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
    if(window.location.href.indexOf("docs.google.com/presentation/d/e") == -1) return;
    if(!shouldRunPdfExport()) return;

    runPdfExport().catch(function(err){
        console.error("[INIADPLUS PDF] エラー:", err);
        notifyFailure(err);
    });
});

function shouldRunPdfExport(){
    try {
        const url = new URL(window.location.href);
        return url.searchParams.get("download") === "true"
            || url.searchParams.get("iniadpp_download") === "1";
    } catch(err){
        return window.location.href.indexOf("download=true") !== -1;
    }
}

async function runPdfExport(){
    const sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };

    const waitFor = async function(check, opts){
        opts = opts || {};
        const timeout = opts.timeout || 15000;
        const interval = opts.interval || 80;
        const start = Date.now();
        for(;;){
            try {
                if(check()) return;
            } catch(e){}
            if(Date.now() - start > timeout){
                throw new Error(opts.message || "状態待機がタイムアウトしました");
            }
            await sleep(interval);
        }
    };

    const getCaption = function(){ return $(".docs-material-menu-button-flat-default-caption"); };
    const getTotalPages = function(){
        const v = parseInt(getCaption().attr("aria-setsize"), 10);
        return isNaN(v) ? null : v;
    };
    const getCurrentPage = function(){
        const v = parseInt(getCaption().text(), 10);
        return isNaN(v) ? null : v;
    };

    await waitFor(function(){
        return getCaption().length > 0 && getTotalPages() !== null;
    }, {timeout: 20000, message: "総ページ数の取得がタイムアウトしました"});

    const totalPages = getTotalPages();
    console.log("[INIADPLUS PDF] 総ページ数: " + totalPages);

    let safety = 0;
    while(getCurrentPage() !== 1 && safety < 1000){
        document.dispatchEvent(new KeyboardEvent("keydown", {keyCode: 37}));
        await sleep(25);
        safety++;
    }
    await waitFor(function(){ return getCurrentPage() === 1; },
        {timeout: 8000, message: "最初のページへの移動がタイムアウトしました"});

    const pages = [];
    let pageTitle = "";
    let prevSvgSnapshot = null;

    for(let i = 1; i <= totalPages; i++){
        await waitFor(function(){
            if(getCurrentPage() !== i) return false;
            const s = $('.punch-viewer-svgpage-svgcontainer:last>svg').get(0);
            if(!s) return false;
            if(!s.children || s.children.length === 0) return false;
            if(i > 1){
                const snap = s.childElementCount + ":" + (s.getAttribute("viewBox") || "") + ":" + s.innerHTML.length;
                if(snap === prevSvgSnapshot) return false;
            }
            return true;
        }, {timeout: 20000, message: "page " + i + " のスライド描画待機がタイムアウトしました"});

        await sleep(150);

        const svg = $('.punch-viewer-svgpage-svgcontainer:last>svg').get(0);

        if(i === 1){
            const title = $(".punch-viewer-svgpage-a11yelement").attr('aria-label');
            const titleArray = (title || "").split(":").slice(1);
            const pt = titleArray.join("");
            pageTitle = (pt && pt.trim() !== "") ? pt : $("title").text();
        }

        const imageNodes = $(svg).find("image").toArray();
        await Promise.all(imageNodes.map(async function(imgNode){
            const href = $(imgNode).attr("xlink:href") || $(imgNode).attr("href");
            if(!href || href.indexOf("data:") === 0) return;

            let url;
            try { url = new URL(href, window.location.href); } catch(e){ return; }
            if(url.protocol !== "https:") return;
            const host = url.hostname;
            const allowed = host === "docs.google.com"
                || host.endsWith(".googleusercontent.com")
                || host.endsWith(".gstatic.com");
            if(!allowed) return;

            try {
                const res = await fetch(url.toString(), { credentials: "include" });
                if(!res.ok) return;
                const contentType = res.headers.get("Content-Type") || "";
                if(!/^image\//i.test(contentType)) return;
                const blob = await res.blob();
                const dataUrl = await new Promise(function(resolve, reject){
                    const fr = new FileReader();
                    fr.onload = function(){ resolve(fr.result); };
                    fr.onerror = function(){ reject(new Error("FileReader failure")); };
                    fr.readAsDataURL(blob);
                });
                $(imgNode).attr("xlink:href", dataUrl);
            } catch(e){
                console.warn("[INIADPLUS PDF] page " + i + " 画像のbase64化に失敗:", e);
            }
        }));

        prevSvgSnapshot = svg.childElementCount + ":" + (svg.getAttribute("viewBox") || "") + ":" + svg.innerHTML.length;
        pages.push(new XMLSerializer().serializeToString(svg));

        if(i < totalPages){
            document.dispatchEvent(new KeyboardEvent("keydown", {keyCode: 39}));
        }
    }

    console.log("[INIADPLUS PDF] 全 " + pages.length + " ページの収集が完了");

    let pageResult = "";
    for(const pageSvg of pages){
        pageResult += "<section class='slide-page'>" + pageSvg + "</section>";
    }

    const safeName = ((pageTitle || "slides") + "").replace(/[\\/:*?"<>|]/g, "_");

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

    const hint = '<div id="iniadpp-hint"><span id="iniadpp-hint-text">PDF を生成しています。完了まで少し待ってください。</span><button id="iniadpp-print-btn" type="button">印刷ダイアログを開く</button></div>';

    const result = "<!DOCTYPE html><html lang='ja'><head><meta charset='utf-8'><title>" + safeName + "</title><style>" + style + "</style></head><body>" + hint + pageResult + "</body></html>";

    document.open();
    document.write(result);
    document.close();
    document.title = safeName;
    console.log("[INIADPLUS PDF] 印刷用ページに置換しました");

    const triggerPrint = function(){
        try {
            window.focus();
            window.print();
        } catch(err){
            console.error("[INIADPLUS PDF] window.print() 失敗:", err);
        }
    };

    const btn = document.getElementById("iniadpp-print-btn");
    if(btn){
        btn.addEventListener("click", triggerPrint);
    }

    await sleep(250);
    const autoSaved = await requestPdfDownload(safeName + ".pdf");
    if(autoSaved){
        updateHint("PDF をダウンロードしています。このタブは自動で閉じます。");
        return;
    }

    updateHint("自動保存に失敗しました。印刷ダイアログから PDF に保存してください。");
    setTimeout(triggerPrint, 800);
}

async function requestPdfDownload(filename){
    if(typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage){
        return false;
    }

    try {
        const response = await chrome.runtime.sendMessage({
            type: "iniadpp:pdf-ready",
            filename: filename
        });
        return !!(response && response.ok);
    } catch(err){
        console.error("[INIADPLUS PDF] 自動保存要求失敗:", err);
        return false;
    }
}

function updateHint(message){
    const el = document.getElementById("iniadpp-hint-text");
    if(el){
        el.textContent = message;
    }
}

function notifyFailure(err){
    const message = "PDF生成中にエラーが発生しました:\n" + (err && err.message ? err.message : err);
    updateHint("自動保存に失敗しました。印刷ダイアログから PDF に保存してください。");

    if(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage){
        chrome.runtime.sendMessage({
            type: "iniadpp:pdf-failed",
            message: message
        }).catch(function(sendErr){
            console.error("[INIADPLUS PDF] エラー通知失敗:", sendErr);
        });
    }

    alert(message);
}
