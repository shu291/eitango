/** @type {import('tailwindcss').Config} */
const { C, R } = require('./src/theme');

/*
  className 側で使う色・角丸・書体の設定。値は src/theme.js が唯一の出どころ。

  色は下の意味の分かる名前（bg-paper / bg-sheet / border-rule / text-ink / bg-navy …）を使う。
  **Tailwind の既定の色名（bg-indigo-600 など）はそのまま既定の色で出る。**

  【2026-08-30】以前はここで Tailwind の既定色をまるごと紙の色に読み替えていた
  （bg-white → 生成り、bg-indigo-600 → 藍）。刷新の途中で App.js に残っていた
  古い色名を拾うための仕掛けだったが、App.js は意味の分かる名前だけになり
  既定の色名は0か所になったので外した。今 Tailwind の既定色名を使っているのは
  src/lib/logic.js の LEVELS（覚え具合バッジの文字色）だけで、こちらは
  既定の色でそのまま出したい。
*/
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // ── 意味の分かる名前。画面のコードはこちらだけを使う ──
        paper: { DEFAULT: C.bg, deep: C.bg2 },
        sheet: { DEFAULT: C.surface, warm: C.surface2 },
        rule: { DEFAULT: C.border, strong: C.border2 },
        ink: { DEFAULT: C.text, soft: C.muted, faint: C.muted2 },
        navy: {
          DEFAULT: C.primary,
          dark: C.navyDark,
          mid: C.navyMid,
          tint: C.navyTint,
          soft: C.navySoft,
        },
        vermilion: { DEFAULT: C.accent, tint: C.accentTint, soft: C.accentSoft },
        moss: { DEFAULT: C.success, tint: C.successTint, soft: C.successSoft },
        ochre: { DEFAULT: C.ochre, soft: C.ochreSoft },
      },

      // 角丸は 2 / 6 / 10 の3段だけ。rounded-2xl や rounded-3xl を書き忘れても 10px に収まるようにする
      borderRadius: {
        none: '0px',
        sm: `${R.sm}px`,
        DEFAULT: `${R.md}px`,
        md: `${R.md}px`,
        lg: `${R.lg}px`,
        xl: `${R.lg}px`,
        '2xl': `${R.lg}px`,
        '3xl': `${R.lg}px`,
        full: '999px',
      },

      // 英単語と数字だけに当てる書体。日本語には当てない（当てると豆腐や偽の太字になる）
      fontFamily: {
        en: ['Lora_400Regular'],
        'en-semi': ['Lora_600SemiBold'],
        'en-bold': ['Lora_700Bold'],
        num: ['IBMPlexMono_400Regular'],
        'num-bold': ['IBMPlexMono_600SemiBold'],
      },
    },
  },
  plugins: [],
};
