// 単語帳（＝本棚に並ぶ1冊）の扱い。
//
// 保存形式は 2 種類あり、この中で吸収する。
//
//   v1（旧・単語帳が1冊しかなかった頃）  { w: [...], s, ld, n }
//   v2（現行・本棚）                    { v: 2, decks: [...], active, s, ld }
//
// 取り込み（読込）で渡される JSON も同じ2種類がありうるので、
// どちらでも受けられるようにしてある。

import { backfillSchedule, repairWord, SR_DEFAULT_EF } from './logic';

export const STORAGE_KEY_V1 = '@eitango_state_v1';
export const STORAGE_KEY_V2 = '@eitango_state_v2';

/**
 * 単語1件を、欠けている項目を埋めた形にそろえる。
 *
 * 間隔反復の項目（due / ivl / ef）は後から足したので、古いデータには入っていない。
 * 学習済みなのに予定が無い単語には backfillSchedule が予定を後付けするので、
 * 間隔反復を入れる前に覚えた単語もそのまま復習モードに乗る。
 *
 * repairWord は、貼り付けの区切りを読み違えていた頃に壊れた単語を直す。
 * 英単語の欄に意味が混ざったままだと出題時に答えが見えてしまうので、
 * 読み込みのたびに直す（正常な単語には触らないので何度通しても安全）。
 */
export const normalizeWord = (w, fallbackId) =>
  backfillSchedule(repairWord({
    ...w,
    id: typeof w.id === 'number' ? w.id : fallbackId,
    en: String(w.en ?? ''),
    ja: String(w.ja ?? ''),
    progress: w.progress || 0,
    correct: w.correct || 0,
    incorrect: w.incorrect || 0,
    streak: w.streak || 0,
    lastReviewed: w.lastReviewed ?? null,
    reviewedDates: w.reviewedDates || (w.lastReviewed ? [w.lastReviewed] : []),
    due: w.due ?? null,
    ivl: typeof w.ivl === 'number' ? w.ivl : 0,
    ef: typeof w.ef === 'number' ? w.ef : SR_DEFAULT_EF,
  }));

/**
 * 保存されていた生データの中に、貼り付けで壊れた単語が何語あるか数える。
 *
 * normalizeWord が黙って直してしまうので、直した事実を知らせるために
 * **直す前の生データ**を見て数える。実際に直せるものだけを数えるので、
 * 和→英の単語帳のように触らないものは含まれない。
 *
 * @param {any} raw JSON.parse した保存データ（v1 / v2 どちらでも可）
 * @returns {number}
 */
export const countBrokenWords = (raw) => {
  if (!raw || typeof raw !== 'object') return 0;
  const lists = Array.isArray(raw.decks)
    ? raw.decks.map((d) => (d && Array.isArray(d.words) ? d.words : []))
    : [Array.isArray(raw.w) ? raw.w : []];
  let n = 0;
  for (const list of lists) for (const w of list) if (repairWord(w) !== w) n++;
  return n;
};

/** 単語帳を1冊作る。nid（次に採番する単語ID）は省略時に単語から求める */
export const makeDeck = ({ id, name, words = [], cover = null, nid }) => {
  const ws = words.map((w, i) => normalizeWord(w, i + 1));
  return {
    id,
    name: String(name || '名称未設定'),
    cover: cover ?? null,
    words: ws,
    nid: typeof nid === 'number' ? nid : ws.reduce((m, w) => Math.max(m, w.id), 0) + 1,
  };
};

/**
 * 本棚の並び順を変える。
 *
 * `delta` の分だけ前後に動かす（-1 で1つ前、+1 で1つ後ろ）。
 * 端を越える指定は端で止めるので、先頭へ持ってくるなら `-decks.length` を渡せばよい。
 *
 * 入れ替え（swap）ではなく抜き差し（splice）にしてある。1つ隣なら結果は同じだが、
 * 2つ以上動かすときに間の単語帳の順番が崩れないのはこちら。
 *
 * ⚠️ 学習中の単語帳は **ID** で覚えている（`activeId`）ので、並べ替えても選択は変わらない。
 * 位置で覚える作りにすると、並べ替えた瞬間に別の単語帳に切り替わってしまう。
 *
 * @param {Array} decks
 * @param {number} id 動かす単語帳のID
 * @param {number} delta 動かす量
 * @returns {Array} 並べ替えた新しい配列（動かないときは元の配列をそのまま返す）
 */
