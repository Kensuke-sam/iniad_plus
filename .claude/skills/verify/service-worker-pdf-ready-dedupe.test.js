const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const serviceWorkerPath = path.resolve(__dirname, "../../../js/service-worker.js");
const TEST_TIMEOUT_MS = 1000;
const FIRST_JOB_ID = "job-first";
const FIRST_URL = "https://docs.google.com/presentation/d/e/first/pub?start=false";
const FIRST_TAB_URL = FIRST_URL + "&download=true&iniadpp_download=1";
const WRONG_TAB_URL = "https://docs.google.com/presentation/d/e/other/pub?download=true";

function clone(value){
    if(typeof value === "undefined") return undefined;
    return JSON.parse(JSON.stringify(value));
}

function plain(value){
    return clone(value);
}

function withTimeout(promise, label, timeoutMs){
    let timer;
    const timeout = new Promise(function(resolve, reject){
        timer = setTimeout(function(){
            reject(new Error(label + " timed out"));
        }, timeoutMs || TEST_TIMEOUT_MS);
    });
    return Promise.race([promise, timeout]).finally(function(){
        clearTimeout(timer);
    });
}

async function waitForCondition(predicate, label){
    return withTimeout((async function(){
        while(!predicate()){
            await new Promise(function(resolve){ setTimeout(resolve, 5); });
        }
    })(), label);
}

function createHarness(options){
    const settings = options || {};
    const listeners = {};
    const counters = {
        attach: 0,
        createTab: 0,
        createTabAttempts: 0,
        detach: 0,
        download: 0,
        printToPdf: 0,
        removeTab: 0,
        storageSet: 0,
        extensionTimers: 0
    };
    const secondJob = {
        jobId: "job-second",
        url: "https://docs.google.com/presentation/d/e/second/pub",
        filenameHint: "second.pdf",
        autoSave: true
    };
    const thirdJob = {
        jobId: "job-third",
        url: "https://docs.google.com/presentation/d/e/third/pub",
        filenameHint: "third.pdf",
        autoSave: true
    };
    const defaultActive = {
        jobId: FIRST_JOB_ID,
        url: FIRST_URL,
        filenameHint: "first.pdf",
        autoSave: settings.activeAutoSave !== false,
        phase: "rendering",
        tabId: 101
    };
    const hasActiveOverride = Object.prototype.hasOwnProperty.call(settings, "active");
    const stored = {
        iniadpp_pdf_queue: clone(settings.queue || [secondJob, thirdJob]),
        iniadpp_pdf_active: hasActiveOverride ? clone(settings.active) : clone(defaultActive)
    };
    let remainingCreateFailures = settings.createFailures || 0;
    let remainingStorageSetFailures = settings.storageSetFailures || 0;
    const storageSetFailureCalls = new Set(settings.storageSetFailureCalls || []);
    let extensionTimerId = 0;

    let releasePrint;
    const printGate = new Promise(function(resolve){
        releasePrint = resolve;
    });
    let notifyPrintStarted;
    const printStarted = new Promise(function(resolve){
        notifyPrintStarted = resolve;
    });

    function event(name){
        return {
            addListener: function(listener){
                listeners[name] = listener;
            }
        };
    }

    const chrome = {
        runtime: {
            onInstalled: event("installed"),
            onMessage: event("message"),
            onStartup: event("startup")
        },
        tabs: {
            create: async function(){
                counters.createTabAttempts++;
                if(remainingCreateFailures > 0){
                    remainingCreateFailures--;
                    throw new Error("tabs.create failed");
                }
                counters.createTab++;
                return { id: 201 + counters.createTab };
            },
            get: async function(tabId){
                const tab = { id: tabId, windowId: 1 };
                if(settings.tabUrl !== null){
                    if(typeof settings.tabUrl === "string"){
                        tab.url = settings.tabUrl;
                    } else if(stored.iniadpp_pdf_active
                        && stored.iniadpp_pdf_active.tabId === tabId){
                        tab.url = stored.iniadpp_pdf_active.url;
                    } else {
                        tab.url = FIRST_TAB_URL;
                    }
                }
                if(settings.tabDiscarded === true){
                    tab.discarded = true;
                }
                return tab;
            },
            onRemoved: event("tab-removed"),
            remove: async function(tabId){
                counters.removeTab++;
                if(settings.emitTabRemovedOnClose !== false && listeners["tab-removed"]){
                    listeners["tab-removed"](tabId);
                }
            },
            update: async function(){}
        },
        windows: {
            update: async function(){}
        },
        debugger: {
            attach: async function(){
                counters.attach++;
            },
            detach: async function(source){
                counters.detach++;
                if(settings.emitExpectedDetach && listeners["debugger-detach"]){
                    listeners["debugger-detach"](source, "canceled_by_user");
                }
            },
            onDetach: event("debugger-detach"),
            sendCommand: async function(){
                counters.printToPdf++;
                notifyPrintStarted();
                await printGate;
                return { data: "cGRm" };
            }
        },
        downloads: {
            download: async function(){
                counters.download++;
                return 1;
            }
        },
        permissions: {
            contains: async function(){ return true; },
            request: async function(){ return true; }
        },
        storage: {
            local: {
                get: async function(keys){
                    return keys.reduce(function(result, key){
                        result[key] = clone(stored[key]);
                        return result;
                    }, {});
                },
                set: async function(values){
                    counters.storageSet++;
                    if(storageSetFailureCalls.has(counters.storageSet)){
                        throw new Error("storage.set failed on call " + counters.storageSet);
                    }
                    if(remainingStorageSetFailures > 0){
                        remainingStorageSetFailures--;
                        throw new Error("storage.set failed");
                    }
                    Object.keys(values).forEach(function(key){
                        stored[key] = clone(values[key]);
                    });
                }
            }
        }
    };

    const quietConsole = {
        error: function(){},
        log: function(){},
        warn: function(){}
    };
    const context = vm.createContext({
        URL: URL,
        chrome: chrome,
        console: quietConsole,
        setTimeout: function(callback, delay){
            counters.extensionTimers++;
            extensionTimerId++;
            if(settings.runExtensionTimers === false){
                return extensionTimerId;
            }
            const timer = setTimeout(callback, Math.min(delay || 0, 25));
            if(typeof timer.unref === "function") timer.unref();
            return timer;
        }
    });
    vm.runInContext(fs.readFileSync(serviceWorkerPath, "utf8"), context, {
        filename: serviceWorkerPath
    });

    return {
        context: context,
        counters: counters,
        listeners: listeners,
        printStarted: printStarted,
        releasePrint: releasePrint,
        state: function(){ return clone(stored); },
        tab: function(url){
            return { id: 101, url: typeof url === "string" ? url : FIRST_TAB_URL };
        }
    };
}

