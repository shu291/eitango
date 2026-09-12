# CLAUDE.md — eitango（英単語マスター）

> このファイルは **調査結果のスナップショット** です。実際に読んで確認できたことだけを書き、
> 確認できなかったことは「未確認」と明記しています。推測は書いていません。
> 調査日: 2026-07-25 / 調査方法: 読み取りのみ（ビルド・インストールは一切実行していない）

---

## 0. 30 秒サマリ

| 項目 | 値 |
|---|---|
| アプリ名 | 英単語マスター（slug: `eitango` / bundle ID: `com.so.eitango`） |
| Expo SDK | **54**（`expo ~54.0.33`） |
| React Native / React | 0.81.5 / 19.1.0 |
| 構成 | **prebuild 済み（iOS のみ）**。`android/` は存在しない |
| New Architecture | **有効**（`Info.plist` の `RCTNewArchEnabled = true`） |
| スタイリング | NativeWind v4 + Tailwind v3（`className` を使う） |
| 言語 | **JavaScript のみ**。TypeScript の型定義ファイルは無い |
| ルーティング | ライブラリ未使用。`scr` という state による条件レンダリング |
| ストレージ | キーは `@eitango_state_v2` の 1 つだけ。ネイティブは AsyncStorage、**Web は IndexedDB**（`src/lib/storage.web.js`。localStorage は iPhone で 5MB 上限のため使わない） |
| 復習アルゴリズム | **SM-2 ではない**（独自ポイント制。詳細は §3） |
| git | **リポジトリが存在しない**（`.git` なし、`.gitignore` なし） |
| テスト / Lint | 無し |

### 触る前に知っておくべき 3 点

1. **`App.js` が 1865 行の単一ファイル**で、全 12 画面と状態管理がここに入っている。分割はされていない。
2. **`git init` すらされていない。** 変更前に必ず退避を取ること。壊しても戻せない。
3. **`ios/app.xcodeproj/project.pbxproj` に手作業の署名設定（`DEVELOPMENT_TEAM`）が入っている。**
   `npx expo prebuild --clean` を打つと消える。詳細は §6。

---

## 1. ディレクトリ構成

```
eitango/
├── App.js                    ★ 本体 1865 行。全画面 + 状態管理 + 永続化
├── index.js                    registerRootComponent(App) だけ（4 行）
├── src/
│   ├── lib/logic.js          ★ 純粋関数 152 行。日付・進捗計算・パーサ・初期データ
│   └── screens/                空ディレクトリ（ファイル 0 件。使われていない）
├── global.css                  NativeWind 用 Tailwind ディレクティブ
├── app.json                    Expo 設定（plugins 配列は現時点で無し）
├── babel.config.js             babel-preset-expo + nativewind
├── metro.config.js             withNativeWind(config, { input: './global.css' })
├── tailwind.config.js
├── nativewind-env.d.ts
├── assets/                     icon.png / splash-icon.png / adaptive-icon.png / favicon.png
│
├── ios/                      ⚙ prebuild 生成物（ただし手作業変更あり → §6）
├── node_modules/             ⚙ 生成物
├── package-lock.json         ⚙ 生成物（ただしコミット対象）
└── .expo/                    ⚙ 生成物（ローカルキャッシュ）
```

**自分で書いたコード（★）**: `App.js` / `src/lib/logic.js` / `index.js` / `global.css` /
`app.json` / 各 `*.config.js` / `assets/`

**生成物（⚙）**: `ios/` / `node_modules/` / `package-lock.json` / `.expo/`

**自作コードの総量は実質 2 ファイル・約 2000 行**。`src/screens/` は空なので、
「画面ごとにファイルを分ける」意図はあったが実行されていない状態。

---

## 2. 単語データの型

**型定義ファイルは存在しない。** 実質的な定義は `src/lib/logic.js:121` の `INIT_WORDS`
（サンプル 30 語）が唯一のリファレンス。

