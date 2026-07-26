// 学習データの書き出し／読み込み（Web 版）
//
// ネイティブ版（backup.js）が使う expo-file-system / expo-sharing / expo-document-picker は
// いずれも Web 非対応。ブラウザ標準の Blob ダウンロードと <input type="file"> で置き換える。
// API の形はネイティブ版と揃えてあるので App.js 側は分岐不要。

const FILE_NAME = '1200.json';

/**
 * JSON 文字列を .json ファイルとしてダウンロードさせる。
 * @param {string} json
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export const saveBackup = async (json) => {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = FILE_NAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 即 revoke するとダウンロードが始まる前に無効化されるブラウザがあるので少し待つ
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true, message: 'ダウンロードしました' };
};

/**
 * ファイル選択ダイアログを出して、選ばれた JSON の中身とファイル名を返す。
 * キャンセル時は null。
 *
 * ファイル名も返すのは、取り込んだ単語帳の名前に使うため
 * （target1900.json → 「target1900」という単語帳になる）。
 *
 * 注: input[type=file] にはキャンセルを知らせる標準イベントが長く無かった。
 * 新しめのブラウザは cancel イベントを出すので併用し、どちらでも解決するようにしている。
 * @returns {Promise<{content: string, name: string} | null>}
 */
export const pickBackup = () =>
  new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';

    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      input.remove();
      fn(value);
    };

    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return finish(resolve, null);
      const reader = new FileReader();
      reader.onload = () => finish(resolve, { content: String(reader.result), name: file.name });
      reader.onerror = () => finish(reject, reader.error || new Error('読み込みに失敗しました'));
      reader.readAsText(file);
    });

    input.addEventListener('cancel', () => finish(resolve, null));

    document.body.appendChild(input);
    input.click();
  });
