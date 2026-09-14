// 単語ごとの例文（英語1文＋日本語訳）をローカル LLM（Ollama）で事前生成する。
//
//   npm run build:examples                          組み込みの単語で、例文がまだ無いものを生成
//   npm run build:examples -- --from 1900.json      アプリから書き出した JSON の単語も対象に加える
//   npm run build:examples -- --from list.txt       テキストの単語リスト（1行1語・「apple りんご」の形）でも可
//   npm run build:examples -- --words a,b,c         指定した単語も対象に加える（意味は空でよい）
//   npm run build:examples -- --model gemma3:12b    使うモデルを変える（既定は下の DEFAULT_MODEL）
//   npm run build:examples -- --force               既にある例文も作り直す
//   npm run build:examples -- --limit 50            先頭から N 語だけ（試しに回すとき）
//   npm run build:examples -- --batch 10            1回の問い合わせで何語まとめて作るか（既定 10。1 で1語ずつ）
//
// --from は、アプリの「保存」で書き出した JSON をそのまま渡せる（v1 / v2 どちらも可）。
// JSON でなければテキストの単語リストとして読む。区切りはアプリの一括追加と同じ
// （タブ / 全角スペース / カンマ / 半角スペース。行頭の番号や印は落とす。parseLine を使う）。
// スマホで単語を追加 → 保存 → その JSON を Mac に持ってきて --from で渡す、
// という流れで、自分で足した単語にも例文を用意できる。build-audio.mjs と同じ流儀。
//
// 生成物:
//   src/lib/exampleMap.json   … 単語キー → { en, ja } の対応表（自動生成・コミットする）
//
// このスクリプトは開発マシンでだけ動かす。アプリは exampleMap.json を読むだけなので、
// iPhone でも公開 Web 版でも実行時に AI は要らない。例文が無い単語は何も出ない。
//
// 途中で止めても大丈夫。10 語ごとに書き出していて、次に回すと続きからになる
// （既にある語は飛ばす。--force で作り直し）。
//
// 前提（初回のみ・README の「例文の作り直し」を参照）:
//   brew install ollama
//   ollama serve            （別のターミナルで起動しておく。アプリ版 Ollama なら不要）
//   ollama pull gemma3:12b  （初回はモデルの取得に数分）

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLine } from '../src/lib/logic.js';
import { headwordCoverage } from '../src/lib/headword.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAP_FILE = join(ROOT, 'src/lib/exampleMap.json');
const LOGIC_FILE = join(ROOT, 'src/lib/logic.js');

/**
 * 既定のモデル。例文を1文作るだけなので 8〜12B クラスで十分。
 * Apple シリコンの Mac なら 1 語あたり数秒。1900 語で 1 時間前後。
 * 日本語訳の質を上げたければ gemma3:27b や qwen3:14b にする（遅くなる）。
 */
const DEFAULT_MODEL = 'gemma3:12b';
const DEFAULT_HOST = 'http://localhost:11434';
/** 1 語につき何回まで作り直させるか（検査に通らなかったとき） */
const MAX_TRIES = 4;
/**
 * 1回の問い合わせでまとめて作る語数。
 * 1語ずつだと毎回のやりとりの無駄（プロンプトの読み込み・返事の立ち上がり）が大きく、
 * 2万語だと 12B モデルで 17 時間近くかかる。10語まとめると 1/3 程度になる。
 * まとめて作った中で検査に通らなかった語は、あとで1語ずつ作り直す。
 */
const DEFAULT_BATCH = 10;
/** 何語ごとにファイルへ書き出すか（途中で止めても続きから再開できるように） */
const SAVE_EVERY = 10;
/** 例文の長さ（語数）の許容範囲。短すぎると用法が分からず、長すぎるとカードに収まらない */
const MIN_WORDS = 5;
const MAX_WORDS = 18;

const argv = process.argv.slice(2);
const force = argv.includes('--force');

/** `--name 値` の形の引数を読む。無ければ null */
const argValue = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};

const model = argValue('--model') || DEFAULT_MODEL;
const host = (argValue('--host') || DEFAULT_HOST).replace(/\/$/, '');
const limit = argValue('--limit') ? parseInt(argValue('--limit'), 10) : Infinity;
const batchSize = Math.max(1, parseInt(argValue('--batch') || DEFAULT_BATCH, 10) || DEFAULT_BATCH);

