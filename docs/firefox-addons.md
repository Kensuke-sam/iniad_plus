# Firefox Add-ons 提出メモ

INIAD Plus を Firefox Add-ons に提出するときに、そのまま転記しやすい情報をまとめたメモです。

## 基本情報

- 拡張機能名: `INIAD Plus - MOOCs PDF Saver`
- 短縮名: `INIAD Plus`
- 推奨カテゴリ: `教育` または `仕事効率化`
- サポート URL: `https://github.com/Kensuke-sam/iniad_plus`
- プライバシーポリシー/説明: [`docs/privacy.md`](privacy.md)

## ストアの短い説明文

`INIAD Plus は、INIAD MOOCs の講義スライドを PDF 保存しやすくする非公式 Firefox 拡張です。`

## 詳細説明文

```text
INIAD Plus は、INIAD MOOCs の講義ページで配信されている Google スライド資料を PDF として保存しやすくするための非公式 Firefox 拡張です。講義ページに PDF 保存ボタンを追加し、Firefox の印刷ダイアログから資料をローカルに保存できます。

主な機能:
- INIAD MOOCs の講義スライドを PDF で保存
- 講義内に複数資料がある場合の PDF 保存ページ作成
- メモ、時間割 JSON の取り込み、表示補助などの学習補助機能
- 設定やメモはブラウザ内の localStorage に保存
- 作者のサーバーや外部サービスへのデータ送信なし

この拡張機能は、東洋大学および情報連携学部による公認・提供ではありません。主要な動作対象は moocs.iniad.org と docs.google.com/presentation/d/e/* です。
```

## Chrome 版との差分

- Firefox では Chrome の `debugger` API が実装されていないため、自動 PDF ダウンロードではなく印刷ダイアログから保存します
- Firefox 用パッケージでは `debugger` 権限を要求しません
- Firefox 用 manifest では、AMO のデータ収集申告として `browser_specific_settings.gecko.data_collection_permissions.required: ["none"]` を指定します
- Firefox 用パッケージは `scripts/package-firefox.sh` で作成します

## 今回の更新内容（v1.4.3）

`ストア掲載名と説明文を INIAD Plus に統一し、Firefox 向け manifest と配布用 ZIP 作成スクリプトを追加しました。`
