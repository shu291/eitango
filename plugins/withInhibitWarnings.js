// @ts-check
/**
 * withInhibitWarnings
 * ---------------------------------------------------------------------------
 * Podfile の先頭に `inhibit_all_warnings!` を注入する Expo config plugin。
 *
 * CocoaPods の `inhibit_all_warnings!` は Podfile のルート（target ブロックの外）に
 * 置くと、全 Pod のコンパイル警告を抑制する。Expo prebuild が生成する Podfile は
 * 素の状態でこれを含まないため、prebuild のたびに手で足す必要があった。
 * この plugin を使えば `npx expo prebuild` の実行時に自動で入る。
 *
 * ## 二重挿入ガード
 * `withPodfile` は prebuild のたびに走り、既存 Podfile がそのまま残っている場合は
 * 同じ mod が同じ内容に対して再実行されうる。そのため、行頭に「実際に評価される」
 * `inhibit_all_warnings!` が既にあれば何もしない。
 * `# inhibit_all_warnings!` のようなコメント行はガードにヒットさせない
 * （コメントアウトしてあるのに「入っている」と誤判定しないため）。
 *
 * ## 使い方（このファイルを置くだけでは有効にならない）
 * app.json の expo.plugins に登録して初めて動く:
 *
 *   {
 *     "expo": {
 *       "plugins": ["./plugins/withInhibitWarnings"]
 *     }
 *   }
 *
 * ※ 今回のタスクでは app.json への登録は行っていない。登録は Claude Code 側の担当。
 *
 * ## 反映方法
 * 登録後、`npx expo prebuild -p ios` を実行すると ios/Podfile が再生成され、
 * 先頭に注入される。既存の ios/Podfile を残したまま反映したい場合は
 * `npx expo prebuild -p ios --clean` が必要になることがある。
 * ただし --clean は ios/ を作り直すため、project.pbxproj の DEVELOPMENT_TEAM など
 * 手作業の変更が消える点に注意（CLAUDE.md §6 参照）。
 *
 * ## 依存
 * `@expo/config-plugins` は expo パッケージの依存として既に node_modules に入っている。
 * 追加インストールは不要。
 * ---------------------------------------------------------------------------
 */

const { withPodfile } = require('@expo/config-plugins');

/** Podfile に挿入する 1 行 */
const DIRECTIVE = 'inhibit_all_warnings!';

/** 由来が分かるようにする目印コメント */
const BANNER = '# --- injected by plugins/withInhibitWarnings.js ---';

/**
 * 行頭（行内の空白のみ許容）にある、実際に評価される DIRECTIVE を探す正規表現。
 * `[^\S\r\n]*` は「改行以外の空白」なので、`# inhibit_all_warnings!` のような
 * コメント行にはマッチしない。
 * @type {RegExp}
 */
const ALREADY_INJECTED = /^[^\S\r\n]*inhibit_all_warnings!/m;

/**
 * @param {import('@expo/config-types').ExpoConfig} config
 * @returns {import('@expo/config-types').ExpoConfig}
 */
const withInhibitWarnings = (config) =>
  withPodfile(config, (cfg) => {
    const contents = cfg.modResults.contents ?? '';

    // すでに入っている場合は何もしない（二重挿入ガード）
    if (ALREADY_INJECTED.test(contents)) {
      return cfg;
    }

    cfg.modResults.contents = `${BANNER}\n${DIRECTIVE}\n\n${contents}`;
    return cfg;
  });

module.exports = withInhibitWarnings;
