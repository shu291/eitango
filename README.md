# 英単語マスター（eitango）

英単語を覚えるための iOS アプリ。6 つの学習モードと、覚え具合の可視化を備えています。

- **学習モード** — フラッシュカード / 4 択クイズ / タイピング / 英訳（逆方向）/ マッチング / スピード
- **発音** — フラッシュカードは単語が出たら自動再生。単語帳はスピーカーから再生。収録済み単語はローカル AI（Piper TTS）で生成した音声を同梱（→ [発音について](#発音について)）
- **習熟度管理** — 単語ごとに 0〜100 の progress を持ち、6 段階（要復習 / 初級 / 学習中 / 定着 / マスター / 完璧）で表示
- **苦手判定・連続学習日数・週次グラフ**
- **単語の取り込み / 書き出し** — テキスト貼り付けによる一括登録、JSON でのバックアップと復元

学習データは端末内の AsyncStorage にのみ保存されます。サーバもアカウントもありません。

| | |
|---|---|
| Expo SDK | 54（React Native 0.81.5 / React 19.1.0） |
| 構成 | prebuild 済み（**iOS のみ**。`android/` は未生成） |
| スタイリング | NativeWind v4 + Tailwind v3 |
| ストレージ | AsyncStorage（キー: `@eitango_state_v1`） |
| New Architecture | 有効 |

> コードの内部構造・アルゴリズムの詳細は [CLAUDE.md](CLAUDE.md) を参照。

---

> **セットアップ手順について**
> 以下は現在のリポジトリの内容から書き起こした手順です。**新しいマシンで clone から通しで実行して
> 検証したわけではありません。** 未検証の箇所には 🔶 を付けてあります。実際に試して詰まったら
> 直してください。

## 1. 必要なもの

| | 必要なもの | 備考 |
|---|---|---|
| OS | **macOS** | iOS ビルドに必須。Linux / Windows では不可能 |
| | Xcode | 🔶 必要バージョン未確認。App Store 版で可 |
| | Xcode Command Line Tools | `xcode-select --install` |
| | Node.js | 🔶 開発機は `ios/.xcode.env.local` に Node 25.9.0 (Homebrew) が記録されている。RN 0.81 の動作確認済み範囲は要確認 |
| | CocoaPods | `brew install cocoapods` または `sudo gem install cocoapods` |
| | Apple ID | 実機に入れるだけなら**無料**でよい（制限あり → §5） |
| ハード | iPhone 実機 + USB ケーブル | シミュレータだけなら実機は不要 |

## 2. clone して依存をインストール

```bash
git clone https://github.com/shu291/eitango.git
cd eitango
npm install
npx pod-install
```

`npm install` は `package-lock.json` に従うので `npm ci` でもよい。

🔶 `pod install` が `pod repo update` を要求してくることがある。その場合は
`cd ios && pod install --repo-update` を試す。

## 3. `ios/.xcode.env.local` を自分のマシンに合わせる

このファイルはマシン固有で、`ios/.gitignore` により **git 管理から外れています**。
clone 直後は存在しないので作る必要があります。

```bash
echo "export NODE_BINARY=$(command -v node)" > ios/.xcode.env.local
```

これを忘れると Xcode ビルド中に `node: command not found` 系のエラーで落ちます。

## 4. 署名（Signing）の確認

```bash
open ios/app.xcworkspace
```

⚠ **`.xcodeproj` ではなく `.xcworkspace` を開くこと。** CocoaPods 構成では workspace が正。

Xcode で:

1. 左のナビゲータで **`app`** プロジェクト → TARGETS の **`app`** を選択
2. **Signing & Capabilities** タブ
3. **Automatically manage signing** にチェック
4. **Team** が自分の Apple ID のものになっているか確認
   （リポジトリには `DEVELOPMENT_TEAM = 8PLVWBJM54` がコミットされています）
5. 別の Apple ID で使う場合は Bundle Identifier `com.so.eitango` を自分用に変える
   （例: `com.<自分>.eitango`）。🔶 変えたら `app.json` の `expo.ios.bundleIdentifier` も合わせる

## 5. 実機で動かす

iPhone を Mac に接続し、**「このコンピュータを信頼」** を許可してから:

```bash
npx expo run:ios --device
```

接続中のデバイス一覧が出るので選択。初回は Xcode のビルドが走るので数分〜十数分かかります。

**「信頼されていないデベロッパ」と出たら** — iPhone 側で
設定 → 一般 → VPN とデバイス管理 → デベロッパ App → 自分の Apple ID → 「信頼」

**無料 Apple ID の制限**

- インストールしたアプリは **7 日で失効**する。切れたら `npx expo run:ios --device` で入れ直す
- 同時にインストールできるアプリは 3 つまで
- App Store 配布・TestFlight・プッシュ通知は使えない

→ 制限を外すには Apple Developer Program（年 99 USD）が必要。

## 6. 開発中の使い方

```bash
npm start          # Metro だけ起動（ネイティブを再ビルドせず JS を差し替える）
npm run ios        # expo run:ios（シミュレータ）
```

ネイティブ側（Podfile / app.json の native 設定 / ネイティブ依存の追加）を触ったときだけ
再ビルドが必要です。**JS/JSX の変更は `npm start` だけで反映されます。**

## 7. よくあるハマりどころ

| 症状 | 対処 |
|---|---|
| `node: command not found`（Xcode ビルド中） | §3 の `ios/.xcode.env.local` を作り直す |
| Pod のバージョン不一致 | `cd ios && pod install --repo-update` |
| `Signing for "app" requires a development team` | §4 で Team を設定 |
| Metro が古いバンドルを返す | `npx expo start -c`（キャッシュクリア） |
| ビルドが謎に壊れた | `rm -rf ios/build ~/Library/Developer/Xcode/DerivedData/*` してから再ビルド |
| Pod の警告が大量に出て見づらい | `plugins/withInhibitWarnings.js` を `app.json` の `expo.plugins` に登録して再 prebuild |

---

## `ios/` をコミットしている理由

Expo プロジェクトでは `ios/` は prebuild で再生成できる生成物なので `.gitignore` するのが定石ですが、
このリポジトリでは**あえてコミットしています**。

`ios/app.xcodeproj/project.pbxproj` に `DEVELOPMENT_TEAM = 8PLVWBJM54` が Xcode の
Signing & Capabilities から手作業で入っており、`app.json` にこれを再生成する記述が無いためです。
`ios/` を無視して prebuild し直すと、この署名設定は失われます。

⚠ **`npx expo prebuild --clean` は安易に打たないこと。**

将来 `ios/` を無視に切り替えるなら、その前に次のどちらかを済ませてください:

- `@expo/config-plugins` の `withXcodeProject` で `DEVELOPMENT_TEAM` を注入する config plugin を書き、`app.json` に登録する
- EAS Build の credentials 管理に寄せて、ローカルの署名設定に依存しなくする

詳細は [CLAUDE.md](CLAUDE.md) §6。

## 発音について

発音が鳴るのは次の 2 か所だけです。他の学習モード（クイズ・タイピングなど）には
意図的に置いていません。

| どこ | いつ |
|---|---|
| 単語帳 | 各行のスピーカーを押したとき |
| フラッシュカード | **単語が表示された瞬間**（自動） |

フラッシュカードはカードをめくり直しても鳴り直しません（`useEffect` の依存に `flipped` を
入れていないため）。1枚につき1回だけ鳴ります。

### ⚠️ iPhone の自動再生ブロックへの対応

iOS Safari は「ユーザーのタップが直接の引き金でない音声再生」を禁止しています。
フラッシュカードは単語が出たタイミング（`useEffect` の中）で鳴らすため、素直に書くと
**iPhone では一切鳴りません。**

[src/lib/speech.web.js](src/lib/speech.web.js) では次の 2 点でこれを回避しています。
**触るときはこの前提を壊さないこと。**

1. `Audio` 要素を毎回 `new` せず、**1つを使い回す**
2. 最初のタップで、その要素に無音を一瞬再生させて「解錠」しておく
   （`speechSynthesis` にも同じ制限があるので、同時に空の発話を投げている）

iOS は一度ユーザー操作で再生された要素については、以後プログラムからの再生を許可します。
毎回新しい `Audio` を作ると解錠が引き継がれず、鳴らなくなります。

音の出どころは 2 段構えです。

| | どの単語 | 音の出どころ | オフライン |
|---|---|---|---|
| 1 | 収録済みの 30 語 | `assets/audio/*.m4a`（ローカル AI で事前生成し、リポジトリに同梱） | ◎ |
| 2 | 自分で追加した単語 | 端末内蔵の読み上げ（iOS は expo-speech、Web は Web Speech API） | 端末による |

**アプリの実行時に AI は動きません。** ローカル AI は音声ファイルを作るときだけ開発マシンで使い、
できあがった `.m4a` を同梱しています。だから iPhone でも公開 Web 版でも同じ音が鳴り、通信も要りません。

### 音声の作り直し

単語を追加・変更して収録音声も用意したいときだけ必要な作業です。普段は不要です。

初回のみ、生成環境を用意します（`.tts-venv/` と `.tts-models/` は 300MB 超あるので git 管理外）:

```bash
brew install python@3.13
$(brew --prefix python@3.13)/bin/python3.13 -m venv .tts-venv
.tts-venv/bin/pip install piper-tts
.tts-venv/bin/python -m piper.download_voices en_US-lessac-medium --download-dir .tts-models
```

🔶 Python 3.13 を指定しているのは、`onnxruntime`（Piper が内部で使う）が **3.14 に未対応**のためです。
新しければよいわけではないので注意。

用意できたら:

```bash
npm run build:audio            # 音声が無い単語だけ生成
npm run build:audio -- --force # 全部作り直す
```

`src/lib/logic.js` の `INIT_WORDS` を読んで、`assets/audio/<単語>.m4a` と対応表
`src/lib/audioMap.js` を書き出します。生成された `.m4a` と `audioMap.js` は**コミットしてください**
（これが同梱される音声の実体です）。

音声を変えたい場合は `scripts/build-audio.mjs` の `MODEL` を別の音声に差し替えます
（`en_GB-alba-medium` ならイギリス英語など）。

## ホーム画面に追加して使う

スマホの Safari で https://shu291.github.io/eitango/ を開き、共有ボタン →「ホーム画面に追加」。
アイコンから全画面で起動し、アドレスバーも出ません。7日で失効する iOS アプリ版と違い期限もありません。

これを成り立たせているのが [public/index.html](public/index.html) のメタタグです。
**Expo が既定で吐く HTML にはこれらが入っていません。** 無いと iOS はページの
スクリーンショットをアイコンに使い、起動しても Safari のバーが残ります。

| 指定 | 役割 |
|---|---|
| `apple-touch-icon` | ホーム画面のアイコン（180×180） |
| `apple-mobile-web-app-capable` | 全画面で起動する（アドレスバーを消す） |
| `apple-mobile-web-app-title` | アイコンの下に出る名前 |
| `theme-color` | ステータスバー周りの色 |

⚠️ `apple-touch-icon` のパスは `app.json` の `expo.experiments.baseUrl` と揃える必要があります。
リポジトリ名を変えたら両方直してください。

`viewport-fit=cover` と `black-translucent` はあえて使っていません。コンテンツがノッチや
ホームインジケータの下に潜り、Web では safe-area のインセットが 0 になりうるためです。

### アイコンを変えたいとき

```bash
pip install pillow   # 初回のみ
python3 scripts/build-icon.py
```

`assets/icon.png` / `assets/adaptive-icon.png` / `assets/favicon.png` / `public/apple-touch-icon.png`
がまとめて再生成されます。色や文字は [scripts/build-icon.py](scripts/build-icon.py) の先頭で変えられます。
生成物はコミットしてください。

## Web 版

ブラウザでも動きます。`main` に push すると GitHub Actions が自動でビルドして
GitHub Pages に公開します（[.github/workflows/deploy-web.yml](.github/workflows/deploy-web.yml)）。

ローカルで確認する場合:

```bash
npm run web            # 開発サーバ
npx expo export -p web # dist/ に本番ビルドを出力
```

### ネイティブとの実装の違い

Web で動かない API があるため、次の 2 つはプラットフォームごとにファイルを分けています。
Metro が Web ビルド時だけ `.web.js` を優先して解決するので、`App.js` 側に分岐はありません。

| 機能 | ネイティブ | Web |
|---|---|---|
| データの保存／読込 | `src/lib/backup.js`<br>expo-file-system + expo-sharing + expo-document-picker | `src/lib/backup.web.js`<br>Blob ダウンロード + `<input type="file">` |
| 削除の確認ダイアログ | `src/lib/confirm.js`<br>`Alert.alert` | `src/lib/confirm.web.js`<br>`window.confirm` |
| 発音の再生 | `src/lib/speech.js`<br>expo-audio + expo-speech | `src/lib/speech.web.js`<br>`Audio` + `speechSynthesis` |

⚠️ **Web で `Alert.alert` は使わないこと。** react-native-web の `Alert` は `static alert() {}` という
何もしない空実装なので、確認ダイアログが無反応になります（気づきにくい）。`confirmDestructive` を使ってください。

⚠️ **高さのパーセント指定（`height: '50%'`）に注意。** Web では CSS の規則がそのまま効くため、
親の高さが内容依存だと 0px に潰れます。ネイティブでは Yoga が解決するので気づけません。
px で指定するのが安全です（`BarChart7` がこれで一度潰れました）。

### 制限

- 学習データはブラウザごとに保存されます。iOS アプリ版とは共有されません
  （移したい場合は「保存」で JSON を書き出して「読込」で取り込む）

## データについて

- 学習データは端末内の AsyncStorage にのみ保存されます（キー: `@eitango_state_v1`）
- **アプリを削除するとデータは消えます。** 端末間の同期もありません
- アプリ内の JSON エクスポート機能でバックアップを取れます。復元も同じくアプリ内から
