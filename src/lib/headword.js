// 例文の中から「見出し語（の活用形）」を探す。純粋関数だけ（JSON も RN も読まない）。
//
// 使う側:
//   - src/lib/examples.js … 太字表示（フラッシュカード・単語帳・聞き流し）と例文クイズの空欄
//   - scripts/build-examples.mjs … LLM が作った例文の検査（見出し語が本当に使われているか）
// 同じ判定を2か所で持つと「アプリでは太字にならないのに検査は通る」がずれるので、ここに1つだけ置く。
//
// 判定の考え方:
//   - 5文字以上の語は末尾2文字を落とした語幹で前方一致（-s / -ed / -ing / -ies を許す）
//   - 4文字以下はそのまま。ただし不規則動詞（take → took / taken）は表で許す
//   - 熟語は語ごとに探す。A / B / one's / do / sth のような「型の記号」と 2文字以下の語
//     （up / to / of）は文中のあちこちに出るので数えない（見出しが1語のときはその語を必ず探す）

/** 熟語の見出しに混ざる「型の記号」。文中にそのまま出ないので探さない */
export const PLACEHOLDERS = new Set([
  'one', 'ones', "one's", 'oneself', 'someone', 'somebody', 'something', 'sth', 'sb',
  'doing', 'ing', 'the', 'and', 'that', 'all', 'just', 'it', 'is', 'etc', 'with',
]);

/** よく熟語に出る不規則動詞。原形 → 文中に出うる別の形 */
const IRREGULAR = {
  take: ['took', 'taken'], give: ['gave', 'given'], get: ['got', 'gotten'], go: ['went', 'gone', 'goes'],
  come: ['came'], make: ['made'], run: ['ran'], see: ['saw', 'seen'], keep: ['kept'], hold: ['held'],
  bring: ['brought'], break: ['broke', 'broken'], fall: ['fell', 'fallen'], stand: ['stood'], do: ['did', 'done', 'does'],
  have: ['had', 'has'], catch: ['caught'], think: ['thought'], tell: ['told'], find: ['found'], lose: ['lost'],
  leave: ['left'], feel: ['felt'], meet: ['met'], pay: ['paid'], say: ['said'], sell: ['sold'], send: ['sent'],
  sit: ['sat'], speak: ['spoke', 'spoken'], spend: ['spent'], stick: ['stuck'], teach: ['taught'], throw: ['threw', 'thrown'],
  wear: ['wore', 'worn'], write: ['wrote', 'written'], know: ['knew', 'known'], grow: ['grew', 'grown'], blow: ['blew', 'blown'],
  draw: ['drew', 'drawn'], drive: ['drove', 'driven'], eat: ['ate', 'eaten'], forget: ['forgot', 'forgotten'], hear: ['heard'],
  hide: ['hid', 'hidden'], lie: ['lay', 'lain', 'lying'], light: ['lit'], mean: ['meant'], ride: ['rode', 'ridden'],
  ring: ['rang', 'rung'], rise: ['rose', 'risen'], shake: ['shook', 'shaken'], shine: ['shone'], shoot: ['shot'],
  show: ['shown'], sing: ['sang', 'sung'], sink: ['sank', 'sunk'], sleep: ['slept'], slide: ['slid'], steal: ['stole', 'stolen'],
  strike: ['struck'], swim: ['swam', 'swum'], swing: ['swung'], tear: ['tore', 'torn'], wake: ['woke', 'woken'], win: ['won'],
  bear: ['bore', 'borne', 'born'], become: ['became'], begin: ['began', 'begun'], bend: ['bent'], bind: ['bound'],
  bite: ['bit', 'bitten'], build: ['built'], burn: ['burnt'], buy: ['bought'], choose: ['chose', 'chosen'], deal: ['dealt'],
  dig: ['dug'], fight: ['fought'], fly: ['flew', 'flown'], freeze: ['froze', 'frozen'], hang: ['hung'], lead: ['led'],
  lend: ['lent'], seek: ['sought'], spring: ['sprang', 'sprung'], sweep: ['swept'], understand: ['understood'],
  undergo: ['underwent', 'undergone'], withdraw: ['withdrew', 'withdrawn'], put: [], cut: [], set: [], let: [], hit: [], shut: [],
};

const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 1語ぶんの正規表現の中身（語幹の前方一致 ＋ 不規則形） */
const tokenPattern = (tok) => {
  const t = tok.replace(/'/g, '');
  const stem = t.length >= 5 ? t.slice(0, t.length - 2) : t;
  const forms = [`${esc(stem)}[a-z']*`];
  for (const f of IRREGULAR[t] || []) forms.push(esc(f));
  return `(?:${forms.join('|')})`;
};

/** 見出し語を語に分ける（小文字） */
export const headwordTokens = (headword) =>
  String(headword ?? '').toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);

/** 実際に文中で探す語。1語の見出しはその語、熟語は3文字以上で型の記号でないもの */
export const contentTokens = (headword) => {
  const toks = headwordTokens(headword);
  if (toks.length <= 1) return toks;
  return toks.filter((t) => t.length >= 3 && !PLACEHOLDERS.has(t));
};

/**
 * 例文の中で見出し語（の活用形）が出ている場所を切り出す。
 * @param {string} sentence
 * @param {string} headword
 * @returns {{text: string, hit: boolean}[]}
 */
export const splitByHeadword = (sentence, headword) => {
  const text = String(sentence ?? '');
  const toks = contentTokens(headword);
  if (!text || !toks.length) return [{ text, hit: false }];
  const re = new RegExp(`\\b(?:${toks.map(tokenPattern).join('|')})\\b`, 'gi');
  const out = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), hit: false });
    out.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out.length ? out : [{ text, hit: false }];
};

/**
 * 見出し語の中身の語のうち、文中に見つかったもの／見つからなかったもの。
 * 検査（scripts/build-examples.mjs）用。
 * @returns {{content: string[], found: string[], missing: string[]}}
 */
export const headwordCoverage = (sentence, headword) => {
  const s = String(sentence ?? '').toLowerCase();
  const content = contentTokens(headword);
  const found = content.filter((t) => new RegExp(`\\b${tokenPattern(t)}\\b`, 'i').test(s));
  return { content, found, missing: content.filter((t) => !found.includes(t)) };
};

/**
 * 例文の中に見出し語が見つかるか（太字にできるか・例文クイズに出せるか）。
 * 1語の見出しはその語が必要。熟語は中身の語の6割以上（of/about のような「どちらか」を吸収）。
 */
export const hasHeadword = (sentence, headword) => {
  const { content, found } = headwordCoverage(sentence, headword);
  if (!content.length) return false;
  if (content.length === 1) return found.length === 1;
  // 2語なら1語、3語なら2語、5語なら3語。「as ~ as possible [one can]」のような別案つきを吸収する
  return found.length >= Math.max(1, Math.round(content.length * 0.6));
};
