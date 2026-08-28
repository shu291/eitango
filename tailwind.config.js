/** @type {import('tailwindcss').Config} */
const { C, R } = require('./src/theme');

/*
  A案「英単語ノート」の見た目を className 側にも効かせる設定。

  ポイントは「Tailwind の既定の色名を、紙の色に置き換えてしまう」こと。
  App.js は 2773 行あって bg-indigo-600 や text-gray-400 が全画面に散っているので、
  1つずつ書き換えるより、色名の指す中身を差し替えるほうが取りこぼしが出ない。
  （bg-white は生成りの紙、bg-indigo-600 は藍、text-rose-500 は朱、という具合に読み替える）

  新しく書くところは、下の意味の分かる名前（bg-paper / text-ink / border-rule / bg-navy …）を使う。
*/
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // ── これから書くとき用の、意味の分かる名前 ──
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

        // ── 既存コードの色名を紙の色に読み替える（取りこぼし防止） ──
        white: C.surface, // 純白は使わない。紙片の色にする
        black: C.text,
        gray: {
          50: C.surface2,
          100: C.bg2,
          200: C.border,
          300: C.muted2, // 薄すぎて読めなかった text-gray-300 を読める濃さに引き上げる
          400: C.muted, //  同上（55か所で使われていた）
          500: C.muted,
          600: '#5B5446',
          700: '#45402F',
          800: C.text,
          900: C.text,
        },
        // 藍にまとめる系（もとは indigo / violet / purple / blue / sky / cyan / teal）
        indigo: {
          50: C.navySoft, 100: '#D7E0EA', 200: C.navyTint, 300: '#8FA3B9', 400: '#5E7B9E',
          500: C.navyMid, 600: C.primary, 700: C.navyDark, 800: '#122134', 900: '#0E1A29',
        },
        violet: {
          50: C.navySoft, 100: '#D7E0EA', 200: C.navyTint, 300: '#8FA3B9', 400: '#5E7B9E',
          500: C.navyMid, 600: C.primary, 700: C.navyDark, 800: '#122134', 900: '#0E1A29',
        },
        purple: {
          50: C.navySoft, 100: '#D7E0EA', 200: C.navyTint, 300: '#8FA3B9', 400: '#5E7B9E',
          500: C.navyMid, 600: C.primary, 700: C.navyDark, 800: '#122134', 900: '#0E1A29',
        },
        blue: {
          50: C.navySoft, 100: '#D7E0EA', 200: C.navyTint, 300: '#8FA3B9', 400: '#5E7B9E',
          500: C.navyMid, 600: C.primary, 700: C.navyDark, 800: '#122134', 900: '#0E1A29',
        },
        sky: {
          50: C.navySoft, 100: '#D7E0EA', 200: C.navyTint, 300: '#8FA3B9', 400: '#5E7B9E',
          500: C.navyMid, 600: C.primary, 700: C.navyDark, 800: '#122134', 900: '#0E1A29',
        },
        cyan: {
          50: C.navySoft, 100: '#D7E0EA', 200: C.navyTint, 300: '#8FA3B9', 400: '#5E7B9E',
          500: C.navyMid, 600: C.primary, 700: C.navyDark, 800: '#122134', 900: '#0E1A29',
        },
        teal: {
          50: C.navySoft, 100: '#D7E0EA', 200: C.navyTint, 300: '#8FA3B9', 400: '#5E7B9E',
          500: C.navyMid, 600: C.primary, 700: C.navyDark, 800: '#122134', 900: '#0E1A29',
        },
        // 正解・完了は苔色にまとめる
        emerald: {
          50: C.successSoft, 100: C.successTint, 200: C.successTint, 300: '#9CBB83',
          400: '#5B8C3E', 500: C.success, 600: C.success, 700: '#2A5618', 800: '#22450F', 900: '#1B370C',
        },
        green: {
          50: C.successSoft, 100: C.successTint, 200: C.successTint, 300: '#9CBB83',
          400: '#5B8C3E', 500: C.success, 600: C.success, 700: '#2A5618', 800: '#22450F', 900: '#1B370C',
        },
        // 間違い・苦手は朱にまとめる
        rose: {
          50: C.accentSoft, 100: C.accentTint, 200: C.accentTint, 300: '#D89A90',
          400: '#C05B4E', 500: C.accent, 600: C.accent, 700: '#8C2A21', 800: '#71211A', 900: '#5B1A15',
        },
        red: {
          50: C.accentSoft, 100: C.accentTint, 200: C.accentTint, 300: '#D89A90',
          400: '#C05B4E', 500: C.accent, 600: C.accent, 700: '#8C2A21', 800: '#71211A', 900: '#5B1A15',
        },
        // 注意ではない警告色（保存・読込など）は代赭にまとめる
        amber: {
          50: '#F7EFE1', 100: C.ochreSoft, 200: '#E7D5BC', 300: '#CBA97B',
          400: '#A97440', 500: C.ochre, 600: C.ochre, 700: '#6F4722', 800: '#57381B', 900: '#452C15',
        },
        orange: {
          50: '#F7EFE1', 100: C.ochreSoft, 200: '#E7D5BC', 300: '#CBA97B',
          400: '#A97440', 500: C.ochre, 600: C.ochre, 700: '#6F4722', 800: '#57381B', 900: '#452C15',
        },
        yellow: {
          50: '#F7EFE1', 100: C.ochreSoft, 200: '#E7D5BC', 300: '#CBA97B',
          400: '#A97440', 500: C.ochre, 600: C.ochre, 700: '#6F4722', 800: '#57381B', 900: '#452C15',
        },
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
