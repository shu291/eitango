export const localDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const getToday = () => localDateStr(new Date());
export const getYesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateStr(d);
};
export const getDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateStr(d);
};

/** 'YYYY-MM-DD' に n 日足した 'YYYY-MM-DD'。不正な文字列なら null */
export const addDays = (dateStr, n) => {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return localDateStr(dt);
};

/** b - a を日数で返す（a より b が後なら正）。不正な文字列なら null */
export const daysBetween = (a, b) => {
  const pa = String(a || '').split('-').map(Number);
  const pb = String(b || '').split('-').map(Number);
  if (!pa[0] || !pb[0]) return null;
  const da = new Date(pa[0], pa[1] - 1, pa[2]);
  const db = new Date(pb[0], pb[1] - 1, pb[2]);
  return Math.round((db - da) / 86400000);
};

export const shuffleArr = (a) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const JA_REGEX = /[　-〿぀-ゟ゠-ヿ一-龯㐀-䶿＀-￯]/;

export const MODE_MULT = {
  flashcard: 0.8,
  quiz: 1.0,
  typing: 1.3,
  reverse: 1.2,
  speed: 0.9,
  matching: 1.0,
};

/** 速さボーナスの境目（ミリ秒）と倍率 */
const SPEED_FAST_MS = 1500; // これより速ければ最大倍率
const SPEED_SLOW_MS = 8000; // これより遅ければ最小倍率
const SPEED_MAX = 1.6;
const SPEED_MIN = 0.8;

/**
 * 正解までの速さから、獲得点の倍率を求める。
 * 1.5秒以内なら 1.6倍、8秒以上かかると 0.8倍。その間はなだらかに変化する。
 *
 * すぐ答えられた＝しっかり覚えている、という考え方。時間が渡されない場合や
 * 数値でない場合は 1（＝影響なし）を返すので、時間を測っていないモードは従来どおり。
 *
 * @param {number} [ms] カードが出てから答えるまでの時間
 * @returns {number}
 */
export const speedFactor = (ms) => {
  if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) return 1;
  if (ms <= SPEED_FAST_MS) return SPEED_MAX;
  if (ms >= SPEED_SLOW_MS) return SPEED_MIN;
  const t = (ms - SPEED_FAST_MS) / (SPEED_SLOW_MS - SPEED_FAST_MS);
  return SPEED_MAX - (SPEED_MAX - SPEED_MIN) * t;
};

/**
 * @param {object} word
 * @param {boolean} ok
 * @param {string} mode
 * @param {number} [elapsedMs] 答えるまでにかかった時間。渡すと**正解時だけ**速さで増減する
 */
export const calcProg = (word, ok, mode = 'quiz', elapsedMs) => {
  const p = word.progress || 0;
  const s = word.streak || 0;
  const m = MODE_MULT[mode] || 1;
  if (ok) {
    const isFirstCorrect = (word.correct || 0) === 0;
    let base = p < 20 ? 15 : p < 40 ? 12 : p < 60 ? 10 : p < 80 ? 7 : 4;
    base += Math.min(s * 2, 6);
    // 速さボーナスは正解時のみ。間違えたときの減点は速さで変えない
    // （早とちりで間違えた人の減点が軽くなってしまうため）
    let gain = Math.round(base * m * speedFactor(elapsedMs));
    if (p > 90) gain = Math.max(1, Math.floor(gain / 2));
    let newProgress = Math.min(100, p + gain);
    if (isFirstCorrect) newProgress = Math.max(20, newProgress);
    return { progress: newProgress, streak: s + 1 };
  } else {
    let base = p < 20 ? 3 : p < 40 ? 8 : p < 60 ? 12 : p < 80 ? 16 : 20;
    if (s >= 3) base += 3;
    let loss = Math.round(base * (0.7 + m * 0.3));
    return { progress: Math.max(0, p - loss), streak: 0 };
  }
};