```js
{
  id: number,                  // 連番。次の ID は state の `nid` が保持
  en: string,                  // 英単語        ← word 相当
  ja: string,                  // 日本語訳      ← meaning 相当
  progress: number,            // 0–100 の習熟度
  correct: number,             // 正解回数
  incorrect: number,           // 不正解回数
  streak: number,              // 連続正解数
  lastReviewed: string | null, // 'YYYY-MM-DD'（ローカル日付）
  reviewedDates: string[],     // 学習した日付の配列
}
```

### 重要

- **`example`（例文）に相当するフィールドは存在しない。** `App.js` / `logic.js` を全文検索しても
  `example` / `sentence` / `例文` のいずれもヒットしない。追加するなら新規フィールドになる。
- 発音・品詞・タグ・レベルなどのフィールドも無い。

> 【2026-09-12 更新】**例文は単語データには持たせず、同梱の対応表で引く。**
> `src/lib/exampleMap.json`（単語キー → `{ en, ja }`）を `scripts/build-examples.mjs` が
> Mac 上の Ollama で事前生成する（音声の `build-audio.mjs` と同じ流儀。実行時に AI は動かない）。
> 画面側は `exampleFor(w)`（`src/lib/examples.js`）だけを呼ぶ。単語が `ex: { en, ja }` を持って
> いればそちらを優先（取り込み JSON での手直し用。`normalizeWord` が通す）。
> キーの作り方 `keyOf` は examples.js と build-examples.mjs で必ず揃える（speech.js の keyOf と同じ式）。
- テキスト取り込みのパーサは `parseLine()`（`src/lib/logic.js`）。
  返すのは **`{ en, ja }` の 2 フィールドのみ**。区切り判定の優先順は
  **タブ → 全角スペース → カンマ** →「行頭の連番を除去して最初の日本語文字の位置で分割」
  → 2 個以上の半角スペース。

  > 【2026-08-24 更新】以前はカンマが最優先だった。意味に含まれるカンマ
  > （`即座の, 素早い； ～を促す, 刺激する`）で行が切られ、`en` に
  > `264\tprompt\t即座の` のように番号・単語・意味の先頭までまとめて入る不具合があった。
  > `en` にタブが残るので表示が改行のように崩れ、**出題時に答えが問題文に見えていた**。

  ⚠️ 割ったあとは必ず `looksLikeEn()` で英単語側の妥当性を確かめ、おかしければ
  **return せず次の区切りで割り直す**。弾くのは「タブを含む」「英字と日本語が混ざる」の2つだけ。
  日本語だけの `en` は和→英の単語帳としてありうるので通す。

  ⚠️ 過去に壊れて保存された単語は `repairWord()` が読み込み時に直す
  （`normalizeWord` の中で呼んでいる。冪等なので何度通しても安全）。
  直した語数は `countBrokenWords()` で数えて起動時にトーストで知らせる。

---

## 3. 進捗の保存とアルゴリズム ⚠ 重要な訂正

### 間隔反復（SM-2 系）と独自ポイント制が **併存** している

> 【2026-07-28 更新】この節は元々「SM-2 は実装されていない」と書かれていたが、その後
> 間隔反復を追加したため書き換えた。以下の記述が現状。詳細は README「間隔反復（忘却曲線）について」。

現在は **2つの仕組みが別の軸として同居している**。

| | 持ち方 | 役割 |
|---|---|---|
| 習熟度 | `progress` 0〜100 | どれくらい覚えているか。表示と通常モードの重み付け |
| 間隔反復 | `due` / `ivl` / `ef` | 次にいつ出すか。復習モードの出題対象 |

間隔反復は `nextSchedule()`（`src/lib/logic.js`）。SM-2 の `ef` 更新式をそのまま使い、
quality（手ごたえ 2〜5）は答えるまでの速さから `srQuality()` で導いている
（本人に5段階申告させる代わり。時間を測っているのはフラッシュカードのみ）。

⚠️ `nextSchedule()` は `word.streak` を「これまでの連続正解数」として読む。
**必ず更新前の単語を渡すこと。** 更新後の値を渡すと間隔が1段階ぶん先走る。