function assertSecondJobActive(harness, expectedTabId, expectedCreateCount){
    const state = harness.state();
    assert.equal(state.iniadpp_pdf_active.jobId, "job-second");
    assert.equal(state.iniadpp_pdf_active.tabId, expectedTabId || 202);
    assert.deepEqual(
        state.iniadpp_pdf_queue.map(function(job){ return job.jobId; }),
        ["job-third"]
    );
    assert.equal(harness.counters.createTab, expectedCreateCount || 1);
}

function assertPersistedQueueIntact(harness){
    const state = harness.state();
    assert.equal(state.iniadpp_pdf_active, null);
    assert.deepEqual(
        state.iniadpp_pdf_queue.map(function(job){ return job.jobId; }),
        ["job-second", "job-third"]
    );
}

async function testConcurrentReadyAndExpectedDetach(){
    const harness = createHarness({ emitExpectedDetach: true });
    const message = { jobId: FIRST_JOB_ID, filename: "first.pdf" };
    const firstReady = harness.context.handlePdfReady(harness.tab(), message);
    const duplicateReady = harness.context.handlePdfReady(harness.tab(), message);

    await withTimeout(harness.printStarted, "concurrent ready print start");
    assert.equal(harness.counters.attach, 1);
    assert.equal(harness.counters.printToPdf, 1);
    assert.equal(harness.counters.createTab, 0);

    harness.releasePrint();
    const results = await withTimeout(
        Promise.all([firstReady, duplicateReady]),
        "concurrent ready completion"
    );
    assert.deepEqual(plain(results), [
        { ok: true, saved: true, filename: "first.pdf" },
        { ok: true, saved: true, filename: "first.pdf" }
    ]);
    assert.equal(harness.counters.attach, 1);
    assert.equal(harness.counters.printToPdf, 1);
    assert.equal(harness.counters.download, 1);
    assert.equal(harness.counters.detach, 1);
    assert.equal(harness.counters.removeTab, 1);
    assertSecondJobActive(harness);

    const lateDuplicate = await harness.context.handlePdfReady(harness.tab(), message);
    assert.deepEqual(plain(lateDuplicate), { ok: false, error: "inactive-tab" });
    assertSecondJobActive(harness);
}