/** 単語 → 対応表のキー。src/lib/examples.js の keyOf と必ず揃えること。 */
const keyOf = (word) => String(word ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** 例文を作れる単語か（英字を含まないものは対象外） */
const isEnglish = (word) => /[a-z]/i.test(word) && keyOf(word).length > 0;

/** logic.js の INIT_WORDS から { en, ja } を抜き出す（build-audio.mjs と同じ読み方） */
function readInitWords() {
  const src = readFileSync(LOGIC_FILE, 'utf8');
  const block = src.match(/INIT_WORDS\s*=\s*\[([\s\S]*?)\n\];/);
  if (!block) {
    console.error('logic.js から INIT_WORDS を読み取れませんでした。');
    process.exit(1);
  }
  const out = [];
  const re = /en:\s*'([^']+)'\s*,\s*ja:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(block[1]))) out.push({ en: m[1], ja: m[2] });
  return out;
}

/**
 * --from のファイルから { en, ja } を抜き出す。
 * アプリが書き出した JSON（v1: {w:[...]} / v2: {decks:[{words:[...]}]}）か、
 * JSON でなければテキストの単語リスト（1行1語）として読む。
 */
function readExportedWords(path) {
  const abs = resolve(path);
  if (!existsSync(abs)) {
    console.error(`--from のファイルが見つかりません: ${abs}`);
    process.exit(1);
  }
  const raw = readFileSync(abs, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    // JSON でない → テキストの単語リスト。アプリの一括追加と同じ読み方
    const out = raw
      .split(/\r?\n/)
      .map((l) => parseLine(l))
      .filter(Boolean)
      // タブ区切りだと行頭の「1.」が残ることがあるので、番号だけの先頭は落とす
      .map((w) => ({ ...w, en: w.en.replace(/^\s*\d+[.)]?\s+/, '') }));
    if (!out.length) {
      console.error('テキストから単語を読み取れませんでした（「apple りんご」のように1行1語で）。');
      process.exit(1);
    }
    return out;
  }
  const lists = [];
  if (Array.isArray(data.w)) lists.push(data.w);
  if (Array.isArray(data.decks)) for (const d of data.decks) if (Array.isArray(d.words)) lists.push(d.words);
  if (Array.isArray(data)) lists.push(data);
  const out = [];
  for (const list of lists) for (const w of list) if (w && typeof w.en === 'string') out.push({ en: w.en, ja: String(w.ja ?? '') });
  if (!out.length) {
    console.error('JSON に単語が見つかりませんでした（w か decks[].words を探しています）。');
    process.exit(1);
  }
  return out;
}

function loadMap() {
  if (!existsSync(MAP_FILE)) return {};
  try {
    return JSON.parse(readFileSync(MAP_FILE, 'utf8'));
  } catch (e) {
    console.error(`${MAP_FILE} を読めませんでした: ${e.message}`);
    process.exit(1);
  }
}

function saveMap(map) {
  const sorted = Object.fromEntries(Object.keys(map).sort().map((k) => [k, map[k]]));
  writeFileSync(MAP_FILE, JSON.stringify(sorted, null, 2) + '\n');
}

/**
 * 例文の検査。LLM の出力はそのまま信じない。
 * 通らなければ理由を返し、呼び出し側が作り直させる。
 */
function validate(word, ex) {
  if (!ex || typeof ex !== 'object') return '出力が JSON オブジェクトでない';
  const en = String(ex.en ?? '').replace(/\s+/g, ' ').trim();
  const ja = String(ex.ja ?? '').replace(/\s+/g, ' ').trim();
  if (!en) return '英文が空';
  if (!ja) return '日本語訳が空';
  if (!/[぀-ヿ一-鿿]/.test(ja)) return '日本語訳に日本語が含まれない';
  if (/[぀-ヿ一-鿿]/.test(en)) return '英文に日本語が混ざっている';
  const n = en.split(' ').length;
  if (n < MIN_WORDS) return `英文が短すぎる（${n}語）`;
  if (n > MAX_WORDS) return `英文が長すぎる（${n}語）`;
  // 見出し語が使われているか。判定はアプリの太字表示と同じ headword.js に1つだけ置いてある
  // （活用形・不規則動詞・熟語の型の記号 A / B / one's の扱いもそちら）。
  // 1語の見出しはその語が必要。熟語は中身の語の6割以上（of/about のような「どちらか」を吸収）
  const { content, found, missing } = headwordCoverage(en, word);
  if (content.length === 1 && !found.length) return `英文に「${content[0]}」が使われていない`;
  if (content.length > 1 && found.length < Math.max(1, Math.ceil(content.length * 0.6))) {
    return `英文に熟語の中身（${missing.join(', ')}）が使われていない`;
  }
  return null;
}

