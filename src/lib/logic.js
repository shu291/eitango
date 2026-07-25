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

export const calcProg = (word, ok, mode = 'quiz') => {
  const p = word.progress || 0;
  const s = word.streak || 0;
  const m = MODE_MULT[mode] || 1;
  if (ok) {
    const isFirstCorrect = (word.correct || 0) === 0;
    let base = p < 20 ? 15 : p < 40 ? 12 : p < 60 ? 10 : p < 80 ? 7 : 4;
    base += Math.min(s * 2, 6);
    let gain = Math.round(base * m);
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

export const parseLine = (line) => {
  const tr = line.trim();
  if (!tr) return null;
  for (const sep of [',', '\t', '　']) {
    if (tr.includes(sep)) {
      const p = tr.split(sep).map((s) => s.trim()).filter(Boolean);
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
  let cl = tr.replace(/^\d+[\s.、)\]】:：]+/, '').trim();
  if (!cl) cl = tr;
  const ji = cl.search(JA_REGEX);
  if (ji > 0) {
    const en = cl.substring(0, ji).trim();
    const ja = cl.substring(ji).trim();
    if (en && ja) return { en, ja };
  }
  const p = tr.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
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
