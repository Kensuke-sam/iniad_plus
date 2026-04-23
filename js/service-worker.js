const STORAGE_KEYS = {
    queue: "iniadpp_pdf_queue",
    active: "iniadpp_pdf_active"
};

chrome.runtime.onInstalled.addListener(function(){
    recoverState().catch(function(err){
        console.error("[INIADPLUS PDF] 初期化失敗:", err);
    });
});

chrome.runtime.onStartup.addListener(function(){
    recoverState().catch(function(err){
        console.error("[INIADPLUS PDF] 復旧失敗:", err);
    });
});

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse){
    if(!message || !message.type) return;

    if(message.type === "iniadpp:enqueue"){
        handleEnqueue(message.items || [])
            .then(function(result){ sendResponse(result); })
            .catch(function(err){
                console.error("[INIADPLUS PDF] enqueue失敗:", err);
                sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
            });
        return true;
    }

    if(message.type === "iniadpp:pdf-ready"){
        handlePdfReady(sender.tab, message)
            .then(function(result){ sendResponse(result); })
            .catch(function(err){
                console.error("[INIADPLUS PDF] pdf-ready失敗:", err);
                sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
            });
        return true;
    }

    if(message.type === "iniadpp:pdf-failed"){
        handlePdfFailed(sender.tab, message)
            .then(function(result){ sendResponse(result); })
            .catch(function(err){
                console.error("[INIADPLUS PDF] pdf-failed失敗:", err);
                sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
            });
        return true;
    }
});

chrome.tabs.onRemoved.addListener(function(tabId){
    handleTabRemoved(tabId).catch(function(err){
        console.error("[INIADPLUS PDF] タブ削除処理失敗:", err);
    });
});

chrome.debugger.onDetach.addListener(function(source, reason){
    handleDebuggerDetach(source, reason).catch(function(err){
        console.error("[INIADPLUS PDF] debugger detach処理失敗:", err);
    });
});

async function handleEnqueue(items){
    const normalizedItems = items
        .map(function(item){ return normalizeQueueItem(item); })
        .filter(Boolean);

    if(!normalizedItems.length){
        return { ok: false, error: "no-items" };
    }

    const state = await getState();
    state.queue = state.queue.concat(normalizedItems);
    await setState(state);
    await processQueue();

    return { ok: true, queued: normalizedItems.length };
}

async function handlePdfReady(tab, message){
    if(!tab || typeof tab.id !== "number"){
        return { ok: false, error: "missing-tab" };
    }

    const state = await getState();
    if(!state.active || state.active.tabId !== tab.id){
        return { ok: false, error: "inactive-tab" };
    }

    const filename = sanitizeFilename(message.filename || state.active.filenameHint || "slides.pdf");

    try {
        await saveTabAsPdf(tab.id, filename);
        await cleanupActiveJob(tab.id, true);
        await processQueue();
        return { ok: true, filename: filename };
    } catch(err){
        console.error("[INIADPLUS PDF] PDF保存失敗:", err);
        await focusTab(tab.id);
        await cleanupActiveJob(tab.id, false);
        await processQueue();
        return { ok: false, error: err && err.message ? err.message : String(err) };
    }
}

async function handlePdfFailed(tab, message){
    const state = await getState();
    if(tab && state.active && state.active.tabId === tab.id){
        console.error("[INIADPLUS PDF] PDF生成失敗:", message && message.message ? message.message : "unknown error");
        await focusTab(tab.id);
        await cleanupActiveJob(tab.id, false);
        await processQueue();
    }
    return { ok: true };
}

async function handleTabRemoved(tabId){
    const state = await getState();
    if(!state.active || state.active.tabId !== tabId) return;
    await clearActive();
    await processQueue();
}

async function handleDebuggerDetach(source, reason){
    if(!source || typeof source.tabId !== "number") return;

    const state = await getState();
    if(!state.active || state.active.tabId !== source.tabId) return;
    if(reason === "target_closed") return;

    await cleanupActiveJob(source.tabId, false);
    await processQueue();
}

