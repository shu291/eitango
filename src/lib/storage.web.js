// 保存領域（Web 版）。
//
// ⚠️ localStorage は **iPhone の Safari で 5MB 固定**。単語を数千語入れたり
// 表紙写真を何枚か付けたりすると、そこで打ち止めになる。上限に当たると
// setItem が QuotaExceededError を投げ、**それ以降の学習がまったく保存されない**。
// （実際に「保存できません」が出た。単語の追加しすぎが原因）
//
// そこで保存先を **IndexedDB** にした。上限は端末の空き容量に応じて決まり、
// iPhone でも数百MB以上ある。localStorage の 5MB とは桁が2つ違う。
//
// AsyncStorage の Web 実装は localStorage をそのまま使うので、それは使わない。
//
// 使い方は storage.js（ネイティブ版）と同じ getItem / setItem / removeItem。
// Metro が Web ビルドのときだけこのファイルを選ぶので、呼ぶ側の分岐は要らない。

const DB_NAME = 'eitango';
const DB_VERSION = 1;
const STORE = 'kv';

const hasIdb = typeof indexedDB !== 'undefined' && indexedDB !== null;
const hasLocal = typeof localStorage !== 'undefined' && localStorage !== null;

/** 開いた DB を使い回す。毎回開くと遅いうえ、同時に開くと待たされる */
let dbPromise = null;
/**
 * IndexedDB を開けなかったか。
 *
 * Safari のプライベートブラウズなどでは open がいつも失敗する。自動保存は
 * 変更のたびに走るので、毎回開き直すと失敗を延々くり返すことになる。
 * 一度ダメだったらこのセッション中は localStorage に落とす
 * （次にアプリを開いたときはまた IndexedDB から試す）。
 */
let idbFailed = false;

const openDb = () => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      // iPhone はアプリが裏に回ったときなどに接続を閉じることがある。閉じた接続を
      // 使い回すと以降の書き込みが全部失敗するので、捨てて次回開き直す
      db.onclose = () => { if (dbPromise) dbPromise = null; };
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB を開けません'));
    // 別のタブが古いバージョンで開いていると進まないので、待たずに諦める
    req.onblocked = () => reject(new Error('IndexedDB が別のタブで使用中です'));
  }).catch((e) => {
    dbPromise = null;
    idbFailed = true;
    throw e;
  });
  return dbPromise;
};

const isQuota = (e) => String(e?.name || '').toLowerCase().includes('quota');

/** localStorage に逃がしてよい最大の長さ（文字数）。上限は約5MBなので余裕を見る */
const LOCAL_FALLBACK_MAX = 2 * 1024 * 1024;

/** IndexedDB を試してよいか */
const canUseIdb = () => hasIdb && !idbFailed;

const idbGet = async (key) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
};

const idbSet = async (key, value) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    // 容量オーバーは tx.error に QuotaExceededError として出る。
    // 握りつぶすと「保存されていないのに気づけない」ので必ず投げ直す
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

const idbDelete = async (key) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

/**
 * 読み出し。
 *
 * IndexedDB に無ければ localStorage を見る。**IndexedDB に移す前に保存された
 * データを拾うため**で、これが移行そのもの。読めた値は次の自動保存で
 * IndexedDB 側に書かれるので、移行用のコードを別に走らせる必要がない。
 *
 * ⚠️ localStorage 側は消さない。移行がうまくいかなかったときの控えとして残す
 * （旧形式 v1 のデータを残しているのと同じ考え方）。
 */
export const getItem = async (key) => {
  if (canUseIdb()) {
    try {
      const v = await idbGet(key);
      if (v !== null && v !== undefined) return v;
    } catch (e) {
      console.log('idb get err', e);
    }
  }
  if (hasLocal) return localStorage.getItem(key);
  return null;
};

/**
 * 書き込み。
 *
 * IndexedDB が使えない場合だけ localStorage に落とす（5MB の制限つき）。
 * どちらも失敗したら例外を投げる。呼ぶ側で必ず画面に出すこと。
 */
export const setItem = async (key, value) => {
  if (canUseIdb()) {
    try {
      await idbSet(key, value);
      return;
    } catch (e) {
      // 容量オーバーは localStorage に落としても同じかそれ以下なので、そのまま伝える
      if (isQuota(e)) throw e;
      console.log('idb set err', e);
      // 接続が切れていただけのことが多い。開き直して1回だけやり直す
      dbPromise = null;
      try {
        await idbSet(key, value);
        return;
      } catch (e2) {
        if (isQuota(e2)) throw e2;
        console.log('idb set retry err', e2);
      }
    }
  }
  // localStorage は約5MB しか入らない。大きいデータを落とすと、本当の容量は余っているのに
  // QuotaExceededError になり「保存領域がいっぱいです」と誤って出る。なので小さいときだけ使う
  if (hasLocal && value.length <= LOCAL_FALLBACK_MAX) {
    localStorage.setItem(key, value);
    return;
  }
  if (hasLocal) {
    // 'quota' を名前にも文面にも入れない（呼ぶ側が容量不足と見分けるため）
    throw new Error('IndexedDB に書き込めませんでした');
  }
  throw new Error('保存領域が使えません');
};

export const removeItem = async (key) => {
  if (canUseIdb()) {
    try {
      await idbDelete(key);
    } catch (e) {
      console.log('idb delete err', e);
    }
  }
  if (hasLocal) localStorage.removeItem(key);
};

/**
 * 保存領域の空き具合。
 *
 * ブラウザが教えてくれる場合だけ返す（Safari も iOS 17 以降は答える）。
 * 分からなければ null。
 *
 * @returns {Promise<{used: number, quota: number}|null>} バイト単位
 */
export const estimateQuota = async () => {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    if (typeof usage !== 'number' || typeof quota !== 'number' || quota <= 0) return null;
    return { used: usage, quota };
  } catch {
    return null;
  }
};