⚠️ **予定（`due`）が付くのは、実際に答えた単語だけ。**
以前は `backfillSchedule()` が「習熟度と正答率から逆算した予定」を古いデータに後付けしていたが、
**2026-08-29 にやめた**（→ §3 の【2026-08-29 更新】）。今あるのは予定を外す `clearSchedule()` だけ。

⚠️ 予定の作り方を変えたら `SR_VERSION`（`src/lib/decks.js`）を上げる。
保存データの `srv` がこれと違うと、読み込みのときに **due / ivl / ef を1回だけ全部外す**
（`normalizeState` → `makeDeck` → `normalizeWord(w, id, resetSchedule)`）。
習熟度・正解数・`reviewedDates` には触らない。外した語数は `countScheduled()` で数えてトーストで知らせる。

以下は習熟度（`progress`）側の計算。こちらは独自のポイント加減算方式。

**`calcProg(word, ok, mode, elapsedMs?, todayStr?)` — `src/lib/logic.js`**

```
正解時:
  base = progress 帯域で決まる基礎点   (<20:15  <40:12  <60:10  <80:7  それ以上:4)
  base += min(streak * 2, 6)
  gain  = round(base * MODE_MULT[mode] * speedFactor(elapsedMs) * spacingFactor(word, todayStr))
  progress > 90 なら gain は半減（最低 1）
  progress = min(100, progress + gain)
  初めての正解なら progress は最低 20 に底上げ
  streak += 1

不正解時:
  base = progress 帯域で決まる減点     (<20:3   <40:8   <60:16  <80:20 それ以上:24)
  streak >= 3 なら base += 3
  loss = round(base * (0.7 + MODE_MULT[mode] * 0.3))
  progress = max(0, progress - loss)
  streak = 0
```

> 【2026-09-12 更新】**「いつ答えたか」を見るようにした。** それまでは同じ日に何度正解しても
> 満額上がり、初見の語が1日で「完璧」になれた。
> - `spacingFactor(word, todayStr)`（間隔係数）: 初めての語は 1。今日すでに答えた語は 0.4。
>   それ以外は「前回から経った日数 ÷ `ivl`」を 0.5〜1.5 に収める（復習日どおりなら 1）。
>   `todayStr` を渡さなければ 1（純粋関数のまま）。**updWord は必ず今日を渡す。**
> - 速さボーナスの上限を 1.6 → 1.25 に。フラッシュカード（MODE_MULT 0.8）の速答が
>   実効 1.0 ＝ 4択と同格になる（以前は 1.28 で自己申告が4択より強かった）。
> - 減点を <60: 12→16、<80: 16→20、80+: 20→24 に。○○×（正答率67%）が定着まで上がり続けていた。
> 数字はすべて `logic.js` 上部の定数（`SPACING_*` / `SPEED_*`）と `calcProg` 内の帯域表にある。

**モード係数 `MODE_MULT`（`logic.js:29`）**

| flashcard | quiz | typing | reverse | speed | matching |
|---|---|---|---|---|---|
| 0.8 | 1.0 | 1.3 | 1.2 | 0.9 | 1.0 |

出題対象の絞り込みは 3 つの述語で行う。
`isNew(w)`（正解も不正解も 0 回）/
`isWeak(w)`（**progress ≦ 30 が前提**（`WEAK_MAX_PROGRESS`）。そのうえで直近で間違えた、または 2 回以上やって正答率 < 50%、または不正解 3 回以上）/
`isDue(w, today)`（`due` が今日以前＝復習日が来ている）。

### 覚え具合の 6 段階は `LEVELS` が唯一の定義

> 【2026-08-29 更新】以前は 90/80/60/40/20 の境目が `getLevel` と統計画面の2か所に
> 別々に書かれていた。単語帳の絞り込みでも同じ段階を使うことになったので、
> `LEVELS`（`src/lib/logic.js`）1か所にまとめた。**境目・名前・色を変えるならここだけ直す。**