async function testReadyAndFailedCoalesce(){
    const harness = createHarness();
    const ready = harness.context.handlePdfReady(harness.tab(), {
        jobId: FIRST_JOB_ID,
        filename: "first.pdf"
    });
    await withTimeout(harness.printStarted, "ready-vs-failed print start");
    const failed = harness.context.handlePdfFailed(harness.tab(), {
        jobId: FIRST_JOB_ID,
        message: "late content failure"
    });

    assert.equal(harness.counters.createTab, 0);
    harness.releasePrint();
    const results = await withTimeout(
        Promise.all([ready, failed]),
        "ready-vs-failed completion"
    );
    assert.deepEqual(plain(results), [
        { ok: true, saved: true, filename: "first.pdf" },
        { ok: true, saved: true, filename: "first.pdf" }
    ]);
    assert.equal(harness.counters.printToPdf, 1);
    assertSecondJobActive(harness);
}

async function testFailedWinsAgainstReady(){
    const harness = createHarness();
    const failed = harness.context.handlePdfFailed(harness.tab(), {
        jobId: FIRST_JOB_ID,
        message: "render failed"
    });
    const ready = harness.context.handlePdfReady(harness.tab(), {
        jobId: FIRST_JOB_ID,
        filename: "first.pdf"
    });
    const results = await withTimeout(
        Promise.all([failed, ready]),
        "failed-vs-ready completion"
    );

    assert.deepEqual(plain(results), [
        { ok: false, error: "pdf-generation-failed" },
        { ok: false, error: "pdf-generation-failed" }
    ]);
    assert.equal(harness.counters.printToPdf, 0);
    assert.equal(harness.counters.download, 0);
    assertSecondJobActive(harness);
}

async function testJobAndDeckValidation(){
    const harness = createHarness();
    const goodContext = await harness.context.handlePdfJobContext(harness.tab());
    assert.deepEqual(plain(goodContext), {
        ok: true,
        jobId: FIRST_JOB_ID,
        deckMatches: true
    });
    const movedContext = await harness.context.handlePdfJobContext(harness.tab(WRONG_TAB_URL));
    assert.deepEqual(plain(movedContext), {
        ok: true,
        jobId: FIRST_JOB_ID,
        deckMatches: false
    });

    const invalidResults = await Promise.all([
        harness.context.handlePdfReady(harness.tab(), { filename: "first.pdf" }),
        harness.context.handlePdfReady(harness.tab(), { jobId: "job-wrong", filename: "first.pdf" }),
        harness.context.handlePdfFailed(harness.tab(), { message: "missing job" }),
        harness.context.handlePdfFailed(harness.tab(), { jobId: "job-wrong", message: "wrong job" }),
        harness.context.handlePdfReady(harness.tab(WRONG_TAB_URL), {
            jobId: FIRST_JOB_ID,
            filename: "first.pdf"
        })
    ]);
    assert.deepEqual(plain(invalidResults), [
        { ok: false, error: "job-mismatch" },
        { ok: false, error: "job-mismatch" },
        { ok: false, error: "job-mismatch" },
        { ok: false, error: "job-mismatch" },
        { ok: false, error: "wrong-deck" }
    ]);
    assert.equal(harness.counters.printToPdf, 0);
    assert.equal(harness.counters.createTab, 0);
    assert.equal(harness.state().iniadpp_pdf_active.jobId, FIRST_JOB_ID);
}

async function testWrongDeckFailureTerminatesOnce(){
    const harness = createHarness();
    const first = harness.context.handlePdfFailed(harness.tab(WRONG_TAB_URL), {
        jobId: FIRST_JOB_ID,
        message: "tab navigated"
    });
    const duplicate = harness.context.handlePdfFailed(harness.tab(WRONG_TAB_URL), {
        jobId: FIRST_JOB_ID,
        message: "tab navigated again"
    });
    const results = await withTimeout(
        Promise.all([first, duplicate]),
        "wrong-deck failure completion"
    );
    assert.deepEqual(plain(results), [
        { ok: false, error: "pdf-generation-failed" },
        { ok: false, error: "pdf-generation-failed" }
    ]);
    assert.equal(harness.counters.printToPdf, 0);
    assertSecondJobActive(harness);
}

