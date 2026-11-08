// Firebase の初期化（Web 版）。ネイティブは firebase.js。
// ログイン状態の保存先は Web の既定（IndexedDB）に任せる。

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const isSyncConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

let cache = null;

/** { auth, db } を返す。未設定なら null */
export const getFirebase = () => {
  if (!isSyncConfigured) return null;
  if (cache) return cache;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  cache = { auth: getAuth(app), db: getFirestore(app) };
  return cache;
};
