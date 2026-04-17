<div align="center">

<img src="img/iniadpp128.png" width="96" alt="INIAD++ icon">

# INIAD++ (PDF Download Fork)

**INIAD MOOCs の講義スライドを、ワンクリックで PDF 保存できる Chrome 拡張機能**

[![GitHub](https://img.shields.io/badge/source-GitHub-181717?logo=github)](https://github.com/Kensuke-sam/iniad_plus)
[![Platform](https://img.shields.io/badge/platform-Chrome-4285F4?logo=googlechrome&logoColor=fff)](https://www.google.com/chrome/)
[![Manifest](https://img.shields.io/badge/manifest-v3-34A853)](manifest.json)
[![License](https://img.shields.io/badge/license-Free%20%2F%20MIT-blue)](#ライセンス)

</div>

---

東洋大学情報連携学部 (INIAD) のオンライン授業プラットフォーム [INIAD MOOCs](https://moocs.iniad.org/) に機能を追加する Chrome 拡張のフォークです。
**「スライドのダウンロード」を HTML 出力から PDF 出力に差し替え**、Chrome 標準の「PDF に保存」で高品質な PDF を手に入れられるようにしました。

本リポジトリは [akahoshi1421/INIAD-](https://github.com/akahoshi1421/INIAD-) のフォークです。原作の全機能をそのまま継承しています。

![説明](img/discription.PNG)

---

## ハイライト

- **ワンクリックで PDF 保存** — スライド表示ページから 1 クリックで印刷ダイアログが開く
- **高品質** — Chrome ネイティブの印刷エンジンでレンダリング（A4 横 / 1 ページ 1 スライド）
- **外部依存なし** — クラウド送信・ログイン追加なし。処理はすべてローカルで完結
- **軽量** — 追加ライブラリなし。Manifest v3 対応
- **原作の機能はそのまま** — メモ・時間割ダウンロード・コース並び替え等も使える

---

## インストール（所要 1 分）

### Step 1. リポジトリを取得

```bash
git clone https://github.com/Kensuke-sam/iniad_plus.git
cd iniad_plus
git checkout feat/pdf-download
```

Git を使わない場合は、GitHub の **ブランチ切替 → `feat/pdf-download`** → **Code ▾ → Download ZIP** で任意の場所に解凍してください。

### Step 2. Chrome に読み込む

1. アドレスバーに `chrome://extensions/` を入力
2. 右上の **デベロッパーモード** を ON
3. 左上の **「パッケージ化されていない拡張機能を読み込む」**
4. `manifest.json` がある階層のフォルダを選択

以上で、拡張機能リストに **INIAD++** が追加されます。

> フォルダを削除・移動すると動作しなくなります。そのまま残しておいてください。

---

## 使い方

1. **INIAD MOOCs** の講義ページを開く
2. スライド下部に現れる **「スライドをPDFでダウンロードする」** をクリック
3. 新タブでスライド公開ビューが開き、確認ダイアログ → **OK**
4. 全スライドの取り込みが終わると、**Chrome の印刷ダイアログが自動で開く**
5. 「送信先」を **「PDFに保存」** に設定 → **保存**

自動で印刷ダイアログが開かない場合は、置き換わったページ上部の緑バーの **「印刷ダイアログを開く」** ボタンを押してください。

> スライド枚数によっては取り込みに数秒〜数十秒かかります。完了までタブを閉じないでください。

---

## よくある質問

<details>
<summary><b>印刷ダイアログが開きません</b></summary>

ページ上部の緑色バーに **「印刷ダイアログを開く」** ボタンがあります。それを押してください。
それでも開かない場合は `F12` → Console タブを確認し、`[INIAD++ PDF]` で始まるログをお知らせください。
</details>

<details>
<summary><b>Chrome ウェブストアからもインストールできますか？</b></summary>

本フォークはウェブストアには公開していません。必ず本 README の手順でローカル読み込みしてください。
</details>

<details>
<summary><b>PDF のレイアウトは変えられますか？</b></summary>

デフォルトは <b>A4 横 / 1 ページ 1 スライド</b> です。印刷ダイアログで用紙サイズ・向き・余白を変更すれば反映されます。
</details>

<details>
<summary><b>画像付きスライドが真っ白になります</b></summary>

画像の取り込みに失敗している可能性があります。タブの DevTools Console を開き、`[INIAD++ PDF] 画像のbase64変換に失敗` というログがないか確認してください。ネットワーク状態の良い環境で再試行すると改善する場合があります。
</details>

---

## 更新 / アンインストール

**更新**
```bash
cd iniad_plus
git pull
```
その後、`chrome://extensions/` の INIAD++ カードで **再読み込み（⟳）** を押すと反映されます。

**アンインストール**
`chrome://extensions/` の INIAD++ カードから **「削除」** を押してください。

---

## 機能一覧

- 講義スライドの **PDF ダウンロード**（本フォークの追加機能）
- 直近の講義のお知らせ
- ace から時間割のダウンロード
- トップページに表示されるコース一覧の自由な入れ替え
- 1 ページごとにメモ機能（複数可）
- メモのダウンロード
- メモを保存したページ一覧の表示
- 外部リンク一覧
- ドライブを開くボタン
- 背景色の変更
- ヘッダー・サイドバーの追従
- ページ上部に戻るボタン
- 入力文字カウント
- スライド位置・大きさの操作

---

## オリジナル版との違い

| 項目 | オリジナル版 | 本フォーク |
| --- | --- | --- |
| スライド出力形式 | HTML | **PDF**（Chrome の印刷機能を利用） |
| その他の機能 | （同じ） | （同じ） |

オリジナル作者: [akahoshi1421](https://github.com/akahoshi1421) / [akahoshi1421/INIAD-](https://github.com/akahoshi1421/INIAD-)

---

## 注意事項

- 本ソフトウェアは、東洋大学および東洋大学情報連携学部が公認・公開・頒布するものではありません。
- 原作者および本フォークの作者は、本ソフトウェアの利用により生じたいかなる損害についても責任を負いません。
- スライドの複製は著作権法の範囲内で行ってください。二次配布など私的利用の範囲を超える利用は法律違反となる場合があります。処理はすべてユーザーのローカル環境で行われ、作者側のサーバーには一切送信されません。

---

## ライセンス

原作のライセンスを継承し、**自由** とします。一部コード（[js/download.js](js/download.js) や [lib/](lib/) 内の jQuery など）には MIT ライセンスが付随していますので、再配布時はそちらもご確認ください。

---

<div align="center">
<sub>Maintained by <a href="https://github.com/Kensuke-sam">@Kensuke-sam</a> — forked from <a href="https://github.com/akahoshi1421/INIAD-">akahoshi1421/INIAD-</a></sub>
</div>
