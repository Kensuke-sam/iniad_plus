# Chrome Web Store 提出メモ

INIAD Plus を Chrome Web Store に再提出するときに、そのまま転記しやすい情報です。v1.4.5 以降の Chrome Web Store 向け ZIP は、審査で見える機能を「印刷用 PDF 作成補助」と「課題・出席まとめ」の 2 つに絞った、権限なし・background なしの構成です。

## 基本情報

- 拡張機能名: `INIAD Plus - MOOCs PDF Helper`
- 短縮名: `INIAD Plus`
- 推奨カテゴリ: `教育`
- サポート URL: `https://github.com/Kensuke-sam/iniad_plus`
- プライバシーポリシー/説明: [`docs/privacy.md`](privacy.md)

Chrome Web Store で公開 URL が必要な場合は、`docs/privacy.md` の内容を GitHub 上の公開ページに置いて、その URL を設定してください。

## ストアの短い説明文

`INIAD MOOCs の講義スライドの学習用 PDF 作成と、課題・出席ページの確認を補助する非公式 Chrome 拡張です。`

## 詳細説明文

```text
INIAD Plus - MOOCs PDF Helper は、INIAD MOOCs の講義ページでの学習を補助する非公式 Chrome 拡張です。主な機能は次の 2 つです。

1. 学習用 PDF 作成補助: 講義ページに PDF 作成ボタンを追加し、利用者が正当に閲覧できる埋め込み Google Slides を Chrome の印刷機能で PDF 化しやすい印刷用ページに整えます。PDF の保存は、利用者自身が Chrome の印刷ダイアログから行います。

2. 課題・出席まとめ: 講義ページのタブ（ページ一覧）を「出席 / 未提出 / 提出済み」に自動分類して色分けし、講義内の課題・出席ページを一覧できるまとめを表示します。分類のために、同じ講義内のページ（moocs.iniad.org の同一オリジン）を利用者のログイン状態で取得し、ブラウザ内でのみ解析します。取得した内容は表示補助にのみ使用し、保存も外部送信もしません。

この拡張機能はログイン制限、アクセス制限、ダウンロード制限を回避しません。対象は、利用者が INIAD MOOCs 上で正当に閲覧できる講義資料だけです。作成した PDF は利用者のローカル環境に保存されます。開発者のサーバー、広告、解析、トラッキング、外部データ販売はありません。

この拡張機能は、東洋大学および情報連携学部による公認・提供ではありません。利用者は所属機関の規則、講義資料の利用条件、著作権法の範囲内で利用する必要があります。
```

## 単一目的の説明

`INIAD MOOCs の講義ページでの学習補助（認可済み講義スライドの学習用 PDF 化と、課題・出席ページの確認補助）。`

## Chrome Web Store 向け ZIP の構成

`./scripts/package-webstore.sh` で作成する Chrome Web Store 向け ZIP は、次のファイルだけを含めます。

- `manifest.json`
- `js/download-button.js`
- `js/download.js`
- `js/moocs_assignment_tabs.js`
- `css/download-button.css`
- `css/moocs_assignment_tabs.css`
- `lib/jquery-3.7.1.min.js`
- `img/iniadpp16.png`, `img/iniadpp48.png`, `img/iniadpp128.png`
- `LICENSE`, `THIRD_PARTY_NOTICES.md`

README や開発用の他機能はリポジトリには残しますが、Web Store 提出 ZIP には入れません。これにより、ストア掲載の説明と実際に提出される機能を一致させます。

## 権限とアクセス先の説明

### Required permissions

なし。

### Optional permissions

なし。

Chrome Web Store 向け ZIP には `debugger`、`downloads`、`storage`、background service worker を含めません。拡張機能はページ内ボタンから印刷用ページを開き、保存は Chrome の印刷ダイアログに委ねます。

### `content_scripts.matches`

- `https://moocs.iniad.org/*`
  INIAD MOOCs の講義ページに PDF 作成ボタンと課題・出席まとめを追加するため
- `https://docs.google.com/presentation/d/e/*`
  INIAD MOOCs 上で埋め込み配信されている Google Slides の published/embedded viewer を印刷用 DOM に変換し、PDF 作成を補助するため。通常の編集用 Slides URL には注入しません

## ユーザーデータに関する説明

- ユーザーデータは開発者の外部サーバーへ送信しません
- 分析、広告、トラッキングは行いません
- 拡張機能は提出版では `chrome.storage.local` を使いません
- Google Slides の表示内容は PDF 作成時にブラウザ内でのみ処理します
- 課題・出席まとめは、タブ分類のために同じ講義内のページ（moocs.iniad.org の同一オリジン）を利用者のログイン状態で取得し、ブラウザ内でのみ解析します。取得内容は表示補助にのみ使用し、保存も外部送信もしません
- 作成された PDF は利用者のローカル環境に保存され、開発者は取得しません
- Chrome Web Store User Data Policy の Limited Use requirements に従い、取得したページ内容は学習用 PDF 作成補助と課題・出席まとめの表示にのみ使用します

