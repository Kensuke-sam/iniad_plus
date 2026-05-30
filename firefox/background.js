const ALLOWED_URL_HOST = "docs.google.com";
const ALLOWED_URL_PATH_PREFIX = "/presentation/d/e/";

const extensionApi = typeof browser !== "undefined" ? browser : chrome;

extensionApi.runtime.onMessage.addListener(function(message){
    if(!message || !message.type) return undefined;

    if(message.type === "iniadpp:enqueue"){
        return handleEnqueue(message.items || []);
    }

    if(message.type === "iniadpp:pdf-ready"){
        return Promise.resolve({
            ok: false,
            error: "firefox-manual-save-required"
        });
    }

    if(message.type === "iniadpp:pdf-failed"){
        return Promise.resolve({ ok: true });
    }

    return undefined;
});

async function handleEnqueue(items){
    const normalizedItems = items
        .map(function(item){ return normalizeQueueItem(item); })
        .filter(Boolean);

    if(!normalizedItems.length){
        return { ok: false, error: "no-items" };
    }

    for(const item of normalizedItems){
        await extensionApi.tabs.create({
            url: buildDownloadUrl(item.url),
            active: true
        });
    }

    return {
        ok: true,
        queued: normalizedItems.length,
        manualSave: true
    };
}

function normalizeQueueItem(item){
    if(!item || !item.url) return null;
    if(!isAllowedUrl(item.url)) return null;
    return { url: item.url };
}

function isAllowedUrl(rawUrl){
    try {
        const url = new URL(rawUrl);
        if(url.protocol !== "https:") return false;
        if(url.hostname !== ALLOWED_URL_HOST) return false;
        if(url.pathname.indexOf(ALLOWED_URL_PATH_PREFIX) !== 0) return false;
        return true;
    } catch(err){
        return false;
    }
}

function buildDownloadUrl(rawUrl){
    const url = new URL(rawUrl);
    url.searchParams.set("download", "true");
    url.searchParams.set("iniadpp_download", "1");
    return url.toString();
}
