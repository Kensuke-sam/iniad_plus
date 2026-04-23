# Chrome Web Store 提出メモ

INIADPLUS を Chrome Web Store に公開するときに、そのまま転記しやすい情報をまとめたメモです。

## 基本情報

- 拡張機能名: `INIADPLUS`
- 推奨カテゴリ: `教育` または `仕事効率化`
- サポート URL: `https://github.com/Kensuke-sam/iniad_plus`
- プライバシーポリシー/説明: [`docs/privacy.md`](privacy.md)

Chrome Web Store で公開 URL が必要な場合は、`docs/privacy.md` の内容を GitHub 上の公開ページに置いて、その URL を設定してください。

## ストアの短い説明文

`【非公式】INIAD MOOCs の講義スライドを PDF 保存しやすくする Chrome 拡張。東洋大学公認ではありません。`

132 文字以内を意識した、日本語向けの候補です。先頭で非公認であることを明示しています。

## 詳細説明文

`INIADPLUS は、INIAD MOOCs の講義スライドを PDF として保存しやすくするための非公式な Chrome 拡張です（東洋大学および情報連携学部による公認・提供ではありません）。講義ページに PDF 保存ボタンを追加し、Google スライドで配信されている資料を Chrome の印刷機能経由で PDF として保存できます。加えて、メモ、時間割 JSON の取り込み、表示補助など、既存の INIAD- 由来の補助機能も利用できます。メモや設定はブラウザ内の localStorage にのみ保存され、作者のサーバーや外部サービスへは送信されません。主要な動作対象は moocs.iniad.org と docs.google.com/presentation/d/e/* です。`

## 単一目的の説明

Chrome Web Store の審査で求められる「single purpose」は次の説明で十分です。

`INIAD MOOCs 上の講義スライドを PDF 保存しやすくし、関連する学習補助機能を提供すること。`

## 権限とアクセス先の説明

この拡張は `permissions` を要求していません。アクセス先は `content_scripts.matches` で指定したページだけです。

- `https://moocs.iniad.org/*`
  INIAD MOOCs の講義ページにダウンロードボタンや補助 UI を追加するため
- `https://docs.google.com/presentation/d/e/*`
  INIAD MOOCs 上で埋め込み配信されている公開スライド（`/d/e/` の embed URL）を印刷用 DOM に変換し、PDF 保存を行うため。通常の編集用 Slides URL には注入しません
- `https://www.ace.toyo.ac.jp/ct/home*`
  ACE 側の学習補助 UI を表示するため

## ユーザーデータに関する説明

- ユーザーデータは外部サーバーへ送信しない
- 分析、広告、トラッキングは行わない
- 設定やメモはブラウザの `localStorage` にのみ保存する
- 保存先は利用者のブラウザ内であり、開発者は取得しない

## 審査担当者向けの動作確認手順

1. `moocs.iniad.org` 上で Google Slides が埋め込まれた講義ページを開く
2. ページ内に表示される `スライドをPDFでダウンロードする` ボタンを押す
3. 新しいタブで確認ダイアログを OK すると、印刷用ページへ変換される
4. 数秒後にブラウザの印刷ダイアログが開くので、送信先を `PDF に保存` にすると PDF として保存できる

## 提出前チェック

- `./scripts/package-webstore.sh` でクリーンな ZIP を作成する
- スクリーンショットは `store-assets/chrome-web-store-screenshot-640x400.png` を使う
- ストアアイコンは `img/iniadpp128.png` を使う
- 「データの販売」「広告」「トラッキング」はすべて `いいえ`
- 「個人情報の収集」は `なし`
