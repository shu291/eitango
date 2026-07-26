// 英単語の発音再生（Web 版）
//
// ネイティブ版（speech.js）と同じ 2段構え:
//   1. ローカル AI（Piper TTS）で事前生成した音声ファイル
//   2. 無ければブラウザの読み上げ（Web Speech API）
//
// ## iOS Safari の自動再生ブロックへの対応（ここが肝）
//
// iPhone は「ユーザーのタップが直接の引き金でない音声再生」を禁止している。
// フラッシュカードは単語が表示されたタイミング（= useEffect の中）で鳴らすので、
// 素直に書くと iPhone では一切鳴らない。
//
// 回避策として、
//   - Audio 要素を毎回作らず **1つを使い回す**
//   - 最初のタップのときに、その要素で無音を一瞬再生して「解錠」しておく
// という形にしている。iOS は一度ユーザー操作で再生された要素については、
// 以後プログラムからの再生を許可する。
//
// speechSynthesis にも同じ制限があるため、同じタイミングで空の発話を投げて解錠する。
import { Asset } from 'expo-asset';
import { AUDIO } from './audioMap';

/** 単語 → 音声ファイル名のキー。scripts/build-audio.mjs の keyOf と必ず揃えること。 */
const keyOf = (word) => String(word ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

/** 長さ0の WAV。解錠用に一瞬だけ鳴らす（実際には無音） */
const SILENCE =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';

/** 使い回す Audio 要素。毎回 new すると iOS の解錠が効かない */
let player = null;

const getPlayer = () => {
  if (!player && hasDom) {
    player = new Audio();
    player.preload = 'auto';
  }
  return player;
};

let unlocked = false;

/** 最初のユーザー操作で、音声と読み上げを解錠する */
const unlock = () => {
  if (unlocked) return;
  unlocked = true;

  const a = getPlayer();
  if (a) {
    a.src = SILENCE;
    const p = a.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        a.pause();
        a.currentTime = 0;
      }).catch(() => {
        // 解錠に失敗しても、実際の再生時にもう一度試すので握りつぶしてよい
      });
    }
  }

  if (window.speechSynthesis) {
    try {
      // 空の発話でエンジンを起こす。音は出ない
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    } catch {
      // 未対応ブラウザは無視
    }
  }
};

if (hasDom) {
  // capture 段階で拾うことで、アプリ側が止めたイベントでも確実に解錠できる
  const opts = { once: true, capture: true, passive: true };
  window.addEventListener('pointerdown', unlock, opts);
  window.addEventListener('touchend', unlock, opts);
  window.addEventListener('keydown', unlock, opts);
}

const cancelSynth = () => {
  if (hasDom && window.speechSynthesis) window.speechSynthesis.cancel();
};

/**
 * ブラウザ読み上げで発音する。
 * 注: 音声一覧は非同期に読み込まれるため、英語音声がまだ見つからないことがある。
 * その場合も lang だけ指定して喋らせれば、たいていのブラウザが英語で読む。
 */
const speakWithSynth = (text) => {
  if (!hasDom || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  const enVoice = window.speechSynthesis.getVoices().find((v) => v.lang?.startsWith('en'));
  if (enVoice) u.voice = enVoice;
  window.speechSynthesis.speak(u);
};

/**
 * 単語を発音する。事前生成の音声があればそれを、無ければ読み上げを使う。
 * 失敗しても例外は投げない（発音は学習の本筋を止めるほどのものではない）。
 * @param {string} word
 */
export const speakWord = async (word) => {
  const text = String(word ?? '').trim();
  if (!text || !hasDom) return;

  cancelSynth();

  const mod = AUDIO[keyOf(text)];
  const a = getPlayer();
  if (mod && a) {
    try {
      a.pause();
      a.src = Asset.fromModule(mod).uri;
      a.currentTime = 0;
      await a.play();
      return;
    } catch {
      // 自動再生を止められた等で鳴らせなかったら読み上げに落とす
    }
  }

  speakWithSynth(text);
};

/** 再生中の音を止める */
export const stopSpeaking = () => {
  if (player) {
    player.pause();
    try {
      player.currentTime = 0;
    } catch {
      // src 未設定だと currentTime の代入が失敗することがある
    }
  }
  cancelSynth();
};
