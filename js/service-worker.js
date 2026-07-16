const STORAGE_KEYS = {
    queue: "iniadpp_pdf_queue",
    active: "iniadpp_pdf_active"
};

const AUTO_SAVE_PERMISSIONS = ["debugger", "downloads"];
const ALLOWED_URL_HOST = "docs.google.com";
const ALLOWED_URL_PATH_PREFIX = "/presentation/d/e/";
const EXPECTED_DEBUGGER_DETACH_GUARD_MS = 2000;
const RECOVERY_RETRY_BASE_MS = 250;
const RECOVERY_RETRY_MAX_MS = 4000;

let stateMutationTail = Promise.resolve();
const expectedDebuggerDetachTabIds = new Set();
const terminalExecutions = new Map();
const pendingExportedJobs = new Map();
let recoveryRetryTimer = null;
let recoveryRetryAttempt = 0;

chrome.runtime.onInstalled.addListener(function(){
    recoverState().catch(function(err){
        console.error("[INIAD Plus PDF] 初期化失敗:", err);
    });
});

chrome.runtime.onStartup.addListener(function(){
    recoverState().catch(function(err){
        console.error("[INIAD Plus PDF] 復旧失敗:", err);
    });
});

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse){
    if(!message || !message.type) return;

    if(message.type === "iniadpp:enqueue"){
        handleEnqueue(message.items || [])
            .then(function(result){ sendResponse(result); })
            .catch(function(err){
                console.error("[INIAD Plus PDF] enqueue失敗:", err);
                sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
            });
        return true;
    }

    if(message.type === "iniadpp:pdf-job-context"){
        handlePdfJobContext(sender && sender.tab)
            .then(function(result){ sendResponse(result); })
            .catch(function(err){
                console.error("[INIAD Plus PDF] job context取得失敗:", err);
                sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
            });
        return true;
    }

    if(message.type === "iniadpp:pdf-ready"){
        handlePdfReady(sender && sender.tab, message)
            .then(function(result){ sendResponse(result); })
            .catch(function(err){
                console.error("[INIAD Plus PDF] pdf-ready失敗:", err);
                sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
            });
        return true;
    }

    if(message.type === "iniadpp:pdf-failed"){
        handlePdfFailed(sender && sender.tab, message)
            .then(function(result){ sendResponse(result); })
            .catch(function(err){
                console.error("[INIAD Plus PDF] pdf-failed失敗:", err);
                sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
            });
        return true;
    }
});

chrome.tabs.onRemoved.addListener(function(tabId){
    handleTabRemoved(tabId).catch(function(err){
        console.error("[INIAD Plus PDF] タブ削除処理失敗:", err);
    });
});

chrome.debugger.onDetach.addListener(function(source, reason){
    handleDebuggerDetach(source, reason).catch(function(err){
        console.error("[INIAD Plus PDF] debugger detach処理失敗:", err);
    });
});

async function handleEnqueue(items){
    const normalizedItems = items
        .map(function(item){ return normalizeQueueItem(item); })
        .filter(Boolean);

    if(!normalizedItems.length){
        return { ok: false, error: "no-items" };
    }

    const autoSave = await ensureAutoSavePermissions();
    const queueItems = normalizedItems.map(function(item){
        return Object.assign({}, item, { autoSave: autoSave });
    });

    let deferred = false;
    await withStateMutationLock(async function(){
        const state = await getState();
        state.queue = state.queue.concat(queueItems);
        // ここが成功した時点で受付は完了。以降の開始失敗で受付結果を失敗に戻さない。
        await setState(state);
        try {
            await processQueueUnlocked();
        } catch(err){
            deferred = true;
            console.warn("[INIAD Plus PDF] キュー開始を延期します:", err);
            scheduleRecoveryRetry();
        }
    });

    const result = {
        ok: true,
        queued: normalizedItems.length,
        manualSave: !autoSave
    };
    if(deferred){
        result.deferred = true;
    }
    return result;
}

async function handlePdfReady(tab, message){
    const reservation = await reserveTerminalForMessage(tab, message, true);
    return executeTerminalReservation(reservation, function(active){
        return runPdfReadyExport(tab, message, active);
    });
}

