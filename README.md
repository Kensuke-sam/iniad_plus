<div align="center">

<img src="img/iniadpp128.png" width="96" alt="INIAD++ icon">

# INIAD++ (PDF Download Fork)

**INIAD MOOCs の講義スライドを、ワンクリックで PDF 保存できるようにした Chrome 拡張**

[![GitHub](https://img.shields.io/badge/source-GitHub-181717?logo=github)](https://github.com/Kensuke-sam/iniad_plus)
[![Platform](https://img.shields.io/badge/platform-Chrome-4285F4?logo=googlechrome&logoColor=fff)](https://www.google.com/chrome/)
[![Manifest](https://img.shields.io/badge/manifest-v3-34A853)](manifest.json)

</div>

---

## これは何？

**[akahoshi1421/INIAD-](https://github.com/akahoshi1421/INIAD-) のフォーク**で、**スライドのダウンロードを HTML 出力から PDF 出力に差し替えた版**です。

- 拡張機能本体の全機能・背景・使い方は **[本家 README](https://github.com/akahoshi1421/INIAD-#readme)** を参照してください
- このリポジトリの README は **PDF 対応に関する差分** だけを扱います

---

## 本フォークの変更点

| | 本家 | 本フォーク |
| --- | --- | --- |
| スライドのダウンロード形式 | HTML | **PDF**（Chrome の印刷機能を利用） |
| レイアウト | 目次付き HTML | **A4 横 / 1 ページ 1 スライド** |
| 追加ライブラリ | なし | なし（Chrome ネイティブの印刷エンジンで出力） |
| その他の機能 | — | 本家と同一 |

---

## インストール（ローカル読み込み）

Chrome ウェブストアには公開していません。下記の手順でローカルに読み込んで使います。

### 1. 取得

```bash
git clone https://github.com/Kensuke-sam/iniad_plus.git
```

Git を使わない場合は、GitHub のリポジトリページで **Code ▾ → Download ZIP** を押し、任意の場所に解凍してください。

### 2. Chrome に読み込む

1. `chrome://extensions/` を開く
2. 右上の **デベロッパーモード** を ON
3. 左上の **「パッケージ化されていない拡張機能を読み込む」**
4. `manifest.json` がある階層のフォルダを選択

> フォルダを削除・移動すると動作しなくなります。そのまま残しておいてください。

---

## PDF 保存の使い方

1. INIAD MOOCs の講義ページを開く
2. **「スライドをPDFでダウンロードする」** ボタンをクリック
3. 新タブで確認ダイアログが出るので **OK**
4. スライドの取り込み完了後、**Chrome の印刷ダイアログが自動で開く**
5. 「送信先」を **「PDFに保存」** にして保存

自動で印刷ダイアログが開かない場合は、置き換わったページ上部の緑バーにある **「印刷ダイアログを開く」** ボタンを押してください。

> スライド枚数によっては取り込みに数秒〜数十秒かかります。完了までタブを閉じないでください。

---

## 更新 / アンインストール

**更新**
```bash
cd iniad_plus
git pull
```
その後 `chrome://extensions/` で INIAD++ カードの **再読み込み（⟳）** ボタンを押してください。

**アンインストール**
`chrome://extensions/` の INIAD++ カードから **「削除」** を押してください。

---

## うまく動かないとき

タブで `F12` → Console タブを開き、`[INIAD++ PDF]` で始まるログを確認してください。
本フォーク固有の不具合は [Issues](https://github.com/Kensuke-sam/iniad_plus/issues) に送ってください。拡張機能本体（PDF 以外の機能）の不具合は [本家リポジトリ](https://github.com/akahoshi1421/INIAD-) を参照してください。

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
