// 保存領域（ネイティブ版）。
//
// iOS/Android では AsyncStorage をそのまま使う。
// iOS の AsyncStorage は大きい値をファイルに分けて置くので、実質的な上限が無い。
//
// Web は事情がまったく違う（localStorage が 5MB で頭打ち）ので storage.web.js に分けてある。
// 呼ぶ側はどちらか意識しなくていい。

import AsyncStorage from '@react-native-async-storage/async-storage';

export const getItem = (key) => AsyncStorage.getItem(key);
export const setItem = (key, value) => AsyncStorage.setItem(key, value);
export const removeItem = (key) => AsyncStorage.removeItem(key);

/**
 * 保存領域の空き具合。ネイティブでは調べる手段が無いので常に null を返す。
 * 呼ぶ側は null なら「不明」として表示を省く。
 */
export const estimateQuota = async () => null;
