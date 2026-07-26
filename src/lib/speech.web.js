// 英単語の発音再生（Web 版）
//
// ネイティブ版（speech.js）と同じ 2段構え:
//   1. ローカル AI（Piper TTS）で事前生成した音声ファイル
//   2. 無ければブラウザの読み上げ（Web Speech API）
//
// expo-audio / expo-speech は使わない。ブラウザ標準の Audio と speechSynthesis で足りるうえ、
// そのほうが初回読み込みが軽い。
import { Asset } from 'expo-asset';
import { AUDIO } from './audioMap';

/** 単語 → 音声ファイル名のキー。scripts/build-audio.mjs の keyOf と必ず揃えること。 */
const keyOf = (word) => String(word ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

let current = null;

const stopCurrent = () => {
  if (current) {
    current.pause();
    current.currentTime = 0;
    current = null;
  }
};

const cancelSynth = () => {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
};

/**
 * ブラウザ読み上げで発音する。
 * 注: 音声一覧は非同期に読み込まれるため、英語音声がまだ見つからないことがある。
 * その場合も lang だけ指定して喋らせれば、たいていのブラウザが英語で読む。
 */
const speakWithSynth = (text) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  const enVoice = window.speechSynthesis.getVoices().find((v) => v.lang?.startsWith('en'));
  if (enVoice) u.voice = enVoice;
  window.speechSynthesis.speak(u);
};

/**
 * 単語を発音する。事前生成の音声があればそれを、無ければ読み上げを使う。
 * 失敗しても例外は投げない。
 * @param {string} word
 */
export const speakWord = async (word) => {
  const text = String(word ?? '').trim();
  if (!text) return;

  stopCurrent();
  cancelSynth();

  const mod = AUDIO[keyOf(text)];
  if (mod) {
    try {
      const audio = new Audio(Asset.fromModule(mod).uri);
      current = audio;
      // ブラウザの自動再生ブロックに当たった場合は読み上げに落とす
      await audio.play();
      return;
    } catch {
      stopCurrent();
    }
  }

  speakWithSynth(text);
};

/** 再生中の音を止める */
export const stopSpeaking = () => {
  stopCurrent();
  cancelSynth();
};
