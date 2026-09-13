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

/**
 * 読み上げの音量（0〜1）。端末の音量とは別に、アプリ内だけで下げられる。
 */
let volume = 1;

/** @param {number} v 0〜1 */
export const setSpeechVolume = (v) => {
  volume = Math.max(0, Math.min(1, Number(v) || 0));
  if (current) {
    try {
      current.volume = volume;
    } catch {
      // 再生が終わっている場合は無視してよい
    }
  }
};

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
  if (volume === 0) return; // 消音

  stopCurrent();
  Speech.stop();

  const asset = AUDIO[keyOf(text)];
  if (asset) {
    try {
      await ensureAudioMode();
      const player = createAudioPlayer(asset);
      player.volume = volume;
      current = player;
      player.play();
      return;
    } catch {
      // ファイル再生に失敗したら読み上げに落とす
      stopCurrent();
    }
  }

  try {
    Speech.speak(text, { language: 'en-US', rate: 0.9, volume });
  } catch {
    // 読み上げも使えない端末では黙って諦める
  }
};

// ===== 読み終わりまで待てる再生（聞き流しモード用） =====
//
// speakWord は「鳴らして即戻る」ので、単語 → 意味 → 例文と順に流すには
// 終わりを待つ版が要る。stopSpeaking() で止めたときは待っている側をすぐ解放する。
const pending = new Set();
const settlePending = () => {
  for (const r of pending) r();
  pending.clear();
};

/**
 * 文を読み上げて、読み終わるまで待つ。英語・日本語どちらも端末の読み上げを使う。
 * @param {string} text
 * @param {'en-US'|'ja-JP'} [lang]
 * @param {number} [rate] 0.9 くらいがふつう。1 で標準速度
 */
export const sayText = (text, lang = 'en-US', rate = 0.9) => {
  const t = String(text ?? '').trim();
  if (!t || volume === 0) return Promise.resolve();
  stopCurrent();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      pending.delete(finish);
      resolve();
    };
    pending.add(finish);
    try {
      Speech.speak(t, { language: lang, rate, volume, onDone: finish, onStopped: finish, onError: finish });
    } catch {
      finish();
    }
  });
};

/**
 * 単語を発音して、鳴り終わるまで待つ。事前生成の音声があればそれを使う。
 * @param {string} word
 */
export const sayWord = async (word) => {
  const text = String(word ?? '').trim();
  if (!text || volume === 0) return;
  const asset = AUDIO[keyOf(text)];
  if (!asset) return sayText(text, 'en-US');
  stopCurrent();
  try {
    Speech.stop();
  } catch {
    // 未再生でも構わない
  }
  try {
    await ensureAudioMode();
    const player = createAudioPlayer(asset);
    player.volume = volume;
    current = player;
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        pending.delete(finish);
        try {
          sub.remove();
        } catch {
          // 解除済みなら無視
        }
        resolve();
      };
      pending.add(finish);
      const sub = player.addListener('playbackStatusUpdate', (st) => {
        if (st && st.didJustFinish) finish();
      });
      // 状態通知が来ない端末向けの保険。単語1語の音声は長くても数秒
      setTimeout(finish, 4000);
      player.play();
    });
  } catch {
    stopCurrent();
    await sayText(text, 'en-US');
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
  settlePending();
};
