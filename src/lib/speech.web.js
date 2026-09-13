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

/**
 * 読み上げの音量（0〜1）。iPhone 本体の音量とは別に、アプリ内だけで下げられる。
 * 端末の音量を変えずに小さくしたい、という用途のために持っている。
 */
let volume = 1;

/** @param {number} v 0〜1 */
export const setSpeechVolume = (v) => {
  volume = Math.max(0, Math.min(1, Number(v) || 0));
  if (player) player.volume = volume;
};

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
  u.volume = volume;
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
  if (volume === 0) return; // 消音のときは鳴らさない（読み上げも含めて止める）

  cancelSynth();

  const mod = AUDIO[keyOf(text)];
  const a = getPlayer();
  if (mod && a) {
    try {
      a.pause();
      a.src = Asset.fromModule(mod).uri;
      a.currentTime = 0;
      a.volume = volume;
      a.playbackRate = 1; // 聞き流しで変えた速度を引きずらない（要素を使い回しているため）
      await a.play();
      return;
    } catch {
      // 自動再生を止められた等で鳴らせなかったら読み上げに落とす
    }
  }

  speakWithSynth(text);
};

// ===== 読み終わりまで待てる再生（聞き流しモード用） =====
//
// speakWord は「鳴らして即戻る」ので、単語 → 意味 → 例文と順に流すには
// 終わりを待つ版が要る。stopSpeaking() で止めたときは待っている側をすぐ解放する。
//
// iOS Safari の注意: 読み上げの onend が来ないことがある（画面を伏せた・別タブへ行った等）ので、
// 文の長さから見積もった上限時間でも必ず解放する。次の発話の前に cancel するので重なりはしない。
const pending = new Set();
const settlePending = () => {
  for (const r of pending) r();
  pending.clear();
};

/**
 * 文を読み上げて、読み終わるまで待つ。英語・日本語どちらもブラウザの読み上げを使う。
 * @param {string} text
 * @param {'en-US'|'ja-JP'} [lang]
 * @param {number} [rate]
 */
export const sayText = (text, lang = 'en-US', rate = 0.9) => {
  const t = String(text ?? '').trim();
  if (!t || !hasDom || !window.speechSynthesis || volume === 0) return Promise.resolve();
  if (player) player.pause();
  cancelSynth();
  return new Promise((resolve) => {
    let done = false;
    let timer = null;
    const finish = () => {
      if (done) return;
      done = true;
      pending.delete(finish);
      if (timer) clearTimeout(timer);
      resolve();
    };
    pending.add(finish);
    try {
      const u = new SpeechSynthesisUtterance(t);
      u.lang = lang;
      u.rate = rate;
      u.volume = volume;
      const want = lang.slice(0, 2);
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang?.startsWith(want));
      if (voice) u.voice = voice;
      u.onend = finish;
      u.onerror = finish;
      // 保険: 1文字 0.25 秒 + 4 秒。日本語の長い訳でも十分足りる長さ
      timer = setTimeout(finish, 4000 + t.length * 250);
      window.speechSynthesis.speak(u);
    } catch {
      finish();
    }
  });
};

/**
 * 単語を発音して、鳴り終わるまで待つ。事前生成の音声があればそれを使う。
 * @param {string} word
 * @param {number} [speed] 再生速度の倍率（1 がふつう。聞き流しの速度設定）
 */
export const sayWord = async (word, speed = 1) => {
  const text = String(word ?? '').trim();
  if (!text || !hasDom || volume === 0) return;
  const mod = AUDIO[keyOf(text)];
  const a = getPlayer();
  if (!mod || !a) return sayText(text, 'en-US', 0.9 * speed);
  cancelSynth();
  try {
    a.pause();
    a.src = Asset.fromModule(mod).uri;
    a.currentTime = 0;
    a.volume = volume;
    a.playbackRate = speed;
    await new Promise((resolve, reject) => {
      let done = false;
      let timer = null;
      const finish = () => {
        if (done) return;
        done = true;
        pending.delete(finish);
        if (timer) clearTimeout(timer);
        a.removeEventListener('ended', finish);
        resolve();
      };
      pending.add(finish);
      a.addEventListener('ended', finish);
      timer = setTimeout(finish, Math.round(4000 / Math.max(0.5, speed)));
      a.play().catch((e) => {
        finish();
        reject(e);
      });
    });
  } catch {
    await sayText(text, 'en-US');
  }
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
  settlePending();
};