export const moveDeck = (decks, id, delta) => {
  if (!Array.isArray(decks)) return decks;
  const from = decks.findIndex((d) => d.id === id);
  if (from < 0) return decks;
  const to = Math.max(0, Math.min(decks.length - 1, from + delta));
  if (to === from) return decks;
  const next = [...decks];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

/** 既存と重ならない単語帳ID */
export const nextDeckId = (decks) => decks.reduce((m, d) => Math.max(m, d.id), 0) + 1;

/** 同じ名前があれば「〜 (2)」のように連番を付ける */
export const uniqueDeckName = (decks, name) => {
  const base = String(name || '名称未設定').trim() || '名称未設定';
  if (!decks.some((d) => d.name === base)) return base;
  for (let i = 2; i < 1000; i++) {
    const cand = `${base} (${i})`;
    if (!decks.some((d) => d.name === cand)) return cand;
  }
  return base;
};

/**
 * 保存されていた生データを v2 の形に直す。
 * v1（単語配列だけ）だった場合は1冊の単語帳に包む。
 * 壊れていて読めない場合は null を返す（呼び出し側で初期状態にする）。
 */
export const normalizeState = (raw, { defaultName = 'マイ単語帳' } = {}) => {
  if (!raw || typeof raw !== 'object') return null;

  // --- v2 ---
  if (Array.isArray(raw.decks)) {
    const decks = raw.decks
      .filter((d) => d && Array.isArray(d.words))
      .map((d, i) => makeDeck({ id: typeof d.id === 'number' ? d.id : i + 1, name: d.name, words: d.words, cover: d.cover, nid: d.nid }));
    if (!decks.length) return null;
    const active = decks.some((d) => d.id === raw.active) ? raw.active : decks[0].id;
    return {
      decks,
      active,
      s: typeof raw.s === 'number' ? raw.s : 0,
      ld: raw.ld || null,
      dt: raw.dt === true, // ダブルタップモード。後から足した項目なので既定はオフ
      vol: typeof raw.vol === 'number' ? Math.max(0, Math.min(1, raw.vol)) : 1, // 読み上げの音量
      // 学習時間の記録 { 'YYYY-MM-DD': { ms, n } }。フラッシュカードのみ計測している
      time: raw.time && typeof raw.time === 'object' ? raw.time : {},
    };
  }

  // --- v1 ---
  if (Array.isArray(raw.w) && raw.w.length) {
    const deck = makeDeck({ id: 1, name: defaultName, words: raw.w, nid: typeof raw.n === 'number' ? raw.n : undefined });
    return {
      decks: [deck],
      active: 1,
      s: typeof raw.s === 'number' ? raw.s : 0,
      ld: raw.ld || null,
      dt: false,
      vol: 1,
      time: {},
    };
  }

  return null;
};

/**
 * 「読込」で渡された JSON を、本棚にどう反映するか判定する。
 *
 *   単語配列だけのファイル（v1 形式）→ mode: 'add'     … 1冊として本棚に追加する
 *   本棚まるごとのファイル（v2 形式）→ mode: 'replace' … 本棚全体を置き換える
 *
 * @param {any} data パース済みの JSON
 * @param {string} nameHint ファイル名など、単語帳の名前に使いたい文字列
 * @returns {{mode: 'add'|'replace', decks: Array}|null}
 */
export const planImport = (data, nameHint = '取り込んだ単語帳') => {
  if (!data || typeof data !== 'object') return null;

  if (Array.isArray(data.decks)) {
    const state = normalizeState(data);
    return state ? { mode: 'replace', decks: state.decks } : null;
  }

  // 単語の配列そのものを渡された場合も受ける
  const list = Array.isArray(data) ? data : data.w;
  if (Array.isArray(list) && list.length) {
    return {
      mode: 'add',
      decks: [makeDeck({ id: 0, name: nameHint, words: list, nid: typeof data.n === 'number' ? data.n : undefined })],
    };
  }

  return null;
};

/** ファイル名から単語帳の名前を作る（拡張子と余計な記号を落とす） */
export const deckNameFromFile = (fileName) => {
  const base = String(fileName || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base || '取り込んだ単語帳';
};

/** 保存する形（v2）に組み立てる */
export const buildState = ({ decks, active, s, ld, dt, vol, time }) => ({
  v: 2,
  decks,
  active,
  s,
  ld,
  dt: dt === true,
  vol: typeof vol === 'number' ? vol : 1,
  time: time || {},
});
