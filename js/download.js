/*
MIT License

Copyright (c) 2019-2020 Issei Terada

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

$(function(){
    if(window.location.href.indexOf("docs.google.com/presentation/d/e") != -1){
        let check = confirm("スライドをPDFでダウンロードしますか？\n次に開く印刷ダイアログで送信先を「PDFに保存」にしてください。");
        if(!check) return;

        let name_pdf;
        let click_cnt = 0;
        let is_break1 = 0;
        let image_done = 0;

        for(;;){
            let slide = $('.punch-viewer-svgpage-svgcontainer:last>svg').get(0);

            $(slide).find("image").each(function(i){
                let imgURL = $(this).attr("xlink:href");
                const imageNode = $(slide).find("image")[i];

                (async () => {
                    try {
                        const res = await fetch(imgURL);
                        const blob = await res.blob();
                        await new Promise(function(resolve){
                            const filereader = new FileReader();
                            filereader.onload = function(){
                                $(imageNode).attr({"xlink:href": this.result});
                                resolve();
                            };
                            filereader.onerror = function(){ resolve(); };
                            filereader.readAsDataURL(blob);
                        });
                    } catch(e){
                        console.warn("[INIAD++ PDF] 画像のbase64変換に失敗:", e);
                    } finally {
                        image_done++;
                    }
                })();
                is_break1++;
            });

            if($(".docs-material-menu-button-flat-default-caption").attr("aria-setsize") == $(".docs-material-menu-button-flat-default-caption").text()){
                break;
            }
            document.dispatchEvent(new KeyboardEvent("keydown", {keyCode: 39}));
            click_cnt++;
        }

        for(let i = 0; i < click_cnt; i++){
            document.dispatchEvent(new KeyboardEvent("keydown", {keyCode: 37}));
        }

        let front = 0;
        const id = setInterval(function(){
            console.log("[INIAD++ PDF] 画像変換待機中: total=" + is_break1 + ", done=" + image_done);
            if(is_break1 == front && image_done >= is_break1){
                clearInterval(id);
                console.log("[INIAD++ PDF] スライド収集を開始");

                let pageResult = "";
                let cnt = 1;
                for(;;){
                    const title = $(".punch-viewer-svgpage-a11yelement").attr('aria-label');
                    if(cnt == 1){
                        const titleArray = (title || "").split(":").slice(1);
                        const pageTitle = titleArray.join("");
                        name_pdf = pageTitle && pageTitle.trim() !== "" ? pageTitle : $("title").text();
                    }
                    const slide = $('.punch-viewer-svgpage-svgcontainer:last>svg').get(0);

                    pageResult += "<section class='slide-page'>";
                    if(slide){
                        pageResult += new XMLSerializer().serializeToString(slide);
                    } else {
                        console.warn("[INIAD++ PDF] slide SVGが見つからない (page " + cnt + ")");
                    }
                    pageResult += "</section>";

                    if($(".docs-material-menu-button-flat-default-caption").attr("aria-setsize") == $(".docs-material-menu-button-flat-default-caption").text()){
                        break;
                    }
                    document.dispatchEvent(new KeyboardEvent("keydown", {keyCode: 39}));
                    cnt++;
                }

                const safeName = ((name_pdf || "slides") + "").replace(/[\\/:*?"<>|]/g, "_");

                const style = [
                    "@page { size: A4 landscape; margin: 0; }",
                    "html, body { margin: 0; padding: 0; background: #fff; font-family: sans-serif; }",
                    ".slide-page {",
                    "  box-sizing: border-box;",
                    "  width: 100vw;",
                    "  height: 100vh;",
                    "  display: flex;",
                    "  align-items: center;",
                    "  justify-content: center;",
                    "  overflow: hidden;",
                    "  page-break-after: always;",
                    "  break-after: page;",
                    "}",
                    ".slide-page:last-child { page-break-after: auto; break-after: auto; }",
                    ".slide-page > svg {",
                    "  width: 100%;",
                    "  height: 100%;",
                    "  max-width: 100%;",
                    "  max-height: 100%;",
                    "}",
                    "@media screen {",
                    "  body { background: #eee; padding: 24px 0; }",
                    "  .slide-page { width: min(90vw, 1280px); aspect-ratio: 16/9; height: auto; background: #fff; margin: 16px auto; box-shadow: 0 2px 12px rgba(0,0,0,.2); }",
                    "  #iniadpp-hint { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: #28a745; color: #fff; padding: 12px 20px; border-radius: 6px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,.25); font-size: 14px; }",
                    "  #iniadpp-hint button { margin-left: 12px; padding: 6px 14px; background: #fff; color: #28a745; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }",
                    "}",
                    "@media print {",
                    "  #iniadpp-hint { display: none !important; }",
                    "}"
                ].join("\n");

                const hint = '<div id="iniadpp-hint">印刷ダイアログで送信先を<b>「PDFに保存」</b>にしてください。<button id="iniadpp-print-btn" type="button">印刷ダイアログを開く</button></div>';

                const result = "<!DOCTYPE html><html lang='ja'><head><meta charset='utf-8'><title>" + safeName + "</title><style>" + style + "</style></head><body>" + hint + pageResult + "</body></html>";

                try {
                    document.open();
                    document.write(result);
                    document.close();
                    document.title = safeName;
                    console.log("[INIAD++ PDF] 印刷用ページに置換しました。印刷ダイアログからPDF保存してください。");

                    const triggerPrint = function(){
                        try {
                            window.focus();
                            window.print();
                            console.log("[INIAD++ PDF] window.print() を呼び出しました");
                        } catch(err){
                            console.error("[INIAD++ PDF] window.print() 失敗:", err);
                        }
                    };

                    const btn = document.getElementById("iniadpp-print-btn");
                    if(btn){
                        btn.addEventListener("click", triggerPrint);
                    } else {
                        console.warn("[INIAD++ PDF] 印刷ボタンが見つかりません");
                    }

                    setTimeout(triggerPrint, 800);
                } catch(e){
                    console.error("[INIAD++ PDF] ページ置換に失敗:", e);
                    alert("PDF用ページの生成に失敗しました。コンソールを確認してください。");
                }
            }
            front = is_break1;
        }, 500);
    }
});
