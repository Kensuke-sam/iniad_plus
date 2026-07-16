$(function(){
    // manifest の matches には ace.toyo.ac.jp も含まれるため、PDF 作成 UI は MOOCs だけに出す
    if(window.location.hostname !== "moocs.iniad.org") return;

    const presentations = collectPresentationItems();
    if(!presentations.length) return;

    const $mountPoint = getMountPoint();
    if(!$mountPoint.length) return;

    const $container = $('<div id="slide_download_group" class="iniadpp-download-group"></div>');

    if(presentations.length === 1){
        $container.append(buildActionRow({
            label: "スライド",
            items: presentations,
            mainClass: "btn-success"
        }));
    } else {
        const $bulkRow = $('<div class="iniadpp-download-row"></div>');
        $bulkRow.append(createButton({
            text: "この講義のスライドを一括で学習用PDFにする",
            className: "btn-success",
            items: presentations
        }));
        $container.append($bulkRow);

        const $rows = $('<div class="iniadpp-download-rows"></div>');
        for(let i = 0; i < presentations.length; i++){
            $rows.append(buildActionRow({
                label: "資料" + (i + 1),
                items: [presentations[i]],
                mainClass: "btn-primary"
            }));
        }
        $container.append($rows);
    }

    $mountPoint.append($container);
});

function collectPresentationItems(){
    const items = [];
    const seen = new Set();
    const iframeSet = $("iframe");

    for(let i = 0; i < iframeSet.length; i++){
        const src = iframeSet[i].src;
        if(!src) continue;

        let normalized = "";
        try {
            // ページ由来の iframe src は部分文字列一致で信用せず、service worker と同じ基準で検証する
            const url = new URL(src, window.location.href);
            if(!isAllowedPresentationUrl(url)) continue;
            url.searchParams.delete("download");
            url.searchParams.delete("iniadpp_download");
            url.searchParams.delete("iniadpp_job");
            normalized = url.toString();
        } catch(err){
            continue;
        }

        if(seen.has(normalized)) continue;
        seen.add(normalized);
        items.push({ url: normalized });
    }

    return items;
}

function isAllowedPresentationUrl(url){
    return url.protocol === "https:"
        && url.hostname === "docs.google.com"
        && url.pathname.indexOf("/presentation/d/e/") === 0;
}

function getMountPoint(){
    if($(".pad-block").length){
        return $($(".pad-block")[0]);
    }
    if($(".content").length){
        return $($(".content")[0]);
    }
    return $("body");
}

function buildActionRow(opts){
    const $row = $('<div class="iniadpp-download-row"></div>');
    $row.append(createButton({
        text: opts.label + "を学習用PDFにする",
        className: opts.mainClass,
        items: opts.items
    }));
    return $row;
}

function createButton(options){
    const $button = $('<button type="button" class="iniadpp-download-button btn"></button>');
    $button.addClass(options.className);
    $button.html("<i class='fa fa-download'></i> <b>" + options.text + "</b>");
    $button.data("items", options.items);
    return $button;
}

$(document).on("click", ".iniadpp-download-button", async function(){
    const $button = $(this);
    const items = $button.data("items") || [];
    if(!items.length) return;

    $button.prop("disabled", true);
    try {
        const runtimeApi = getRuntimeApi();
        if(runtimeApi){
            try {
                const response = await runtimeApi.sendMessage({
                    type: "iniadpp:enqueue",
                    items: items
                });
                if(response && Array.isArray(response.unacceptedIndexes)){
                    const unacceptedItems = getUnacceptedEnqueueItems(items, response.unacceptedIndexes);
                    if(unacceptedItems.length){
                        openManualSavePages(unacceptedItems);
                    }
                    if(response.ok || unacceptedItems.length){
                        alert(buildManualSaveMessage(items.length));
                        return;
                    }
                }
                if(!response || !response.ok){
                    throw new Error(response && response.error ? response.error : "enqueue failed");
                }
                alert(response.manualSave
                    ? buildManualSaveMessage(items.length)
                    : buildEnqueueMessage(items.length));
                return;
            } catch(err){
                console.warn("[INIAD Plus PDF] background queue unavailable. Falling back to print-ready pages:", err);
            }
        }

        openManualSavePages(items);
        alert(buildManualSaveMessage(items.length));
    } catch(err){
        console.error("[INIAD Plus PDF] PDF処理開始失敗:", err);
        alert("PDF処理の開始に失敗しました。時間をおいてもう一度試してください。");
    } finally {
        $button.prop("disabled", false);
    }
});

function openManualSavePages(items){
    for(let i = 0; i < items.length; i++){
        const manualUrl = createManualDownloadUrl(items[i].url);
        if(!manualUrl) continue;
        window.open(manualUrl, "_blank", "noopener");
    }
}

function getUnacceptedEnqueueItems(items, indexes){
    const result = [];
    const seen = new Set();
    for(let i = 0; i < indexes.length; i++){
        const index = indexes[i];
        if(!Number.isInteger(index) || index < 0 || index >= items.length || seen.has(index)) continue;
        seen.add(index);
        result.push(items[index]);
    }
    return result;
}

function buildEnqueueMessage(count){
    return count === 1
        ? "学習用 PDF の作成を開始しました。完了まで少し待ってください。"
        : count + " 件の学習用 PDF 作成を順番に開始しました。完了まで少し待ってください。";
}

function buildManualSaveMessage(count){
    return count === 1
        ? "PDF 保存用ページを開きました。印刷ダイアログから PDF に保存してください。"
        : count + " 件の PDF 保存用ページを開きました。各タブの印刷ダイアログから PDF に保存してください。";
}

function createManualDownloadUrl(rawUrl){
    try {
        const url = new URL(rawUrl, window.location.href);
        if(!isAllowedPresentationUrl(url)) return "";
        url.searchParams.set("download", "true");
        return url.toString();
    } catch(err){
        return "";
    }
}

function getRuntimeApi(){
    if(typeof browser !== "undefined" && browser.runtime && browser.runtime.sendMessage && hasBackgroundRuntime(browser.runtime)){
        return browser.runtime;
    }
    if(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage && hasBackgroundRuntime(chrome.runtime)){
        return chrome.runtime;
    }
    return null;
}

function hasBackgroundRuntime(runtime){
    if(!runtime || !runtime.getManifest) return false;
    try {
        const manifest = runtime.getManifest();
        return !!(manifest && manifest.background);
    } catch(err){
        return false;
    }
}
