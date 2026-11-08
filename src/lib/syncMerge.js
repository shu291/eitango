// 複数端末の進捗を1つにまとめる（純粋関数だけ。Firebase には触らない）。
//
// 考え方
//   ・単語帳は「名前」、単語は「英単語（小文字）」で端末をまたいで同じものとみなす。
//     id は端末ごとに振った連番なので、端末をまたぐと一致しない。
//   ・同じ単語が両方にあれば、新しく学習した側を採用する（lastReviewed が新しい方。
//     同じ日なら、答えた回数が多い方）。片方の進捗を丸ごと上書きして学習が消えることは無い。
//   ・片方にしか無い単語・単語帳は足す（和集合）。
//   ・⚠️ 削除は伝わらない。端末Aで消した単語が、端末Bに残っていれば戻ってくる。
//     「消したのに復活する」より「学習した記録が消える」ほうが痛いので、あえてこうしている。

import { normalizeWord } from './decks';

/** 単語の「新しさ」。大きいほど新しく学習している */
const stamp = (w) => [String(w.lastReviewed || ''), (w.correct || 0) + (w.incorrect || 0)];

/** a のほうが新しい（学習が進んでいる）か。同点なら false（＝手元を優先） */
const isNewer = (a, b) => {
  const [da, na] = stamp(a);
  const [db, nb] = stamp(b);
  if (da !== db) return da > db;
  return na > nb;
};

/** 同じ単語どうしを1つにする。学習の記録（日付）は両方の和集合 */
export const mergeWord = (local, remote) => {
  const win = isNewer(remote, local) ? remote : local;
  const lose = win === local ? remote : local;
  const dates = Array.from(new Set([...(local.reviewedDates || []), ...(remote.reviewedDates || [])])).sort();
  return { ...win, id: local.id, reviewedDates: dates, ...(win.ex || !lose.ex ? {} : { ex: lose.ex }) };
};

/** 同じ綴りが1冊の中に複数あっても取り違えないよう、2個目以降には #1, #2 を付けて鍵にする */
const keyed = (words) => {
  const seen = new Map();
  return words.map((w) => {
    const base = String(w.en || '').trim().toLowerCase();
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return [`${base}#${n}`, w];
  });
};

/** 単語帳1冊ぶんの単語をまとめる。local の id・並びを保ち、remote だけの語は後ろに足す */
export const mergeDeck = (local, remote) => {
  const remoteMap = new Map(keyed(remote.words || []));
  const used = new Set();
  let nid = local.nid;
  const words = keyed(local.words).map(([k, w]) => {
    const r = remoteMap.get(k);
    if (!r) return w;
    used.add(k);
    return mergeWord(w, r);
  });
  for (const [k, r] of remoteMap) {
    if (used.has(k)) continue;
    words.push(normalizeWord({ ...r, id: nid }, nid));
    nid += 1;
  }
  return { ...local, words, nid };
};

/** 学習時間の記録 { 'YYYY-MM-DD': { ms, n } } は、日ごとに大きい方を採る */
export const mergeTime = (a = {}, b = {}) => {
  const out = { ...a };
  for (const [d, v] of Object.entries(b)) {
    const cur = out[d];
    out[d] = !cur || (v?.ms || 0) > (cur.ms || 0) ? v : cur;
  }
  return out;
};

/**
 * 手元と クラウドをまとめる。
 *
 * @param {{decks: Array, s: number, ld: string|null, time: object}} local
 * @param {{decks: Array<{name: string, words: Array}>, s: number, ld: string|null, time: object}} remote
 *        クラウドの単語帳は id/nid/cover を持たない
 * @returns {{decks: Array, s: number, ld: string|null, time: object, changed: boolean}}
 *          changed … 手元の内容が変わったか（保存・表示の更新が要るか）
 */
export const mergeState = (local, remote) => {
  const byName = new Map((remote.decks || []).map((d) => [d.name, d]));
  const usedNames = new Set();
  const decks = local.decks.map((d) => {
    const r = byName.get(d.name);
    if (!r) return d;
    usedNames.add(d.name);
    return mergeDeck(d, r);
  });
  let nextId = decks.reduce((m, d) => Math.max(m, d.id), 0) + 1;
  for (const r of remote.decks || []) {
    if (usedNames.has(r.name)) continue;
    const words = (r.words || []).map((w, i) => normalizeWord(w, i + 1));
    decks.push({
      id: nextId++,
      name: r.name,
      cover: null,
      words,
      nid: words.reduce((m, w) => Math.max(m, w.id), 0) + 1,
    });
  }

  // 連続日数: 最後に学習した日が新しい方を採る。同じ日なら大きい方
  const lr = local.ld || '';
  const rr = remote.ld || '';
  let s = local.s;
  let ld = local.ld;
  if (rr > lr || (rr === lr && (remote.s || 0) > (local.s || 0))) {
    s = remote.s || 0;
    ld = remote.ld || null;
  }

  const time = mergeTime(local.time, remote.time);
  const changed =
    JSON.stringify(decks) !== JSON.stringify(local.decks) ||
    s !== local.s ||
    ld !== local.ld ||
    JSON.stringify(time) !== JSON.stringify(local.time || {});
  return { decks, s, ld, time, changed };
};

/**
 * クラウドへ送る形にする。
 * ⚠️ 表紙写真（cover）は送らない。1枚で数百KBあり、Firestore の1件1MBの上限に当たる。
 */
export const toRemoteDecks = (decks) => decks.map((d) => ({ name: d.name, words: d.words }));

/** 1件のドキュメントに入れる単語数。1語 約250バイト前後なので 1000 語で 250KB 程度（上限1MBに余裕） */
export const CHUNK = 1000;

/** words を CHUNK 語ずつに分ける。空の単語帳でも 1 つ返す（単語帳の存在を残すため） */
export const chunkWords = (words) => {
  const out = [];
  for (let i = 0; i < words.length; i += CHUNK) out.push(words.slice(i, i + CHUNK));
  return out.length ? out : [[]];
};
