// Firebase の初期化（ネイティブ版）。Web は firebase.web.js。
//
// 設定値は環境変数（EXPO_PUBLIC_FIREBASE_*）から読む。Firebase の設定値は公開されても
// 問題ない（守っているのは Firestore のセキュリティルール）。未設定なら同期は無効になり、
// アプリは今までどおり端末の中だけで動く。

import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
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
  const fresh = getApps().length === 0;
  const app = fresh ? initializeApp(firebaseConfig) : getApp();
  // ログイン状態を端末に残す（アプリを開き直しても入り直さなくて済む）
  const auth = fresh ? initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) }) : getAuth(app);
  cache = { auth, db: getFirestore(app) };
  return cache;
};
