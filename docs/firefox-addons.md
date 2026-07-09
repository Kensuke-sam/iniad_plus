# Firefox Add-ons 提出メモ

INIAD Plus を Firefox Add-ons に提出するときに、そのまま転記しやすい情報をまとめたメモです。

## 基本情報

- 拡張機能名: `INIAD Plus - MOOCs PDF Helper`
- 短縮名: `INIAD Plus`
- 推奨カテゴリ: `教育` または `仕事効率化`
- サポート URL: `https://github.com/Kensuke-sam/iniad_plus`
- プライバシーポリシー/説明: [`docs/privacy.md`](privacy.md)

## ストアの短い説明文

`INIAD Plus は、INIAD MOOCs の講義スライドの学習用 PDF 作成、課題・出席確認、Drive 資料検索を補助する非公式 Firefox 拡張です。`

## 詳細説明文

```text
INIAD Plus は、INIAD MOOCs の講義ページで利用者が正当に閲覧できる Google スライド資料を、学習用 PDF として保存しやすくするための非公式 Firefox 拡張です。講義ページに PDF 作成ボタンを追加し、Firefox の印刷ダイアログから資料をローカルに保存できます。

主な機能:
- INIAD MOOCs の認可済み講義スライドを学習用 PDF として保存
- 講義内に複数資料がある場合の PDF 作成ページ生成
- 講義ページのタブを「出席 / 未提出 / 提出済み」に自動分類して強調表示する課題・出席まとめ
- コース一覧から Google Drive の検索ページを開く「ドライブで探す」ボタン
- メモ、大学ポータル (ACE) からの時間割 JSON 生成と MOOCs への取り込み、表示補助などの学習補助機能
- 設定やメモはブラウザ内の localStorage に保存（課題・出席まとめの分類結果ラベルは sessionStorage に一時保存）
- 作者のサーバーや外部サービスへのデータ送信なし

この拡張機能は、東洋大学および情報連携学部による公認・提供ではありません。主要な動作対象は moocs.iniad.org、docs.google.com/presentation/d/e/*、および時間割 JSON 生成のための www.ace.toyo.ac.jp/ct/home です。
```

## ローカル Chrome 版との差分

Chrome Web Store 提出版も権限なし・印刷ダイアログ保存の最小構成です。ここでの差分は、リポジトリのローカル Chrome フル機能版（optional で自動ダウンロードあり）との比較です。

- Firefox 版は自動 PDF ダウンロードではなく印刷ダイアログから保存します
- Firefox 用パッケージは拡張機能の `permissions` を要求しません（`debugger` / `downloads` / `storage` を含めません）
- Firefox 用 manifest では、AMO のデータ収集申告として `browser_specific_settings.gecko.data_collection_permissions.required: ["none"]` を指定します
- Firefox 用パッケージは `scripts/package-firefox.sh` で作成します

## 今回の更新内容（v1.4.7）

`掲載名を PDF Helper にそろえ、認可済み資料の学習用 PDF 作成補助であること、印刷ダイアログから保存すること、コース一覧に「ドライブで探す」ボタンを表示すること、未表示タブの動的な提出済み表示も確認することを明確にしました。`
