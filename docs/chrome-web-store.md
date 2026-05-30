# Chrome Web Store 提出メモ

INIAD Plus を Chrome Web Store に公開するときに、そのまま転記しやすい情報をまとめたメモです。

## 基本情報

- 拡張機能名: `INIAD Plus - MOOCs PDF Saver`
- 短縮名: `INIAD Plus`
- 推奨カテゴリ: `教育` または `仕事効率化`
- サポート URL: `https://github.com/Kensuke-sam/iniad_plus`
- プライバシーポリシー/説明: [`docs/privacy.md`](privacy.md)

Chrome Web Store で公開 URL が必要な場合は、`docs/privacy.md` の内容を GitHub 上の公開ページに置いて、その URL を設定してください。

## ストアの短い説明文

`INIAD Plus は、INIAD MOOCs の講義スライドを PDF 保存しやすくする非公式 Chrome 拡張です。`

132 文字以内を意識した、日本語向けの候補です。検索で見せたい正式名 `INIAD Plus` を先頭に置き、主要用途と `Chrome 拡張` を自然に含めています。

## 詳細説明文

```text
INIAD Plus は、INIAD MOOCs の講義スライドを PDF 保存しやすくする非公式 Chrome 拡張です。講義ページに PDF 保存ボタンを追加し、Google スライドで配信されている資料を Chrome 標準の印刷機能でローカルに保存できます。INIAD MOOCs で配布されるスライドを後から復習したい人向けに、PDF 保存の操作をできるだけ短くします。

主な機能:
- INIAD MOOCs の講義スライドを PDF で保存
- 講義内に複数資料がある場合の一括 PDF 保存
- Google Slides の資料を A4 横、1 ページ 1 スライドの PDF として保存
- メモ、時間割 JSON の取り込み、表示補助などの INIAD 学習補助機能
- 設定やメモはブラウザ内の localStorage に保存
- 作者のサーバーや外部サービスへのデータ送信なし

この拡張機能は、東洋大学および情報連携学部による公認・提供ではありません。主要な動作対象は moocs.iniad.org と docs.google.com/presentation/d/e/* です。
```

## 検索で勝つための掲載チェックリスト

- 検索結果で見えるタイトルと短い説明文の両方に `INIAD Plus` と `PDF` を入れる
- 詳細説明文の最初の一文を `INIAD Plus は、INIAD MOOCs の講義スライドを PDF 保存...` で固定する
- スクリーンショット 1 枚目は `INIAD Plus`、`MOOCs PDF Saver`、`PDF 保存` が読めるものにする
- 可能なら小プロモーション タイルとマーキー画像を追加し、同じ色・同じ言葉で統一する
- 競合名を説明欄で直接出さず、`PDF 保存に特化` という用途で差別化する
- レビュー依頼は自然な利用者にだけ行い、評価操作やキーワード詰め込みはしない

## 検索表示の方針

- 正式な表示名は `INIAD Plus` を先頭に置く
- ストアタイトル、短い説明文、詳細説明文、スクリーンショット内の表記を `INIAD Plus` に統一する
- 関連語は `INIAD MOOCs`、`PDF 保存`、`Chrome 拡張` だけを自然な文脈で入れる
- 競合しやすい別表記や記号だけの表記は、ストア掲載文と画像内では使わない
- 公式ガイダンス上、キーワードの詰め込みや競合拡張への言及は審査・検索評価のリスクになるため避ける

## 類似名との混同を避ける方針

- ストア上では、既存拡張の名前を直接出して比較しない
- タイトルと冒頭文で `PDF Saver` / `PDF 保存` を明示し、この拡張の主目的を先に伝える
- スクリーンショット内でも `INIAD Plus` と `PDF 保存` を大きく見せる
- 小プロモーション タイルとマーキー画像も同じコピーにそろえる
- README では、必要に応じて「PDF 保存できる INIAD MOOCs 向け Chrome 拡張」と説明する
- アイコン、スクリーンショット、紹介文のトーンを統一して、別プロジェクトとして認識しやすくする

## 単一目的の説明

Chrome Web Store の審査で求められる「single purpose」は次の説明で十分です。

`INIAD MOOCs 上の講義スライドを PDF として保存しやすくし、関連する学習補助機能を提供すること。`

## 権限とアクセス先の説明

### `permissions`

| 権限 | 用途 |
| --- | --- |
| `debugger` | 取り込み対象タブに対して Chrome 標準の印刷エンジン (`Page.printToPDF`) を呼び出すためだけに使用します。デバッガはジョブ完了直後に必ず detach します。 |
| `downloads` | 生成した PDF をユーザーのダウンロードフォルダへ保存するためだけに使用します。 |
| `storage` | ダウンロードキューや進行中ジョブの状態を `chrome.storage.local` に保持するためだけに使用します。外部送信はしません。 |

### `content_scripts.matches`

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
2. ページ内に表示される `スライドをPDFでダウンロード` ボタンを押す
3. 新しいタブで Google Slides が開き、自動で印刷用ページへ変換される
4. 拡張機能が `Page.printToPDF` を呼び出し、PDF を `Downloads/` 配下に自動保存する

## 提出前チェック

- `./scripts/package-webstore.sh` でクリーンな ZIP を作成する
- スクリーンショットは `store-assets/chrome-web-store-screenshot-640x400.png` を使う
- 小プロモーション タイルは `store-assets/chrome-web-store-small-promo-440x280.png` を使う
- マーキー画像は `store-assets/chrome-web-store-marquee-1400x560.png` を使う
- ストアアイコンは `img/iniadpp128.png` を使う
- 「データの販売」「広告」「トラッキング」はすべて `いいえ`
- 「個人情報の収集」は `なし`

## 今回の更新内容（v1.4.3）

`ストア掲載名と説明文を INIAD Plus に統一し、検索結果で用途が伝わりやすいタイトル・短い説明文・詳細説明文に更新しました。`