```js
LEVELS  // 低いほうから: 要復習(0) / うろ覚え(20) / あと一歩(40) / 定着(60) / マスター(80) / 完璧(90〜)
LEVEL_NEW  // 未学習。どの段階にも入らない
getLevel(p, touched)  // 1語 → 段階。touched が false なら LEVEL_NEW
inLevel(w, 'lv_settled')  // その単語が「定着」か。未学習は必ず false
// k は 'lv_review' / 'lv_vague' / 'lv_almost' / 'lv_settled' / 'lv_master' / 'lv_perfect'
```

⚠️ **未学習（一度も出していない語）を段階に混ぜないこと。** progress 0 のままなので
素直に書くと「要復習」に落ちるが、手を付けていないだけの語が苦手に見えてしまう。
`inLevel` が `isNew` で弾いている。

⚠️ 語数を数えるときは App.js の `lvCount`（1語につき1回だけ数える）を使う。
段階ごとに `words.filter()` を回すと 1900 語で 6 周する。統計の分布グラフも同じ値を見ている。

> 【2026-07-28 更新】ここには「SM-2 を導入するなら新規実装になる」と書かれていたが、
> 実際に追加済み。`progress` は捨てず併存させた。
>
> 【2026-08-29 更新】古いデータへ `backfillSchedule()` で予定を後付けする形だったが、
> **やめた**。実際にいつ答えられたかを知らない数字から作った予定なので、開いた初日に
> いきなり数百語が「今日の復習」に積まれ、忘却曲線としても正しくなかった。
> 今は**その日から実際に答えた単語だけ**が予定を持つ。既存データの予定は
> `SR_VERSION` の仕組みで読み込み時に1回だけ外した。

### ストレージ

> 【2026-08-24 更新】Web の保存先を localStorage から **IndexedDB** に移した。
> localStorage は iPhone の Safari で 5MB 固定で、単語を数千語入れると上限に当たり
> `QuotaExceededError` で**以降の学習が一切保存されなくなる**（実際に発生）。
> `src/lib/storage.js` / `storage.web.js` に分けてあるので、App.js 側に分岐は無い。

- ネイティブ … **AsyncStorage**（`@react-native-async-storage/async-storage` v2.2.0）
- Web … **IndexedDB**（`eitango` DB の `kv` ストア）
- **SQLite / MMKV / expo-sqlite は未使用**（package.json にも無い）。

⚠️ **Web で AsyncStorage を直接使わないこと。** Web 実装は localStorage をそのまま使うので、
5MB の問題がそのまま戻る。必ず `src/lib/storage.js` の `getItem` / `setItem` を通す。

⚠️ 旧データの引き継ぎは `getItem` の中で行う（IndexedDB に無ければ localStorage を見る）。
localStorage 側は控えとして消さない。

- **キーは 1 つだけ**: `@eitango_state_v2`（旧 `@eitango_state_v1` からは初回に移行）
- 保存される値（キー名が 1 文字に圧縮されている点に注意）:

  ```js
  JSON.stringify({
    w: words,      // 単語配列まるごと
    s: streak,     // 連続学習日数
    ld: lastDate,  // 最終学習日 'YYYY-MM-DD'
    n: nid,        // 次に採番する ID
  })
  ```

- **読み込み**: `App.js:115-132` の初回 `useEffect`。失敗しても `console.log` して握りつぶし、
  `INIT_WORDS`（サンプル 30 語）のまま起動する。
- **保存**: `App.js:135-144` の `useEffect`。`words / streak / lastDate / nid` のいずれかが変わると
  **500ms デバウンス**後に全件を JSON 化して 1 キーに書き込む。エラーは `.catch(() => {})` で無視。
- マイグレーション処理は無い（キー名の `_v1` が唯一のバージョン表明）。

### 手動バックアップ（JSON エクスポート / インポート）

- `exportData()` — `App.js:592`
  `FileSystem.documentDirectory + '1200.json'` に書き出し → `Sharing.shareAsync()` で共有シートを出す。
- `importData()` — `App.js:608`
  `DocumentPicker.getDocumentAsync({ type: 'application/json' })` → `FileSystem.readAsStringAsync()`。
- `FileSystem` は **`expo-file-system/legacy` からインポートしている**（`App.js:23`）。
  SDK 54 の新 API（`File` / `Directory` / `Paths`）ではない。

