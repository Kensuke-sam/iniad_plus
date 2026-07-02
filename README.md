<div align="center">

<img src="img/iniadpp128.png" width="96" alt="INIAD Plus icon">

# INIAD Plus - MOOCs PDF Helper

**INIAD MOOCs の認可済み講義スライドを学習用 PDF として保存しやすくする Chrome / Firefox 拡張**

[![GitHub](https://img.shields.io/badge/source-GitHub-181717?logo=github)](https://github.com/Kensuke-sam/iniad_plus)
[![Platform](https://img.shields.io/badge/platform-Chrome%20%2F%20Firefox-4285F4?logo=firefoxbrowser&logoColor=fff)](https://www.mozilla.org/firefox/)
[![Manifest](https://img.shields.io/badge/manifest-v3-34A853)](manifest.json)

</div>

---

## これは何？

**INIAD Plus は、INIAD MOOCs の認可済み講義スライドを学習用 PDF として保存しやすくする非公式ブラウザー拡張**です。
**[akahoshi1421/INIAD-](https://github.com/akahoshi1421/INIAD-) のフォーク**で、**スライドのダウンロードを HTML 出力から PDF 出力に差し替えた版**です。

- 拡張機能本体の全機能・背景・使い方は **[本家 README](https://github.com/akahoshi1421/INIAD-#readme)** を参照してください
- このリポジトリの README は **PDF 対応に関する差分と、それを使うためのインストール手順** だけを扱います

## 名前について

このフォークの表示名は **INIAD Plus** です。検索やストア掲載では、既存の類似名と混同しないように **INIAD MOOCs の認可済み講義スライドを学習用 PDF として保存しやすくする拡張機能** として説明しています。

ストア掲載では **INIAD Plus - MOOCs PDF Helper** を正式名にし、`INIAD Plus`、`INIAD MOOCs`、`学習用 PDF` が自然に伝わる表記へ統一しています。

---

## 本フォークの変更点

| | 本家 | 本フォーク |
| --- | --- | --- |
| スライドの保存形式 | HTML | **PDF 印刷用ページ**（A4 横 / 1 ページ 1 スライド） |
| Chrome Web Store 提出版 | — | **権限なし / background なし / 印刷ダイアログ保存** |
| 追加ライブラリ | なし | なし |
| 課題・出席まとめ | — | **講義ページのタブを「出席 / 未提出 / 提出済み」に自動分類して強調表示** |
| その他の機能 | — | 本家と同一 |

---

## 動作環境

- Google Chrome（Manifest v3 対応のバージョン）
- macOS / Windows / Linux いずれも OK
- Chromium 系ブラウザ（Edge / Brave / Arc など）でも同じ手順で動きます

> Chrome Web Store 公開準備用の素材と提出メモは [`docs/chrome-web-store.md`](docs/chrome-web-store.md) にまとめています。

> Chrome Web Store 向け ZIP は、審査で見える機能と掲載説明を一致させるため、PDF 作成補助と課題・出席まとめに必要な最小ファイルだけを含めています。リポジトリには、フォーク元由来のローカル利用向け補助機能も残っています。

---

## インストール

### 1. ソースを取得する

**A. Git を使う場合（推奨）**

ターミナルを開き、好きな作業ディレクトリで以下を実行します。ここでは例としてホーム直下の `chrome-extensions` フォルダに置きます。

```bash
mkdir -p ~/chrome-extensions
cd ~/chrome-extensions
git clone https://github.com/Kensuke-sam/iniad_plus.git
```

これで `~/chrome-extensions/iniad_plus` が作成され、中に `manifest.json` が入ります。

**B. Git を使わない場合**

1. リポジトリのトップページ右上の **`<> Code ▾`** → **Download ZIP** をクリック
2. ダウンロードした ZIP を任意の場所に解凍
3. 解凍後、`iniad_plus-master`（または `iniad_plus`）というフォルダが出来ます。**このフォルダ自体を削除・移動しないでください**

### 2. Chrome に読み込む

1. Chrome のアドレスバーに `chrome://extensions/` と入力して Enter
2. ページ右上の **「デベロッパーモード」** のトグルを **ON** にする
3. ページ左上に現れる **「パッケージ化されていない拡張機能を読み込む」** をクリック
4. 先ほどの **`manifest.json` がある階層のフォルダ**（例: `~/chrome-extensions/iniad_plus`）を選択

拡張機能一覧に **INIAD Plus** が追加されれば完了です。

> ⚠️ 読み込み元のフォルダを削除・移動・リネームすると動かなくなります。そのままの場所に置いておいてください。

---

## 保存の使い方

1. INIAD MOOCs の講義ページ（スライドが埋め込まれているページ）を開く
2. ページに追加される **「スライドを学習用PDFにする」** ボタン、または複数資料の **「この講義のスライドを一括で学習用PDFにする」** / **「資料1を学習用PDFにする」** ボタンを押します
3. 拡張機能が講義内の Google Slides を順番に開き、PDF として印刷保存できるページを作成します
   - PDF は **A4 横 / 1 ページ 1 スライド** で、資料 1 件につき 1 ファイルとして保存

> ⏳ 1 ページずつ描画完了を確認しながら取り込むため、スライド枚数が多い講義だと **数秒〜数十秒** かかります。取り込み中はタブを閉じたり他の操作をしないでください。

---

## 更新

リポジトリをクローンして使っている場合:

```bash
cd ~/chrome-extensions/iniad_plus      # 自分がクローンしたパスに合わせてください
git pull
```

その後、`chrome://extensions/` の **INIAD Plus** カードで **再読み込み（⟳）** ボタンを押してください。

ZIP でインストールした場合は、最新版の ZIP を再ダウンロードしてフォルダを上書きし、同じく再読み込みしてください。

---

## Chrome Web Store 公開向けメモ

- ストア掲載文面、審査向け説明、単一目的の説明は [`docs/chrome-web-store.md`](docs/chrome-web-store.md)
- プライバシー説明は [`docs/privacy.md`](docs/privacy.md)
- 提出用 ZIP は `./scripts/package-webstore.sh` で作成。Chrome Web Store 向け ZIP には PDF 作成補助と課題・出席まとめに必要な最小ファイルだけを含め、拡張機能権限と background service worker は含めません
- スクリーンショット素材は `store-assets/` 配下

提出用 ZIP の生成:

```bash
./scripts/package-webstore.sh
```

実行すると `dist/iniad_plus-chrome-web-store-v<version>.zip` が作成されます。`debugs/`、background service worker、既存の配布用 ZIP など、審査に不要なファイルは含めません。

Firefox Add-ons 向けの ZIP は次のコマンドで作成できます。

```bash
./scripts/package-firefox.sh
```

実行すると `dist/iniad_plus-firefox-addons-v<version>.zip` が作成されます。Firefox 版も印刷ダイアログから PDF に保存します。

---

## アンインストール

`chrome://extensions/` の **INIAD Plus** カードの **「削除」** ボタンを押すだけです。

ローカルのフォルダは残っても Chrome 側からは消えます。フォルダも要らなければ手動で削除してください。

---

## うまく動かないとき

1. 講義ページで `F12`（Mac は `Cmd + Option + I`）で DevTools を開く
2. **Console** タブで `[INIAD Plus PDF]` で始まるログを確認
3. 赤字 (error) / 黄色 (warning) のログがあれば、それを [Issues](https://github.com/Kensuke-sam/iniad_plus/issues) に貼って報告してください

よくある原因:

| 症状 | 確認すること |
| --- | --- |
| ボタンが出ない | INIAD Plus が有効になっているか。講義ページを F5 でリロード |
| PDF が保存できない | 置き換わったページ上部の緑バーの「印刷ダイアログを開く」ボタンから PDF として保存 |
| 一部のスライドが空白になる | Console に `[INIAD Plus PDF]` のログを出し、どの page で止まったかを Issue で報告 |

拡張機能本体（PDF 以外の機能）の不具合は [本家リポジトリ](https://github.com/akahoshi1421/INIAD-) 側に送ってください。

---

## 注意

- 本ソフトウェアは、東洋大学および東洋大学情報連携学部が公認・公開・頒布するものではありません。
- 原作者および本フォークの作者は、本ソフトウェアの利用により生じたいかなる損害についても責任を負いません。
- スライドの複製は著作権法の範囲内で行ってください。処理はすべてユーザーのローカル環境で行われ、作者側のサーバーには一切送信されません。

---

## クレジット / ライセンス

- **原作**: [akahoshi1421/INIAD-](https://github.com/akahoshi1421/INIAD-)（作者: [@akahoshi1421](https://github.com/akahoshi1421)）
- **本フォーク**: [@Kensuke-sam](https://github.com/Kensuke-sam) による PDF 対応版
- **ライセンス**: 原作由来部分は原作のライセンス表記（自由 / 一部 MIT）を継承し、本フォークの追加変更は MIT License とします。詳細は [`LICENSE`](LICENSE) と [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) を参照してください。
