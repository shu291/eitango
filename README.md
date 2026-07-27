# 英単語マスター（eitango）

英単語を覚えるための iOS アプリ。6 つの学習モードと、覚え具合の可視化を備えています。

- **本棚** — 単語帳を何冊でも持てて、表紙写真を付けて選べる（→ [本棚について](#本棚について)）
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

## 本棚について

単語帳は何冊でも持てます。学習・単語帳・統計の各画面は、**本棚で選んでいる1冊だけ**を見ます。

| 操作 | どこから |
|---|---|
| 冊を切り替える | カードを**タップ**（ホーム画面の単語帳名からも行ける） |
| 表紙写真・名前変更・削除 | カードを**長押し**してメニューから |
| 空の冊を作る | 「＋ 新しい単語帳」 |

カードは本の表紙の形（3:4）で、写真は切り取らずに全体を表示します（余白は単語帳の色で埋まる）。

⚠️ **長押しの判定は自前で書いています。** `TouchableOpacity` の `onLongPress` は
react-native-web では発火しないことを実測で確認したためです（マウスで900ms押しても無反応で、
離すと通常タップ扱いになった）。`onPressIn` / `onPressOut` は効くので、その間の時間を測って
450ms 超えたらメニューを開き、長押しが成立したときは離したときの `onPress` を無視しています。
**`onLongPress` に戻すと編集手段が丸ごと消える**ので注意。

### ファイルの読み込みは中身で動きが変わる

| ファイル | 動き |
|---|---|
| 単語の一覧だけ（`{"w": [...]}`） | **1冊として本棚に追加**。今ある単語帳は消えない。名前はファイル名から付く |
| 本棚まるごと（`{"v":2,"decks":[...]}`） | 本棚全体を復元（確認あり） |

「本棚を保存」は**全冊を1ファイル**に書き出します。バックアップはこれ1つで足ります。

### 保存の仕組みと容量

保存先はブラウザのローカル領域で、上限はおよそ **5MB** です。1900語で約300KB使います。

⚠️ **表紙写真は必ず縮小してから保存しています**（長辺640px / JPEG品質0.72 → 1枚あたり数十KB）。
[src/lib/photo.web.js](src/lib/photo.web.js) の処理を外すと、写真1枚で上限を超えて
**単語データごと保存できなくなります。** 上限を超えた場合はトーストで知らせます。

⚠️ 表紙写真の選択は **Web 版のみ**です。iOS アプリ版で使うには `expo-image-picker` の導入が要ります
（[src/lib/photo.js](src/lib/photo.js) 参照）。

### データ形式の移行

旧形式（単語帳が1冊だけだった頃、キー `@eitango_state_v1`）は、初回起動時に自動で
新形式（`@eitango_state_v2`）へ移行し、「マイ単語帳」1冊になります。
**旧データは消さずに残す**ので、移行に失敗しても元データは失われません。
変換処理は [src/lib/decks.js](src/lib/decks.js) にまとめてあります。

## 単語の貼り付け（一括追加）

単語帳の「一括追加」に貼れる形式は [`parseLine`](src/lib/logic.js) が判定します。
区切りは **カンマ / タブ / 全角スペース / 半角スペース** のどれでも構いません。

```
apple りんご
apple, りんご
1. apple りんご
新	26	hire	～を雇う      ← 単語帳からコピーした形もそのまま貼れる
```

**行頭の印は自動で落とします。** 「新」「★」「済」のような英字を含まない目印や通し番号が
英単語の前に何個並んでいても読み飛ばし、英単語から意味までを取り出します。

⚠️ ただし落としすぎないよう、**英単語と意味の2つが残る場合だけ**落とします。
`りんご	apple` のように日本語が先に来る行は、落とすと意味が無くなるのでそのまま扱います。

## 発音の音量

ホーム画面の「発音の音量」で **消音 / 小 / 中 / 大**（0 / 0.3 / 0.6 / 1.0）を選べます。
**端末の音量は変えません**。アプリの中だけで下げられます。

- 音声ファイル（`Audio.volume`）と読み上げ（`SpeechSynthesisUtterance.volume`）の両方に効きます
- 消音のときは何も鳴らしません
- 押すとその音量で1語鳴るので、耳で確かめられます
- 設定は保存されます（保存データの `vol`）

⚠️ スライダーは使っていません。React Native にスライダーは標準で無く、追加ライブラリが要るためです。
押すだけで決まる4段階のほうが確実で、片手でも操作しやすいという判断です。

## 学習設定の画面

**「学習を開始」までスクロールせずに届くこと**を条件に、余白と文字を詰めてあります
（375×812 で開始ボタンの下端が 572px）。要素を足すときは実機幅で確認してください。

- 出題数の既定は**「全」**。ボタンの並びも「全」が左端です
- 3行あった要約は1行にまとめています

## ダブルタップモード（フラッシュカード）

学習設定の「出題数」の下でオン／オフできます。オンにすると:

| 操作 | 動き |
|---|---|
| 「知ってた／知らない」を1回押す | **意味が出るだけ。判定されない** |
| もう一度押す | 判定して次のカードへ |

意味を確かめてから判定できるので、誤タップで進んでしまうのを防げます。
いま1回目か2回目かはボタンの下に出ます。

- 次のカードに進むと毎回1回目に戻ります（`flipped` が false に戻るため）
- カードを直接タップして意味を出した後は、ボタン1回で判定します（もう意味を見ているため）
- スワイプは意図的な操作なので、これまでどおり1回で判定します
- 設定は保存されます（保存データの `dt`）
- オフ（既定）のときは従来どおり1回で判定します

## フラッシュカードの速さボーナス

フラッシュカードだけ、**正解までが速いほど獲得点が増えます**（[`speedFactor`](src/lib/logic.js)）。
すぐ答えられた＝しっかり覚えている、という考え方です。

| 答えるまで | 倍率 |
|---|---|
| 1.5秒以内 | 1.6倍 |
| 3秒 | 1.42倍 |
| 6秒 | 1.05倍 |
| 8秒以上 | 0.8倍 |

実測例：習熟度30%の同じ条件の単語で、**1.2秒なら +15%、13.3秒なら +8%**。
結果一覧にかかった時間が出て、ボーナスが付いた行には ⚡ が付きます。

⚠️ **速さで変わるのは正解時の加点だけ**です。不正解の減点は時間で変えていません
（早とちりで間違えた人の減点が軽くなってしまうため）。

⚠️ 時間を測っているのはフラッシュカードだけです。`calcProg` は第4引数に時間を渡したときだけ
速さを見るので、他モードは従来どおり動きます。

## 連続日数

学習した日が途切れずに続いている日数です。1日1回でも学習すれば加算されます。

画面に出す値は、次の**大きいほう**を採ります（[`streakFromDates`](src/lib/logic.js)）。

| | 持ち方 | 長所 / 短所 |
|---|---|---|
| カウンタ | `s`（連続日数）と `ld`（最後に学習した日） | 30日より長い連続も持てる / 壊れると復元できない |
| 学習履歴 | 各単語の `reviewedDates` から数え直す | 実際の記録なので確実 / 30日ぶんしか残らない |

カウンタ側は、最後の学習が**今日でも昨日でもない**なら連続が切れているので 0 とみなします。

⚠️ 履歴から数え直す仕組みを入れているのは、以前カウンタが加算されない不具合で 0 のまま
止まっていたためです。**カウンタだけに頼ると、壊れたときに復元手段がありません。**

⚠️ **`lastDate` の初期値を `getToday()` にしてはいけません。** 学習していないのに
「今日はもう学習済み」とみなされ、連続日数が永久に 0 のままになります（実際にこの不具合がありました）。
まだ一度も学習していない状態は `null` です。

⚠️ 1回の操作で `updWord` が複数回走ることがあるため、二重加算を ref で見張っています。
state の反映は非同期なので `lastDate` の比較だけでは防ぎきれません。

## 出題の選ばれ方（通常モード）

**ランダムではありません。** 苦手な語ほど出やすくなるよう重み付けしています
（[`calcWeight`](src/lib/logic.js)）。次の 4 つを掛け合わせた値が重みです。

| 要素 | 効き方 |
|---|---|
| 習熟度 | 0% で 3.0倍 → 100% で 0.5倍 |
| **間違い率** | 0% で 1.0倍 → 100% で最大 3.0倍 |
| 未学習 | 1.5倍（出題されないと永久に覚えられないため） |
| 連続正解 | 3連続以上なら 0.7倍 |

間違い率は**試行回数で割り引いています**。「1回やって1回ミス（100%）」と
「20回中15回ミス（75%）」を同列に扱うと、たまたま1回間違えただけの語が
上位に居座ってしまうためです。

実測（2000セッション分のシミュレーション）では、間違い率90%の語は
間違い率5%で連続正解中の語より **約9倍** 出題されます。

新規モード・苦手モードは、対象を絞り込んだうえで均等に選びます。

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

### 自分で追加した単語に AI 音声を用意する

アプリで追加した単語は、何もしなくても端末の読み上げが担当します。
そのうえで AI 音声を用意したい場合は、次の流れで作れます。

1. スマホのアプリで「保存」を押し、JSON を書き出す（メールや AirDrop で Mac へ）
2. Mac で JSON を渡して生成する

```bash
npm run build:audio -- --from ~/Downloads/1200.json
```

書き出した JSON に入っている単語のうち、まだ音声が無いものだけ生成します。
単語を直接指定することもできます。

```bash
npm run build:audio -- --words "serendipity,ephemeral"
```

3. 生成された `assets/audio/*.m4a` と `src/lib/audioMap.js` をコミットして push

```bash
git add assets/audio src/lib/audioMap.js && git commit -m "音声を追加" && git push
```

push すれば Web 版に自動で反映されます。

### 音声をすべて作り直す

音声の声質を変えたときなど、既存分も含めて作り直したいときだけ必要です。普段は不要です。

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
npm run build:audio -- --force # 既にあるものも作り直す
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