---

## 4. package.json

**Expo SDK 54**（`expo ~54.0.33`）

| パッケージ | バージョン | 用途 |
|---|---|---|
| `expo` | ~54.0.33 | SDK 本体 |
| `react` / `react-native` | 19.1.0 / 0.81.5 | — |
| `@expo/vector-icons` | ^15.1.1 | Ionicons / MaterialCommunityIcons |
| `@react-native-async-storage/async-storage` | ^2.2.0 | **唯一の永続化手段** |
| `expo-document-picker` | ^14.0.7 | JSON インポート |
| `expo-file-system` | ^19.0.16 | `/legacy` で読み書き |
| `expo-sharing` | ^14.0.7 | JSON エクスポート |
| `expo-status-bar` | ~3.0.9 | — |
| `nativewind` | ^4.1.23 | Tailwind for RN |
| `tailwindcss` | ^3.4.17 | — |
| `react-native-gesture-handler` | ^2.28.0 | （`App.js` からの直接 import は無し・未確認） |
| `react-native-reanimated` | ^4.1.3 | 同上 |
| `react-native-worklets` | ^0.8.3 | reanimated 4 の依存 |
| `react-native-safe-area-context` | ^5.6.0 | `SafeAreaView` / `SafeAreaProvider` |
| `react-native-screens` | ^4.16.0 | （直接 import は無し・未確認） |
| `react-native-svg` | ^15.13.0 | （直接 import は無し・未確認） |

`devDependencies` は `@babel/core ^7.25.0` **のみ**。TypeScript / ESLint / Prettier / Jest いずれも無し。

### 入っていないもの（重要）

- **`react-dom` / `react-native-web` / `@expo/metro-runtime` が無い。**
  `package.json` に `"web": "expo start --web"` スクリプトはあるが、**このままでは Web は起動しない。**
- **`expo-speech` は入っていない。** 読み上げ（TTS）機能は現状のコードに存在しない。
- `expo-dev-client` は無し（`Podfile.properties.json` に `EX_DEV_CLIENT_NETWORK_INSPECTOR: "true"` はあるが、
  パッケージ自体は未インストール）。

---

## 5. 単語カードを表示しているコンポーネント

すべて `App.js` の `App()` 関数**内部**に定義されたインライン関数。独立したコンポーネントファイルは無い。

| 対象 | 場所 | 内容 |
|---|---|---|
| **フラッシュカード本体** | `App.js:1005-1081` `renderFlash()` | ★ 主役。表 `w.en` → タップで裏 `w.en`(小)+`w.ja`(大) |
| スワイプ判定 | `App.js:658` `panResponder` | 左 = 知らない / 右 = 知ってた。`pan` は `Animated.Value` |
| 採点ハンドラ | `App.js:396` `hFlash(knew)` | ここから `calcProg()` を呼ぶ。判定前の単語を `undoStack` に積む |
| 1つ前にもどる | `hFlashBack()` | `undoStack` の一番上を単語に書き戻して取り消す（点・成績・復習日・学習時間・結果一覧）。連続日数だけは戻さない |
| レベルバッジ | `App.js:697` `LvBadge({ w })` | `getLevel()` の結果を表示 |
| 単語リストの 1 行 | `App.js:1369` `renderWordItem({ item: w })` | `renderWords()`（1361）内の `FlatList` 用 |
| 共通ヘッダ | `App.js:688` `Header({ title, back })` | |
| アイコンラッパ | `App.js:43` `Icon({ name, ... })` | `brain` だけ MaterialCommunityIcons に振り分け |
| 週次グラフ | `App.js:1838` `BarChart7({ data })` | ファイル末尾のトップレベル関数 |

### 画面遷移

`scr` という state の文字列で条件レンダリング（`App.js:1786-1797`）。ルーターライブラリは使っていない。

```
dashboard → study → config → flashcard / quiz / typing / reverse / matching / speed
                                        ↓
                                     results
その他: words（単語一覧） / stats（統計）
```

