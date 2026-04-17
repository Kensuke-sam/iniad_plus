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

function svgToDataUrl(svgElement, scale){
    return new Promise(function(resolve, reject){
        const serialized = new XMLSerializer().serializeToString(svgElement);
        const viewBox = svgElement.viewBox && svgElement.viewBox.baseVal;
        const w = viewBox && viewBox.width ? viewBox.width : (svgElement.getBoundingClientRect().width || 960);
        const h = viewBox && viewBox.height ? viewBox.height : (svgElement.getBoundingClientRect().height || 540);

        const svgBlob = new Blob([serialized], {type: "image/svg+xml;charset=utf-8"});
        const url = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = function(){
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(w * scale));
            canvas.height = Math.max(1, Math.round(h * scale));
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            try {
                const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
                resolve({dataUrl: dataUrl, width: w, height: h});
            } catch(e){
                reject(e);
            }
        };
        img.onerror = function(e){
            URL.revokeObjectURL(url);
            reject(e);
        };
        img.src = url;
    });
}

$(function(){
    if(window.location.href.indexOf("docs.google.com/presentation/d/e") != -1){
        let check = confirm("スライドをPDFでダウンロードしますか？");
        if(check){
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
                            async function getImage(url){
                                const res = await fetch(url);
                                const blob = await res.blob()
                                return blob;
                            }

                            const imageData = await getImage(imgURL);

                            await new Promise(function(resolve){
                                let filereader = new FileReader();
                                filereader.onload = function(){
                                    $(imageNode).attr({
                                        "xlink:href": this.result
                                    });
                                    resolve();
                                };
                                filereader.onerror = function(){ resolve(); };
                                filereader.readAsDataURL(imageData);
                            });
                        } catch(e){
                            console.warn("画像のbase64変換に失敗:", e);
                        } finally {
                            image_done++;
                        }
                    })()
                    is_break1++;
                });

                if($(".docs-material-menu-button-flat-default-caption").attr("aria-setsize") == $(".docs-material-menu-button-flat-default-caption").text()){
                    break;
                }
                document.dispatchEvent(new KeyboardEvent("keydown",{
                    keyCode: 39
                }));
                click_cnt++;
            }

            for(let i = 0; i < click_cnt; i++){
                document.dispatchEvent(new KeyboardEvent("keydown",{
                    keyCode: 37
                }));
            }

            let front = 0;

            const originalTitle = document.title;
            let id = setInterval(async function(){
                console.log("[INIAD++ PDF] 待機中: images total=" + is_break1 + ", done=" + image_done);
                if(is_break1 == front && image_done >= is_break1){
                    clearInterval(id);
                    console.log("[INIAD++ PDF] 全画像の変換完了。PDF生成を開始");

                    if(!window.jspdf || !window.jspdf.jsPDF){
                        alert("jsPDFの読み込みに失敗しました。拡張機能を再読み込みしてください。");
                        return;
                    }
                    const { jsPDF } = window.jspdf;

                    let pdf = null;
                    let cnt = 1;
                    const scale = 2;
                    const totalPages = (parseInt($(".docs-material-menu-button-flat-default-caption").attr("aria-setsize"), 10) || 0);

                    for(;;){
                        let title = $(".punch-viewer-svgpage-a11yelement").attr('aria-label');
                        if(cnt == 1){
                            const titleArray = (title || "").split(":").slice(1);
                            const pageTitle = titleArray.join("");
                            name_pdf = pageTitle && pageTitle.trim() !== "" ? pageTitle : $("title").text();
                        }
                        document.title = "[PDF生成中 " + cnt + (totalPages ? "/" + totalPages : "") + "] " + originalTitle;
                        let slide = $('.punch-viewer-svgpage-svgcontainer:last>svg').get(0);

                        if(!slide){
                            console.warn("[INIAD++ PDF] slide SVGが見つからない (page " + cnt + ")");
                        } else {
                            try {
                                const rendered = await svgToDataUrl(slide, scale);
                                const w = rendered.width;
                                const h = rendered.height;
                                const orientation = w >= h ? "l" : "p";

                                if(pdf === null){
                                    pdf = new jsPDF({
                                        orientation: orientation,
                                        unit: "pt",
                                        format: [w, h]
                                    });
                                } else {
                                    pdf.addPage([w, h], orientation);
                                }
                                pdf.addImage(rendered.dataUrl, "JPEG", 0, 0, w, h, undefined, "FAST");
                                console.log("[INIAD++ PDF] ページ追加: " + cnt + " (" + w + "x" + h + ")");
                            } catch(e){
                                console.error("[INIAD++ PDF] スライドのレンダリングに失敗 (page " + cnt + "):", e);
                            }
                        }

                        if($(".docs-material-menu-button-flat-default-caption").attr("aria-setsize") == $(".docs-material-menu-button-flat-default-caption").text()){
                            break;
                        }
                        document.dispatchEvent(new KeyboardEvent("keydown",{
                            keyCode: 39
                        }));
                        cnt++;
                        await new Promise(function(r){ setTimeout(r, 350); });
                    }

                    document.title = originalTitle;

                    if(pdf){
                        const safeName = (name_pdf || "slides").replace(/[\\/:*?"<>|]/g, "_");
                        pdf.save(safeName + ".pdf");
                        console.log("[INIAD++ PDF] 保存完了: " + safeName + ".pdf");
                    } else {
                        alert("PDFの生成に失敗しました。");
                    }
                }
                front = is_break1;
            }, 500);

        }
    }
});
