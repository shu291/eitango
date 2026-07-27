// 単語帳（＝本棚に並ぶ1冊）の扱い。
//
// 保存形式は 2 種類あり、この中で吸収する。
//
//   v1（旧・単語帳が1冊しかなかった頃）  { w: [...], s, ld, n }
//   v2（現行・本棚）                    { v: 2, decks: [...], active, s, ld }
//
// 取り込み（読込）で渡される JSON も同じ2種類がありうるので、
// どちらでも受けられるようにしてある。

export const STORAGE_KEY_V1 = '@eitango_state_v1';
export const STORAGE_KEY_V2 = '@eitango_state_v2';

/** 単語1件を、欠けている項目を埋めた形にそろえる */
export const normalizeWord = (w, fallbackId) => ({
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
});

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
export const buildState = ({ decks, active, s, ld, dt, vol }) => ({
  v: 2,
  decks,
  active,
  s,
  ld,
  dt: dt === true,
  vol: typeof vol === 'number' ? vol : 1,
});
