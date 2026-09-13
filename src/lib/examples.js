// 単語の例文（英語1文＋日本語訳）。
//
// 例文の実体は scripts/build-examples.mjs が Mac 上のローカル LLM（Ollama）で事前生成した
// src/lib/exampleMap.json。アプリはそれを読むだけで、実行時に AI は動かさない
// （音声の audioMap.js と同じ考え方）。
//
// 単語自身が `ex: { en, ja }` を持っていればそちらを優先する（取り込み JSON で手直しできるように）。
// どちらにも無ければ null。画面側は null なら何も出さない。

import EXAMPLES from './exampleMap.json';

/** 単語 → 対応表のキー。scripts/build-examples.mjs の keyOf と必ず揃えること。 */
export const keyOf = (word) =>
  String(word ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * @param {{en?: string, ex?: {en?: string, ja?: string}}} w
 * @returns {{en: string, ja: string} | null}
 */
export const exampleFor = (w) => {
  if (!w) return null;
  if (w.ex && typeof w.ex === 'object' && w.ex.en) return { en: String(w.ex.en), ja: String(w.ex.ja ?? '') };
  const hit = EXAMPLES[keyOf(w.en)];
  if (!hit || !hit.en) return null;
  return { en: String(hit.en), ja: String(hit.ja ?? '') };
};

/** 例文が入っている語の数（設定画面などで「例文 N 語ぶん同梱」と出す用） */
export const exampleCount = () => Object.keys(EXAMPLES).length;

/**
 * 例文の中で見出し語（の活用形）が出ている場所を切り出す。
 * 太字表示（フラッシュカード・単語帳・聞き流し）と、空欄にする例文クイズの両方がこれを使う。
 *
 * 一致の考え方は scripts/build-examples.mjs の validate と同じ:
 * 5文字以上の語は末尾2文字を落とした語幹で前方一致（-s / -ed / -ing / -ies を許す）、
 * 短い語はそのまま。熟語（look up）は語ごとに探すが、2文字以下の語（up / to / a）は
 * 文中のあちこちに出るので、単独の見出しでない限り対象にしない。
 *
 * @param {string} sentence
 * @param {string} headword
 * @returns {{text: string, hit: boolean}[]}
 */
export const splitByHeadword = (sentence, headword) => {
  const text = String(sentence ?? '');
  const toks = String(headword ?? '').toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
  const useToks = toks.length === 1 ? toks : toks.filter((t) => t.length >= 3);
  if (!text || !useToks.length) return [{ text, hit: false }];
  const stems = useToks.map((t) => (t.length >= 5 ? t.slice(0, t.length - 2) : t)).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`\\b(?:${stems.join('|')})[a-z']*\\b`, 'gi');
  const out = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), hit: false });
    out.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out.length ? out : [{ text, hit: false }];
};

/** 例文の中に見出し語が見つかるか（例文クイズの出題対象にできるか） */
export const hasHeadword = (sentence, headword) => splitByHeadword(sentence, headword).some((s) => s.hit);
