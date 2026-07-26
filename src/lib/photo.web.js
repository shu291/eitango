// 単語帳の表紙写真を選ぶ（Web 版）
//
// 保存先はブラウザのローカル領域で、上限はだいたい 5MB しかない。
// スマホの写真はそのままだと1枚で数MBあるので、**必ず縮小してから**保存する。
// 縮小せずに入れると、単語データごと保存できなくなる。

/** 表紙の最大辺（px）。本棚のカードに使うだけなので、これで十分きれい */
const MAX_SIZE = 640;
/** JPEG の品質。0.72 だとだいたい 40〜70KB に収まる */
const QUALITY = 0.72;

const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';

/** File を <img> に読み込む */
const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読み込めませんでした'));
    };
    img.src = url;
  });

/** 長辺を MAX_SIZE 以内に縮めて JPEG の data URI にする */
const shrink = (img) => {
  const scale = Math.min(1, MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // 透過 PNG を JPEG にすると黒くなるので、先に白で塗っておく
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', QUALITY);
};

/**
 * 写真を選ばせて、縮小した data URI を返す。キャンセル時は null。
 * @returns {Promise<string|null>}
 */
export const pickPhoto = () =>
  new Promise((resolve, reject) => {
    if (!hasDom) return resolve(null);

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';

    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      input.remove();
      fn(value);
    };

    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return finish(resolve, null);
      try {
        finish(resolve, shrink(await loadImage(file)));
      } catch (e) {
        finish(reject, e);
      }
    });
    // 新しめのブラウザはキャンセル時に cancel を出す
    input.addEventListener('cancel', () => finish(resolve, null));

    document.body.appendChild(input);
    input.click();
  });

/** 写真の見た目のサイズ（KB）。保存量をユーザーに見せるのに使う */
export const photoSizeKB = (dataUri) =>
  dataUri ? Math.round((dataUri.length * 3) / 4 / 1024) : 0;
