$(function(){
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
            text: "この講義のスライドを一括PDFダウンロード",
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
        if(!src || src.indexOf("docs.google.com/presentation/d/e/") === -1) continue;

        let normalized = "";
        try {
            const url = new URL(src, window.location.href);
            url.searchParams.delete("download");
            url.searchParams.delete("iniadpp_download");
            url.searchParams.delete("iniadpp_job");
            normalized = url.toString();
        } catch(err){
            normalized = src;
        }

        if(seen.has(normalized)) continue;
        seen.add(normalized);
        items.push({ url: normalized });
    }

    return items;
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
        text: opts.label + "をPDFでダウンロード",
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
            const response = await runtimeApi.sendMessage({
                type: "iniadpp:enqueue",
                items: items
            });
            if(!response || !response.ok){
                throw new Error(response && response.error ? response.error : "enqueue failed");
            }
            alert(response.manualSave
                ? buildManualSaveMessage(items.length)
                : buildEnqueueMessage(items.length));
            return;
        }

        for(let i = 0; i < items.length; i++){
            window.open(createManualDownloadUrl(items[i].url), "_blank");
        }
    } catch(err){
        console.error("[INIAD Plus PDF] キュー登録失敗:", err);
        alert("PDF処理の開始に失敗しました。時間をおいてもう一度試してください。");
    } finally {
        $button.prop("disabled", false);
    }
});

function buildEnqueueMessage(count){
    return count === 1
        ? "PDF の生成を開始しました。ダウンロード完了まで少し待ってください。"
        : count + " 件の PDF 生成を順番に開始しました。ダウンロード完了まで少し待ってください。";
}

function buildManualSaveMessage(count){
    return count === 1
        ? "PDF 保存用ページを開きました。印刷ダイアログから PDF に保存してください。"
        : count + " 件の PDF 保存用ページを開きました。各タブの印刷ダイアログから PDF に保存してください。";
}

function createManualDownloadUrl(rawUrl){
    try {
        const url = new URL(rawUrl, window.location.href);
        url.searchParams.set("download", "true");
        return url.toString();
    } catch(err){
        return rawUrl;
    }
}

function getRuntimeApi(){
    if(typeof browser !== "undefined" && browser.runtime && browser.runtime.sendMessage){
        return browser.runtime;
    }
    if(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage){
        return chrome.runtime;
    }
    return null;
}
