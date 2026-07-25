// 破壊的操作の確認ダイアログ（Web 版）
//
// react-native-web の Alert は何もしない空実装なので、ブラウザ標準の confirm を使う。

/**
 * 確認ダイアログを出し、実行してよければ true を返す。
 * @param {{ title: string, message: string, confirmLabel?: string }} opts
 * @returns {Promise<boolean>}
 */
export const confirmDestructive = async ({ title, message }) =>
  window.confirm(`${title}\n\n${message}`);
