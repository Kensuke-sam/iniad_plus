"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const createdTabs = [];
let nextTabId = 100;
let createAttempts = 0;
let failCreateAt = null;
let messageListener = null;
let removedListener = null;
let startupListener = null;
let windowUpdateGate = null;
let tabUpdateGate = null;
const focusedWindows = [];
const activatedTabs = [];
const storageValues = new Map();
const localStorage = {
  getItem(key) { return storageValues.has(key) ? storageValues.get(key) : null; },
  setItem(key, value) { storageValues.set(key, String(value)); },
  removeItem(key) { storageValues.delete(key); },
};
const cryptoApi = { randomUUID: (() => {
  let id = 0;
  return () => `firefox-job-${++id}`;
})() };

function createDeferred(){
  let resolve;
  const promise = new Promise((resolver) => { resolve = resolver; });
  return { promise, resolve };
}

const browser = {
  runtime: {
    onMessage: {
      addListener(listener) { messageListener = listener; },
    },
    onStartup: {
      addListener(listener) { startupListener = listener; },
    },
  },
  tabs: {
    async create(options) {
      createAttempts += 1;
      if (createAttempts === failCreateAt) throw new Error("fixture tabs.create failure");
      const tab = { id: nextTabId++, windowId: 7, url: options.url };
      createdTabs.push(tab);
      return tab;
    },
    async update(tabId, options) {
      activatedTabs.push({ tabId, options });
      if (tabUpdateGate) await tabUpdateGate;
      return { id: tabId };
    },
    onRemoved: {
      addListener(listener) { removedListener = listener; },
    },
  },
  windows: {
    async update(windowId, options) {
      focusedWindows.push({ windowId, options });
      if (windowUpdateGate) await windowUpdateGate;
      return { id: windowId };
    },
  },
};

const backgroundSource = fs.readFileSync(
  path.resolve(__dirname, "../../../firefox/background.js"),
  "utf8"
);

function reloadBackground(){
  messageListener = null;
  removedListener = null;
  startupListener = null;
  const sandbox = {
    browser,
    URL,
    Map,
    Promise,
    Date,
    Math,
    console,
    localStorage,
    crypto: cryptoApi,
  };
  vm.createContext(sandbox);
  vm.runInContext(backgroundSource, sandbox, { filename: "firefox/background.js" });
  assert(messageListener, "runtime message listener was not registered");
  assert(removedListener, "tab removal listener was not registered");
  assert(startupListener, "startup listener was not registered");
}

reloadBackground();

async function send(message, tab) {
  const result = await messageListener(message, tab ? { tab } : {});
  return result === undefined ? undefined : JSON.parse(JSON.stringify(result));
}