async function processQueue(){
    const state = await getState();
    if(state.active || !state.queue.length) return;

    const nextJob = state.queue.shift();
    const tab = await chrome.tabs.create({
        url: buildDownloadUrl(nextJob.url, nextJob.jobId),
        active: false
    });

    state.active = {
        jobId: nextJob.jobId,
        url: nextJob.url,
        filenameHint: nextJob.filenameHint,
        tabId: tab.id
    };

    await setState(state);
}

async function recoverState(){
    const state = await getState();
    if(!state.active) return;

    try {
        await chrome.tabs.get(state.active.tabId);
    } catch(err){
        await clearActive();
        await processQueue();
    }
}

async function saveTabAsPdf(tabId, filename){
    const debuggee = { tabId: tabId };
    let attached = false;

    try {
        await chrome.debugger.attach(debuggee, "1.3");
        attached = true;

        const result = await chrome.debugger.sendCommand(debuggee, "Page.printToPDF", {
            landscape: true,
            printBackground: true,
            paperWidth: 11.69,
            paperHeight: 8.27,
            marginTop: 0,
            marginBottom: 0,
            marginLeft: 0,
            marginRight: 0,
            preferCSSPageSize: true
        });

        if(!result || !result.data){
            throw new Error("PDF データを取得できませんでした");
        }

        await chrome.downloads.download({
            url: "data:application/pdf;base64," + result.data,
            filename: filename,
            saveAs: false,
            conflictAction: "uniquify"
        });
    } finally {
        if(attached){
            try {
                await chrome.debugger.detach(debuggee);
            } catch(err){
                console.warn("[INIADPLUS PDF] debugger detach失敗:", err);
            }
        }
    }
}

async function cleanupActiveJob(tabId, shouldCloseTab){
    if(shouldCloseTab){
        try {
            await chrome.tabs.remove(tabId);
        } catch(err){
            console.warn("[INIADPLUS PDF] タブ close 失敗:", err);
        }
    }
    await clearActive();
}

async function focusTab(tabId){
    try {
        const tab = await chrome.tabs.get(tabId);
        if(tab.windowId){
            await chrome.windows.update(tab.windowId, { focused: true });
        }
        await chrome.tabs.update(tabId, { active: true });
    } catch(err){
        console.warn("[INIADPLUS PDF] タブ focus 失敗:", err);
    }
}

function normalizeQueueItem(item){
    if(!item || !item.url) return null;

    return {
        jobId: createJobId(),
        url: item.url,
        filenameHint: sanitizeFilename(item.filenameHint || "slides.pdf")
    };
}

function buildDownloadUrl(rawUrl, jobId){
    const url = new URL(rawUrl);
    url.searchParams.set("download", "true");
    url.searchParams.set("iniadpp_download", "1");
    url.searchParams.set("iniadpp_job", jobId);
    return url.toString();
}

function sanitizeFilename(filename){
    let result = String(filename || "slides.pdf").replace(/[\\/:*?"<>|]/g, "_").trim();
    if(!result){
        result = "slides.pdf";
    }
    if(result.toLowerCase().slice(-4) !== ".pdf"){
        result += ".pdf";
    }
    return result;
}

function createJobId(){
    return "job-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

async function getState(){
    const stored = await chrome.storage.local.get([STORAGE_KEYS.queue, STORAGE_KEYS.active]);
    return {
        queue: Array.isArray(stored[STORAGE_KEYS.queue]) ? stored[STORAGE_KEYS.queue] : [],
        active: stored[STORAGE_KEYS.active] || null
    };
}

async function setState(state){
    await chrome.storage.local.set({
        [STORAGE_KEYS.queue]: state.queue,
        [STORAGE_KEYS.active]: state.active
    });
}

async function clearActive(){
    await chrome.storage.local.set({
        [STORAGE_KEYS.active]: null
    });
}
