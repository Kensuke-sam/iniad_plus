"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../../../js/download.js"),
  "utf8"
);
const sandbox = {
  console,
  URL,
  setTimeout,
  clearTimeout,
  $: (value) => {
    if (typeof value === "function") return undefined;
    throw new Error("Unexpected jQuery access in PDF regression test");
  },
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "js/download.js" });

const createNavigator = sandbox.createPdfSlideNavigator;
const createRenderedWaiter = sandbox.createPdfRenderedSlideWaiter;
const verifyFinalBoundary = sandbox.verifyPdfFinalVisibleBoundary;
const isBoundaryIndicated = sandbox.isGoogleSlidesBoundaryIndicated;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeNavigator(state, dispatchArrow, windows = [12, 12, 12]) {
  return createNavigator({
    sleep,
    getCurrentPage: () => state.current,
    getTotalPages: () => state.total,
    expectedTotalPages: state.total,
    dispatchArrow,
    isCurrentPageRenderable: () => state.renderable !== false,
    isBoundaryIndicated: () => state.boundaryIndicated === true,
    observationWindowsMs: windows,
    pollIntervalMs: 2,
  });
}

async function rejectsWith(promise, pattern) {
  let error = null;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }
  assert(error, "expected promise to reject");
  assert.match(error.message, pattern);
}

function fakeSvg(signature) {
  return {
    signature,
    children: [{}],
    innerHTML: signature,
    getAttribute: () => "",
  };
}

function noOpObserver() {
  return { observe() {}, disconnect() {} };
}

function makeControl({
  label,
  disabled = false,
  ariaDisabled = null,
  inViewer = false,
  width = 20,
  height = 20,
  opacity = "1",
  hiddenAncestor = false,
  inertAncestor = false,
}) {
  const attributes = { "aria-label": label };
  if (ariaDisabled !== null) attributes["aria-disabled"] = ariaDisabled;
  if (disabled) attributes.disabled = "";
  const viewer = inViewer ? {} : null;
  const ancestor = hiddenAncestor || inertAncestor ? {
    hidden: hiddenAncestor,
    inert: inertAncestor,
    parentElement: null,
    _style: { display: "block", visibility: "visible", opacity: "1" },
    hasAttribute: (name) => (name === "hidden" && hiddenAncestor)
      || (name === "inert" && inertAncestor),
    getAttribute: () => null,
  } : null;
  const control = {
    disabled,
    hidden: false,
    inert: false,
    parentElement: ancestor,
    _style: { display: "block", visibility: "visible", opacity },
    closest(selector) {
      if (selector.includes("punch-viewer")) return viewer;
      if (selector.includes("button") || selector.includes("role")) return control;
      return null;
    },
    getAttribute: (name) => attributes[name] ?? null,
    hasAttribute: (name) => Object.prototype.hasOwnProperty.call(attributes, name),
    getClientRects: () => [{ width, height }],
    getBoundingClientRect: () => ({ width, height }),
  };
  return control;
}

function installBoundaryDocument({ known = [], labelled = [] }) {
  sandbox.document = {
    querySelectorAll(selector) {
      return selector === "[aria-label]" ? labelled : known;
    },
    getElementById() { return null; },
  };
  sandbox.window = {
    location: { href: "https://docs.google.com/presentation/d/e/deck/pub" },
    getComputedStyle: (element) => element._style
      || { display: "block", visibility: "visible", opacity: "1" },
  };
}