async function testUnexpectedDetachAdvancesOnce(){
    const harness = createHarness();
    const first = harness.context.handleDebuggerDetach(
        { tabId: 101 },
        "canceled_by_user"
    );
    const duplicate = harness.context.handleDebuggerDetach(
        { tabId: 101 },
        "canceled_by_user"
    );
    await withTimeout(Promise.all([first, duplicate]), "unexpected detach completion");
    assertSecondJobActive(harness);

    await harness.context.handleDebuggerDetach({ tabId: 101 }, "canceled_by_user");
    assertSecondJobActive(harness);
}

async function testLossFirstCannotLookSaved(){
    const tabHarness = createHarness();
    const tabLoss = tabHarness.context.handleTabRemoved(101);
    const tabReady = tabHarness.context.handlePdfReady(tabHarness.tab(), {
        jobId: FIRST_JOB_ID,
        filename: "first.pdf"
    });
    const tabResults = await withTimeout(
        Promise.all([tabLoss, tabReady]),
        "tab loss-first completion"
    );
    assert.deepEqual(plain(tabResults), [
        { ok: false, error: "job-aborted", advanced: true, reason: "tab-removed" },
        { ok: false, error: "job-aborted", advanced: true, reason: "tab-removed" }
    ]);
    assert.equal(tabHarness.counters.printToPdf, 0);
    assertSecondJobActive(tabHarness);

    const detachHarness = createHarness();
    const detachLoss = detachHarness.context.handleDebuggerDetach(
        { tabId: 101 },
        "canceled_by_user"
    );
    const detachReady = detachHarness.context.handlePdfReady(detachHarness.tab(), {
        jobId: FIRST_JOB_ID,
        filename: "first.pdf"
    });
    const detachResults = await withTimeout(
        Promise.all([detachLoss, detachReady]),
        "detach loss-first completion"
    );
    assert.deepEqual(plain(detachResults), [
        { ok: false, error: "job-aborted", advanced: true, reason: "canceled_by_user" },
        { ok: false, error: "job-aborted", advanced: true, reason: "canceled_by_user" }
    ]);
    assert.equal(detachHarness.counters.printToPdf, 0);
    assertSecondJobActive(detachHarness);
}

async function testManualSaveAdvancesOnce(){
    const harness = createHarness({ activeAutoSave: false });
    const message = { jobId: FIRST_JOB_ID, filename: "first.pdf" };
    const first = harness.context.handlePdfReady(harness.tab(), message);
    const duplicate = harness.context.handlePdfReady(harness.tab(), message);
    const results = await withTimeout(
        Promise.all([first, duplicate]),
        "manual-save completion"
    );

    assert.deepEqual(plain(results), [
        { ok: false, error: "manual-save-required" },
        { ok: false, error: "manual-save-required" }
    ]);
    assert.equal(harness.counters.attach, 0);
    assert.equal(harness.counters.printToPdf, 0);
    assert.equal(harness.counters.download, 0);
    assert.equal(harness.counters.removeTab, 0);
    assertSecondJobActive(harness);
}

async function testManualSaveKeepsManualResultWhenCleanupIsPending(){
    const harness = createHarness({
        activeAutoSave: false,
        storageSetFailureCalls: [1],
        runExtensionTimers: false
    });
    const result = await harness.context.handlePdfReady(harness.tab(), {
        jobId: FIRST_JOB_ID,
        filename: "first.pdf"
    });

    assert.deepEqual(plain(result), {
        ok: false,
        error: "manual-save-required",
        cleanupPending: true
    });
    assert.equal(harness.counters.attach, 0);
    assert.equal(harness.counters.printToPdf, 0);
    assert.equal(harness.counters.download, 0);
    assert.equal(harness.state().iniadpp_pdf_active.jobId, FIRST_JOB_ID);
}