## 審査担当者向けの動作確認手順

```text
This extension does not bypass login, paywalls, access controls, or download restrictions. It has two features: (1) it helps users create a study PDF from Google Slides content that they are already authorized to view in INIAD MOOCs, and (2) it shows an assignment/attendance summary for the lecture pages the user is viewing.

Primary flow (study PDF):
1. Install the extension.
2. Log in to an INIAD MOOCs account that is authorized to view a lecture containing an embedded Google Slides presentation.
3. Open the lecture page on https://moocs.iniad.org/.
4. Click the button labeled "スライドを学習用PDFにする" or "この講義のスライドを一括で学習用PDFにする".
5. The extension opens a print-ready page for each selected Slides file. Use Chrome's print dialog to save the page as a PDF.

Note: When a lecture contains multiple Slides files and you use the bulk button, allow pop-ups for moocs.iniad.org so that a print-ready tab can open for each file. The per-material buttons ("資料Nを学習用PDFにする") open one tab per click and do not need this.

Assignment/attendance summary flow:
1. Log in to INIAD MOOCs and open a lecture page that has numbered lesson tabs (pagination).
2. The extension adds an "課題・出席まとめ" panel near the top of the lecture content and color-codes the lesson tabs as attendance / not submitted / submitted.
3. For this classification, the extension fetches other pages of the same lecture from moocs.iniad.org (same origin, using the user's existing session), parses them inside the browser only, and does not store or transmit the page content anywhere.

Fallback flow without an INIAD account:
1. Open any publicly published Google Slides URL under https://docs.google.com/presentation/d/e/.
2. Add the query parameter iniadpp_download=1 to the URL.
3. The extension converts the visible Slides viewer into a print-ready page. This fallback verifies the local print-ready conversion path without requiring an INIAD account.

The Chrome Web Store package requests no extension permissions, has no background service worker, and does not send data to the developer's server.
```

## 再提出時の appeal / reviewer note

```text
INIAD Plus - MOOCs PDF Helper has been updated for review clarity and minimum permissions.

Changes in v1.4.5:
- The Chrome Web Store package now includes only the two features described in the listing: the print-ready PDF helper and the assignment/attendance summary for lecture pages.
- The package requests no extension permissions.
- debugger, downloads, storage, and the background service worker were removed from the Chrome Web Store package.
- PDF saving is performed by the user through Chrome's print dialog.
- The assignment/attendance summary fetches only pages of the same lecture from moocs.iniad.org (same origin) with the user's existing session, parses them locally in the browser, and never stores or transmits page content.
- The listing and privacy policy now explicitly state that the extension does not bypass login restrictions, access controls, paywalls, or download restrictions. It only works with content the user is already authorized to view.
- The extension does not transmit user data to the developer, does not use ads or tracking, and uses page content only to provide the two listed features to the user.
```

## 提出前チェック

- `./scripts/package-webstore.sh` でクリーンな ZIP を作成する
- `unzip -p dist/iniad_plus-chrome-web-store-v1.4.5.zip manifest.json` で `permissions`、`optional_permissions`、`background` が存在しないことを確認する
- `unzip -l dist/iniad_plus-chrome-web-store-v1.4.5.zip` で掲載機能（PDF helper と課題・出席まとめ）以外の JS/CSS と `js/service-worker.js` が入っていないことを確認する
- スクリーンショットは `store-assets/chrome-web-store-screenshot-640x400.png` を使う
- 小プロモーション タイルは `store-assets/chrome-web-store-small-promo-440x280.png` を使う
- マーキー画像は `store-assets/chrome-web-store-marquee-1400x560.png` を使う
- ストアアイコンは `img/iniadpp128.png` を使う
- 「データの販売」「広告」「トラッキング」はすべて `いいえ`
- 収集データは、実際の dashboard 分類に合わせて `ウェブサイトのコンテンツ` または同等項目を開示し、用途を学習用 PDF 作成補助と課題・出席まとめの表示に限定する

## 今回の更新内容（v1.4.5）

`Chrome Web Store 向け ZIP を権限なし・background なしの構成に絞り、debugger/downloads/storage を提出版から外しました。機能は掲載どおり「印刷用 PDF 作成補助」と「課題・出席まとめ（同一オリジンのページをブラウザ内でのみ解析）」の 2 つです。掲載文・プライバシー文・審査手順も、制限回避なし/ローカル処理/手動印刷保存に寄せました。`
