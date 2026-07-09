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
  フィクスチャ 6 ページ構成: 対象外 / 静的提出済み / 未提出 / 遅延描画アップロード済み(2.5s後に注入
  → 暫定「未提出」からの後追い補正を検証) / 出席 / 対象外。
  シナリオ: 初回表示 → sessionStorage ウォームリロード即時表示 → 提出反映(更新ボタン) →
  focus 連打スロットル(遅延実行) → 更新ボタン連打。
- ダッシュボードの状態は `.pagination li[data-iniadpp-assignment-state]` と
  `[data-count="..."]` から読み取れる。

## 実行

```bash
node driver.js            # 17 チェック、~50 秒。exit 0 = ALL PASS
HEADFUL=1 node driver.js  # 画面を見ながら
```

スライド PDF 系の確認は公開デッキ URL (INIAD アカウント不要) が使える:
`https://docs.google.com/presentation/d/e/2PACX-…/pub?…&iniadpp_download=1`