async function testRecoverRetriesCreateFailure(){
    const harness = createHarness({
        active: null,
        createFailures: 1,
        runExtensionTimers: false
    });
    await assert.rejects(
        withTimeout(harness.context.recoverState(), "recover create failure"),
        /tabs\.create failed/
    );
    assertPersistedQueueIntact(harness);
    assert.equal(harness.counters.createTabAttempts, 1);
    assert.equal(harness.counters.createTab, 0);
    assert.equal(harness.counters.removeTab, 0);

    await withTimeout(harness.context.recoverState(), "recover create retry");
    assert.equal(harness.counters.createTabAttempts, 2);
    assertSecondJobActive(harness);
}

async function testRecoverCompensatesStorageFailure(){
    const harness = createHarness({
        active: null,
        storageSetFailures: 1,
        runExtensionTimers: false
    });
    await assert.rejects(
        withTimeout(harness.context.recoverState(), "recover storage failure"),
        /storage\.set failed/
    );
    assertPersistedQueueIntact(harness);
    assert.equal(harness.counters.createTabAttempts, 1);
    assert.equal(harness.counters.createTab, 1);
    assert.equal(harness.counters.removeTab, 1);

    await withTimeout(harness.context.recoverState(), "recover storage retry");
    assert.equal(harness.counters.createTabAttempts, 2);
    assertSecondJobActive(harness, 203, 2);
}

async function testTerminalRejectionClearsReservation(){
    const harness = createHarness();
    const firstReservation = await harness.context.reserveActiveTerminal(101);
    assert.equal(firstReservation.owner, true);
    await assert.rejects(
        withTimeout(
            harness.context.executeTerminalReservation(firstReservation, function(){
                throw new Error("terminal task failed");
            }),
            "terminal rejection"
        ),
        /terminal task failed/
    );

    const retryReservation = await harness.context.reserveActiveTerminal(101);
    assert.equal(retryReservation.owner, true, "rejected terminal must release its single-flight entry");
    const retryResult = await harness.context.executeTerminalReservation(
        retryReservation,
        function(){ return { ok: false, error: "retry-probe" }; }
    );
    assert.deepEqual(plain(retryResult), { ok: false, error: "retry-probe" });
    assert.equal(harness.state().iniadpp_pdf_active.jobId, FIRST_JOB_ID);
}

async function completePrintAndGetReadyResult(harness){
    const ready = harness.context.handlePdfReady(harness.tab(), {
        jobId: FIRST_JOB_ID,
        filename: "first.pdf"
    });
    await withTimeout(harness.printStarted, "saved export print start");
    harness.releasePrint();
    return withTimeout(ready, "saved export response");
}

async function testSavedResultSurvivesNextCreateFailure(){
    const harness = createHarness({ createFailures: 1 });
    const result = await completePrintAndGetReadyResult(harness);
    assert.deepEqual(plain(result), {
        ok: true,
        saved: true,
        filename: "first.pdf",
        cleanupPending: true
    });
    assert.equal(harness.counters.download, 1);
    assert.equal(harness.counters.createTabAttempts, 1);

    await waitForCondition(function(){
        const active = harness.state().iniadpp_pdf_active;
        return active && active.jobId === "job-second";
    }, "automatic retry after next tabs.create failure");
    assert.equal(harness.counters.createTabAttempts, 2);
    assertSecondJobActive(harness);
}

async function testSavedResultSurvivesPhasePersistenceFailure(){
    const harness = createHarness({ storageSetFailureCalls: [1] });
    const result = await completePrintAndGetReadyResult(harness);
    assert.deepEqual(plain(result), {
        ok: true,
        saved: true,
        filename: "first.pdf",
        cleanupPending: true
    });
    assert.equal(harness.state().iniadpp_pdf_active.phase, "rendering");

    await waitForCondition(function(){
        const active = harness.state().iniadpp_pdf_active;
        return active && active.jobId === "job-second";
    }, "automatic retry after exported phase persistence failure");
    assert.equal(harness.counters.download, 1);
    assertSecondJobActive(harness);
}

async function testSavedResultSurvivesClearFailure(){
    const harness = createHarness({ storageSetFailureCalls: [2] });
    const result = await completePrintAndGetReadyResult(harness);
    assert.deepEqual(plain(result), {
        ok: true,
        saved: true,
        filename: "first.pdf",
        cleanupPending: true
    });
    assert.equal(harness.state().iniadpp_pdf_active.phase, "exported");

    await waitForCondition(function(){
        const active = harness.state().iniadpp_pdf_active;
        return active && active.jobId === "job-second";
    }, "automatic retry after exported active clear failure");
    assert.equal(harness.counters.download, 1);
    assertSecondJobActive(harness);
}