/**
 * 覚え具合（習熟度）の6段階。**低いほうから**並べてある。
 *
 * ここが段階の唯一の定義。1語の見た目（getLevel）・単語帳の絞り込み・統計の分布グラフが
 * すべてこの配列を読むので、境目や名前や色を変えるときはここだけ直せばよい。
 * 以前は同じ 90/80/60/40/20 の並びが3か所に散らばっていて、片方だけ直す事故が起きやすかった。
 *
 * `min` 以上 `max` 未満で1段。いちばん上だけ `max` を Infinity にしてある（progress が 100 まで来るため）。
 *
 * 色は段階ごとに色相を変える（赤 → 橙 → 黄 → 青 → 緑 → 紫）。
 * 値は src/theme.js の lv1〜lv6 と同じもの（logic.js は純粋関数だけにしたいので import しない）。
 * ⚠️ 片方だけ直すとバッジの文字色とグラフのバーの色がずれる。必ず両方そろえる。
 */
export const LEVELS = [
  { k: 'lv_review',   name: '要復習',   min: 0,  max: 20,       c: 'text-rose-600',    bg: 'bg-rose-50',    bar: 'bg-rose-400',    barColor: '#FB7185', i: '' },
  { k: 'lv_beginner', name: '初級',     min: 20, max: 40,       c: 'text-orange-600',  bg: 'bg-orange-50',  bar: 'bg-orange-400',  barColor: '#FB923C', i: '' },
  { k: 'lv_learning', name: '学習中',   min: 40, max: 60,       c: 'text-amber-600',   bg: 'bg-amber-50',   bar: 'bg-amber-500',   barColor: '#F59E0B', i: '' },
  { k: 'lv_settled',  name: '定着',     min: 60, max: 80,       c: 'text-blue-600',    bg: 'bg-blue-50',    bar: 'bg-blue-500',    barColor: '#3B82F6', i: '' },
  { k: 'lv_master',   name: 'マスター', min: 80, max: 90,       c: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500', barColor: '#10B981', i: '' },
  { k: 'lv_perfect',  name: '完璧',     min: 90, max: Infinity, c: 'text-purple-600',  bg: 'bg-purple-50',  bar: 'bg-purple-500',  barColor: '#9333EA', i: '' },
];

/**
 * まだ一度も出していない単語。**段階には含めない**。
 * progress 0 のまま「要復習」に混ぜると、手を付けていないだけの語が苦手に見えてしまう。
 */
export const LEVEL_NEW = { k: 'new', name: '未学習', min: 0, max: 0, c: 'text-gray-400', bg: 'bg-gray-50', bar: 'bg-gray-300', barColor: '#D1D5DB', i: '' };

/**
 * 習熟度から段階を1つ返す。
 * @param {number} p 0〜100
 * @param {boolean} [touched] 一度でも出したか。false なら段階ではなく「未学習」
 */
export const getLevel = (p, touched = true) => {
  if (!touched) return LEVEL_NEW;
  const q = clamp(p || 0, 0, 100);
  return LEVELS.find((l) => q >= l.min && q < l.max) || LEVELS[0];
};

// 一度も触れていない（正解も不正解も0回）
export const isNew = (w) => ((w.correct || 0) + (w.incorrect || 0)) === 0;

/**
 * その単語が指定した段階に入るか。単語帳の絞り込みで使う。
 * @param {object} w
 * @param {string} k LEVELS の k（'lv_review' など）
 */
export const inLevel = (w, k) => !isNew(w) && getLevel(w.progress || 0).k === k;

export const isWeak = (w) => {
  const t = (w.correct || 0) + (w.incorrect || 0);
  if (t < 2) return false;
  const rate = w.correct / t;
  return rate < 0.5 || (w.incorrect >= 3 && w.progress < 50);
};

/**
 * 通常モードで、その単語がどれだけ出題されやすいかの重み。
 * 大きいほど出やすい。返す値はだいたい 0.15〜6 の範囲。
 *
 * 5つを掛け合わせて決める:
 *   1. 習熟度   … 低いほど重い
 *   2. 間違い率 … 高いほど重い。ただし試行回数が少ないと当てにならないので、
 *                 回数に応じて効き目を割り引く（1回中1回ミスと20回中8回ミスを
 *                 同列に扱わないため）
 *   3. 未学習   … まだ一度も出ていない語が埋もれないよう下駄をはかせる
 *   4. 連続正解 … 3連続以上で正解できている語は少し控える
 *   5. 直近性   … さっき出したばかりの語を控える（recencyFactor 参照）
 *
 * @param {{progress?: number, correct?: number, incorrect?: number, streak?: number, due?: string, lastReviewed?: string}} w
 * @param {string} [todayStr] 直近性の判定に使う基準日
 * @returns {number}
 */
export const calcWeight = (w, todayStr = getToday()) => {
  const correct = w.correct || 0;
  const incorrect = w.incorrect || 0;
  const attempts = correct + incorrect;
  const progress = clamp(w.progress || 0, 0, 100);

  // 習熟度 0% → 3.0 / 100% → 0.5
  const byProgress = 3 - (progress / 100) * 2.5;

  // 間違い率 0% → 1.0倍 / 100% → 最大3.0倍
  // confidence は試行3回でおよそ0.5。回数を重ねるほど間違い率をそのまま信じる
  const errorRate = attempts > 0 ? incorrect / attempts : 0;
  const confidence = attempts / (attempts + 3);
  const byError = 1 + errorRate * 2 * confidence;

  // 未学習は 1.5倍。出題されないと永久に覚えられないため
  const byNew = attempts === 0 ? 1.5 : 1;

  // 3連続正解以上は 0.7倍。今は他の語に時間を使うべき
  const byStreak = (w.streak || 0) >= 3 ? 0.7 : 1;

  return byProgress * byError * byNew * byStreak * recencyFactor(w, todayStr);
};

/**
 * さっき出したばかりの単語を続けて出さないための重み。
 *
 * これが無いと、同じ日に2回3回と学習したときに **1回目で答えたばかりの単語が
 * そのまま2回目にも出てくる**（実測で「同じ語が5セッション連続」が起きていた）。
 * 「同じような単語ばかり出る」と感じる主な原因がこれ。
 *
 * 間隔反復の `due`（次回復習日）をそのまま流用する。予定が先の語ほど下げ、
 * 復習日が来ている語は少し後押しする。
 *
 * ⚠️ 未学習の語（`due` が無い）は 1 を返して影響を与えない。
 * ここで下げてしまうと、まだ一度も出ていない語が永久に出なくなる。
 *
 * @param {object} w
 * @param {string} todayStr
 * @returns {number} 0.25〜1.3
 */
export const recencyFactor = (w, todayStr) => {
  if (!w.due) return 1;
  // 今日もう出した語は大きく下げる。同じセッション内・連続セッションでの重複を防ぐ
  if (w.lastReviewed === todayStr) return 0.25;
  const left = daysBetween(todayStr, w.due);
  if (left === null) return 1;
  if (left <= 0) return 1.3; // 復習日が来ている＝そろそろ忘れる頃
  // 予定が先の語ほど下げる。7日先で 0.37、それ以上は 0.35 で頭打ち
  return clamp(1 - left * 0.09, 0.35, 1);
};

/**
 * 「学習した日」の集合から連続日数を数える。
 *
 * 連続日数のカウンタは1つの数値で持っているため、不具合や機種変で壊れると復元できない。
 * 一方どの単語にも `reviewedDates`（学習した日）が残っているので、そこから数え直せる。
 *
 * 今日まだ学習していなければ昨日から遡る（今日やれば続く、という扱い）。
 *
 * 注: reviewedDates は30日で切り捨てているため、ここで数えられるのも約30日まで。
 * それより長い連続は保存済みのカウンタ側が保持する。
 *
 * @param {Set<string>} dateSet 'YYYY-MM-DD' の集合
 * @param {string} todayStr
 * @returns {number}
 */
export const streakFromDates = (dateSet, todayStr) => {
  if (!dateSet || dateSet.size === 0) return 0;
  const [y, m, d] = todayStr.split('-').map(Number);
  const cursor = new Date(y, m - 1, d);
  if (!dateSet.has(todayStr)) cursor.setDate(cursor.getDate() - 1);
  let n = 0;
  while (dateSet.has(localDateStr(cursor))) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
};

// ===== 間隔反復（忘却曲線） =====
//
// 「この単語は次にいつ復習すべきか」を決める部分。SM-2（Anki が使っているのと
// 同じ系統のアルゴリズム）を、このアプリに合わせて調整して使っている。
//
// 考え方: 正解し続けた単語ほど復習の間隔を伸ばし、間違えた単語は明日また出す。
// 忘れる直前に復習するのが一番効率がよい、という研究にもとづく。
//
// 既存の習熟度（progress 0〜100）は**そのまま残して併存**させている。
//   - progress … 「どれくらい覚えているか」の目安。表示と重み付けに使う
//   - 間隔反復 … 「次にいつ出すか」の予定。復習モードの出題対象を決める
// 片方だけでは足りない（progress は日付を持たず、間隔反復は習熟度を表さない）。
//
// 単語が持つ項目（すべて後から足したものなので、無い場合の既定値がある）:
//   due  … 次回復習日 'YYYY-MM-DD'。null なら未スケジュール（＝一度も学習していない）
//   ivl  … 現在の間隔（日数）
//   ef   … 難易度係数。覚えやすい単語ほど大きく、間隔が速く伸びる

export const SR_MIN_EF = 1.3;
export const SR_MAX_EF = 2.5;
export const SR_DEFAULT_EF = 2.5;
/** 間隔の上限（日）。1年を超えて先の予定を立てても意味がないので頭打ちにする */
export const SR_MAX_IVL = 365;

/**
 * 手ごたえを 0〜5 で表す（SM-2 の quality）。
 *
 * 本来は本人に5段階で申告させるが、このアプリの操作は「正解／不正解」の2択なので、
 * **答えるまでの速さ**で 3〜5 を分けている。すぐ答えられた＝手ごたえがある。
 *
 * 時間を測っているのはフラッシュカードだけなので、他のモードは常に 4（ふつう）。
 *
 * @param {boolean} ok 正解したか
 * @param {number} [elapsedMs] 答えるまでの時間
 * @returns {number} 2（不正解）/ 3（遅い）/ 4（ふつう）/ 5（速い）
 */
export const srQuality = (ok, elapsedMs) => {
  if (!ok) return 2;
  if (typeof elapsedMs !== 'number' || !isFinite(elapsedMs) || elapsedMs < 0) return 4;
  if (elapsedMs <= 3000) return 5;
  if (elapsedMs >= 8000) return 3;
  return 4;
};

/**
 * 次回復習日を計算する。
 *
 * 間隔の伸び方:
 *   1回目の正解 → 1日後
 *   2回目の正解 → 3日後
 *   3回目以降   → 前回の間隔 × ef（覚えやすい単語ほど速く伸びる）
 *   不正解      → 1日後にリセット（間隔は最初からやり直し）
 *
 * ⚠️ 連続正解数は `word.streak` を見ている（**更新前**の値を渡すこと）。
 * SM-2 の「連続何回正解したか」と streak は同じ意味なので、別に持つと必ずずれる。
 *
 * @param {object} w 単語（更新前）
 * @param {boolean} ok 正解したか
 * @param {string} todayStr 'YYYY-MM-DD'
 * @param {number} [elapsedMs] 答えるまでの時間
 * @returns {{due: string, ivl: number, ef: number}}
 */
export const nextSchedule = (w, ok, todayStr, elapsedMs) => {
  const q = srQuality(ok, elapsedMs);
  const prevEf = typeof w.ef === 'number' ? w.ef : SR_DEFAULT_EF;
  const prevIvl = typeof w.ivl === 'number' && w.ivl > 0 ? w.ivl : 0;
  const reps = w.streak || 0;

  // SM-2 の難易度係数の更新式。q=5 で +0.1、q=4 で 増減なし、q=2 で -0.32
  const ef = clamp(prevEf + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)), SR_MIN_EF, SR_MAX_EF);

  let ivl;
  if (!ok) ivl = 1;
  else if (reps === 0) ivl = 1;
  else if (reps === 1) ivl = 3;
  else ivl = clamp(Math.round((prevIvl || 3) * ef), 1, SR_MAX_IVL);

  return { due: addDays(todayStr, ivl), ivl, ef: Math.round(ef * 100) / 100 };
};

