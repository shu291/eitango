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

export const getLevel = (p, touched = true) => {
  if (!touched) return { name: '未学習', c: 'text-gray-400', bg: 'bg-gray-50', bar: 'bg-gray-300', barColor: '#d1d5db', i: '❓' };
  if (p >= 90) return { name: '完璧', c: 'text-purple-600', bg: 'bg-purple-50', bar: 'bg-purple-500', barColor: '#9333ea', i: '👑' };
  if (p >= 80) return { name: 'マスター', c: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500', barColor: '#10b981', i: '⭐' };
  if (p >= 60) return { name: '定着', c: 'text-blue-600', bg: 'bg-blue-50', bar: 'bg-blue-500', barColor: '#3b82f6', i: '📘' };
  if (p >= 40) return { name: '学習中', c: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-500', barColor: '#f59e0b', i: '📝' };
  if (p >= 20) return { name: '初級', c: 'text-orange-600', bg: 'bg-orange-50', bar: 'bg-orange-400', barColor: '#fb923c', i: '🌱' };
  return { name: '要復習', c: 'text-rose-600', bg: 'bg-rose-50', bar: 'bg-rose-400', barColor: '#fb7185', i: '🔥' };
};

// 一度も触れていない（正解も不正解も0回）
export const isNew = (w) => ((w.correct || 0) + (w.incorrect || 0)) === 0;

export const isWeak = (w) => {
  const t = (w.correct || 0) + (w.incorrect || 0);
  if (t < 2) return false;
  const rate = w.correct / t;
  return rate < 0.5 || (w.incorrect >= 3 && w.progress < 50);
};

/**
 * 通常モードで、その単語がどれだけ出題されやすいかの重み。
 * 大きいほど出やすい。返す値はだいたい 0.4〜5 の範囲。
 *
 * 4つを掛け合わせて決める:
 *   1. 習熟度   … 低いほど重い
 *   2. 間違い率 … 高いほど重い。ただし試行回数が少ないと当てにならないので、
 *                 回数に応じて効き目を割り引く（1回中1回ミスと20回中8回ミスを
 *                 同列に扱わないため）
 *   3. 未学習   … まだ一度も出ていない語が埋もれないよう下駄をはかせる
 *   4. 連続正解 … 3連続以上で正解できている語は少し控える
 *
 * @param {{progress?: number, correct?: number, incorrect?: number, streak?: number}} w
 * @returns {number}
 */
export const calcWeight = (w) => {
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

  return byProgress * byError * byNew * byStreak;
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
 * 「勉強時間」が実態とかけ離れる。長考しても1分と見なして頭打ちにする。
 */
export const MAX_WORD_MS = 60000;

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

export const parseLine = (line) => {
  const tr = line.trim();
  if (!tr) return null;
  for (const sep of [',', '\t', '　']) {
    if (tr.includes(sep)) {
      const p = dropLeadingMarkers(tr.split(sep).map((s) => s.trim()).filter(Boolean));
      if (p.length >= 2) {
        let i = /^\d+$/.test(p[0]) ? 1 : 0;
        if (p.length - i >= 2) {
          const en = p[i];
          const ja = p.slice(i + 1).join(sep === ',' ? '、' : sep).trim();
          if (en && ja) return { en, ja };
        }
      }
    }
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
    if (en && ja) return { en, ja };
  }
  const p = dropLeadingMarkers(tr.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean));
  if (p.length >= 2) {
    let i = /^\d+$/.test(p[0]) ? 1 : 0;
    if (p.length - i >= 2) {
      const en = p[i];
      const ja = p.slice(i + 1).join(' ').trim();
      if (en && ja) return { en, ja };
    }
  }
  return null;
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