async function testSavedResultSurvivesNextActivationPersistenceFailure(){
    const harness = createHarness({ storageSetFailureCalls: [3] });
    const result = await completePrintAndGetReadyResult(harness);
    assert.deepEqual(plain(result), {
        ok: true,
        saved: true,
        filename: "first.pdf",
        cleanupPending: true
    });
    assert.equal(harness.counters.download, 1);
    assert.equal(harness.counters.removeTab, 2, "保存元タブと孤立した次タブを閉じる");

    await waitForCondition(function(){
        const active = harness.state().iniadpp_pdf_active;
        return active && active.jobId === "job-second";
    }, "automatic retry after next activation persistence failure");
    assert.equal(harness.counters.createTabAttempts, 2);
    assertSecondJobActive(harness, 203, 2);
}

async function testCleanupPendingReadyDoesNotExportAgain(){
    const harness = createHarness({
        storageSetFailureCalls: [1],
        runExtensionTimers: false
    });
    const firstResult = await completePrintAndGetReadyResult(harness);
    assert.equal(firstResult.saved, true);
    assert.equal(firstResult.cleanupPending, true);
    assert.equal(harness.counters.printToPdf, 1);
    assert.equal(harness.counters.download, 1);

    const duplicateResult = await harness.context.handlePdfReady(harness.tab(), {
        jobId: FIRST_JOB_ID,
        filename: "first.pdf"
    });
    assert.deepEqual(plain(duplicateResult), {
        ok: true,
        saved: true,
        filename: "first.pdf"
    });
    assert.equal(harness.counters.printToPdf, 1);
    assert.equal(harness.counters.download, 1);
    assertSecondJobActive(harness);
}

async function testRecoverFinalizesPersistedExportedJob(){
    const harness = createHarness({
        active: {
            jobId: FIRST_JOB_ID,
            url: FIRST_URL,
            filenameHint: "first.pdf",
            autoSave: true,
            phase: "exported",
            tabId: 101
        }
    });
    await withTimeout(harness.context.recoverState(), "recover exported active");
    assert.equal(harness.counters.printToPdf, 0);
    assert.equal(harness.counters.removeTab, 1);
    assertSecondJobActive(harness);
}

async function testRecoverAbortsWrongDeckRenderingTab(){
    const harness = createHarness({ tabUrl: WRONG_TAB_URL });
    await withTimeout(harness.context.recoverState(), "recover wrong-deck active");
    assert.equal(harness.counters.printToPdf, 0);
    assert.equal(harness.counters.removeTab, 0);
    assertSecondJobActive(harness);
}

async function testRecoverKeepsMatchingDiscardedTab(){
    const harness = createHarness({
        tabUrl: FIRST_TAB_URL,
        tabDiscarded: true
    });
    await withTimeout(harness.context.recoverState(), "recover matching discarded active");
    const state = harness.state();
    assert.equal(state.iniadpp_pdf_active.jobId, FIRST_JOB_ID);
    assert.equal(state.iniadpp_pdf_active.phase, "rendering");
    assert.equal(state.iniadpp_pdf_queue.length, 2);
    assert.equal(harness.counters.createTab, 0);
}

async function testEnqueueDefersCreateFailureAndRetries(){
    const harness = createHarness({
        active: null,
        queue: [],
        createFailures: 1
    });
    const result = await harness.context.handleEnqueue([{
        url: "https://docs.google.com/presentation/d/e/enqueued/pub",
        filenameHint: "enqueued.pdf"
    }]);
    assert.deepEqual(plain(result), {
        ok: true,
        queued: 1,
        manualSave: false,
        deferred: true
    });
    assert.equal(harness.counters.createTabAttempts, 1);
    assert.equal(harness.counters.createTab, 0);
    assert.equal(harness.counters.extensionTimers, 1);

    await waitForCondition(function(){
        return Boolean(harness.state().iniadpp_pdf_active);
    }, "enqueue retry timer after tabs.create failure");
    const state = harness.state();
    assert.equal(state.iniadpp_pdf_active.url, "https://docs.google.com/presentation/d/e/enqueued/pub");
    assert.equal(state.iniadpp_pdf_active.phase, "rendering");
    assert.equal(state.iniadpp_pdf_queue.length, 0);
    assert.equal(harness.counters.createTabAttempts, 2);
    assert.equal(harness.counters.createTab, 1);
}