/**
 * 今日やるべき単語か（復習日が来ているか）。
 *
 * 一度も学習していない単語（due が無い）は **対象外**。新規の単語は
 * 「新規モード」の担当で、復習モードは一度覚えた単語を忘れる前に出すためのもの。
 *
 * @param {object} w
 * @param {string} todayStr
 * @returns {boolean}
 */
export const isDue = (w, todayStr) => !!w.due && w.due <= todayStr;

/**
 * 単語から復習の予定だけを外す（習熟度・正解数・学習した日付は触らない）。
 *
 * 間隔反復を入れたとき、それ以前に覚えた単語へ「習熟度と正答率から逆算した予定」を
 * 後付けしていた（backfillSchedule）。**やめた。** 実際にいつ答えられたかを知らない
 * 数字から作った予定なので、開いた初日にいきなり数百語が「今日の復習」に積まれ、
 * 忘却曲線として正しくもなかった。今は予定を持つのは**その日から実際に答えた単語だけ**。
 *
 * @param {object} w
 * @returns {object} 予定を外した単語（もともと無ければ同じ参照を返す）
 */
export const clearSchedule = (w) => {
  if (!w || (!w.due && !w.ivl)) return w;
  return { ...w, due: null, ivl: 0, ef: SR_DEFAULT_EF };
};

