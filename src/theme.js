/**
 * 見た目の唯一の出どころ（デザイントークン＝色や余白の名前を決めて1か所にまとめたもの）。
 *
 * design/direction.json の A案「英単語ノート」を実装用に書き下したファイル。
 * App.js（Icon の color や inline style 用）と tailwind.config.js（className 用）の
 * 両方がこのファイルを読むので、色を変えるときはここだけ直せば全画面に効く。
 *
 * ⚠️ CommonJS で書くこと。tailwind.config.js は Node がそのまま require するため、
 *    export 構文にすると Metro は通っても Tailwind の設定読み込みで落ちる。
 */

// ===== 契約の10色（design/direction.json の palette と1:1）=====
const bg = '#F7F3E9'; // 紙の地。生成り
const surface = '#FFFDF7'; // 紙片（カード）。地よりわずかに白い
const border = '#E3DAC6'; // 罫線
const text = '#22201B'; // インク
const muted = '#6E6656'; // 鉛筆。地に対して 5.12:1 で読める
const primary = '#1F3A5F'; // 藍＝「押せる／進んでいる」を意味する色
const onPrimary = '#FFFDF7'; // 藍の上に乗る文字
const accent = '#A8352A'; // 朱＝赤ペンの印（間違い・苦手・期限超過）
const danger = '#A93226'; // 削除・失敗。朱と同系
const success = '#33691E'; // 正解・完了

const C = {
  bg,
  surface,
  border,
  text,
  muted,
  primary,
  onPrimary,
  accent,
  danger,
  success,

  // 「もう一段」。面と罫線の濃さを1段ずつ持つ
  bg2: '#EFE9DB',
  surface2: '#FBF6EA',
  border2: '#CDBFA2', // はっきり見せたい罫線（下タブの上辺など）
  muted2: '#8C8271', // いちばん弱い文字。12px より小さくしない

  // 藍（押せるもの・進捗）
  navyDark: '#16293F',
  navyMid: '#33547E',
  navyTint: '#C6D2E0', // 罫・バーの地
  navySoft: '#E8EDF3', // 面（チップ・選択中の下地）

  // 朱（赤ペンの印）
  accentTint: '#EBC9C2',
  accentSoft: '#F7E7E3',

  // 苔（正解・完了）
  successTint: '#CBDBBB',
  successSoft: '#E9EFE2',

  // 代赭（保存・読込など「注意ではない警告色」の置き場）
  ochre: '#8A5A2B',
  ochreSoft: '#F2E7D8',

  // 習熟度ランプ。虹色をやめ、藍1色の濃淡で「濃いほど覚えている」を表す
  lv0: '#8C8271', // 未学習
  lv1: '#A8352A', // 要復習（ここだけ朱＝赤ペンでチェックした行）
  lv2: '#8FA3B9', // 初級
  lv3: '#6E88A4', // 学習中
  lv4: '#4A6B8C', // 定着
  lv5: '#2F5175', // マスター
  lv6: '#1F3A5F', // 完璧
};

// ===== 形 =====
// 角丸は小さめ。紙を切った縁のつもりで、丸めすぎない
const R = { sm: 2, md: 6, lg: 10, pill: 999 };

// ===== 余白 =====
// 4の倍数で5段だけ。半端な 6px / 10px / 14px は使わない
const SP = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24 };

// ===== 文字 =====
// 欧文（英単語）と数字だけ Google Font を当てる。日本語はシステム（ヒラギノ）に任せる＝0KB
const F = {
  en: 'Lora_400Regular',
  enSemi: 'Lora_600SemiBold',
  enBold: 'Lora_700Bold',
  num: 'IBMPlexMono_400Regular',
  numBold: 'IBMPlexMono_600SemiBold',
};

// 数字の桁がガタつかないようにする指定。<Text style={NUM}> の形で使う
const NUM = { fontFamily: F.num, fontVariant: ['tabular-nums'] };
const NUM_BOLD = { fontFamily: F.numBold, fontVariant: ['tabular-nums'] };

module.exports = { C, R, SP, F, NUM, NUM_BOLD };