async function runPdfReadyExport(tab, message, active){
    const baseHint = stripExtension(message.filename || active.filenameHint || "slides");
    const filename = sanitizeFilename(baseHint, ".pdf");
    const terminalKey = createTerminalExecutionKey(active);

    if(active.phase === "exported" || pendingExportedJobs.has(terminalKey)){
        const finalization = await finalizeSavedExport(active);
        return addCleanupPending(
            { ok: true, saved: true, filename: filename },
            finalization
        );
    }

    if(active.autoSave === false){
        await focusTab(tab.id);
        const finalization = await finishActiveJobAndContinue(active, false);
        return addCleanupPending(
            { ok: false, error: "manual-save-required" },
            finalization
        );
    }

    try {
        await processExportFromTab(tab.id, filename);
    } catch(err){
        console.error("[INIAD Plus PDF] エクスポート処理失敗:", err);
        await focusTab(tab.id);
        const finalization = await finishActiveJobAndContinue(active, false);
        return addCleanupPending(
            { ok: false, error: err && err.message ? err.message : String(err) },
            finalization
        );
    }

    const finalization = await finalizeSavedExport(active);
    return addCleanupPending(
        { ok: true, saved: true, filename: filename },
        finalization
    );
}

function addCleanupPending(result, finalization){
    if(finalization && finalization.cleanupPending){
        result.cleanupPending = true;
    }
    return result;
}

async function handlePdfJobContext(tab){
    if(!tab || typeof tab.id !== "number"){
        return { ok: false, error: "missing-tab" };
    }

    return withStateMutationLock(async function(){
        const state = await getState();
        if(!state.active || state.active.tabId !== tab.id){
            return { ok: false, error: "inactive-tab" };
        }
        if(typeof state.active.jobId !== "string" || !state.active.jobId){
            return { ok: false, error: "inactive-job" };
        }
        return {
            ok: true,
            jobId: state.active.jobId,
            deckMatches: hasSameDeckPath(tab.url, state.active.url)
        };
    });
}

async function handlePdfFailed(tab, message){
    const reservation = await reserveTerminalForMessage(tab, message, false);
    return executeTerminalReservation(reservation, async function(active){
        if(!hasSameDeckPath(tab.url, active.url)){
            console.warn("[INIAD Plus PDF] PDF生成タブが対象スライドから移動したため、ジョブを終了します");
        }
        console.error("[INIAD Plus PDF] PDF生成失敗:", message && message.message ? message.message : "unknown error");
        await focusTab(active.tabId);
        const finalization = await finishActiveJobAndContinue(active, false);
        return addCleanupPending(
            {
                ok: false,
                error: finalization.completed ? "pdf-generation-failed" : "inactive-job"
            },
            finalization
        );
    });
}

async function reserveTerminalForMessage(tab, message, requireDeckMatch){
    if(!tab || typeof tab.id !== "number"){
        return { result: { ok: false, error: "missing-tab" } };
    }

    return reserveActiveTerminal(tab.id, function(active){
        if(!message || typeof message.jobId !== "string" || message.jobId !== active.jobId){
            return { ok: false, error: "job-mismatch" };
        }
        if(requireDeckMatch && !hasSameDeckPath(tab.url, active.url)){
            return { ok: false, error: "wrong-deck" };
        }
        return null;
    });
}

async function reserveActiveTerminal(tabId, validateActive){
    return withStateMutationLock(async function(){
        const state = await getState();
        if(!state.active || state.active.tabId !== tabId){
            return { result: { ok: false, error: "inactive-tab" } };
        }

        if(typeof validateActive === "function"){
            const validationError = validateActive(state.active);
            if(validationError){
                return { result: validationError };
            }
        }

        const key = createTerminalExecutionKey(state.active);
        const existing = terminalExecutions.get(key);
        if(existing){
            return { active: state.active, entry: existing, key: key, owner: false };
        }

        const entry = createDeferredExecution();
        terminalExecutions.set(key, entry);
        return {
            active: state.active,
            entry: entry,
            key: key,
            owner: true
        };
    });
}

async function executeTerminalReservation(reservation, task){
    if(reservation.result){
        return reservation.result;
    }
    if(!reservation.owner){
        return reservation.entry.promise;
    }

    reservation.entry.start(function(){
        return task(reservation.active);
    });

    try {
        return await reservation.entry.promise;
    } finally {
        if(terminalExecutions.get(reservation.key) === reservation.entry){
            terminalExecutions.delete(reservation.key);
        }
    }
}

