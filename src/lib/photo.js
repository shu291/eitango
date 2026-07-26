// 単語帳の表紙写真を選ぶ（ネイティブ版）
//
// ⚠ ネイティブでは未対応。
// 写真を選ぶには expo-image-picker が必要だが、このアプリは実際には
// Web 版（ホーム画面に追加して使う）でのみ運用しているため入れていない。
// iOS アプリ版でも使いたくなったら:
//   npx expo install expo-image-picker
// を入れて、ここを差し替える（Web 側 photo.web.js と同じく data URI を返せばよい。
// ただし縮小は必須。表紙が数MBになるとローカル保存の上限を超える）。

/**
 * 未対応なので常に null を返す。呼び出し側は null のときに
 * 「Web 版でのみ対応」と案内する。
 * @returns {Promise<null>}
 */
export const pickPhoto = async () => null;

/** 写真の見た目のサイズ（KB） */
export const photoSizeKB = (dataUri) =>
  dataUri ? Math.round((dataUri.length * 3) / 4 / 1024) : 0;
