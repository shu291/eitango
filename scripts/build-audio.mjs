// 単語の発音音声をローカル AI（Piper TTS）で事前生成する。
//
//   npm run build:audio            収録済み単語のうち、音声がまだ無いものだけ生成
//   npm run build:audio -- --force 既存の音声も作り直す
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

const force = process.argv.includes('--force');

/** 単語をファイル名に使える形にする。speech.js 側の keyOf と必ず揃えること。 */
const keyOf = (word) => word.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

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

const words = readBuiltinWords();
console.log(`収録単語: ${words.length} 語`);

let made = 0;
let skipped = 0;
const keys = [];

for (const word of words) {
  const key = keyOf(word);
  const out = join(AUDIO_DIR, `${key}.m4a`);
  keys.push(key);

  if (!force && existsSync(out)) {
    skipped++;
    continue;
  }
  process.stdout.write(`  生成中: ${word} ... `);
  synthesize(word, out);
  console.log(`${(statSync(out).size / 1024).toFixed(1)} KB`);
  made++;
}

writeAudioMap(keys);

const total = keys.reduce((sum, k) => sum + statSync(join(AUDIO_DIR, `${k}.m4a`)).size, 0);
console.log(`\n生成 ${made} 件 / スキップ ${skipped} 件（既存）`);
console.log(`合計サイズ: ${(total / 1024).toFixed(0)} KB`);
console.log(`対応表を書き出しました: src/lib/audioMap.js`);