function createTerminalExecutionKey(active){
    return String(active.tabId) + ":" + String(active.jobId || "unknown-job");
}

function createDeferredExecution(){
    let resolveExecution;
    let rejectExecution;
    let started = false;
    const promise = new Promise(function(resolve, reject){
        resolveExecution = resolve;
        rejectExecution = reject;
    });

    return {
        promise: promise,
        start: function(task){
            if(started) return;
            started = true;
            Promise.resolve()
                .then(task)
                .then(resolveExecution, rejectExecution);
        }
    };
}

async function handleTabRemoved(tabId){
    return handleActiveTerminalLoss(tabId);
}

async function handleDebuggerDetach(source, reason){
    if(!source || typeof source.tabId !== "number") return;
    if(expectedDebuggerDetachTabIds.delete(source.tabId)){
        return { ok: true, expected: true };
    }
    return handleActiveTerminalLoss(source.tabId, reason);
}

async function handleActiveTerminalLoss(tabId, reason){
    const reservation = await reserveActiveTerminal(tabId);
    return executeTerminalReservation(reservation, async function(active){
        const finalization = await finishActiveJobAndContinue(active, false);
        return addCleanupPending({
            ok: false,
            error: "job-aborted",
            advanced: finalization.completed,
            reason: reason || "tab-removed"
        }, finalization);
    });
}

async function processQueue(){
    return withStateMutationLock(processQueueUnlocked);
}

async function processQueueUnlocked(){
    const state = await getState();
    if(state.active || !state.queue.length) return;

    const nextJob = state.queue[0];
    const tab = await chrome.tabs.create({
        url: buildDownloadUrl(nextJob.url, nextJob.jobId),
        active: nextJob.autoSave === false
    });

    const nextState = {
        queue: state.queue.slice(1),
        active: {
            jobId: nextJob.jobId,
            url: nextJob.url,
            filenameHint: nextJob.filenameHint,
            autoSave: nextJob.autoSave !== false,
            phase: "rendering",
            tabId: tab.id
        }
    };

    try {
        await setState(nextState);
    } catch(err){
        try {
            await chrome.tabs.remove(tab.id);
        } catch(closeErr){
            console.warn("[INIAD Plus PDF] 状態保存失敗後のタブ close 失敗:", closeErr);
        }
        throw err;
    }
}

async function recoverState(){
    try {
        await runRecoveryPass();
        recoveryRetryAttempt = 0;
    } catch(err){
        scheduleRecoveryRetry();
        throw err;
    }
}

async function runRecoveryPass(){
    const pendingComplete = await flushPendingExportedJobs();
    if(!pendingComplete){
        throw new Error("exported-job-finalization-pending");
    }

    const state = await getState();
    if(!state.active){
        if(state.queue.length){
            await processQueue();
        }
        return;
    }

    if(state.active.phase === "exported"){
        const key = rememberExportedJob(state.active);
        const finalization = await attemptFinalizeExportedJob(key);
        if(finalization.cleanupPending){
            throw new Error("exported-job-finalization-pending");
        }
        return;
    }

    let activeTab;
    try {
        activeTab = await chrome.tabs.get(state.active.tabId);
    } catch(err){
        const result = await handleActiveTerminalLoss(state.active.tabId, "recovery-missing-tab");
        if(result && result.cleanupPending){
            throw new Error("missing-tab-finalization-pending");
        }
        return;
    }

    const activeTabUrl = activeTab && typeof activeTab.url === "string"
        ? activeTab.url
        : "";
    if(activeTabUrl && !hasSameDeckPath(activeTabUrl, state.active.url)){
        const result = await handleActiveTerminalLoss(state.active.tabId, "recovery-wrong-deck");
        if(result && result.cleanupPending){
            throw new Error("wrong-deck-finalization-pending");
        }
    }
}

