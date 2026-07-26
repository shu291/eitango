#!/usr/bin/env python3
"""アプリのアイコンを生成する。

    python3 scripts/build-icon.py

出力:
    assets/icon.png            1024x1024  … iOS アプリのアイコン・favicon の元
    assets/adaptive-icon.png   1024x1024  … Android 用（余白を多めに取る）
    assets/favicon.png           48x48    … ブラウザのタブ
    public/apple-touch-icon.png 180x180   … iOS のホーム画面に追加したときのアイコン

Expo の初期テンプレートのアイコン（灰色の的）のままだと、ホーム画面では
ほぼ真っ白なタイルに見えてしまうため差し替えている。

必要なもの: Pillow（`pip install pillow`）。生成物はコミットするので、
アイコンを変えたいとき以外このスクリプトを動かす必要はない。
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent

# アプリのヘッダーと同じインディゴ系。上から下へ少し暗くする
TOP = (99, 102, 241)      # indigo-500 #6366f1
BOTTOM = (67, 56, 202)    # indigo-700 #4338ca

# 日本語が出せるフォント。上から順に見つかったものを使う
FONT_CANDIDATES = [
    "/System/Library/Fonts/ヒラギノ角ゴシック W7.ttc",
    "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/Library/Fonts/Arial Unicode.ttf",
]


def load_font(size):
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    raise SystemExit(
        "日本語フォントが見つかりませんでした。FONT_CANDIDATES にパスを足してください。"
    )


def make_icon(size, pad_ratio=0.0):
    """アイコンを1枚描く。pad_ratio は中身を内側に寄せる割合（Android 用）。"""
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)

    # 背景の縦グラデーション
    for y in range(size):
        t = y / max(1, size - 1)
        d.line(
            [(0, y), (size, y)],
            fill=tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)),
        )

    # 中身の描画領域。Android のアダプティブアイコンは外周が切られるので内側に寄せる
    inner = size * (1 - pad_ratio * 2)
    off = size * pad_ratio
    cx = size / 2

    # 「英」… アプリ名の頭文字
    font = load_font(round(inner * 0.56))
    text = "英"
    box = d.textbbox((0, 0), text, font=font)
    d.text(
        (cx - (box[0] + box[2]) / 2, off + inner * 0.44 - (box[1] + box[3]) / 2),
        text,
        font=font,
        fill=(255, 255, 255),
    )

    # 単語帳のページに見立てた2本のライン
    bar_w = inner * 0.42
    bar_h = max(2, round(inner * 0.042))
    radius = bar_h / 2
    for i, (width_scale, alpha) in enumerate(((1.0, 235), (0.62, 130))):
        w = bar_w * width_scale
        y = off + inner * 0.76 + i * bar_h * 2.1
        d.rounded_rectangle(
            [cx - w / 2, y, cx + w / 2, y + bar_h],
            radius=radius,
            fill=(255, 255, 255, alpha) if img.mode == "RGBA" else (
                # RGB なので背景と混ぜて半透明を再現する
                tuple(
                    round(255 * (alpha / 255) + BOTTOM[c] * (1 - alpha / 255))
                    for c in range(3)
                )
            ),
        )
    return img


def save(img, rel_path, size=None):
    out = ROOT / rel_path
    out.parent.mkdir(parents=True, exist_ok=True)
    if size and size != img.width:
        img = img.resize((size, size), Image.LANCZOS)
    img.save(out)
    print(f"  {rel_path}  {img.width}x{img.height}  {out.stat().st_size / 1024:.1f} KB")


print("アイコンを生成します")
base = make_icon(1024)
save(base, "assets/icon.png")
save(base, "public/apple-touch-icon.png", 180)
save(base, "assets/favicon.png", 48)
# Android は外周が円などに切り抜かれるため、中身を内側に寄せた版を使う
save(make_icon(1024, pad_ratio=0.14), "assets/adaptive-icon.png")
print("完了")
