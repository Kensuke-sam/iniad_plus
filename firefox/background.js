const ALLOWED_URL_HOST = "docs.google.com";
const ALLOWED_URL_PATH_PREFIX = "/presentation/d/e/";
const PDF_JOBS_STORAGE_KEY = "iniadpp_firefox_pdf_jobs_v1";
const PDF_JOB_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const extensionApi = typeof browser !== "undefined" ? browser : chrome;
const pdfJobsByTabId = loadPersistedPdfJobs();

extensionApi.runtime.onMessage.addListener(function(message, sender){
    if(!message || !message.type) return undefined;

    if(message.type === "iniadpp:enqueue"){
        return handleEnqueue(message.items || []);
    }

    if(message.type === "iniadpp:pdf-job-context"){
        return Promise.resolve(handlePdfJobContext(sender && sender.tab));
    }

    if(message.type === "iniadpp:pdf-ready"){
        return Promise.resolve(handlePdfReady(sender && sender.tab, message));
    }

    if(message.type === "iniadpp:pdf-failed"){
        return Promise.resolve(handlePdfFailed(sender && sender.tab, message));
    }

    return undefined;
});

if(extensionApi.tabs.onRemoved){
    extensionApi.tabs.onRemoved.addListener(function(tabId){
        deleteTrackedPdfJob(tabId);
    });
}

// tabId はブラウザーセッションごとに振り直されるため、前セッションの永続ジョブを
// 再起動後の別タブに適用しない。イベントページの再起動 (同一セッション) では発火しない。
if(extensionApi.runtime.onStartup){
    extensionApi.runtime.onStartup.addListener(function(){
        clearTrackedPdfJobs();
    });
}

async function handleEnqueue(items){
    const normalizedItems = items.map(function(item, index){
        return { index: index, item: normalizeQueueItem(item) };
    });
    const validItems = normalizedItems.filter(function(entry){ return !!entry.item; });

    if(!validItems.length){
        return {
            ok: false,
            error: "no-items",
            queued: 0,
            manualSave: true,
            unacceptedIndexes: normalizedItems.map(function(entry){ return entry.index; })
        };
    }

    let createdCount = 0;
    const unacceptedIndexes = normalizedItems
        .filter(function(entry){ return !entry.item; })
        .map(function(entry){ return entry.index; });
    for(const entry of validItems){
        const item = entry.item;
        const job = {
            jobId: createJobId(),
            url: item.url,
            createdAt: Date.now()
        };
        try {
            const tab = await extensionApi.tabs.create({
                url: buildDownloadUrl(item.url, job.jobId),
                active: true
            });
            if(!tab || typeof tab.id !== "number"){
                throw new Error("created-tab-missing-id");
            }
            setTrackedPdfJob(tab.id, job);
            createdCount++;
        } catch(err){
            console.error("[INIAD Plus PDF] Firefox PDFタブ作成失敗:", err);
            unacceptedIndexes.push(entry.index);
        }
    }

    const result = {
        ok: createdCount > 0,
        queued: createdCount,
        manualSave: true,
        unacceptedIndexes: unacceptedIndexes.sort(function(a, b){ return a - b; })
    };
    if(unacceptedIndexes.length){
        result.error = createdCount > 0 ? "partial-enqueue" : "tab-create-failed";
    }
    return result;
}

function handlePdfJobContext(tab){
    const job = resolveTrackedJob(tab);
    if(!job){
        return { ok: false, error: "inactive-tab" };
    }
    return {
        ok: true,
        jobId: job.jobId,
        deckMatches: hasSameDeckPath(tab.url, job.url)
    };
}

async function handlePdfReady(tab, message){
    const validation = validateTerminalMessage(tab, message, true);
    if(validation.error) return validation.error;

    deleteTrackedPdfJob(tab.id);
    // 収集完了までに別タブへ移っていても印刷ダイアログに気付けるよう、Chrome 版と同様に前面化する
    await focusPdfJobTab(tab);
    return {
        ok: false,
        error: "firefox-manual-save-required"
    };
}

async function handlePdfFailed(tab, message){
    const validation = validateTerminalMessage(tab, message, false);
    if(validation.error) return validation.error;

    deleteTrackedPdfJob(tab.id);
    await focusPdfJobTab(tab);
    return { ok: true };
}

async function focusPdfJobTab(tab){
    if(!tab || typeof tab.id !== "number") return;
    const focusPromises = [];
    try {
        if(typeof tab.windowId === "number" && extensionApi.windows && extensionApi.windows.update){
            focusPromises.push(Promise.resolve(extensionApi.windows.update(tab.windowId, { focused: true })).catch(function(err){
                console.warn("[INIAD Plus PDF] Firefox ウィンドウ focus 失敗:", err);
            }));
        }
        if(extensionApi.tabs && extensionApi.tabs.update){
            focusPromises.push(Promise.resolve(extensionApi.tabs.update(tab.id, { active: true })).catch(function(err){
                console.warn("[INIAD Plus PDF] Firefox タブ focus 失敗:", err);
            }));
        }
    } catch(err){
        console.warn("[INIAD Plus PDF] Firefox タブ focus 失敗:", err);
    }
    await Promise.all(focusPromises);
}