async function testEnqueueDefersActivationPersistenceFailure(){
    const harness = createHarness({
        active: null,
        queue: [],
        storageSetFailureCalls: [2]
    });
    const result = await harness.context.handleEnqueue([{
        url: "https://docs.google.com/presentation/d/e/enqueued/pub",
        filenameHint: "enqueued.pdf"
    }]);
    assert.deepEqual(plain(result), {
        ok: true,
        queued: 1,
        manualSave: false,
        deferred: true
    });
    assert.equal(harness.counters.createTab, 1);
    assert.equal(harness.counters.removeTab, 1);

    await waitForCondition(function(){
        return Boolean(harness.state().iniadpp_pdf_active);
    }, "enqueue retry timer after activation persistence failure");
    const state = harness.state();
    assert.equal(state.iniadpp_pdf_active.url, "https://docs.google.com/presentation/d/e/enqueued/pub");
    assert.equal(state.iniadpp_pdf_queue.length, 0);
    assert.equal(harness.counters.createTabAttempts, 2);
    assert.equal(harness.counters.createTab, 2);
    assert.equal(harness.counters.removeTab, 1);
}

async function testEnqueueRejectsBeforeQueuePersistence(){
    const harness = createHarness({
        active: null,
        queue: [],
        storageSetFailureCalls: [1],
        runExtensionTimers: false
    });
    await assert.rejects(
        harness.context.handleEnqueue([{
            url: "https://docs.google.com/presentation/d/e/enqueued/pub",
            filenameHint: "enqueued.pdf"
        }]),
        /storage\.set failed/
    );
    assert.equal(harness.state().iniadpp_pdf_queue.length, 0);
    assert.equal(harness.counters.createTabAttempts, 0);
    assert.equal(harness.counters.extensionTimers, 0);
}

async function testTabRemovedCannotRaceReady(){
    const harness = createHarness({ emitTabRemovedOnClose: false });
    const ready = harness.context.handlePdfReady(harness.tab(), {
        jobId: FIRST_JOB_ID,
        filename: "first.pdf"
    });
    await withTimeout(harness.printStarted, "tab-removed race print start");
    const removed = harness.context.handleTabRemoved(101);
    assert.equal(harness.counters.createTab, 0);

    harness.releasePrint();
    const results = await withTimeout(
        Promise.all([ready, removed]),
        "tab-removed race completion"
    );
    assert.deepEqual(plain(results), [
        { ok: true, saved: true, filename: "first.pdf" },
        { ok: true, saved: true, filename: "first.pdf" }
    ]);
    assertSecondJobActive(harness);
}

async function main(){
    await testConcurrentReadyAndExpectedDetach();
    await testReadyAndFailedCoalesce();
    await testFailedWinsAgainstReady();
    await testJobAndDeckValidation();
    await testWrongDeckFailureTerminatesOnce();
    await testUnexpectedDetachAdvancesOnce();
    await testLossFirstCannotLookSaved();
    await testManualSaveAdvancesOnce();
    await testManualSaveKeepsManualResultWhenCleanupIsPending();
    await testRecoverRetriesCreateFailure();
    await testRecoverCompensatesStorageFailure();
    await testTerminalRejectionClearsReservation();
    await testSavedResultSurvivesNextCreateFailure();
    await testSavedResultSurvivesPhasePersistenceFailure();
    await testSavedResultSurvivesClearFailure();
    await testSavedResultSurvivesNextActivationPersistenceFailure();
    await testCleanupPendingReadyDoesNotExportAgain();
    await testRecoverFinalizesPersistedExportedJob();
    await testRecoverAbortsWrongDeckRenderingTab();
    await testRecoverKeepsMatchingDiscardedTab();
    await testEnqueueDefersCreateFailureAndRetries();
    await testEnqueueDefersActivationPersistenceFailure();
    await testEnqueueRejectsBeforeQueuePersistence();
    await testTabRemovedCannotRaceReady();
    console.log("service-worker terminal dedupe regression: ok");
}

withTimeout(main(), "service-worker regression suite", 5000).catch(function(err){
    console.error(err);
    process.exitCode = 1;
});