function scheduleRecoveryRetry(){
    if(recoveryRetryTimer !== null) return false;

    const delay = Math.min(
        RECOVERY_RETRY_BASE_MS * Math.pow(2, Math.min(recoveryRetryAttempt, 8)),
        RECOVERY_RETRY_MAX_MS
    );
    recoveryRetryTimer = setTimeout(function(){
        recoveryRetryTimer = null;
        runRecoveryPass()
            .then(function(){
                recoveryRetryAttempt = 0;
            })
            .catch(function(err){
                recoveryRetryAttempt++;
                console.warn("[INIAD Plus PDF] 復旧を再試行します:", err);
                scheduleRecoveryRetry();
            });
    }, delay);
    return true;
}

async function processExportFromTab(tabId, filename){
    const hasAutoSavePermissions = await ensureAutoSavePermissions();
    if(!hasAutoSavePermissions){
        throw new Error("manual-save-required");
    }

    const debuggee = { tabId: tabId };
    let attached = false;

    try {
        await chrome.debugger.attach(debuggee, "1.3");
        attached = true;

        await exportAsPdf(debuggee, filename);
    } finally {
        if(attached){
            expectedDebuggerDetachTabIds.add(tabId);
            try {
                await chrome.debugger.detach(debuggee);
                setTimeout(function(){
                    expectedDebuggerDetachTabIds.delete(tabId);
                }, EXPECTED_DEBUGGER_DETACH_GUARD_MS);
            } catch(err){
                expectedDebuggerDetachTabIds.delete(tabId);
                console.warn("[INIAD Plus PDF] debugger detach失敗:", err);
            }
        }
    }
}

async function ensureAutoSavePermissions(){
    if(!chrome.permissions || !chrome.permissions.contains || !chrome.permissions.request){
        return false;
    }

    try {
        const alreadyGranted = await chrome.permissions.contains({
            permissions: AUTO_SAVE_PERMISSIONS
        });
        if(alreadyGranted) return true;
    } catch(err){
        console.warn("[INIAD Plus PDF] optional permission check failed:", err);
        return false;
    }

    try {
        return await chrome.permissions.request({
            permissions: AUTO_SAVE_PERMISSIONS
        });
    } catch(err){
        console.warn("[INIAD Plus PDF] optional permission request failed:", err);
        return false;
    }
}

async function exportAsPdf(debuggee, filename){
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
}

async function finalizeSavedExport(active){
    const key = rememberExportedJob(active);
    const finalization = await attemptFinalizeExportedJob(key);
    if(finalization.cleanupPending){
        scheduleRecoveryRetry();
    }
    return finalization;
}

function rememberExportedJob(active){
    const key = createTerminalExecutionKey(active);
    if(!pendingExportedJobs.has(key)){
        pendingExportedJobs.set(key, Object.assign({}, active));
    }
    return key;
}

async function flushPendingExportedJobs(){
    let complete = true;
    const keys = Array.from(pendingExportedJobs.keys());
    for(const key of keys){
        const finalization = await attemptFinalizeExportedJob(key);
        if(finalization.cleanupPending){
            complete = false;
        }
    }
    return complete;
}

async function attemptFinalizeExportedJob(key){
    const active = pendingExportedJobs.get(key);
    if(!active){
        return { completed: true, cleanupPending: false };
    }

    let marked;
    try {
        marked = await markActiveExported(active.tabId, active.jobId);
    } catch(err){
        console.warn("[INIAD Plus PDF] 保存済み状態の記録を延期します:", err);
        scheduleRecoveryRetry();
        return { completed: false, cleanupPending: true };
    }

    if(!marked){
        pendingExportedJobs.delete(key);
        return { completed: true, cleanupPending: false };
    }

    const finalization = await finishActiveJobAndContinue(active, true);
    if(finalization.completed){
        pendingExportedJobs.delete(key);
    }
    return finalization;
}

async function markActiveExported(tabId, jobId){
    return withStateMutationLock(async function(){
        const state = await getState();
        if(!state.active || state.active.tabId !== tabId || state.active.jobId !== jobId){
            return false;
        }
        if(state.active.phase === "exported"){
            return true;
        }

        const exportedActive = Object.assign({}, state.active, { phase: "exported" });
        await chrome.storage.local.set({
            [STORAGE_KEYS.active]: exportedActive
        });
        return true;
    });
}