function buildPrompt(en, ja) {
  const meaning = ja
    ? `Japanese meaning(s) as listed in the vocabulary book: "${ja}". Use the most common one.`
    : 'Use the most common meaning.';
  return [
    `Write ONE natural English example sentence using the word "${en}".`,
    meaning,
    'Requirements:',
    `- ${MIN_WORDS} to ${MAX_WORDS} words, one sentence, everyday or academic context suitable for Japanese university entrance exams.`,
    `- The word "${en}" must appear in the sentence (inflected forms are fine) in exactly the meaning given above.`,
    '- If it is a phrase pattern, A / B / one\'s / do / sth are placeholders: fill them with real words (e.g. "accuse A of B" -> "accused him of lying").',
    '- Do not explain the word. Do not use quotation marks around the word.',
    '- Also give a natural Japanese translation of the whole sentence.',
    'Answer in JSON only: {"en": "<sentence>", "ja": "<Japanese translation>"}',
  ].join('\n');
}

/** まとめて聞くときのプロンプト。単語ごとの要件は buildPrompt と同じ */
function buildBatchPrompt(words) {
  const list = words.map((w, i) => `${i + 1}. "${w.en}"${w.ja ? ` — Japanese meaning(s): "${w.ja}" (use the most common one)` : ''}`).join('\n');
  return [
    `Write ONE natural English example sentence for EACH of the following ${words.length} words.`,
    list,
    'Requirements for every sentence:',
    `- ${MIN_WORDS} to ${MAX_WORDS} words, one sentence, everyday or academic context suitable for Japanese university entrance exams.`,
    '- The word must appear in its sentence (inflected forms are fine) in exactly the meaning given.',
    '- For phrase patterns, A / B / one\'s / do / sth are placeholders: fill them with real words (e.g. "accuse A of B" -> "accused him of lying").',
    '- Do not explain the word. Do not use quotation marks around the word.',
    '- Also give a natural Japanese translation of each sentence.',
    'Answer in JSON only, one item per word, in the same order:',
    '{"items": [{"word": "<word exactly as listed>", "en": "<sentence>", "ja": "<Japanese translation>"}, ...]}',
  ].join('\n');
}

async function chat(userContent) {
  const res = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      options: { temperature: 0.7 },
      messages: [
        { role: 'system', content: 'You are an English teacher writing example sentences for Japanese high school students. Reply with JSON only.' },
        { role: 'user', content: userContent },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama が ${res.status} を返しました: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const text = body?.message?.content ?? '';
  // format: 'json' でも前後に余計な文字が付くことがあるので、最初の { から最後の } までを取る
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`JSON が見つかりません: ${text.slice(0, 120)}`);
  return JSON.parse(m[0]);
}

/**
 * まとめて作る。返ってきたものを単語ごとに検査し、合格した語だけ { key: {en, ja} } で返す。
 * 足りない・不合格の語は呼び出し側が1語ずつ作り直す。
 */
async function askOllamaBatch(words) {
  const out = {};
  let data;
  try {
    data = await chat(buildBatchPrompt(words));
  } catch (e) {
    console.log(`  （まとめ聞きに失敗: ${e.message.slice(0, 80)}。1語ずつに切り替えます）`);
    return out;
  }
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  items.forEach((it, i) => {
    // word で突き合わせ、無ければ順番で
    const byWord = it && typeof it.word === 'string' ? words.find((w) => keyOf(w.en) === keyOf(it.word)) : null;
    const w = byWord || words[i];
    if (!w || out[w.key]) return;
    if (validate(w.en, it)) return;
    out[w.key] = { en: String(it.en).replace(/\s+/g, ' ').trim(), ja: String(it.ja).replace(/\s+/g, ' ').trim() };
  });
  return out;
}

async function askOllama(en, ja) {
  return chat(buildPrompt(en, ja));
}