対応する render 関数: `renderDash`(709) / `renderStudy`(829) / `renderConfig`(868) /
`renderFlash`(1005) / `renderQuiz`(1082) / `renderTyping`(1123, 引数 `isRev` で reverse と共用) /
`renderMatch`(1192) / `renderSpeed`(1243) / `renderResults`(1301) / `renderWords`(1361) / `renderStats`(1615)

---

## 6. ios/ の手作業変更と git 履歴

### git 履歴 → **存在しない**

`.git` ディレクトリが無いため、**`git log` / `git diff` による確認は不可能**。
以下はファイルのタイムスタンプと内容から読み取れた事実のみ。

### prebuild の実行時刻

`ios/` 配下の大半（`Podfile` / `AppDelegate.swift` / `Info.plist` / `SplashScreen.storyboard` /
`app.entitlements` / `Podfile.properties.json`）が **2025-05-24 07:12** で揃っている。
これが `expo prebuild` の実行時刻と考えられる。`pod install` は 07:27（`Podfile.lock` / `PrivacyInfo.xcprivacy`）。

### 検出された prebuild 後の変更

| ファイル | 更新時刻 | 判定 |
|---|---|---|
| **`ios/app.xcodeproj/project.pbxproj`** | 05-24 **07:33** | ⚠ **手作業。§下記** |
| `ios/app.xcodeproj/xcshareddata/xcschemes/app.xcscheme` | 05-24 **07:35** | Xcode による自動更新の可能性が高い。**差分内容は未確認** |
| `ios/app.xcworkspace/xcuserdata/so.xcuserdatad/` | （継続更新） | Xcode で開いた形跡。個人設定なので無視してよい |
| `ios/.xcode.env.local` | 05-24 07:16 | マシン固有。`ios/.gitignore` で既に除外済み |

### ⚠ 唯一の「消えると困る」手作業変更

```
ios/app.xcodeproj/project.pbxproj:343  DEVELOPMENT_TEAM = 8PLVWBJM54;   (Debug)
ios/app.xcodeproj/project.pbxproj:380  DEVELOPMENT_TEAM = 8PLVWBJM54;   (Release)
```

- `expo prebuild` はこの値を書き込まない。**Xcode の Signing & Capabilities で手動設定したもの**と判断できる。
- `app.json` にこれを再生成する記述は無い（`plugins` 配列自体が存在しない）。
- したがって **`npx expo prebuild --clean` を打つと確実に失われ、git 履歴も無いので復元できない。**
- 恒久対策の方向性: `@expo/config-plugins` の `withXcodeProject` で `DEVELOPMENT_TEAM` を注入する
  config plugin を書くか、EAS Build の credentials 管理に寄せる。**どちらを採るかは未決定。**
- `8PLVWBJM54` が無料の Personal Team か有料 Apple Developer Program の Team かは **未確認**。

### その他の ios/ 所見

- `ios/Podfile` は **素の prebuild 出力**。`inhibit_all_warnings!` は**未挿入**
  （→ 本タスクで `plugins/withInhibitWarnings.js` を用意した）。
- `ios/Podfile.properties.json` = `{"expo.jsEngine":"hermes","EX_DEV_CLIENT_NETWORK_INSPECTOR":"true"}`。標準。
- `ios/app/Info.plist` は prebuild 標準出力に見える。カメラ・マイク等の usage description の手書き追加は無い。
  New Architecture は `RCTNewArchEnabled = true`。`LSMinimumSystemVersion = 12.0`。
- Podfile の deployment target は `podfile_properties['ios.deploymentTarget'] || '15.1'` → **15.1**。
- `ios/.gitignore` は prebuild が生成済み（`build/` `Pods/` `xcuserdata` `.xcode.env.local` 等を除外）。
  **ios/ をコミットするなら、この `ios/.gitignore` も一緒にコミットして残すこと。**
- `ios/.DS_Store` が存在する。コミットしないよう除外が必要。
- `ios/Pods/` と `ios/build/` の中身は生成物として**未検査**。

---

## 7. 開発時の制約

- **実機ビルドには macOS + Xcode + CocoaPods が必須。** Linux 環境（Cowork のクラウドサンドボックス等）では
  iOS ビルドは原理的に不可能。