function validateTerminalMessage(tab, message, requireDeckMatch){
    const job = resolveTrackedJob(tab);
    if(!job){
        return { error: { ok: false, error: "inactive-tab" } };
    }
    if(!message || typeof message.jobId !== "string" || message.jobId !== job.jobId){
        return { error: { ok: false, error: "job-mismatch" } };
    }
    if(requireDeckMatch && !hasSameDeckPath(tab.url, job.url)){
        return { error: { ok: false, error: "wrong-deck" } };
    }
    return { job: job };
}

function resolveTrackedJob(tab){
    if(!tab || typeof tab.id !== "number") return null;
    const job = pdfJobsByTabId.get(tab.id) || null;
    if(!job) return null;
    const age = Date.now() - job.createdAt;
    if(age < 0 || age > PDF_JOB_MAX_AGE_MS){
        deleteTrackedPdfJob(tab.id);
        return null;
    }
    return job;
}

function loadPersistedPdfJobs(){
    const jobs = new Map();
    const storage = getExtensionLocalStorage();
    if(!storage) return jobs;

    let parsed;
    try {
        parsed = JSON.parse(storage.getItem(PDF_JOBS_STORAGE_KEY) || "[]");
    } catch(err){
        try {
            storage.removeItem(PDF_JOBS_STORAGE_KEY);
        } catch(ignoredError){
            // 読み書きできないストレージでは in-memory 管理だけにフォールバックする
        }
        console.warn("[INIAD Plus PDF] Firefox PDFジョブ復元失敗:", err);
        return jobs;
    }

    if(!Array.isArray(parsed)){
        try {
            storage.removeItem(PDF_JOBS_STORAGE_KEY);
        } catch(ignoredError){
            // 読み書きできないストレージでは in-memory 管理だけにフォールバックする
        }
        return jobs;
    }

    try {
        parsed.forEach(function(entry){
            if(!entry || typeof entry.tabId !== "number") return;
            if(typeof entry.jobId !== "string" || !entry.jobId) return;
            if(!isAllowedUrl(entry.url)) return;
            if(typeof entry.createdAt !== "number") return;
            const age = Date.now() - entry.createdAt;
            if(age < 0 || age > PDF_JOB_MAX_AGE_MS) return;
            jobs.set(entry.tabId, {
                jobId: entry.jobId,
                url: entry.url,
                createdAt: entry.createdAt
            });
        });
        if(jobs.size !== parsed.length){
            writePersistedPdfJobs(storage, jobs);
        }
    } catch(err){
        console.warn("[INIAD Plus PDF] Firefox PDFジョブ復元失敗:", err);
    }
    return jobs;
}

function setTrackedPdfJob(tabId, job){
    pdfJobsByTabId.set(tabId, job);
    persistPdfJobs();
}

function deleteTrackedPdfJob(tabId){
    if(pdfJobsByTabId.delete(tabId)) persistPdfJobs();
}

function clearTrackedPdfJobs(){
    pdfJobsByTabId.clear();
    persistPdfJobs();
}

function persistPdfJobs(){
    const storage = getExtensionLocalStorage();
    if(!storage) return;
    try {
        writePersistedPdfJobs(storage, pdfJobsByTabId);
    } catch(err){
        console.warn("[INIAD Plus PDF] Firefox PDFジョブ保存失敗:", err);
    }
}

function writePersistedPdfJobs(storage, jobs){
    const serialized = [];
    jobs.forEach(function(job, tabId){
        serialized.push({
            tabId: tabId,
            jobId: job.jobId,
            url: job.url,
            createdAt: job.createdAt
        });
    });
    storage.setItem(PDF_JOBS_STORAGE_KEY, JSON.stringify(serialized));
}

function getExtensionLocalStorage(){
    try {
        return typeof localStorage !== "undefined" ? localStorage : null;
    } catch(err){
        return null;
    }
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

function hasSameDeckPath(firstUrl, secondUrl){
    try {
        const first = new URL(firstUrl);
        const second = new URL(secondUrl);
        if(first.protocol !== "https:" || second.protocol !== "https:") return false;
        if(first.hostname !== ALLOWED_URL_HOST || second.hostname !== ALLOWED_URL_HOST) return false;
        if(first.pathname.indexOf(ALLOWED_URL_PATH_PREFIX) !== 0) return false;
        if(second.pathname.indexOf(ALLOWED_URL_PATH_PREFIX) !== 0) return false;
        return normalizeDeckPath(first.pathname) === normalizeDeckPath(second.pathname);
    } catch(err){
        return false;
    }
}

function normalizeDeckPath(pathname){
    const normalized = String(pathname || "").replace(/\/+$/, "");
    return normalized || "/";
}

function createJobId(){
    if(typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"){
        return crypto.randomUUID();
    }
    return "firefox-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

function buildDownloadUrl(rawUrl, jobId){
    const url = new URL(rawUrl);
    url.searchParams.set("download", "true");
    url.searchParams.set("iniadpp_download", "1");
    url.searchParams.set("iniadpp_job", jobId);
    return url.toString();
}
