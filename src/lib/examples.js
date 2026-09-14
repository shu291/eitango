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

// 見出し語の探し方（太字・空欄・検査で共通）は headword.js にある。ここからは再輸出するだけ
export { splitByHeadword, hasHeadword, headwordCoverage } from './headword';
