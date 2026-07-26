// 学習データの書き出し／読み込み（ネイティブ版）
//
// Web 版は backup.web.js にある。Metro が Web ビルド時だけ .web.js を優先解決するので、
// App.js からは常に './src/lib/backup' を import すればよい。
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const FILE_NAME = '1200.json';

/**
 * JSON 文字列をファイルに書き出して共有シートを開く。
 * @param {string} json
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export const saveBackup = async (json) => {
  const uri = FileSystem.documentDirectory + FILE_NAME;
  await FileSystem.writeAsStringAsync(uri, json);
  if (!(await Sharing.isAvailableAsync())) {
    return { ok: false, message: '共有が使えません' };
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/json',
    dialogTitle: '単語データを保存',
  });
  return { ok: true, message: '保存しました' };
};

/**
 * JSON ファイルを選ばせて中身とファイル名を返す。キャンセル時は null。
 * ファイル名は、取り込んだ単語帳の名前に使う。
 * @returns {Promise<{content: string, name: string} | null>}
 */
export const pickBackup = async () => {
  const res = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (res.canceled) return null;
  const asset = res.assets[0];
  return { content: await FileSystem.readAsStringAsync(asset.uri), name: asset.name || '' };
};