/**
 * 復習日までの残り日数を「明日」「3日後」のような文にする。
 * @param {string} due 'YYYY-MM-DD'
 * @param {string} todayStr
 * @returns {string}
 */
export const formatDue = (due, todayStr) => {
  if (!due) return '未定';
  const d = daysBetween(todayStr, due);
  if (d === null) return '未定';
  if (d < 0) return `${-d}日超過`;
  if (d === 0) return '今日';
  if (d === 1) return '明日';
  return `${d}日後`;
};

// ===== 学習時間の記録 =====
//
// 時間を測れるのはフラッシュカードだけ（カードが出てから答えるまでを計っている）。
// 他のモードは計測していないので、ここに積むのはフラッシュカードぶんだけ。
//
// 形は { 'YYYY-MM-DD': { ms: 合計ミリ秒, n: 語数 } }。

/**
 * 1語に費やした時間として数える上限（ミリ秒）。
 *
 * カードを開いたまま放置されると、その1語だけで何十分も加算されてしまい
 * 「勉強時間」が実態とかけ離れる。頭打ちを設けて放置ぶんを切り捨てる。
 *
 * 15秒にしている。1語に15秒以上かけているのは、考えているのではなく
 * 手が止まっている（＝放置）とみなす。速さボーナスも8秒で最低倍率に達するので、
 * 「まじめに考えている」と扱う範囲はそもそも8秒までという設計になっている。
 */
