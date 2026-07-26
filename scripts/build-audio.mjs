// 単語の発音音声をローカル AI（Piper TTS）で事前生成する。
//
//   npm run build:audio                     組み込みの単語で、音声がまだ無いものを生成
//   npm run build:audio -- --words a,b,c    指定した単語も対象に加える
//   npm run build:audio -- --from 1200.json アプリから書き出した JSON の単語も対象に加える
//   npm run build:audio -- --force          既にある音声も作り直す
//
// --from は、アプリの「保存」で書き出した JSON をそのまま渡せる。
// スマホで単語を追加 → 保存 → その JSON を Mac に持ってきて --from で渡す、
// という流れで、自分で足した単語にも AI 音声を用意できる。
//
// 生成物:
//   assets/audio/<単語>.m4a   … アプリに同梱される音声ファイル
//   src/lib/audioMap.js       … 単語 → 音声ファイル の対応表（自動生成）
//
// このスクリプトは開発マシンでだけ動かす。生成した .m4a と audioMap.js を
// コミットすれば、iPhone でも公開 Web 版でも音声が鳴る（実行時に AI は要らない）。
// 音声が無い単語は端末内蔵の読み上げが肩代わりする（src/lib/speech.js を参照）。
//
// 前提（初回のみ・README の「音声の作り直し」を参照）:
//   brew install python@3.13
//   $(brew --prefix python@3.13)/bin/python3.13 -m venv .tts-venv
//   .tts-venv/bin/pip install piper-tts
//   .tts-venv/bin/python -m piper.download_voices en_US-lessac-medium --download-dir .tts-models

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VENV_PY = join(ROOT, '.tts-venv/bin/python');
const MODEL = join(ROOT, '.tts-models/en_US-lessac-medium.onnx');
const AUDIO_DIR = join(ROOT, 'assets/audio');
const MAP_FILE = join(ROOT, 'src/lib/audioMap.js');
const LOGIC_FILE = join(ROOT, 'src/lib/logic.js');

const argv = process.argv.slice(2);
const force = argv.includes('--force');

/** `--name 値` の形の引数を読む。無ければ null */
const argValue = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};

/** 単語をファイル名に使える形にする。speech.js 側の keyOf と必ず揃えること。 */
const keyOf = (word) => word.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

/** 音声を作れる単語か（英字を含まないものは Piper に渡しても意味がない） */
const isSpeakable = (word) => /[a-z]/i.test(word) && keyOf(word).length > 0;

function checkSetup() {
  const missing = [];
  if (!existsSync(VENV_PY)) missing.push(`.tts-venv （Python 仮想環境）`);
  if (!existsSync(MODEL)) missing.push(`.tts-models/en_US-lessac-medium.onnx （音声モデル）`);
  if (missing.length) {
    console.error('音声生成の準備ができていません。見つからないもの:');
    missing.forEach((m) => console.error('  - ' + m));
    console.error('\nREADME.md の「音声の作り直し」の手順を実行してください。');
    process.exit(1);
  }
}

/** logic.js の INIT_WORDS から英単語を抜き出す */
function readBuiltinWords() {
  const src = readFileSync(LOGIC_FILE, 'utf8');
  const block = src.match(/INIT_WORDS\s*=\s*\[([\s\S]*?)\n\];/);
  if (!block) {
    console.error('logic.js から INIT_WORDS を読み取れませんでした。');
    process.exit(1);
  }
  return [...block[1].matchAll(/en:\s*'([^']+)'/g)].map((m) => m[1]);
}

/**
 * アプリの「保存」で書き出した JSON から英単語を抜き出す。
 * 形式は { w: [{ en, ja, ... }], s, ld, n }（App.js の exportData を参照）。
 * 単語の配列だけの JSON や、文字列の配列も一応受け付ける。
 */