(async () => {
  const unrelated = {
    id: 999,
    url: "https://docs.google.com/presentation/d/e/unrelated/pub",
  };
  assert.deepStrictEqual(
    await send({ type: "iniadpp:pdf-job-context" }, unrelated),
    { ok: false, error: "inactive-tab" }
  );
  console.log("PASS: unrelated queryless presentation has no Firefox job context");

  const deckUrl = "https://docs.google.com/presentation/d/e/tracked-deck/pub?start=false";
  assert.deepStrictEqual(
    await send({ type: "iniadpp:enqueue", items: [{ url: deckUrl }] }),
    { ok: true, queued: 1, manualSave: true, unacceptedIndexes: [] }
  );
  const created = createdTabs[0];
  const createdUrl = new URL(created.url);
  assert.equal(createdUrl.searchParams.get("iniadpp_download"), "1");
  assert.equal(createdUrl.searchParams.get("iniadpp_job"), "firefox-job-1");

  const querylessTrackedTab = {
    id: created.id,
    windowId: created.windowId,
    url: "https://docs.google.com/presentation/d/e/tracked-deck/pub",
  };
  reloadBackground();
  const context = await send(
    { type: "iniadpp:pdf-job-context" },
    querylessTrackedTab
  );
  assert.deepStrictEqual(context, {
    ok: true,
    jobId: "firefox-job-1",
    deckMatches: true,
  });
  console.log("PASS: tracked queryless context survives a Firefox event-page restart");

  assert.deepStrictEqual(
    await send({ type: "iniadpp:pdf-ready", jobId: "wrong-job" }, querylessTrackedTab),
    { ok: false, error: "job-mismatch" }
  );
  assert.equal((await send({ type: "iniadpp:pdf-job-context" }, querylessTrackedTab)).ok, true);

  const windowGate = createDeferred();
  const tabGate = createDeferred();
  windowUpdateGate = windowGate.promise;
  tabUpdateGate = tabGate.promise;
  let readySettled = false;
  const readyPromise = send({
      type: "iniadpp:pdf-ready",
      jobId: context.jobId,
      filename: "deck.pdf",
    }, querylessTrackedTab).then((result) => {
      readySettled = true;
      return result;
    });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(readySettled, false, "manual-save response must wait for foregrounding");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(focusedWindows.at(-1))), {
    windowId: querylessTrackedTab.windowId,
    options: { focused: true },
  });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(activatedTabs.at(-1))), {
    tabId: querylessTrackedTab.id,
    options: { active: true },
  });
  windowGate.resolve();
  tabGate.resolve();
  windowUpdateGate = null;
  tabUpdateGate = null;
  assert.deepStrictEqual(
    await readyPromise,
    { ok: false, error: "firefox-manual-save-required" }
  );
  assert.deepStrictEqual(
    await send({ type: "iniadpp:pdf-job-context" }, querylessTrackedTab),
    { ok: false, error: "inactive-tab" }
  );
  reloadBackground();
  assert.deepStrictEqual(
    await send({ type: "iniadpp:pdf-job-context" }, querylessTrackedTab),
    { ok: false, error: "inactive-tab" }
  );
  console.log("PASS: validated ready foregrounds the tab before manual-save response and clears tracking");

  await send({ type: "iniadpp:enqueue", items: [{ url: deckUrl }] });
  const movedTab = {
    id: createdTabs[1].id,
    url: "https://docs.google.com/presentation/d/e/different-deck/pub",
  };
  const movedContext = await send({ type: "iniadpp:pdf-job-context" }, movedTab);
  assert.equal(movedContext.ok, true);
  assert.equal(movedContext.deckMatches, false);
  assert.deepStrictEqual(
    await send({
      type: "iniadpp:pdf-failed",
      jobId: movedContext.jobId,
      message: "wrong deck",
    }, movedTab),
    { ok: true }
  );
  assert.deepStrictEqual(
    await send({ type: "iniadpp:pdf-job-context" }, movedTab),
    { ok: false, error: "inactive-tab" }
  );
  console.log("PASS: failed terminal may clean a tracked tab after deck navigation");

  await send({ type: "iniadpp:enqueue", items: [{ url: deckUrl }] });
  const closingTab = createdTabs[2];
  removedListener(closingTab.id);
  assert.deepStrictEqual(
    await send({ type: "iniadpp:pdf-job-context" }, closingTab),
    { ok: false, error: "inactive-tab" }
  );
  console.log("PASS: closing a Firefox PDF tab clears its job context");

  const partialItems = [
    { url: "https://docs.google.com/presentation/d/e/partial-a/pub" },
    { url: "https://docs.google.com/presentation/d/e/partial-b/pub" },
    { url: "https://docs.google.com/presentation/d/e/partial-c/pub" },
  ];
  const createdBeforePartial = createdTabs.length;
  failCreateAt = createAttempts + 2;
  assert.deepStrictEqual(
    await send({ type: "iniadpp:enqueue", items: partialItems }),
    {
      ok: true,
      queued: 2,
      manualSave: true,
      unacceptedIndexes: [1],
      error: "partial-enqueue",
    }
  );
  failCreateAt = null;
  const partialCreatedTabs = createdTabs.slice(createdBeforePartial);
  assert.equal(partialCreatedTabs.length, 2);
  assert.equal(
    (await send({ type: "iniadpp:pdf-job-context" }, partialCreatedTabs[0])).deckMatches,
    true
  );
  assert.equal(
    (await send({ type: "iniadpp:pdf-job-context" }, partialCreatedTabs[1])).deckMatches,
    true
  );
  console.log("PASS: partial tabs.create failure reports only the unaccepted item");

  const downloadButtonSource = fs.readFileSync(
    path.resolve(__dirname, "../../../js/download-button.js"),
    "utf8"
  );
  const downloadButtonSandbox = {
    URL,
    window: { location: { href: "https://moocs.iniad.org/course" } },
    document: {},
    Set,
    console,
    $: (value) => {
      if (typeof value === "function") return undefined;
      return { on() { return this; } };
    },
  };
  vm.createContext(downloadButtonSandbox);
  vm.runInContext(downloadButtonSource, downloadButtonSandbox, {
    filename: "js/download-button.js",
  });
  const fallbackItems = downloadButtonSandbox.getUnacceptedEnqueueItems(
    partialItems,
    [1, 1, 99, -1, "0"]
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(fallbackItems)),
    [partialItems[1]]
  );
  console.log("PASS: content fallback opens only valid unique unaccepted indexes");

  startupListener();
  assert.equal(storageValues.get("iniadpp_firefox_pdf_jobs_v1"), "[]");
  assert.deepStrictEqual(
    await send({ type: "iniadpp:pdf-job-context" }, partialCreatedTabs[0]),
    { ok: false, error: "inactive-tab" }
  );
  console.log("PASS: browser startup purges persisted Firefox PDF jobs");

  storageValues.set("iniadpp_firefox_pdf_jobs_v1", JSON.stringify([{
    tabId: 321,
    jobId: "expired-job",
    url: "https://docs.google.com/presentation/d/e/expired/pub",
    createdAt: Date.now() - (3 * 60 * 60 * 1000),
  }]));
  reloadBackground();
  assert.equal(storageValues.get("iniadpp_firefox_pdf_jobs_v1"), "[]");

  storageValues.set("iniadpp_firefox_pdf_jobs_v1", "{not-json");
  reloadBackground();
  assert.equal(storageValues.has("iniadpp_firefox_pdf_jobs_v1"), false);
  console.log("PASS: expired and corrupt persisted Firefox PDF jobs are pruned on load");

  console.log("ALL PASS: Firefox tracked job-context checks");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
