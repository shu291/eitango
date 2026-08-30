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

// ===== 基本の10色 =====
//
// 【2026-08-30】色だけ、刷新前（Tailwind の既定色をそのまま使っていた頃）に戻した。
// 組み方（罫線で段差を作る・影ゼロ・角丸3段・英字と数字だけ別書体）は A案のまま。
// 値は Tailwind v3 の既定色そのもので、旧 App.js が className で使っていたものと同じ。
//
// ⚠️ 名前は A案「英単語ノート」由来のまま残してある（navy / vermilion / moss / ochre）。
//    className が App.js に 38 か所あり、名前を変えると色と関係ない差分が増えるため。
//    色相はおおむね合っている（navy=藍紫の indigo、vermilion=赤の rose、
//    moss=緑の emerald、ochre=黄土の amber）ので、読み替えれば意味は通る。
const bg = '#F8FAFC'; // 画面全体の地（slate-50）
const surface = '#FFFFFF'; // カード・パネル。純白
const border = '#E5E7EB'; // 枠・区切り（gray-200）
const text = '#1F2937'; // ふつうの文字（gray-800）
const muted = '#6B7280'; // 補足・単位・日付（gray-500）
const primary = '#4F46E5'; // 「押せる／進んでいる」を意味する色（indigo-600）
const onPrimary = '#FFFFFF'; // primary の上に乗る文字
const accent = '#F43F5E'; // 間違い・苦手・期限超過（rose-500）
const danger = '#EF4444'; // 削除・失敗（red-500）
const success = '#10B981'; // 正解・完了（emerald-500）

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
  bg2: '#F3F4F6', // gray-100
  surface2: '#F9FAFB', // gray-50
  border2: '#D1D5DB', // はっきり見せたい罫線（下タブの上辺など）。gray-300
  muted2: '#9CA3AF', // いちばん弱い文字（gray-400）。12px より小さくしない

  // 押せるもの・進捗（indigo）
  navyDark: '#4338CA', // indigo-700
  navyMid: '#6366F1', // indigo-500
  navyTint: '#C7D2FE', // 罫・バーの地。indigo-200
  navySoft: '#EEF2FF', // 面（チップ・選択中の下地）。indigo-50

  // 間違いの印（rose）
  accentTint: '#FECDD3', // rose-200
  accentSoft: '#FFF1F2', // rose-50

  // 正解・完了（emerald）
  successTint: '#A7F3D0', // emerald-200
  successSoft: '#ECFDF5', // emerald-50

  // 「注意ではない警告色」の置き場（amber）
  ochre: '#F59E0B', // amber-500
  ochreSoft: '#FEF3C7', // amber-100

  // 習熟度ランプ。藍1色の濃淡はやめ、段階ごとに色相を変える元の並びに戻した。
  // ⚠️ 同じ値を src/lib/logic.js の LEVELS も持っている（logic.js は純粋関数だけに
  //    したいので theme.js を import していない）。片方だけ直さないこと。
  lv0: '#D1D5DB', // 未学習（gray-300）
  lv1: '#FB7185', // 要復習（rose-400）
  lv2: '#FB923C', // 初級（orange-400）
  lv3: '#F59E0B', // 学習中（amber-500）
  lv4: '#3B82F6', // 定着（blue-500）
  lv5: '#10B981', // マスター（emerald-500）
  lv6: '#9333EA', // 完璧（purple-600）
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
