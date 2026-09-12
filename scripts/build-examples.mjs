// 単語ごとの例文（英語1文＋日本語訳）をローカル LLM（Ollama）で事前生成する。
//
//   npm run build:examples                          組み込みの単語で、例文がまだ無いものを生成
//   npm run build:examples -- --from 1900.json      アプリから書き出した JSON の単語も対象に加える
//   npm run build:examples -- --words a,b,c         指定した単語も対象に加える（意味は空でよい）
//   npm run build:examples -- --model gemma3:12b    使うモデルを変える（既定は下の DEFAULT_MODEL）
//   npm run build:examples -- --force               既にある例文も作り直す
//   npm run build:examples -- --limit 50            先頭から N 語だけ（試しに回すとき）
//
// --from は、アプリの「保存」で書き出した JSON をそのまま渡せる（v1 / v2 どちらも可）。
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

/** アプリが書き出した JSON（v1: {w:[...]} / v2: {decks:[{words:[...]}]}）から { en, ja } を抜き出す */
function readExportedWords(path) {
  const abs = resolve(path);
  if (!existsSync(abs)) {
    console.error(`--from のファイルが見つかりません: ${abs}`);
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(abs, 'utf8'));
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
  // 見出し語が使われているか。活用形（-s / -ed / -ing / -ies など）は語幹で許す
  const sentence = en.toLowerCase();
  for (const tok of word.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    const stem = tok.length >= 5 ? tok.slice(0, tok.length - 2) : tok;
    const re = new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z]*\\b`);
    if (!re.test(sentence)) return `英文に「${tok}」が使われていない`;
  }
  return null;
}

function buildPrompt(en, ja) {
  const meaning = ja ? `Japanese meaning to use: "${ja}"` : 'Use the most common meaning.';
  return [
    `Write ONE natural English example sentence using the word "${en}".`,
    meaning,
    'Requirements:',
    `- ${MIN_WORDS} to ${MAX_WORDS} words, one sentence, everyday or academic context suitable for Japanese university entrance exams.`,
    `- The word "${en}" must appear in the sentence (inflected forms are fine) in exactly the meaning given above.`,
    '- Do not explain the word. Do not use quotation marks around the word.',
    '- Also give a natural Japanese translation of the whole sentence.',
    'Answer in JSON only: {"en": "<sentence>", "ja": "<Japanese translation>"}',
  ].join('\n');
}

async function askOllama(en, ja) {
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
        { role: 'user', content: buildPrompt(en, ja) },
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
  // 対象の単語を集める。同じ単語（キーが同じ）は最初の1件だけ
  const seen = new Map();
  const add = (w) => {
    if (!isEnglish(w.en)) return;
    const k = keyOf(w.en);
    if (!seen.has(k)) seen.set(k, { key: k, en: w.en.trim(), ja: (w.ja || '').trim() });
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
  console.log(`モデル: ${model} / 保存先: ${MAP_FILE}`);

  const started = Date.now();
  let done = 0;
  let failed = 0;
  for (const w of targets) {
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
    done++;
    if (ex) {
      map[w.key] = ex;
      console.log(`[${done}/${targets.length}] ${w.en}: ${ex.en}`);
    } else {
      failed++;
      console.log(`[${done}/${targets.length}] ${w.en}: ✗ ${MAX_TRIES}回とも不合格（${lastReason}）`);
    }
    if (done % SAVE_EVERY === 0) {
      saveMap(map);
      const per = (Date.now() - started) / done;
      const left = Math.round(((targets.length - done) * per) / 60000);
      console.log(`  …保存しました（残り約 ${left} 分）`);
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
