---
name: verify
description: INIAD Plus 拡張の動作確認手順。MOOCs ログイン不要で、実拡張を Chrome for Testing に読み込みローカルのフィクスチャサーバーで課題・出席まとめ等の実挙動を E2E 確認する。
---

# INIAD Plus 動作確認 (E2E)

ブランド版 Chrome は `--load-extension` を無視するため Chrome for Testing を使う。
MOOCs へのログインは自動化できないので、`--host-resolver-rules` で `moocs.iniad.org` を
ローカル HTTPS フィクスチャサーバーへ向け、本物の content script を manifest 経由で注入して確認する。

## セットアップ (作業用ディレクトリで)

```bash
npm init -y && npm i puppeteer-core @puppeteer/browsers
npx @puppeteer/browsers install chrome@stable --path ./browsers
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 2 -nodes -subj "/CN=moocs.iniad.org"
```

## 要点

- HTTPS フィクスチャサーバーを 8443 で立てる。`content_scripts` の match パターンはポートを無視するので
  `https://moocs.iniad.org:8443/...` に注入される。`window.location.hostname` もポートを含まないため
  hostname ガードを通る。443 を使う必要はない。
- puppeteer.launch: `ignoreDefaultArgs: ['--disable-extensions']` が必須。
  args: `--disable-extensions-except=<repo>` `--load-extension=<repo>`
  `--host-resolver-rules=MAP moocs.iniad.org 127.0.0.1` `--ignore-certificate-errors`。
  headless (new) で拡張が動く。
- content script はエラー時に alert() を出すことがある。`page.on('dialog')` で必ず dismiss する。
- 課題・出席まとめの検証には [driver.js](driver.js) を使う (このディレクトリに同梱)。
  フィクスチャ 15 ページ構成: 現在ページの遅延「問題を開く」 / 静的提出済み / 未提出 / 遅延描画アップロード済み
  (2.5s後に注入 → 確定前に「未提出」を点滅させないことを検証) / 出席 / 対象外 / 「問題を開く」が残る途中保存 /
  提出済み・未提出が混在する複数ファイル欄 / 静的HTMLはアップロード済みのみで、2.5s後に
  「問題を開く」がDOM挿入されるページ / 静的HTMLは出席だが2.5s後に対象外へ変わるページ /
  回答受付終了表示・入力済み回答・可視の提出ボタンが共存する小テスト対象外ページ /
  説明文での受付終了文言の引用・非表示またはゼロサイズの古い警告・操作可能な未提出フォームが共存するページ /
  受付終了と明示的な提出済みが共存するページ / 受付終了後2.5秒で提出済みが描画され、途中で対象外・未提出を
  点滅させない未表示タブと現在ページ。
  シナリオ: 初回表示 → sessionStorage ウォームリロード即時表示 → 提出反映(更新ボタン) →
  focus連打の集約 → 更新ボタン連打の重複排除 → 操作起点の追走更新 →
  部分失敗時の前回結果保持 / 前回結果なし表示。
- ダッシュボードの状態は `.pagination li[data-iniadpp-assignment-state]` と
  `[data-count="..."]` から読み取れる。

## 実行

```bash
node driver.js            # 51 チェック、~2 分。exit 0 = ALL PASS
HEADFUL=1 node driver.js  # 画面を見ながら

node pdf-navigation-regression.js
node assignment-status-regression.test.js
node firefox-background-job-context.test.js
node service-worker-pdf-ready-dedupe.test.js
```

証明書・スクリーンショットをリポジトリ外へ置く場合は、`TLS_DIR` と `ARTIFACT_DIR` を指定できる。

スライド PDF 系の確認は公開デッキ URL (INIAD アカウント不要) が使える:
`https://docs.google.com/presentation/d/e/2PACX-…/pub?…&iniadpp_download=1`