- `ios/.xcode.env.local` に記録された開発マシンの Node は
  `/usr/local/Cellar/node/25.9.0_3/bin/node`（Homebrew / Intel prefix）。
  **現在も同じパスに存在するかは未確認。** clone 先が変われば必ず書き換えが要る。
- New Architecture が有効なので、対応していないサードパーティライブラリは追加時に注意。

---

## 8. 未確認事項の一覧

- `app.xcscheme` が prebuild 出力からどう変わったかの具体的な差分
- `ios/Pods/` `ios/build/` の中身
- `DEVELOPMENT_TEAM = 8PLVWBJM54` が無料 Personal Team か有料 Apple Developer Program か
- 実機での動作確認が済んでいるかどうか、済んでいる場合の iOS バージョン
- 開発マシンの Xcode / CocoaPods / Ruby のバージョン
- `react-native-gesture-handler` / `react-native-screens` / `react-native-svg` /
  `react-native-reanimated` が実際に使われているか（`App.js` からの直接 import は無し。
  NativeWind や safe-area-context 経由の間接依存の可能性がある）
- `.expo/` の中身

---

## 9. 見た目のルール（2026-08-28 追加）

UI を全面的に作り替えた。**色・余白・書体を触るときは必ず `design/DESIGN.md` を読むこと。**

| ファイル | 役割 |
|---|---|
| `src/theme.js` | **色・角丸・余白・書体の唯一の出どころ**（CommonJS。`tailwind.config.js` も App.js もここを読む） |
| `tailwind.config.js` | 意味の分かる色名（`bg-paper` / `bg-sheet` / `border-rule` / `text-ink` / `bg-navy` …）と書体を定義。`rounded-2xl` も 10px に丸め込まれる。**Tailwind の既定色名はそのまま既定の色で出る**（2026-08-30 に読み替えを外した） |
| `design/DESIGN.md` | 守るべきルール（影を使わない／13px以下にLoraを当てない／押せる＝色の面 など） |
| `design/direction.json` | 採用案Aと不採用のB・C案の定義 |
| `design/design-brief.html` | 3案の見くらべページ（ブラウザで開く） |

### 触る前に知っておくこと

- 採用案は **A「英単語ノート」**。ただし **色だけは 2026-08-30 に刷新前へ戻した**（本人の希望）。
  組み方（罫線で段差・影ゼロ・角丸3段・英字と数字だけ別書体）は A案のまま、色は
  Tailwind 既定の indigo / rose / emerald / amber に戻っている。詳細は `src/theme.js` の冒頭。
- **影は全画面ゼロ。** `shadowColor` や `elevation` を足さない。段差は 1px 罫線と紙の色差で作る。
  カードは `<Sheet>`、区切りは `<Rule>`、見出しは `<SectionTitle>` / `<PageTitle>`、ボタンは `<Btn>`、
  空っぽの画面は `<EmptyState>`。**新しくカードやボタンを書かない。**
- **`C.primary` = 押す／進捗。`C.accent` = 間違い・苦手・期限超過の印。** 混ぜない。
  ⚠️ トークン名は A案由来のまま（`navy` / `vermilion` / `moss` / `ochre`）。色を戻したときに
  名前まで変えると、色と関係ない差分が App.js の 38 か所に出るので残してある。
  色相はおおむね合っている（navy=indigo・vermilion=rose・moss=emerald・ochre=amber）。
- 書体は `@expo-google-fonts/lora`（英単語）と `@expo-google-fonts/ibm-plex-mono`（数字）を同梱。
  **日本語には当てない。** Web では `ff()`（App.js:76）がシステム書体のフォールバックを付け足す。
  `useFonts` の完了を待って `return null` しないこと（Web で一瞬まっ白になる）。
- `getLevel()`（`src/lib/logic.js`）の色は虹色をやめ、**藍1色の濃淡ランプ**にした（要復習だけ朱）。
- 下タブは `TabBar`（App.js 末尾）。`useSafeAreaInsets().bottom` を足しているので `SafeAreaProvider` の中でのみ使える。
