// 破壊的操作の確認ダイアログ（ネイティブ版）
//
// Web 版は confirm.web.js。react-native-web の Alert は
// `static alert() {}` という**何もしない空実装**なので、
// Alert.alert をそのまま使うと Web では削除確認が無反応になる。
import { Alert } from 'react-native';

/**
 * 確認ダイアログを出し、実行してよければ true を返す。
 * @param {{ title: string, message: string, confirmLabel?: string }} opts
 * @returns {Promise<boolean>}
 */
export const confirmDestructive = ({ title, message, confirmLabel = '削除' }) =>
  new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'キャンセル', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
