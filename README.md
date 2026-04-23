<div align="center">

<img src="img/iniadpp128.png" width="96" alt="INIADPLUS icon">

# INIADPLUS (PDF Download Fork)

**INIAD MOOCs の講義スライドを、講義単位でまとめて PDF 保存できる Chrome 拡張**

[![GitHub](https://img.shields.io/badge/source-GitHub-181717?logo=github)](https://github.com/Kensuke-sam/iniad_plus)
[![Platform](https://img.shields.io/badge/platform-Chrome-4285F4?logo=googlechrome&logoColor=fff)](https://www.google.com/chrome/)
[![Manifest](https://img.shields.io/badge/manifest-v3-34A853)](manifest.json)

</div>

---

## これは何？

**[akahoshi1421/INIAD-](https://github.com/akahoshi1421/INIAD-) のフォーク**で、**スライドのダウンロードを HTML 出力から PDF 出力に差し替えた版**です。

- 拡張機能本体の全機能・背景・使い方は **[本家 README](https://github.com/akahoshi1421/INIAD-#readme)** を参照してください
- このリポジトリの README は **PDF 対応に関する差分と、それを使うためのインストール手順** だけを扱います

---

## 本フォークの変更点

| | 本家 | 本フォーク |
| --- | --- | --- |
| スライドのダウンロード形式 | HTML | **PDF**（拡張機能が自動保存） |
| レイアウト | 目次付き HTML | **A4 横 / 1 ページ 1 スライド** |
| 追加ライブラリ | なし | なし（Chrome ネイティブの印刷エンジンで出力） |
| その他の機能 | — | 本家と同一 |

---

## 動作環境

- Google Chrome（Manifest v3 対応のバージョン）
- macOS / Windows / Linux いずれも OK
- Chromium 系ブラウザ（Edge / Brave / Arc など）でも同じ手順で動きます

> Chrome Web Store 公開準備用の素材と提出メモは [`docs/chrome-web-store.md`](docs/chrome-web-store.md) にまとめています。

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

拡張機能一覧に **INIADPLUS** が追加されれば完了です。

> ⚠️ 読み込み元のフォルダを削除・移動・リネームすると動かなくなります。そのままの場所に置いておいてください。

---

## PDF 保存の使い方

1. INIAD MOOCs の講義ページ（スライドが埋め込まれているページ）を開く
2. スライドが 1 つだけなら **「スライドをPDFでダウンロードする」**、複数ある講義なら **「この講義のスライドを一括ダウンロードする」** をクリック
3. 拡張機能が講義内の Google Slides を順番に開き、PDF を自動でダウンロードします

講義内の一部資料だけ欲しい場合は、表示される **「資料1をPDFでダウンロード」** などの個別ボタンも使えます。

> ⏳ 1 ページずつ描画完了を確認しながら取り込むため、スライド枚数が多い講義だと **数秒〜数十秒** かかります。取り込み中はタブを閉じたり他の操作をしないでください。

---

## 更新

リポジトリをクローンして使っている場合:

```bash
cd ~/chrome-extensions/iniad_plus      # 自分がクローンしたパスに合わせてください
git pull
```

その後、`chrome://extensions/` の **INIADPLUS** カードで **再読み込み（⟳）** ボタンを押してください。

ZIP でインストールした場合は、最新版の ZIP を再ダウンロードしてフォルダを上書きし、同じく再読み込みしてください。

---

## Chrome Web Store 公開向けメモ

- ストア掲載文面、審査向け説明、単一目的の説明は [`docs/chrome-web-store.md`](docs/chrome-web-store.md)
- プライバシー説明は [`docs/privacy.md`](docs/privacy.md)
- 提出用 ZIP は `./scripts/package-webstore.sh` で作成
- スクリーンショット素材は `store-assets/` 配下

提出用 ZIP の生成:

```bash
./scripts/package-webstore.sh
```

実行すると `dist/iniad_plus-chrome-web-store-v<version>.zip` が作成されます。`debugs/` や既存の配布用 ZIP など、審査に不要なファイルは含めません。

---

## アンインストール

`chrome://extensions/` の **INIADPLUS** カードの **「削除」** ボタンを押すだけです。

ローカルのフォルダは残っても Chrome 側からは消えます。フォルダも要らなければ手動で削除してください。

---

## うまく動かないとき

1. 講義ページで `F12`（Mac は `Cmd + Option + I`）で DevTools を開く
2. **Console** タブで `[INIADPLUS PDF]` で始まるログを確認
3. 赤字 (error) / 黄色 (warning) のログがあれば、それを [Issues](https://github.com/Kensuke-sam/iniad_plus/issues) に貼って報告してください

よくある原因:

| 症状 | 確認すること |
| --- | --- |
| ボタンが出ない | INIADPLUS が有効になっているか。講義ページを F5 でリロード |
| PDF が自動保存されない | 置き換わったページ上部の緑バーの「印刷ダイアログを開く」ボタンから手動保存 |
| 一部のスライドが空白になる | Console に `[INIADPLUS PDF]` のログを出し、どの page で止まったかを Issue で報告 |

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
- **ライセンス**: 原作のライセンス（自由 / 一部 MIT）を継承。詳細は原作の [README](https://github.com/akahoshi1421/INIAD-#readme) を参照してください。
