// 英単語の発音再生（ネイティブ版）
//
// Web 版は speech.web.js。Metro が Web ビルド時だけ .web.js を優先解決する。
//
// 2段構え:
//   1. ローカル AI（Piper TTS）で事前生成した音声ファイルがあればそれを鳴らす
//      → 全端末で同じ音・オフラインでも鳴る。生成は `npm run build:audio`
//   2. 無ければ端末内蔵の読み上げ（expo-speech）で読む
//      → ユーザーが自分で追加した単語はこちらが担当する
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import { AUDIO } from './audioMap';

/** 単語 → 音声ファイル名のキー。scripts/build-audio.mjs の keyOf と必ず揃えること。 */
const keyOf = (word) => String(word ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

// マナーモードでも発音が聞こえるようにする。学習アプリなので鳴らないと機能しない。
// 1度だけ実行すればよく、失敗しても再生自体は試みる。
let audioModeReady = null;
const ensureAudioMode = () => {
  if (!audioModeReady) {
    audioModeReady = setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }
  return audioModeReady;
};

// 直前の再生を止めるために持っておく（連打で音が重ならないように）
let current = null;

const stopCurrent = () => {
  if (current) {
    try {
      current.remove();
    } catch {
      // 再生済みインスタンスの解放失敗は無視してよい
    }
    current = null;
  }
};

/**
 * 単語を発音する。事前生成の音声があればそれを、無ければ読み上げを使う。
 * 失敗しても例外は投げない（発音は学習の本筋を止めるほどのものではない）。
 * @param {string} word
 */
export const speakWord = async (word) => {
  const text = String(word ?? '').trim();
  if (!text) return;

  stopCurrent();
  Speech.stop();

  const asset = AUDIO[keyOf(text)];
  if (asset) {
    try {
      await ensureAudioMode();
      const player = createAudioPlayer(asset);
      current = player;
      player.play();
      return;
    } catch {
      // ファイル再生に失敗したら読み上げに落とす
      stopCurrent();
    }
  }

  try {
    Speech.speak(text, { language: 'en-US', rate: 0.9 });
  } catch {
    // 読み上げも使えない端末では黙って諦める
  }
};

/** 再生中の音を止める（画面を離れるときなど） */
export const stopSpeaking = () => {
  stopCurrent();
  try {
    Speech.stop();
  } catch {
    // 未再生時に呼ばれても問題ない
  }
};
