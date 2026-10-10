// 単語の「覚えやすいイラスト」（絵文字1〜2個）。リールモードのイラスト表示で使う。
//
// 実体は emojiMap.json（単語キー → 絵文字）。例文の exampleMap.json と同じ流儀で、
// アプリはそれを引くだけ。実行時に AI は動かさない。
// 単語自身が `emoji` を持っていればそちらを優先する（取り込み JSON で手直しできるように）。
// 対応表に無ければ空文字。画面側は空なら何も出さない。

import EMOJI from './emojiMap.json';
import { keyOf } from './examples';

/** @param {{en?: string, emoji?: string}} w @returns {string} */
export const emojiFor = (w) => {
  if (!w) return '';
  if (w.emoji) return String(w.emoji);
  return EMOJI[keyOf(w.en)] || '';
};

/** 絵文字が入っている語の数 */
export const emojiCount = () => Object.keys(EMOJI).length;