function readWordsFromBackup(path) {
  const full = resolve(process.cwd(), path);
  if (!existsSync(full)) {
    console.error(`JSON が見つかりません: ${full}`);
    process.exit(1);
  }
  let data;
  try {
    data = JSON.parse(readFileSync(full, 'utf8'));
  } catch (e) {
    console.error(`JSON として読めませんでした: ${full}\n  ${e.message}`);
    process.exit(1);
  }
  const list = Array.isArray(data) ? data : data.w;
  if (!Array.isArray(list)) {
    console.error(
      'JSON の中に単語の配列が見つかりません。アプリの「保存」で書き出したファイルを渡してください。'
    );
    process.exit(1);
  }
  return list.map((x) => (typeof x === 'string' ? x : x?.en)).filter((x) => typeof x === 'string');
}

/** Piper で WAV を作り、afconvert で m4a に変換する */
function synthesize(word, outPath) {
  const wav = join(tmpdir(), `eitango-tts-${process.pid}.wav`);
  try {
    execFileSync(VENV_PY, ['-m', 'piper', '-m', MODEL, '-f', wav], {
      input: word,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    // m4a(AAC) は iOS でも主要ブラウザでも再生できる。afconvert は macOS 標準なので追加install不要。
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', wav, outPath], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } finally {
    rmSync(wav, { force: true });
  }
}

function writeAudioMap(keys) {
  const entries = keys
    .sort()
    .map((k) => `  ${k}: require('../../assets/audio/${k}.m4a'),`)
    .join('\n');
  writeFileSync(
    MAP_FILE,
    `// このファイルは scripts/build-audio.mjs が自動生成する。手で編集しないこと。
// 生成しなおす: npm run build:audio
//
// Metro は require() を静的に解決するため、ここに1件ずつ書き出す必要がある
// （\`require(\`../../assets/audio/\${word}.m4a\`)\` のような動的パスは使えない）。
export const AUDIO = {
${entries}
};
`
  );
}

checkSetup();
mkdirSync(AUDIO_DIR, { recursive: true });

// 対象の単語を集める。組み込み + --words + --from をまとめ、キーが同じものは1件にする
const sources = [{ label: '組み込み', words: readBuiltinWords() }];

const wordsArg = argValue('--words');
if (wordsArg) {
  sources.push({ label: '--words', words: wordsArg.split(',').map((s) => s.trim()) });
}

const fromArg = argValue('--from');
if (fromArg) {
  sources.push({ label: fromArg, words: readWordsFromBackup(fromArg) });
}

const byKey = new Map();
for (const src of sources) {
  const usable = src.words.filter(isSpeakable);
  console.log(`${src.label}: ${usable.length} 語`);
  for (const w of usable) {
    if (!byKey.has(keyOf(w))) byKey.set(keyOf(w), w.trim());
  }
}

const targets = [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b));
console.log(`対象は重複を除いて ${targets.length} 語\n`);

let made = 0;
let skipped = 0;

for (const [key, word] of targets) {
  const out = join(AUDIO_DIR, `${key}.m4a`);
  if (!force && existsSync(out)) {
    skipped++;
    continue;
  }
  process.stdout.write(`  生成中: ${word} ... `);
  synthesize(word, out);
  console.log(`${(statSync(out).size / 1024).toFixed(1)} KB`);
  made++;
}

const keys = targets.map(([k]) => k);
writeAudioMap(keys);

const total = keys.reduce((sum, k) => sum + statSync(join(AUDIO_DIR, `${k}.m4a`)).size, 0);
console.log(`\n生成 ${made} 件 / スキップ ${skipped} 件（既に音声あり）`);
console.log(`音声ファイル ${keys.length} 件 / 合計 ${(total / 1024).toFixed(0)} KB`);
console.log(`対応表を書き出しました: src/lib/audioMap.js`);
if (made > 0) {
  console.log(`\nassets/audio/ と src/lib/audioMap.js をコミットしてください。`);
}