(async () => {
  {
    const state = { current: 1, total: 3, renderable: true };
    let dispatches = 0;
    const navigator = makeNavigator(state, () => {
      dispatches += 1;
      setTimeout(() => { state.current = 2; }, 18);
    });
    const result = await navigator.move(1, 1);
    assert.equal(result.status, "moved");
    assert.equal(result.page, 2);
    assert.equal(result.observationWindow, 2);
    assert.equal(dispatches, 1);
    console.log("PASS: late caption movement uses one Arrow input across observation windows");
  }

  {
    const state = {
      current: 2,
      total: 3,
      renderable: true,
      boundaryIndicated: false,
    };
    let dispatches = 0;
    const result = await makeNavigator(state, () => { dispatches += 1; }).move(2, 1);
    assert.equal(result.status, "failed");
    assert.match(result.reason, /ナビゲーションが無効/);
    assert.equal(dispatches, 1);
    console.log("PASS: a permanently missed Arrow fails and is never re-dispatched");
  }

  for (const direction of [-1, 1]) {
    const state = {
      current: 2,
      total: 3,
      renderable: true,
      boundaryIndicated: true,
    };
    let dispatches = 0;
    const result = await makeNavigator(state, () => { dispatches += 1; }, [6, 6]).move(2, direction);
    assert.equal(result.status, "boundary");
    assert.equal(result.confirmedBy, "disabled-navigation-control");
    assert.equal(dispatches, 1);
  }
  console.log("PASS: hidden leading/trailing boundaries retain safe disabled-control handling");

  {
    const state = { current: 3, total: 3, renderable: true };
    let dispatches = 0;
    const result = await makeNavigator(state, () => { dispatches += 1; }).move(3, 1);
    assert.equal(result.status, "boundary");
    assert.equal(result.confirmedBy, "page-number");
    assert.equal(dispatches, 0);
    console.log("PASS: numeric deck boundary needs no Arrow input");
  }

  {
    const known = makeControl({ label: "", disabled: true });
    installBoundaryDocument({ known: [known] });
    assert.equal(isBoundaryIndicated(1), true);

    const viewerNext = makeControl({
      label: "次のスライド",
      ariaDisabled: "true",
      inViewer: true,
    });
    installBoundaryDocument({ labelled: [viewerNext] });
    assert.equal(isBoundaryIndicated(1), true);

    const globalNext = makeControl({
      label: "Next slide",
      ariaDisabled: "true",
      inViewer: false,
    });
    installBoundaryDocument({ labelled: [globalNext] });
    assert.equal(isBoundaryIndicated(1), false);

    const playback = makeControl({
      label: "Playback",
      ariaDisabled: "true",
      inViewer: true,
    });
    installBoundaryDocument({ labelled: [playback] });
    assert.equal(isBoundaryIndicated(-1), false);

    const enabledViewerNext = makeControl({ label: "Next slide", inViewer: true });
    installBoundaryDocument({ labelled: [enabledViewerNext] });
    assert.equal(isBoundaryIndicated(1), false);

    const invisibleControls = [
      makeControl({ label: "Next slide", ariaDisabled: "true", inViewer: true, width: 0 }),
      makeControl({ label: "Next slide", ariaDisabled: "true", inViewer: true, opacity: "0" }),
      makeControl({ label: "Next slide", ariaDisabled: "true", inViewer: true, hiddenAncestor: true }),
      makeControl({ label: "Next slide", ariaDisabled: "true", inViewer: true, inertAncestor: true }),
    ];
    for (const invisible of invisibleControls) {
      installBoundaryDocument({ labelled: [invisible] });
      assert.equal(isBoundaryIndicated(1), false);
    }
    console.log("PASS: only actually visible disabled Google viewer controls prove a boundary");
  }

  {
    let clock = 0;
    const initialSvg3 = fakeSvg("same");
    const staleSvg = initialSvg3;
    const staleWaiter = createRenderedWaiter({
      sleep: async (ms) => { clock += ms; },
      now: () => clock,
      getCurrentPage: () => 1,
      getRenderedSvg: () => initialSvg3,
      getRenderedSvgSignature: (svg) => svg.signature,
      getPreviousRenderedSvg: () => initialSvg3,
      getPreviousRenderedSvgSignature: () => "same",
      createObserver: noOpObserver,
      stableMs: 100,
      timeoutMs: 5000,
      pollIntervalMs: 1000,
    });
    await rejectsWith(staleWaiter.wait(1), /新しいスライド描画/);
    assert(clock > 4500);
    console.log("PASS: caption page 1 cannot reuse the initial page 3 SVG baseline");

    clock = 0;
    const newSvg1 = fakeSvg("same");
    const replacedWaiter = createRenderedWaiter({
      sleep: async (ms) => { clock += ms; },
      now: () => clock,
      getCurrentPage: () => 1,
      getRenderedSvg: () => newSvg1,
      getRenderedSvgSignature: (svg) => svg.signature,
      getPreviousRenderedSvg: () => initialSvg3,
      getPreviousRenderedSvgSignature: () => "same",
      createObserver: noOpObserver,
      stableMs: 100,
      timeoutMs: 1000,
      pollIntervalMs: 100,
    });
    const rendered = await replacedWaiter.wait(1);
    assert.equal(rendered.svg, newSvg1);
    console.log("PASS: page 1 is accepted after replacing the page 3 baseline node");

    clock = 0;
    let advancedPage = 2;
    let advancedSvg = staleSvg;
    const skippedWaiter = createRenderedWaiter({
      sleep: async (ms) => {
        clock += ms;
        advancedPage = 3;
        advancedSvg = fakeSvg("page-3");
      },
      now: () => clock,
      getCurrentPage: () => advancedPage,
      getRenderedSvg: () => advancedSvg,
      getRenderedSvgSignature: (svg) => svg.signature,
      getPreviousRenderedSvg: () => staleSvg,
      getPreviousRenderedSvgSignature: () => "same",
      createObserver: noOpObserver,
      stableMs: 100,
      timeoutMs: 1000,
      pollIntervalMs: 100,
    });
    await rejectsWith(skippedWaiter.wait(2), /page 2.*page 3 まで進みました/);
    console.log("PASS: page 3 cannot be accepted while waiting for a fresh page 2 SVG");
  }

  {
    let clock = 0;
    let current = 2;
    let svg = fakeSvg("first-render");
    let dispatches = 1;
    const result = await verifyFinalBoundary({
      expectedPage: 2,
      expectedTotalPages: 3,
      boundaryResult: {
        status: "boundary",
        page: 2,
        confirmedBy: "disabled-navigation-control",
      },
      sleep: async (ms) => {
        clock += ms;
        svg = fakeSvg("replacement-render");
      },
      now: () => clock,
      graceMs: 20,
      pollIntervalMs: 5,
      getCurrentPage: () => current,
      getTotalPages: () => 3,
      getRenderedSvg: () => svg,
      isBoundaryIndicated: () => true,
    });
    assert.equal(result.status, "boundary");
    assert.equal(dispatches, 1);
    console.log("PASS: final grace adds no input and permits a renderable SVG replacement");

    clock = 0;
    current = 2;
    await rejectsWith(verifyFinalBoundary({
      expectedPage: 2,
      expectedTotalPages: 3,
      boundaryResult: {
        status: "boundary",
        page: 2,
        confirmedBy: "disabled-navigation-control",
      },
      sleep: async (ms) => {
        clock += ms;
        if (clock >= 10) current = 3;
      },
      now: () => clock,
      graceMs: 20,
      pollIntervalMs: 5,
      getCurrentPage: () => current,
      getTotalPages: () => 3,
      getRenderedSvg: () => svg,
      isBoundaryIndicated: () => true,
    }), /表示位置が変わりました/);
    console.log("PASS: delayed caption movement during the no-input grace is rejected");
  }

  {
    const messages = [];
    const runtime = {
      getManifest: () => ({ background: { service_worker: "js/service-worker.js" } }),
      sendMessage: async (message) => {
        messages.push(message);
        if (message.type === "iniadpp:pdf-job-context") {
          return { ok: true, jobId: "job-123" };
        }
        if (message.type === "iniadpp:pdf-ready") {
          return { ok: true, saved: true, filename: "slides.pdf" };
        }
        return { ok: true };
      },
    };
    sandbox.chrome = { runtime };
    installBoundaryDocument({});
    sandbox.alert = () => {};

    assert.equal(await sandbox.shouldStartPdfExport(), true);
    assert.equal(await sandbox.requestExport({ filename: "slides.pdf" }), "saved");
    await sandbox.notifyFailure(new Error("fixture failure"));

    assert.equal(messages.filter((m) => m.type === "iniadpp:pdf-job-context").length, 1);
    assert.equal(messages.find((m) => m.type === "iniadpp:pdf-ready").jobId, "job-123");
    assert.equal(messages.find((m) => m.type === "iniadpp:pdf-failed").jobId, "job-123");
    console.log("PASS: job context starts queryless export and is cached in ready/failed payloads");

    const genericOkMessages = [];
    sandbox.chrome = { runtime: {
      getManifest: runtime.getManifest,
      sendMessage: async (message) => {
        genericOkMessages.push(message);
        if (message.type === "iniadpp:pdf-job-context") {
          return { ok: true, jobId: "job-generic-ok", deckMatches: true };
        }
        return { ok: true };
      },
    } };
    assert.equal(await sandbox.requestExport({ filename: "not-saved.pdf" }), "failed");
    assert(genericOkMessages.some((m) => m.type === "iniadpp:pdf-ready"));
    console.log("PASS: a generic ok terminal response is not mistaken for a saved PDF");

    const transientContextMessages = [];
    let transientContextAttempts = 0;
    sandbox.chrome = { runtime: {
      getManifest: runtime.getManifest,
      sendMessage: async (message) => {
        transientContextMessages.push(message);
        if (message.type === "iniadpp:pdf-job-context") {
          transientContextAttempts += 1;
          if (transientContextAttempts === 1) return { ok: false, error: "temporary" };
          return { ok: true, jobId: "job-after-retry", deckMatches: true };
        }
        if (message.type === "iniadpp:pdf-ready") {
          return { ok: true, saved: true, filename: "retry.pdf" };
        }
        return { ok: true };
      },
    } };
    assert.equal(await sandbox.shouldStartPdfExport(), true);
    assert.equal(await sandbox.requestExport({ filename: "retry.pdf" }), "saved");
    assert.equal(transientContextAttempts, 2);
    assert.equal(
      transientContextMessages.find((m) => m.type === "iniadpp:pdf-ready").jobId,
      "job-after-retry"
    );
    console.log("PASS: a transient job-context failure is retried and not cached");

    const mismatchMessages = [];
    sandbox.chrome = { runtime: {
      getManifest: runtime.getManifest,
      sendMessage: async (message) => {
        mismatchMessages.push(message);
        if (message.type === "iniadpp:pdf-job-context") {
          return { ok: true, jobId: "job-wrong-deck", deckMatches: false };
        }
        return { ok: false, error: "job-aborted" };
      },
    } };
    assert.equal(await sandbox.shouldStartPdfExport(), false);
    assert.equal(await sandbox.requestExport({ filename: "wrong-deck.pdf" }), "failed");
    assert.equal(mismatchMessages.filter((m) => m.type === "iniadpp:pdf-failed").length, 1);
    assert.equal(mismatchMessages.find((m) => m.type === "iniadpp:pdf-failed").jobId, "job-wrong-deck");
    assert.equal(mismatchMessages.some((m) => m.type === "iniadpp:pdf-ready"), false);
    console.log("PASS: deck mismatch aborts once with jobId and never starts ready export");

    const failedMessages = [];
    sandbox.chrome = { runtime: {
      getManifest: runtime.getManifest,
      sendMessage: async (message) => {
        failedMessages.push(message);
        return { ok: false, error: "wrong-deck" };
      },
    } };
    assert.equal(await sandbox.requestExport({ filename: "unsafe.pdf" }), "failed");
    assert.equal(failedMessages.some((m) => m.type === "iniadpp:pdf-ready"), false);
    console.log("PASS: missing job context never sends an unsafe auto-save terminal message");

    const trackedFirefoxMessages = [];
    const trackedFirefoxRuntime = {
      getManifest: () => ({ background: { scripts: ["firefox/background.js"] } }),
      sendMessage: async (message) => {
        trackedFirefoxMessages.push(message);
        if (message.type === "iniadpp:pdf-job-context") {
          return { ok: true, jobId: "firefox-tracked-job", deckMatches: true };
        }
        return { ok: false, error: "firefox-manual-save-required" };
      },
    };
    sandbox.browser = { runtime: trackedFirefoxRuntime };
    assert.equal(await sandbox.shouldStartPdfExport(), true);
    assert.equal(await sandbox.requestExport({ filename: "tracked-firefox.pdf" }), "manual");
    assert.equal(
      trackedFirefoxMessages.find((m) => m.type === "iniadpp:pdf-ready").jobId,
      "firefox-tracked-job"
    );

    const unrelatedFirefoxMessages = [];
    sandbox.browser = { runtime: {
      getManifest: trackedFirefoxRuntime.getManifest,
      sendMessage: async (message) => {
        unrelatedFirefoxMessages.push(message);
        return { ok: false, error: "inactive-tab" };
      },
    } };
    assert.equal(await sandbox.shouldStartPdfExport(), false);
    assert.equal(unrelatedFirefoxMessages.some((m) => m.type === "iniadpp:pdf-ready"), false);
    console.log("PASS: only tracked queryless Firefox tabs start the manual PDF flow");

    const firefoxMessages = [];
    const firefoxRuntime = {
      getManifest: () => ({ background: { scripts: ["firefox/background.js"] } }),
      sendMessage: async (message) => {
        firefoxMessages.push(message);
        if (message.type === "iniadpp:pdf-job-context") return undefined;
        if (message.type === "iniadpp:pdf-ready") {
          return { ok: false, error: "firefox-manual-save-required" };
        }
        return { ok: false, error: "pdf-generation-failed" };
      },
    };
    sandbox.browser = { runtime: firefoxRuntime };
    assert.equal(await sandbox.requestExport({ filename: "firefox.pdf" }), "manual");
    await sandbox.notifyFailure(new Error("firefox fixture failure"));
    const firefoxReady = firefoxMessages.find((m) => m.type === "iniadpp:pdf-ready");
    const firefoxFailed = firefoxMessages.find((m) => m.type === "iniadpp:pdf-failed");
    assert(firefoxReady);
    assert(firefoxFailed);
    assert.equal(Object.prototype.hasOwnProperty.call(firefoxReady, "jobId"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(firefoxFailed, "jobId"), false);
    console.log("PASS: Firefox unsupported context preserves its legacy manual-ready flow");
    delete sandbox.browser;

    let manualMessages = 0;
    sandbox.chrome = { runtime: {
      getManifest: () => ({}),
      sendMessage: async () => { manualMessages += 1; },
    } };
    assert.equal(await sandbox.requestExport({ filename: "manual.pdf" }), "manual");
    assert.equal(manualMessages, 0);
    console.log("PASS: background-free builds retain the manual-save path");
  }

  assert.match(source, /current !== null && current >= 1 && current <= total/);
  assert.doesNotMatch(source, /identicalSlideFallback/);
  console.log("ALL PASS: PDF navigation, render, and job-context regression checks");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
