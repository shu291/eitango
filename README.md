# 英単語マスター（eitango）

英単語を覚えるための iOS アプリ。6 つの学習モードと、覚え具合の可視化を備えています。

- **学習モード** — フラッシュカード / 4 択クイズ / タイピング / 英訳（逆方向）/ マッチング / スピード
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

## Web 版について

`package.json` に `"web": "expo start --web"` スクリプトはありますが、
**`react-dom` / `react-native-web` / `@expo/metro-runtime` が未インストールのため、現状では起動しません。**
また JSON の入出力に使っている `expo-file-system` は Web 非対応です。

## データについて

- 学習データは端末内の AsyncStorage にのみ保存されます（キー: `@eitango_state_v1`）
- **アプリを削除するとデータは消えます。** 端末間の同期もありません
- アプリ内の JSON エクスポート機能でバックアップを取れます。復元も同じくアプリ内から