async function checkOllama() {
  let tags;
  try {
    tags = await (await fetch(`${host}/api/tags`)).json();
  } catch {
    console.error(`Ollama に接続できません（${host}）。`);
    console.error('  brew install ollama → 別ターミナルで ollama serve → ollama pull ' + model);
    process.exit(1);
  }
  const names = (tags.models || []).map((m) => m.name);
  const has = names.some((n) => n === model || n.split(':')[0] === model.split(':')[0]);
  if (!has) {
    console.error(`モデル ${model} が入っていません。入っているもの: ${names.join(', ') || '（なし）'}`);
    console.error(`  ollama pull ${model}`);
    process.exit(1);
  }
}

async function main() {
  // 対象の単語を集める。同じ単語（キーが同じ）は1件にまとめる。
  // 単語帳ごとに意味の書き方が違うことが多い（change: 変える／つり銭；変化）ので、
  // 意味は捨てずに「；」でつないで全部渡す。LLM は一番ふつうの意味で文を作る
  const seen = new Map();
  const add = (w) => {
    if (!isEnglish(w.en)) return;
    const k = keyOf(w.en);
    const ja = (w.ja || '').trim();
    if (!seen.has(k)) {
      seen.set(k, { key: k, en: w.en.trim(), ja });
      return;
    }
    const cur = seen.get(k);
    if (ja && !cur.ja.includes(ja) && cur.ja.length < 120) cur.ja = cur.ja ? `${cur.ja}；${ja}` : ja;
  };
  readInitWords().forEach(add);
  const from = argValue('--from');
  if (from) readExportedWords(from).forEach(add);
  const extra = argValue('--words');
  if (extra) extra.split(',').map((s) => s.trim()).filter(Boolean).forEach((en) => add({ en, ja: '' }));

  const map = loadMap();
  let targets = [...seen.values()].filter((w) => force || !map[w.key]);
  if (targets.length > limit) targets = targets.slice(0, limit);
  console.log(`対象 ${seen.size} 語のうち、これから作るのは ${targets.length} 語（既にある: ${Object.keys(map).length}）`);
  if (!targets.length) return;

  await checkOllama();
  console.log(`モデル: ${model} / ${batchSize} 語ずつ / 保存先: ${MAP_FILE}`);

  const started = Date.now();
  let done = 0;
  let failed = 0;
  const report = (w, ex) => {
    done++;
    console.log(`[${done}/${targets.length}] ${w.en}: ${ex.en}`);
    if (done % SAVE_EVERY === 0) {
      saveMap(map);
      const per = (Date.now() - started) / done;
      const left = Math.round(((targets.length - done) * per) / 60000);
      console.log(`  …保存しました（残り約 ${left} 分）`);
    }
  };

  // 1. まとめて作る。合格した語はここで確定
  const leftovers = [];
  if (batchSize > 1) {
    for (let i = 0; i < targets.length; i += batchSize) {
      const chunk = targets.slice(i, i + batchSize);
      const got = await askOllamaBatch(chunk);
      for (const w of chunk) {
        if (got[w.key]) {
          map[w.key] = got[w.key];
          report(w, got[w.key]);
        } else leftovers.push(w);
      }
    }
    if (leftovers.length) console.log(`\nまとめ聞きで足りなかった ${leftovers.length} 語を1語ずつ作ります`);
  } else leftovers.push(...targets);

  // 2. 残りは1語ずつ（最大 MAX_TRIES 回まで作り直し）
  for (const w of leftovers) {
    let ex = null;
    let lastReason = '';
    for (let t = 1; t <= MAX_TRIES && !ex; t++) {
      try {
        const cand = await askOllama(w.en, w.ja);
        const reason = validate(w.en, cand);
        if (reason) lastReason = reason;
        else ex = { en: String(cand.en).replace(/\s+/g, ' ').trim(), ja: String(cand.ja).replace(/\s+/g, ' ').trim() };
      } catch (e) {
        lastReason = e.message;
      }
    }
    if (ex) {
      map[w.key] = ex;
      report(w, ex);
    } else {
      failed++;
      done++;
      console.log(`[${done}/${targets.length}] ${w.en}: ✗ ${MAX_TRIES}回とも不合格（${lastReason}）`);
    }
  }
  saveMap(map);
  console.log(`\n完了: ${done - failed} 語を作成、${failed} 語は不合格。${Object.keys(map).length} 語ぶんを ${MAP_FILE} に保存しました。`);
  if (failed) console.log('不合格の語はもう一度実行すると再挑戦します。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