async function finishActiveJobAndContinue(active, shouldCloseTab){
    let cleared;
    try {
        cleared = await cleanupActiveJob(active.tabId, active.jobId, shouldCloseTab);
    } catch(err){
        console.warn("[INIAD Plus PDF] active解除を延期します:", err);
        scheduleRecoveryRetry();
        return { completed: false, cleanupPending: true };
    }

    if(!cleared){
        // すでに同じジョブがactiveでなければ、このジョブの後処理は完了済み。
        return { completed: true, cleanupPending: false };
    }

    try {
        await processQueue();
        return { completed: true, cleanupPending: false };
    } catch(err){
        console.warn("[INIAD Plus PDF] 次のキュー開始を延期します:", err);
        scheduleRecoveryRetry();
        return { completed: true, cleanupPending: true };
    }
}

async function cleanupActiveJob(tabId, jobId, shouldCloseTab){
    const cleared = await clearActiveIfMatches(tabId, jobId);
    if(!cleared) return false;

    if(shouldCloseTab){
        try {
            await chrome.tabs.remove(tabId);
        } catch(err){
            console.warn("[INIAD Plus PDF] タブ close 失敗:", err);
        }
    }
    return true;
}

async function focusTab(tabId){
    try {
        const tab = await chrome.tabs.get(tabId);
        if(tab.windowId){
            await chrome.windows.update(tab.windowId, { focused: true });
        }
        await chrome.tabs.update(tabId, { active: true });
    } catch(err){
        console.warn("[INIAD Plus PDF] タブ focus 失敗:", err);
    }
}

function normalizeQueueItem(item){
    if(!item || !item.url) return null;
    if(!isAllowedUrl(item.url)) return null;

    return {
        jobId: createJobId(),
        url: item.url,
        filenameHint: sanitizeFilename(stripExtension(item.filenameHint || "slides"), ".pdf")
    };
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

function hasSameDeckPath(tabUrl, activeUrl){
    try {
        const tabDeck = new URL(tabUrl);
        const activeDeck = new URL(activeUrl);
        if(tabDeck.protocol !== "https:" || activeDeck.protocol !== "https:") return false;
        if(tabDeck.hostname !== ALLOWED_URL_HOST || activeDeck.hostname !== ALLOWED_URL_HOST) return false;
        if(tabDeck.pathname.indexOf(ALLOWED_URL_PATH_PREFIX) !== 0) return false;
        if(activeDeck.pathname.indexOf(ALLOWED_URL_PATH_PREFIX) !== 0) return false;
        return normalizeDeckPath(tabDeck.pathname) === normalizeDeckPath(activeDeck.pathname);
    } catch(err){
        return false;
    }
}

function normalizeDeckPath(pathname){
    const normalized = String(pathname || "").replace(/\/+$/, "");
    return normalized || "/";
}

function buildDownloadUrl(rawUrl, jobId){
    const url = new URL(rawUrl);
    url.searchParams.set("download", "true");
    url.searchParams.set("iniadpp_download", "1");
    url.searchParams.set("iniadpp_job", jobId);
    return url.toString();
}

function sanitizeFilename(filename, ext){
    const safeExt = String(ext || ".pdf").charAt(0) === "." ? String(ext) : "." + String(ext);
    let base = String(filename || "slides").replace(/[\\/:*?"<>|]/g, "_").trim();
    if(base.toLowerCase().endsWith(safeExt.toLowerCase())){
        base = base.slice(0, -safeExt.length);
    }
    if(!base.trim()){
        base = "slides";
    }
    return base + safeExt;
}

function stripExtension(name){
    return String(name || "").replace(/\.(pdf|png)$/i, "");
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

async function clearActiveIfMatches(tabId, jobId){
    return withStateMutationLock(function(){
        return clearActiveIfMatchesUnlocked(tabId, jobId);
    });
}

async function clearActiveIfMatchesUnlocked(tabId, jobId){
    const state = await getState();
    if(!state.active || state.active.tabId !== tabId || state.active.jobId !== jobId) return false;

    await chrome.storage.local.set({
        [STORAGE_KEYS.active]: null
    });
    return true;
}

function withStateMutationLock(task){
    const operation = stateMutationTail.then(task, task);
    stateMutationTail = operation.catch(function(){
        // 後続の状態変更は、直前の失敗に巻き込まず必ず実行できるようにする。
    });
    return operation;
}
