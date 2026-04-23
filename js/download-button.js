$(function(){
    const presentations = collectPresentationItems();
    if(!presentations.length) return;

    const $mountPoint = getMountPoint();
    if(!$mountPoint.length) return;

    const $container = $('<div id="slide_download_group" class="iniadpp-download-group"></div>');

    if(presentations.length === 1){
        $container.append(createButton({
            text: "スライドをPDFでダウンロードする",
            className: "btn-success",
            items: presentations
        }));
    } else {
        $container.append(createButton({
            text: "この講義のスライドを一括ダウンロードする",
            className: "btn-success",
            items: presentations
        }));

        const $subButtons = $('<div class="iniadpp-download-subbuttons"></div>');
        for(let i = 0; i < presentations.length; i++){
            $subButtons.append(createButton({
                text: "資料" + (i + 1) + "をPDFでダウンロード",
                className: "btn-primary",
                items: [presentations[i]]
            }));
        }
        $container.append($subButtons);
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
        if(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage){
            const response = await chrome.runtime.sendMessage({
                type: "iniadpp:enqueue",
                items: items
            });
            if(!response || !response.ok){
                throw new Error(response && response.error ? response.error : "enqueue failed");
            }
            const count = items.length;
            const message = count === 1
                ? "PDF の生成を開始しました。ダウンロード完了まで少し待ってください。"
                : count + " 件の PDF 生成を順番に開始しました。ダウンロード完了まで少し待ってください。";
            alert(message);
            return;
        }

        for(let i = 0; i < items.length; i++){
            window.open(createManualDownloadUrl(items[i].url), "_blank");
        }
    } catch(err){
        console.error("[INIADPLUS PDF] キュー登録失敗:", err);
        alert("PDF 生成の開始に失敗しました。時間をおいてもう一度試してください。");
    } finally {
        $button.prop("disabled", false);
    }
});

function createManualDownloadUrl(rawUrl){
    try {
        const url = new URL(rawUrl, window.location.href);
        url.searchParams.set("download", "true");
        return url.toString();
    } catch(err){
        return rawUrl;
    }
}