export const MAX_WORD_MS = 15000;

/** 30日より古い記録は捨てる（単語の reviewedDates と同じ扱い） */
const TIME_KEEP_DAYS = 30;

/**
 * 学習時間の記録に1語ぶん足した新しい記録を返す（元は変更しない）。
 * @param {object} log 既存の記録
 * @param {string} day 'YYYY-MM-DD'
 * @param {number} ms その語にかかった時間
 * @param {string} [todayStr] 古い記録を捨てる基準日。省略時は day
 * @returns {object}
 */
export const addStudyTime = (log, day, ms, todayStr) => {
  const capped = Math.max(0, Math.min(Number(ms) || 0, MAX_WORD_MS));
  const base = log && typeof log === 'object' ? log : {};
  const prev = base[day] || { ms: 0, n: 0 };
  const next = { ...base, [day]: { ms: prev.ms + capped, n: prev.n + 1 } };

  // 古い日を落とす
  const cutoff = new Date(`${todayStr || day}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - TIME_KEEP_DAYS);
  const cutStr = localDateStr(cutoff);
  const trimmed = {};
  for (const k of Object.keys(next)) if (k >= cutStr) trimmed[k] = next[k];
  return trimmed;
};

/**
 * 期間をまとめた合計を返す。
 * @param {object} log
 * @param {string[]} [days] 対象の日。省略すると全期間
 * @returns {{ms: number, n: number, avgMs: number}}
 */
export const sumStudyTime = (log, days) => {
  const base = log && typeof log === 'object' ? log : {};
  const keys = days || Object.keys(base);
  let ms = 0;
  let n = 0;
  for (const k of keys) {
    const e = base[k];
    if (e) {
      ms += e.ms || 0;
      n += e.n || 0;
    }
  }
  return { ms, n, avgMs: n > 0 ? ms / n : 0 };
};

/** ミリ秒を「1時間5分」「12分34秒」「45秒」のように読みやすくする */
export const formatDuration = (ms) => {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}時間${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
};

/**
 * バイト数を「1.2 MB」のような読める文字にする。
 *
 * 保存データの大きさを出すのに使う。JSON の**文字数**から呼ぶときは
 * 2倍して渡すこと（ブラウザは保存領域を UTF-16＝1文字2バイトで数えるため）。
 *
 * @param {number} bytes
 * @returns {string}
 */
export const formatBytes = (bytes) => {
  if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

/** 英字を含むか。含んでいれば英単語の側とみなす */
const hasLatin = (s) => /[A-Za-z]/.test(s);

/**
 * 行頭に付いた「印」を落とす。
 *
 * 単語帳からコピーすると `新	26	hire	～を雇う` のように、
 * チェック印（新／★／済 など）や通し番号が英単語の前に並ぶことがある。
 * 英字を含まない要素が続く限り読み飛ばして、英単語から始まるようにする。
 *
 * ただし落としすぎると行が壊れるので、**英単語と意味の2つが残るときだけ**実際に落とす。
 * 例えば `りんご	apple`（日本語が先）は、落とすと意味が無くなるので元のまま返す。
 *
 * @param {string[]} parts
 * @returns {string[]}
 */
const dropLeadingMarkers = (parts) => {
  let i = 0;
  while (i < parts.length && !hasLatin(parts[i])) i++;
  // 英字を含む要素が無い、またはそれが最後で意味が残らない場合は触らない
  if (i === 0 || i >= parts.length - 1) return parts;
  return parts.slice(i);
};

/**
 * 英単語の側として妥当か。
 *
 * 区切りを読み違えると、英単語の欄に通し番号や意味まで入り込む
 * （例: `264	prompt	即座の`）。この状態で出題すると
 * **問題文に答えが混ざって見えてしまう**ので、返す前に必ずここで確かめ、
 * おかしければ次の区切りで割り直す。
 *
 * 弾くのは2つだけ。
 *   1. タブを含む     … 割れていない列がそのまま残っている
 *   2. 英字と日本語が混ざっている … 意味を巻き込んでいる（`apple,りんご` など）
 *
 * 日本語だけの場合は通す。`りんご	apple` のように和→英で貼り付けた単語帳を
 * これまで通り受けるため（dropLeadingMarkers の説明も参照）。
 * `in spite of` のような複数語や `P.S.` のような記号入りも通る。
 */
const looksLikeEn = (s) => !!s && !s.includes('\t') && !(hasLatin(s) && JA_REGEX.test(s));

export const parseLine = (line) => {
  const tr = line.trim();
  if (!tr) return null;

  // 区切りは **タブ → 全角スペース → カンマ** の順に試す。
  //
  // ⚠️ カンマを最後に回しているのが要点。意味には
  // `即座の, 素早い； ～を(…するよう)促す, 刺激する(to do)` のようにカンマが
  // 入ることがよくあり、先に試すと意味の途中で切ってしまう。
  // （以前はカンマが最優先で、この行の英単語が `264	prompt	即座の` になっていた）
  // タブと全角スペースは意味の中にはまず現れないので、こちらの方が信用できる。
  for (const sep of ['\t', '　', ',']) {
    if (!tr.includes(sep)) continue;
    const p = dropLeadingMarkers(tr.split(sep).map((s) => s.trim()).filter(Boolean));
    if (p.length < 2) continue;
    const i = /^\d+$/.test(p[0]) ? 1 : 0;
    if (p.length - i < 2) continue;
    const en = p[i];
    // 3つ以上に割れたら、残りは意味の続きとみなしてつなぎ直す。
    // タブのまま繋ぐと表示が改行のように崩れるので、読める区切りに置き換える
    const ja = p.slice(i + 1).join(sep === ',' ? '、' : '　').trim();
    // 読み違えていたら return せず、次の区切りで試す
    if (looksLikeEn(en) && ja) return { en, ja };
  }

  // 半角スペース区切りの場合も、行頭の印（新／★／通し番号など）を落としてから境目を探す
  const ws = tr.split(/\s+/).filter(Boolean);
  const kept = dropLeadingMarkers(ws);
  let cl = (kept.length < ws.length ? kept.join(' ') : tr)
    .replace(/^\d+[\s.、)\]】:：]+/, '')
    .trim();
  if (!cl) cl = tr;
  const ji = cl.search(JA_REGEX);
  if (ji > 0) {
    const en = cl.substring(0, ji).trim();
    const ja = cl.substring(ji).trim();
    if (looksLikeEn(en) && ja) return { en, ja };
  }
  const p = dropLeadingMarkers(tr.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean));
  if (p.length >= 2) {
    const i = /^\d+$/.test(p[0]) ? 1 : 0;
    if (p.length - i >= 2) {
      const en = p[i];
      const ja = p.slice(i + 1).join(' ').trim();
      if (looksLikeEn(en) && ja) return { en, ja };
    }
  }
  return null;
};

/**
 * 英単語の欄が壊れているか。looksLikeEn の裏返し。
 *
 * タブが残っている、または英字と日本語が混ざっているものを壊れているとみなす。
 * 日本語だけの欄は和→英の単語帳としてありうるので壊れ扱いしない。
 */
export const isBrokenEn = (en) => !!en && (en.includes('\t') || (hasLatin(en) && JA_REGEX.test(en)));

/**
 * 貼り付けの読み違いで壊れた単語を直す。
 *
 * カンマを最優先で区切っていた頃、意味にカンマが入った行が途中で切られ、
 * 英単語の欄に `264	prompt	即座の` のように通し番号・英単語・意味の先頭まで
 * まとめて入ってしまっていた。この状態だと出題時に問題文へ答えが混ざる。
 *
 * 英単語の欄を直した parseLine で割り直し、巻き込まれていた意味は元の意味の
 * **前に**戻す（`265	abandon	～を捨てる` ＋ `見捨てる` → `～を捨てる、見捨てる`）。
 * 意味の前半が欠けたままにならないよう、後ろではなく前に付ける。
 *
 * 割り直せない場合は触らない。日本語を英単語の欄に入れている単語帳
 * （和→英で使っている場合）は parseLine が null を返すのでそのまま残る。
 * 直したあとは条件に当たらなくなるので、何度呼んでも安全。
 *
 * @param {object} w 単語
 * @returns {object} 直した単語（変更が無ければ同じ参照を返す）
 */
export const repairWord = (w) => {
  if (!w || !isBrokenEn(w.en)) return w;
  const p = parseLine(w.en);
  if (!p) return w;
  const ja = w.ja ? `${p.ja}、${w.ja}` : p.ja;
  return { ...w, en: p.en, ja };
};

// 初期サンプルデータ（importDataするまで使う）
const today = getToday();
const y1 = getDaysAgo(1);
const y2 = getDaysAgo(2);
const y3 = getDaysAgo(3);

export const INIT_WORDS = [
  { id: 1, en: 'abundant', ja: '豊富な', progress: 95, correct: 10, incorrect: 1, streak: 5, lastReviewed: today, reviewedDates: [today, y1, y2] },
  { id: 2, en: 'benevolent', ja: '慈悲深い', progress: 92, correct: 8, incorrect: 0, streak: 8, lastReviewed: today, reviewedDates: [today, y1] },
  { id: 3, en: 'comprehensive', ja: '包括的な', progress: 100, correct: 12, incorrect: 2, streak: 6, lastReviewed: y1, reviewedDates: [y1, y2, y3] },
  { id: 4, en: 'diligent', ja: '勤勉な', progress: 85, correct: 7, incorrect: 2, streak: 3, lastReviewed: today, reviewedDates: [today] },
  { id: 5, en: 'eloquent', ja: '雄弁な', progress: 80, correct: 6, incorrect: 1, streak: 4, lastReviewed: y1, reviewedDates: [y1, y2] },
  { id: 6, en: 'fluctuate', ja: '変動する', progress: 88, correct: 9, incorrect: 3, streak: 2, lastReviewed: today, reviewedDates: [today, y1, y2, y3] },
  { id: 7, en: 'gregarious', ja: '社交的な', progress: 82, correct: 5, incorrect: 1, streak: 5, lastReviewed: y2, reviewedDates: [y2, y3] },
  { id: 8, en: 'hypothesis', ja: '仮説', progress: 75, correct: 6, incorrect: 3, streak: 2, lastReviewed: today, reviewedDates: [today, y1] },
  { id: 9, en: 'inevitable', ja: '避けられない', progress: 65, correct: 5, incorrect: 2, streak: 1, lastReviewed: y1, reviewedDates: [y1] },
  { id: 10, en: 'jubilant', ja: '歓喜した', progress: 70, correct: 4, incorrect: 2, streak: 3, lastReviewed: today, reviewedDates: [today, y2] },
  { id: 11, en: 'keen', ja: '鋭い・熱心な', progress: 60, correct: 3, incorrect: 1, streak: 2, lastReviewed: y3, reviewedDates: [y3] },
  { id: 12, en: 'lucrative', ja: '利益の多い', progress: 72, correct: 5, incorrect: 3, streak: 0, lastReviewed: today, reviewedDates: [today, y1, y2] },
  { id: 13, en: 'meticulous', ja: '細心の', progress: 55, correct: 4, incorrect: 3, streak: 1, lastReviewed: y1, reviewedDates: [y1, y2] },
  { id: 14, en: 'notorious', ja: '悪名高い', progress: 45, correct: 3, incorrect: 2, streak: 0, lastReviewed: today, reviewedDates: [today] },
  { id: 15, en: 'obsolete', ja: '時代遅れの', progress: 40, correct: 2, incorrect: 2, streak: 1, lastReviewed: y2, reviewedDates: [y2] },
  { id: 16, en: 'persevere', ja: '忍耐する', progress: 50, correct: 3, incorrect: 4, streak: 0, lastReviewed: today, reviewedDates: [today, y1] },
  { id: 17, en: 'resilient', ja: '回復力のある', progress: 35, correct: 2, incorrect: 3, streak: 0, lastReviewed: y1, reviewedDates: [y1] },
  { id: 18, en: 'scrutinize', ja: '精査する', progress: 20, correct: 1, incorrect: 1, streak: 1, lastReviewed: today, reviewedDates: [today] },
  { id: 19, en: 'tentative', ja: '暫定的な', progress: 25, correct: 1, incorrect: 0, streak: 1, lastReviewed: y3, reviewedDates: [y3] },
  { id: 20, en: 'ubiquitous', ja: '至る所にある', progress: 30, correct: 2, incorrect: 5, streak: 0, lastReviewed: today, reviewedDates: [today, y1, y2] },
  { id: 21, en: 'versatile', ja: '多才な', progress: 15, correct: 1, incorrect: 4, streak: 0, lastReviewed: y1, reviewedDates: [y1] },
  { id: 22, en: 'whimsical', ja: '気まぐれな', progress: 10, correct: 0, incorrect: 3, streak: 0, lastReviewed: y2, reviewedDates: [y2] },
  { id: 23, en: 'yield', ja: '産出する・譲る', progress: 5, correct: 0, incorrect: 2, streak: 0, lastReviewed: today, reviewedDates: [today] },
  { id: 24, en: 'zealous', ja: '熱心な', progress: 0, correct: 0, incorrect: 0, streak: 0, lastReviewed: null, reviewedDates: [] },
  { id: 25, en: 'ambiguous', ja: '曖昧な', progress: 0, correct: 0, incorrect: 0, streak: 0, lastReviewed: null, reviewedDates: [] },
  { id: 26, en: 'contemplate', ja: '熟考する', progress: 0, correct: 0, incorrect: 0, streak: 0, lastReviewed: null, reviewedDates: [] },
  { id: 27, en: 'pragmatic', ja: '実用的な', progress: 0, correct: 0, incorrect: 0, streak: 0, lastReviewed: null, reviewedDates: [] },
  { id: 28, en: 'profound', ja: '深い・深遠な', progress: 8, correct: 1, incorrect: 1, streak: 0, lastReviewed: y1, reviewedDates: [y1] },
  { id: 29, en: 'trivial', ja: '些細な', progress: 3, correct: 0, incorrect: 1, streak: 0, lastReviewed: y3, reviewedDates: [y3] },
  { id: 30, en: 'vivid', ja: '鮮明な', progress: 0, correct: 0, incorrect: 0, streak: 0, lastReviewed: null, reviewedDates: [] },
];
