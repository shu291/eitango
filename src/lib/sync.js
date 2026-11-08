// クラウド同期（Firebase Auth + Firestore）。
//
// 送るのは進捗（単語・習熟度・復習の予定・連続日数・学習時間）だけ。表紙写真と設定は送らない。
//
// 保存先
//   users/{uid}/meta/main          … { s, ld, time, deckNames, updatedAt }
//   users/{uid}/decks/{鍵}_{n}     … { name, part, words: [...] }   1000語ずつに分割
//
// 流れ: ① クラウドを読む → ② 手元とまとめる（syncMerge.js）→ ③ 手元を更新 → ④ 変わった所だけ書く。
// 競合は単語ごとに「新しく学習した側」が勝つので、2台で別々に学習しても記録が消えない。

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { collection, doc, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { getFirebase, isSyncConfigured } from './firebase';
import { mergeState, toRemoteDecks, chunkWords } from './syncMerge';
import { INIT_WORDS } from './logic';

export { isSyncConfigured };

/** Firestore の文書IDに使える形にする（"/" は使えない） */
const deckKey = (name) => encodeURIComponent(name).slice(0, 200) || '_';

/** 直前に書いた内容（文書ID → JSON）。変わっていない文書は書かない＝書き込み回数を節約する */
let lastWritten = new Map();

export const onUser = (cb) => {
  const fb = getFirebase();
  if (!fb) { cb(null); return () => {}; }
  return onAuthStateChanged(fb.auth, cb);
};

export const signUp = (email, password) => createUserWithEmailAndPassword(getFirebase().auth, email, password);
export const signIn = (email, password) => signInWithEmailAndPassword(getFirebase().auth, email, password);
export const resetPassword = (email) => sendPasswordResetEmail(getFirebase().auth, email);
export const signOut = () => { lastWritten = new Map(); return fbSignOut(getFirebase().auth); };

/** Firebase のエラーを、画面に出せる日本語にする */
export const authMessage = (e) => {
  switch (e?.code) {
    case 'auth/invalid-email': return 'メールアドレスの形が正しくありません';
    case 'auth/missing-password': return 'パスワードを入力してください';
    case 'auth/weak-password': return 'パスワードは6文字以上にしてください';
    case 'auth/email-already-in-use': return 'このメールアドレスはすでに登録されています。「ログイン」を使ってください';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'メールアドレスかパスワードが違います';
    case 'auth/too-many-requests': return '試行が多すぎます。しばらくしてからやり直してください';
    case 'auth/network-request-failed': return '通信できません。電波を確認してください';
    default: return `失敗しました（${e?.code || e?.message || '不明'}）`;
  }
};

/** クラウドの内容を読む。まだ何も無ければ null */
const pull = async (uid) => {
  const { db } = getFirebase();
  const [metaSnap, deckSnap] = await Promise.all([
    getDocs(collection(db, 'users', uid, 'meta')),
    getDocs(collection(db, 'users', uid, 'decks')),
  ]);
  const meta = metaSnap.docs.find((d) => d.id === 'main')?.data();
  if (!meta) return null;
  const byName = new Map();
  const order = Array.isArray(meta.deckNames) ? meta.deckNames : [];
  const parts = [];
  deckSnap.forEach((d) => {
    lastWritten.set(`decks/${d.id}`, JSON.stringify(d.data()));
    parts.push(d.data());
  });
  parts.sort((a, b) => (a.part || 0) - (b.part || 0));
  for (const p of parts) {
    if (!byName.has(p.name)) byName.set(p.name, []);
    byName.get(p.name).push(...(p.words || []));
  }
  const names = [...order.filter((n) => byName.has(n)), ...[...byName.keys()].filter((n) => !order.includes(n))];
  return {
    decks: names.map((name) => ({ name, words: byName.get(name) })),
    s: meta.s || 0,
    ld: meta.ld || null,
    time: meta.time && typeof meta.time === 'object' ? meta.time : {},
  };
};

/** 手元の内容をクラウドへ書く。変わっていない文書は書かない（削除は伝えない。syncMerge.js 参照） */
const push = async (uid, st) => {
  const { db } = getFirebase();
  const remoteDecks = toRemoteDecks(st.decks);
  const want = new Map();
  for (const d of remoteDecks) {
    const chunks = chunkWords(d.words);
    chunks.forEach((words, i) => {
      want.set(`decks/${deckKey(d.name)}_${i}`, { name: d.name, part: i, words });
    });
  }
  want.set('meta/main', { s: st.s || 0, ld: st.ld || null, time: st.time || {}, deckNames: remoteDecks.map((d) => d.name), updatedAt: Date.now() });

  let batch = writeBatch(db);
  let n = 0;
  const commits = [];
  for (const [path, data] of want) {
    const json = JSON.stringify(data);
    // updatedAt だけが違うのは「変わった」に数えない
    const cmp = path === 'meta/main' ? JSON.stringify({ ...data, updatedAt: 0 }) : json;
    const prev = lastWritten.get(path);
    if (prev === cmp) continue;
    batch.set(doc(db, 'users', uid, ...path.split('/')), data);
    lastWritten.set(path, cmp);
    // 1回のバッチは 500 件まで。余裕を見て 400 で区切る
    if (++n % 400 === 0) { commits.push(batch.commit()); batch = writeBatch(db); }
  }
  commits.push(batch.commit());
  await Promise.all(commits);
};

/**
 * 初期サンプル（INIT_WORDS）のまま一度も学習していない端末か。
 * 新しい端末でログインしたとき、サンプルの単語帳がクラウドの単語帳と並んでしまうのを防ぐ。
 * 名前・語数・未学習のすべてが一致するときだけ「サンプルのまま」とみなす。
 */
const isPristine = (local) =>
  local.decks.length === 1 &&
  local.decks[0].name === 'マイ単語帳' &&
  local.decks[0].words.length === INIT_WORDS.length &&
  local.decks[0].words.every((w) => !w.correct && !w.incorrect) &&
  !local.ld && !local.s;

/**
 * 同期を1回行う。
 *
 * @param {string} uid
 * @param {{decks: Array, s: number, ld: string|null, time: object}} local 手元の状態
 * @returns {Promise<{state: object, changed: boolean}>} state … まとめた結果。changed … 手元の更新が要るか
 * @throws 通信失敗など。呼ぶ側で握りつぶさず画面に出すこと
 */
export const syncOnce = async (uid, local) => {
  const remote = await pull(uid);
  // サンプルのままの端末は、手元を捨ててクラウドをそのまま採用する（空のクラウドのときは除く）
  const adopt = remote && remote.decks.length > 0 && isPristine(local);
  const merged = remote
    ? { ...mergeState(adopt ? { ...local, decks: [] } : local, remote), adopted: !!adopt }
    : { ...local, changed: false };
  if (adopt) merged.changed = true;
  await push(uid, merged);
  return { state: merged, changed: merged.changed };
};

/** 全端末のクラウド上のデータを消す（ログアウトではなく「クラウドから削除」用） */
export const wipeCloud = async (uid) => {
  const { db } = getFirebase();
  const [a, b] = await Promise.all([getDocs(collection(db, 'users', uid, 'meta')), getDocs(collection(db, 'users', uid, 'decks'))]);
  await Promise.all([...a.docs, ...b.docs].map((d) => deleteDoc(d.ref)));
  lastWritten = new Map();
};
