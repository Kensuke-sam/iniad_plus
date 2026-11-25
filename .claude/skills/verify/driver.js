"use strict";
const https = require("https");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const PORT = 8443;
const REPO = "/Users/hanesoubukensuke/Documents/myapps/iniad_plus";
const HERE = __dirname;
const TLS_DIR = process.env.TLS_DIR || HERE;
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || HERE;
const LESSON_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const ASSIGNMENT_STATE_STORAGE_KEY = "iniadppAssignmentStates:v6";
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

// ---- fixture server ----------------------------------------------------
const state = {
  p1: "unsubmitted",
  p3: "unsubmitted",
  failPage: null,
  responseDelayMs: 0,
  slowFetchPage: null,
  slowFetchRemaining: 0,
};
const requestLog = [];

function shell(body, lessonNumbers) {
  const links = (lessonNumbers || LESSON_NUMBERS)
    .map((n) => `<li><a href="/lesson/${n}">${n}</a></li>`)
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>cs_test lesson</title></head>
<body class="skin-green">
<div class="wrapper"><div class="content-wrapper">
<section class="content-header"><h1>cs_test: Lesson</h1></section>
<section class="content">
<ul class="pagination">${links}</ul>
${body}
</section></div></div></body></html>`;
}

function pageBody(n) {
  if (n === 1) {
    if (state.p1 === "submitted") {
      return `<div class="box"><p>課題0: 回答を提出してください。</p>
<form action="/dummy" onsubmit="return false"><textarea name="answer"></textarea>
<p>状態: 提出済み</p><button type="button">提出</button></form></div>`;
    }
    return `<div class="box"><p>課題0: 問題を開いて回答してください。</p>
<form action="/dummy" onsubmit="return false"><input type="file" name="draft">
<p>途中ファイル: アップロード済み</p><span id="p1actions"></span></form></div>
<script>setTimeout(function(){var button=document.createElement("button");button.type="button";button.textContent="問題を開く";document.getElementById("p1actions").appendChild(button);},2500);</script>`;
  }
  if (n === 2)
    return `<div class="box"><p>課題1: レポートを提出してください。</p>
<form action="/dummy" onsubmit="return false"><textarea name="answer"></textarea>
<p>状態: 提出済み</p><button type="button">提出</button></form></div>`;
  if (n === 3) {
    const mark = state.p3 === "submitted" ? "提出済み" : "未提出";
    return `<div class="box"><p>課題2: 回答を提出してください。</p>
<form action="/dummy" onsubmit="return false"><textarea name="answer"></textarea>
<p>状態: ${mark}</p><button type="button">提出</button></form></div>`;
  }
  if (n === 4)
    return `<div class="box"><p>課題3: ファイルをアップロードしてください。</p>
<form action="/dummy" onsubmit="return false"><input type="file" name="f">
<p id="p4status">状態: しばらくお待ちください</p><button type="button">アップロード</button></form></div>
<script>setTimeout(function(){document.getElementById("p4status").textContent="状態: アップロード済み";},2500);</script>`;
  if (n === 5)
    return `<div class="box"><p>出席確認: 本日の出席を登録してください。</p>
<form action="/dummy" onsubmit="return false"><label><input type="radio" name="a" value="1">はい</label>
<button type="button">送信</button></form></div>`;
  if (n === 6)
    return `<p>参考資料のページです。</p>
<button type="button" hidden>提出</button>
<button type="button" aria-hidden="true">送信</button>
<button type="button" style="display:none">アップロード</button>
<button type="button" style="width:0;height:0;padding:0;border:0;overflow:hidden">提出</button>
<button type="button" style="opacity:0">送信</button>
<div style="display:none"><button type="button">アップロード</button></div>
<div inert><button type="button">Submit</button></div>
<button type="button" disabled>Submit</button>
<button type="button" class="start-answer" hidden>問題を開く</button>`;
  if (n === 7)
    return `<div class="box"><p>課題4: 問題を開いて最終回答を提出してください。</p>
<form action="/dummy" onsubmit="return false"><input type="file" name="draft">
<p>途中ファイル: アップロード済み</p>
<button type="button">問題を開く</button>
<button type="button" class="submit-answer">最終提出</button></form></div>`;
  if (n === 8)
    return `<div class="box"><p>課題5: 2つのファイルを提出してください。</p>
<form action="/dummy" onsubmit="return false"><input type="file" name="done">
<p>ファイルA: アップロード済み</p><input type="file" name="pending">
<p>File B:</p><span>Not yet submitted / Not-submitted</span>
<button type="button">アップロード</button></form></div>`;
  if (n === 9)
    return `<div class="box"><p>課題6: 問題を開いて回答してください。</p>
<form action="/dummy" onsubmit="return false"><input type="file" name="draft">
<p>途中ファイル: アップロード済み</p><span id="p9actions"></span></form></div>
<script>setTimeout(function(){var button=document.createElement("button");button.type="button";button.textContent="問題を開く";document.getElementById("p9actions").appendChild(button);},2500);</script>`;
  if (n === 10)
    return `<div id="p10root" class="box"><p>出席確認: 読み込み中です。</p>
<form action="/dummy" onsubmit="return false"><label><input type="radio" name="late-attendance" value="1">はい</label>
<button type="button">送信</button></form></div>
<script>setTimeout(function(){document.getElementById("p10root").innerHTML="<p>参考資料のページです。</p>";},2500);</script>`;
  if (n === 11)
    return `<div class="box"><div class="alert alert-warning">現在回答を受け付けていません。</div>
<h2>小テスト / Mini Quiz 1</h2><form action="/dummy" onsubmit="return false">
<label>1. <input type="text" name="answer1" value="int64" readonly></label>
<label>2. <input type="text" name="answer2" value="3, 2, 1" readonly></label>
<p>回答は自動的に記録されますが、最後に「提出」ボタンをクリックして提出を確認してください。</p>
<button type="submit">提出</button></form></div>`;
  if (n === 12)
    return `<div class="box"><p>説明文では「現在回答を受け付けていません。」と表示される場合があります。</p>
<div class="alert alert-warning" hidden aria-hidden="true">現在回答を受け付けていません。</div>
<div class="alert alert-warning" style="width:0;height:0;overflow:hidden;padding:0;border:0">現在回答を受け付けていません。</div>
<h2>課題7</h2><form action="/dummy" onsubmit="return false">
<textarea name="answer"></textarea><p>状態: 未提出</p><button type="submit">提出</button></form></div>`;
  if (n === 13)
    return `<div class="box"><div class="alert alert-warning">現在回答を受け付けていません。</div>
<h2>課題8</h2><form action="/dummy" onsubmit="return false">
<textarea name="answer" readonly>提出した回答</textarea><p>状態: 提出済み</p>
<button type="submit">提出</button></form></div>`;
  if (n === 14)
    return `<div class="box"><div class="alert alert-warning">現在回答を受け付けていません。</div>
<h2>課題9</h2><form action="/dummy" onsubmit="return false">
<textarea name="answer" readonly>提出した回答</textarea><p id="p14status">状態: 処理中</p>
<button type="submit">提出</button></form></div>
<script>setTimeout(function(){document.getElementById("p14status").textContent="状態: 提出済み";},2500);</script>`;
  return `<div class="box"><div class="alert alert-warning">現在回答を受け付けていません。</div>
<h2>課題10</h2><form action="/dummy" onsubmit="return false">
<textarea name="answer" readonly>提出した回答</textarea><p id="p15status">状態: 処理中</p>
<button type="submit">提出</button></form></div>
<script>setTimeout(function(){document.getElementById("p15status").textContent="状態: 提出済み";},2500);</script>`;
}

const server = https.createServer(
  {
    key: fs.readFileSync(path.join(TLS_DIR, "key.pem")),
    cert: fs.readFileSync(path.join(TLS_DIR, "cert.pem")),
  },
  (req, res) => {
    const m = req.url.match(/^\/lesson\/(\d+)$/);
    requestLog.push({ t: Date.now(), url: req.url, destination: req.headers["sec-fetch-dest"] || "" });
    if (m) {
      const pageNumber = Number(m[1]);
      const isFetchRequest = (req.headers["sec-fetch-dest"] || "") === "empty";
      const respond = () => {
        if (state.failPage === pageNumber) {
          res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
          res.end("fixture unavailable");
          return;
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(shell(pageBody(pageNumber), pageNumber === 15 ? [15] : LESSON_NUMBERS));
      };
      if (isFetchRequest && state.slowFetchPage === pageNumber && state.slowFetchRemaining > 0) {
        state.slowFetchRemaining -= 1;
        setTimeout(respond, 2700);
      } else if (state.responseDelayMs > 0) setTimeout(respond, state.responseDelayMs);
      else respond();
      return;
    }
    if (req.url === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
);

// ---- helpers -----------------------------------------------------------
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
}

async function sampleDashboard(page) {
  return page.evaluate(() => {
    const dash = document.getElementById("iniadpp-assignment-dashboard");
    if (!dash) return null;
    const counts = {};
    ["attendance", "submit", "submitted", "pending"].forEach((k) => {
      const el = dash.querySelector(`[data-count="${k}"]`);
      counts[k] = el ? el.textContent : "?";
    });
    const badges = {};
    document
      .querySelectorAll(".pagination li[data-iniadpp-assignment-state]")
      .forEach((li) => {
        badges[li.textContent.trim()] = li.getAttribute(
          "data-iniadpp-assignment-state"
        );
      });
    return { counts, badges };
  });
}

async function sampleRefreshUi(page) {
  return page.evaluate(() => {
    const dashboard = document.getElementById("iniadpp-assignment-dashboard");
    const button = dashboard && dashboard.querySelector(".iniadpp-assignment-dashboard__refresh");
    const notice = dashboard && dashboard.querySelector(".iniadpp-assignment-dashboard__notice");
    const results = dashboard && dashboard.querySelector(".iniadpp-assignment-dashboard__list");
    const icon = button && button.querySelector(".fa-refresh");
    return {
      dashboardLive: dashboard && dashboard.getAttribute("aria-live"),
      resultsBusy: results && results.getAttribute("aria-busy"),
      buttonBusy: button && button.getAttribute("aria-busy"),
      disabled: !!(button && button.disabled),
      spinning: !!(icon && icon.classList.contains("iniadpp-assignment-dashboard__refresh-icon--spinning")),
      notice: notice && !notice.hidden ? notice.textContent.trim() : "",
    };
  });
}

async function watch(page, ms, stepMs) {
  const t0 = Date.now();
  const timeline = [];
  while (Date.now() - t0 < ms) {
    const s = await sampleDashboard(page);
    if (s) timeline.push({ at: Date.now() - t0, ...s });
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return timeline;
}

function firstAt(timeline, pageNo, state) {
  const hit = timeline.find((s) => s.badges[String(pageNo)] === state);
  return hit ? hit.at : null;
}

function lessonRequestsSince(t) {
  return requestLog.filter((r) => r.t >= t && /^\/lesson\//.test(r.url)).length;
}

function lessonFetchRequestsSince(t) {
  return requestLog.filter((r) =>
    r.t >= t && /^\/lesson\//.test(r.url) && r.destination === "empty"
  ).length;
}

async function waitForCondition(predicate, timeoutMs, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForLessonRequestQuiescence(quietMs, timeoutMs) {
  const startedAt = Date.now();
  let quietStartedAt = startedAt;
  let previousCount = lessonRequestsSince(0);

  while (Date.now() - startedAt < timeoutMs) {
    const currentCount = lessonRequestsSince(0);
    if (currentCount !== previousCount) {
      previousCount = currentCount;
      quietStartedAt = Date.now();
    } else if (Date.now() - quietStartedAt >= quietMs) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timed out waiting for lesson request quiescence");
}

// ---- main --------------------------------------------------------------
let browser = null;
(async () => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, resolve);
  });
  const chromeDir = process.env.BROWSERS_DIR || path.join(HERE, "browsers");
  const found = fs
    .readdirSync(path.join(chromeDir, "chrome"))
    .find((d) => d.startsWith("mac"));
  const appDir = fs
    .readdirSync(path.join(chromeDir, "chrome", found))
    .find((d) => d.includes("chrome-"));
  const exe = path.join(
    chromeDir, "chrome", found, appDir,
    "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
  );

  browser = await puppeteer.launch({
    executablePath: exe,
    headless: process.env.HEADFUL ? false : true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${REPO}`,
      `--load-extension=${REPO}`,
      "--host-resolver-rules=MAP moocs.iniad.org 127.0.0.1",
      "--ignore-certificate-errors",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  const page = await browser.newPage();
  const dialogs = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  const attachPageDiagnostics = (targetPage) => {
    targetPage.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
    targetPage.on("console", (msg) => {
      const location = msg.location();
      const entry = { text: msg.text(), url: location && location.url ? location.url : "" };
      if (msg.type() === "error") consoleErrors.push(entry);
      if (msg.type() === "warn") consoleWarnings.push(entry);
    });
    targetPage.on("pageerror", (error) => { pageErrors.push(error.message || String(error)); });
  };
  attachPageDiagnostics(page);

  // ---- Phase 1: cold load ----
  console.log("\n== Phase 1: cold load ==");
  await page.goto("https://moocs.iniad.org:8443/lesson/1", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const wrapper = document.createElement("div");
    wrapper.id = "fixture-memo-wrapper";
    wrapper.className = "mymemo-contents";
    wrapper.innerHTML = '<textarea class="textarea-mymemo">memo fixture</textarea>';
    document.body.appendChild(wrapper);
  });
  const memoCounterCheck = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 1300));
    return page.evaluate(() => {
      const wrapper = document.getElementById("fixture-memo-wrapper");
      const memo = wrapper && wrapper.querySelector(".textarea-mymemo");
      const hasCounter = !!(memo && memo.nextElementSibling && memo.nextElementSibling.id === "iniadppwordcnt");
      if (wrapper) wrapper.remove();
      return !hasCounter;
    });
  })();
  const tl1 = await watch(page, 19000, 150);
  const fin1 = tl1[tl1.length - 1];
  console.log("final:", JSON.stringify(fin1));
  check("dashboard appeared", tl1.length > 0);
  check("textarea counter ignores extension memo fields on initial scan", await memoCounterCheck);
  const p1submittedAt = firstAt(tl1, 1, "submitted");
  const p1submitAt = firstAt(tl1, 1, "submit");
  check("P1 current page waits for delayed 問題を開く without false 提出済み",
    fin1.badges["1"] === "submit" && p1submittedAt === null && p1submitAt !== null,
    `submitted@${p1submittedAt}ms submit@${p1submitAt}ms final=${fin1.badges["1"]}`);
  const p2submittedAt = firstAt(tl1, 2, "submitted");
  check("P2 submitted waits for final rendered verification",
    fin1.badges["2"] === "submitted" && p2submittedAt !== null && p2submittedAt >= 4000,
    `at ${p2submittedAt}ms`);
  check("P3 unsubmitted", fin1.badges["3"] === "submit", `at ${firstAt(tl1, 3, "submit")}ms`);
  const p4submitAt = firstAt(tl1, 4, "submit");
  const p4submittedAt = firstAt(tl1, 4, "submitted");
  check("P4 ambiguous state never flashes 未提出 before 提出済み",
    p4submitAt === null && p4submittedAt !== null,
    `submit@${p4submitAt}ms submitted@${p4submittedAt}ms`);
  const p5attendanceAt = firstAt(tl1, 5, "attendance");
  check("P5 attendance waits for final rendered verification",
    fin1.badges["5"] === "attendance" && p5attendanceAt !== null && p5attendanceAt >= 4000,
    `at ${p5attendanceAt}ms`);
  check("P6 hidden/disabled/zero-size/transparent controls ignored",
    fin1.badges["6"] === "none", `p6=${fin1.badges["6"]}`);
  check("P7 visible 問題を開く wins over アップロード済み",
    fin1.badges["7"] === "submit", `p7=${fin1.badges["7"]}`);
  check("P8 mixed submitted/unsubmitted stays unsubmitted",
    fin1.badges["8"] === "submit", `p8=${fin1.badges["8"]}`);
  const p9submittedAt = firstAt(tl1, 9, "submitted");
  const p9submitAt = firstAt(tl1, 9, "submit");
  check("P9 never flashes 提出済み before delayed 未提出",
    p9submittedAt === null && p9submitAt !== null,
    `submitted@${p9submittedAt}ms submit@${p9submitAt}ms`);
  const p10attendanceAt = firstAt(tl1, 10, "attendance");
  check("P10 transient attendance never flashes green",
    p10attendanceAt === null && fin1.badges["10"] === "none",
    `attendance@${p10attendanceAt}ms final=${fin1.badges["10"]}`);
  const p11submitAt = firstAt(tl1, 11, "submit");
  const p11submittedAt = firstAt(tl1, 11, "submitted");
  const p11attendanceAt = firstAt(tl1, 11, "attendance");
  check("P11 closed 小テスト with filled answers and visible submit stays excluded without status flash",
    fin1.badges["11"] === "none" && p11submitAt === null &&
      p11submittedAt === null && p11attendanceAt === null,
    `submit@${p11submitAt}ms submitted@${p11submittedAt}ms attendance@${p11attendanceAt}ms final=${fin1.badges["11"]}`);
  const p12noneAt = firstAt(tl1, 12, "none");
  check("P12 quoted text and hidden stale closed alert keep the actionable form unsubmitted",
    fin1.badges["12"] === "submit" && p12noneAt === null,
    `none@${p12noneAt}ms final=${fin1.badges["12"]}`);
  const p13noneAt = firstAt(tl1, 13, "none");
  const p13submitAt = firstAt(tl1, 13, "submit");
  check("P13 closed assignment with explicit 提出済み is submitted without status flash",
    fin1.badges["13"] === "submitted" && p13noneAt === null && p13submitAt === null,
    `none@${p13noneAt}ms submit@${p13submitAt}ms final=${fin1.badges["13"]}`);
  const p14noneAt = firstAt(tl1, 14, "none");
  const p14submitAt = firstAt(tl1, 14, "submit");
  const p14submittedAt = firstAt(tl1, 14, "submitted");
  check("P14 closed assignment waits for delayed 提出済み without none/submit flash",
    fin1.badges["14"] === "submitted" && p14noneAt === null &&
      p14submitAt === null && p14submittedAt !== null,
    `none@${p14noneAt}ms submit@${p14submitAt}ms submitted@${p14submittedAt}ms final=${fin1.badges["14"]}`);
  check("pending count 0 at end", fin1.counts.pending === "0");
  const p3At = firstAt(tl1, 3, "submit");
  check("true-unsubmitted resolves < 4500ms (old impl was >5200ms)", p3At !== null && p3At < 4500, `${p3At}ms`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "cold.png") });

  const ss = await page.evaluate((key) => sessionStorage.getItem(key), ASSIGNMENT_STATE_STORAGE_KEY);
  const ssObj = ss ? JSON.parse(ss) : {};
  const ssStates = {};
  Object.keys(ssObj).forEach((u) => { ssStates[u.replace(/^.*\/lesson\//, "")] = ssObj[u].state; });
  console.log("sessionStorage:", JSON.stringify(ssStates));
  check("sessionStorage has all fixture pages",
    LESSON_NUMBERS.map(String).every((k) => ssStates[k]),
    JSON.stringify(ssStates));
  check("sessionStorage P4 corrected to submitted", ssStates["4"] === "submitted", ssStates["4"]);
  const closedFixtureStates = { 11: "none", 12: "submit", 13: "submitted", 14: "submitted" };
  check("sessionStorage caches closed and stale-alert fixtures with their final states",
    Object.entries(closedFixtureStates).every(([pageNumber, expected]) => ssStates[pageNumber] === expected),
    JSON.stringify(Object.fromEntries(Object.keys(closedFixtureStates).map((pageNumber) => [pageNumber, ssStates[pageNumber]]))));

  // ---- Phase 1b: current closed page waits for its delayed final state ----
  console.log("\n== Phase 1b: current closed page render settling ==");
  const currentClosedPage = await browser.newPage();
  attachPageDiagnostics(currentClosedPage);
  await currentClosedPage.goto("https://moocs.iniad.org:8443/lesson/15", { waitUntil: "domcontentloaded" });
  const currentClosedTimeline = await watch(currentClosedPage, 7000, 100);
  const currentClosedFinal = currentClosedTimeline[currentClosedTimeline.length - 1];
  const currentClosedCache = await currentClosedPage.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key) || "{}"),
    ASSIGNMENT_STATE_STORAGE_KEY
  );
  const p15noneAt = firstAt(currentClosedTimeline, 15, "none");
  const p15submitAt = firstAt(currentClosedTimeline, 15, "submit");
  const p15attendanceAt = firstAt(currentClosedTimeline, 15, "attendance");
  check("P15 current closed assignment waits for delayed 提出済み without false final state",
    currentClosedFinal && currentClosedFinal.badges["15"] === "submitted" &&
      p15noneAt === null && p15submitAt === null && p15attendanceAt === null &&
      currentClosedCache["https://moocs.iniad.org:8443/lesson/15"]?.state === "submitted",
    `none@${p15noneAt}ms submit@${p15submitAt}ms attendance@${p15attendanceAt}ms final=${currentClosedFinal && currentClosedFinal.badges["15"]}`);

  await currentClosedPage.reload({ waitUntil: "domcontentloaded" });
  const currentClosedWarmTimeline = await watch(currentClosedPage, 3200, 50);
  const currentClosedWarmFirst = currentClosedWarmTimeline[0];
  check("P15 warm reload preserves the correct submitted cache without pending regression",
    currentClosedWarmFirst && currentClosedWarmFirst.badges["15"] === "submitted" &&
      currentClosedWarmTimeline.every((sample) => sample.badges["15"] === "submitted"),
    `states=${JSON.stringify([...new Set(currentClosedWarmTimeline.map((sample) => sample.badges["15"]))])}`);

  await currentClosedPage.evaluate((key) => {
    const cache = JSON.parse(sessionStorage.getItem(key) || "{}");
    cache[location.href] = { state: "submit", at: Date.now() };
    sessionStorage.setItem(key, JSON.stringify(cache));
  }, ASSIGNMENT_STATE_STORAGE_KEY);
  await currentClosedPage.reload({ waitUntil: "domcontentloaded" });
  const currentClosedStaleTimeline = await watch(currentClosedPage, 7000, 50);
  const currentClosedStaleFirst = currentClosedStaleTimeline[0];
  const currentClosedStaleFinal = currentClosedStaleTimeline[currentClosedStaleTimeline.length - 1];
  check("P15 warm reload clears only a stale submit cache while awaiting delayed submitted state",
    currentClosedStaleFirst && currentClosedStaleFirst.badges["15"] === "pending" &&
      firstAt(currentClosedStaleTimeline, 15, "pending") !== null &&
      currentClosedStaleTimeline.every((sample) =>
        sample.badges["15"] === "pending" || sample.badges["15"] === "submitted") &&
      firstAt(currentClosedStaleTimeline, 15, "submit") === null &&
      firstAt(currentClosedStaleTimeline, 15, "none") === null &&
      currentClosedStaleFinal && currentClosedStaleFinal.badges["15"] === "submitted",
    `first=${currentClosedStaleFirst && currentClosedStaleFirst.badges["15"]} pending@${firstAt(currentClosedStaleTimeline, 15, "pending")}ms submit@${firstAt(currentClosedStaleTimeline, 15, "submit")}ms none@${firstAt(currentClosedStaleTimeline, 15, "none")}ms final=${currentClosedStaleFinal && currentClosedStaleFinal.badges["15"]}`);
  await currentClosedPage.close();

  // ---- Phase 2: warm reload ----
  console.log("\n== Phase 2: warm reload (instant display from cache) ==");
  await page.reload({ waitUntil: "domcontentloaded" });
  const tl2 = await watch(page, 6000, 50);
  const first2 = tl2[0];
  console.log("first sample:", JSON.stringify(first2));
  check("warm: states visible immediately (first sample non-pending)",
    first2 && first2.badges["1"] === "submit" && first2.badges["2"] === "submitted" &&
    first2.badges["3"] === "submit" && first2.badges["4"] === "submitted" &&
    first2.badges["5"] === "attendance" && first2.badges["6"] === "none" &&
    first2.badges["7"] === "submit" && first2.badges["8"] === "submit" &&
    first2.badges["9"] === "submit" && first2.badges["10"] === "none" &&
    first2.badges["11"] === "none" && first2.badges["12"] === "submit" &&
    first2.badges["13"] === "submitted" && first2.badges["14"] === "submitted",
    `at ${first2 && first2.at}ms: ${JSON.stringify(first2 && first2.badges)}`);
  check("warm: cached states render within 1 second",
    first2 && first2.at < 1000, `${first2 && first2.at}ms`);
  const regressed = tl2.some((s) =>
    LESSON_NUMBERS.map(String).some((k) => s.badges[k] === "pending"));
  check("warm: never regresses to 確認中", !regressed);
  if (first2 && first2.at < 1500) await page.screenshot({ path: path.join(ARTIFACT_DIR, "warm.png") });

  // ---- Phase 2b: submit-triggered timer survives passive focus events ----
  console.log("\n== Phase 2b: submit timer vs focus/visibility ==");
  await waitForLessonRequestQuiescence(1200, 10000);
  const t2b = Date.now();
  setTimeout(() => { state.p1 = "submitted"; }, 1200);
  await page.evaluate(() => {
    document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await new Promise((r) => setTimeout(r, 1000));
  const earlySubmitTimerReqs = lessonRequestsSince(t2b);
  check("submit timer: passive events do not pull 2.5s refresh forward",
    earlySubmitTimerReqs === 0, `${earlySubmitTimerReqs} lesson requests in first 1s`);
  await new Promise((r) => setTimeout(r, 3000));
  const submitTimerReqs = lessonRequestsSince(t2b);
  check("submit timer: scheduled refresh still fires",
    submitTimerReqs >= LESSON_NUMBERS.length - 1,
    `${submitTimerReqs} lesson requests after scheduled refresh`);
  await page.waitForFunction(() => {
    const button = document.querySelector(".iniadpp-assignment-dashboard__refresh");
    return button && !button.disabled;
  }, { timeout: 35000 });
  const afterCurrentSubmit = await sampleDashboard(page);
  check("submit timer: current page is refreshed from server state",
    afterCurrentSubmit.badges["1"] === "submitted",
    `p1=${afterCurrentSubmit.badges["1"]}`);
  const currentCache = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) || "{}"), ASSIGNMENT_STATE_STORAGE_KEY);
  check("submit timer: refreshed current state is cached",
    currentCache["https://moocs.iniad.org:8443/lesson/1"]?.state === "submitted",
    JSON.stringify(currentCache["https://moocs.iniad.org:8443/lesson/1"] || null));

  // ---- Phase 3: submit on P3 then manual refresh ----
  console.log("\n== Phase 3: P3 becomes submitted -> refresh button ==");
  state.p3 = "submitted";
  const t3 = Date.now();
  await page.click(".iniadpp-assignment-dashboard__refresh");
  await new Promise((r) => setTimeout(r, 80));
  const loadingUi = await sampleRefreshUi(page);
  check("refresh UI: disabled + aria-busy + spinner while loading",
    loadingUi.disabled && loadingUi.resultsBusy === "true" && loadingUi.dashboardLive === null &&
    loadingUi.buttonBusy === "true" && loadingUi.spinning,
    JSON.stringify(loadingUi));
  check("refresh UI: loading notice says previous results remain visible",
    /前回の結果/.test(loadingUi.notice), loadingUi.notice);

  // disabled 属性だけに頼らず、合成 click が届いても同じ in-flight Promise を返すことを確認する
  await page.evaluate(() => {
    const button = document.querySelector(".iniadpp-assignment-dashboard__refresh");
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await new Promise((r) => setTimeout(r, 500));
  const duplicateFetches = lessonFetchRequestsSince(t3);
  check("refresh UI: rapid repeat is deduped to one fetch batch",
    duplicateFetches === LESSON_NUMBERS.length,
    `${duplicateFetches} fetches (expected ${LESSON_NUMBERS.length})`);

  const tl3Promise = watch(page, 10500, 100);
  await page.waitForFunction(() => {
    const button = document.querySelector(".iniadpp-assignment-dashboard__refresh");
    return button && !button.disabled;
  }, { timeout: 35000 });
  const tl3 = await tl3Promise;
  const p3newAt = firstAt(tl3, 3, "submitted");
  const p3pending = tl3.some((s) => s.badges["3"] === "pending");
  check("P3 flips to 提出済み after refresh", p3newAt !== null, `at ${p3newAt}ms`);
  check("P3 shows stale 未提出 (not 確認中) while re-checking", !p3pending);
  const successUi = await sampleRefreshUi(page);
  check("refresh UI: success reenables button and clears busy state",
    !successUi.disabled && successUi.resultsBusy === "false" && successUi.dashboardLive === null &&
    successUi.buttonBusy === "false" && /最新の結果/.test(successUi.notice),
    JSON.stringify(successUi));
  const totalManualRefreshFetches = lessonFetchRequestsSince(t3);
  check("refresh UI: repeated manual click does not schedule a trailing batch",
    totalManualRefreshFetches === LESSON_NUMBERS.length,
    `${totalManualRefreshFetches} fetches (expected ${LESSON_NUMBERS.length})`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "after-submit.png") });

  // ---- Phase 4: focus storm coalescing ----
  console.log("\n== Phase 4: focus/visibility storm coalescing ==");
  const t4 = Date.now();
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    }
  });
  await new Promise((r) => setTimeout(r, 1200));
  const stormFetches = lessonFetchRequestsSince(t4);
  check("storm: repeated passive events coalesce to one fetch batch",
    stormFetches === LESSON_NUMBERS.length,
    `${stormFetches} fetches (expected ${LESSON_NUMBERS.length})`);
  await page.waitForFunction(() => {
    const button = document.querySelector(".iniadpp-assignment-dashboard__refresh");
    return button && !button.disabled;
  }, { timeout: 35000 });

  // ---- Phase 4b: action timer during an active scan schedules exactly one trailing scan ----
  console.log("\n== Phase 4b: submit action schedules one trailing refresh ==");
  state.slowFetchPage = 5;
  state.slowFetchRemaining = 1;
  const t4b = Date.now();
  await page.click(".iniadpp-assignment-dashboard__refresh");
  await new Promise((resolve) => setTimeout(resolve, 100));
  await page.evaluate(() => {
    document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await waitForCondition(
    () => lessonFetchRequestsSince(t4b) >= LESSON_NUMBERS.length * 2,
    35000,
    "the trailing lesson fetch batch"
  );
  await page.waitForFunction(() => {
    const button = document.querySelector(".iniadpp-assignment-dashboard__refresh");
    return button && !button.disabled;
  }, { timeout: 35000 });
  const trailingFetches = lessonFetchRequestsSince(t4b);
  check("submit timer: active scan is followed by exactly one trailing fetch batch",
    trailingFetches === LESSON_NUMBERS.length * 2,
    `${trailingFetches} fetches (expected ${LESSON_NUMBERS.length * 2})`);
  state.slowFetchPage = null;
  state.slowFetchRemaining = 0;

  // ---- Phase 5: partial refresh failure ----
  console.log("\n== Phase 5: refresh failure preserves previous results ==");
  state.failPage = 8;
  await page.click(".iniadpp-assignment-dashboard__refresh");
  await page.waitForFunction(() => {
    const button = document.querySelector(".iniadpp-assignment-dashboard__refresh");
    return button && !button.disabled;
  }, { timeout: 35000 });
  state.failPage = null;
  const failureUi = await sampleRefreshUi(page);
  check("refresh failure: explicit previous-results notice",
    !failureUi.disabled && failureUi.resultsBusy === "false" &&
    /再読み込みできませんでした/.test(failureUi.notice) && /前回の結果/.test(failureUi.notice),
    JSON.stringify(failureUi));
  const fin5 = await sampleDashboard(page);
  check("refresh failure: previous state is preserved without pending regression",
    fin5.badges["1"] === "submitted" && fin5.badges["2"] === "submitted" &&
    fin5.badges["3"] === "submitted" && fin5.badges["4"] === "submitted" &&
    fin5.badges["5"] === "attendance" && fin5.badges["6"] === "none" &&
    fin5.badges["7"] === "submit" && fin5.badges["8"] === "submit" &&
    fin5.badges["9"] === "submit" && fin5.badges["10"] === "none" &&
    fin5.badges["11"] === "none" && fin5.badges["12"] === "submit" &&
    fin5.badges["13"] === "submitted" && fin5.badges["14"] === "submitted" &&
    fin5.counts.pending === "0",
    JSON.stringify(fin5.badges));

  // ---- Phase 6: failure with neither cache nor rendered previous state ----
  console.log("\n== Phase 6: refresh failure without previous state ==");
  await page.evaluate((cacheKey) => {
    sessionStorage.removeItem(cacheKey);
    document.querySelectorAll(".pagination li").forEach((li) => {
      li.removeAttribute("data-iniadpp-assignment-state");
      Array.from(li.classList).forEach((className) => {
        if (className.indexOf("iniadpp-assignment-tab-") === 0) li.classList.remove(className);
      });
    });
  }, ASSIGNMENT_STATE_STORAGE_KEY);
  state.failPage = 8;
  await page.click(".iniadpp-assignment-dashboard__refresh");
  await new Promise((resolve) => setTimeout(resolve, 80));
  const noPreviousLoadingUi = await sampleRefreshUi(page);
  check("refresh loading: no-cache state does not claim an old result is displayed",
    noPreviousLoadingUi.resultsBusy === "true" &&
    /結果を確認しています/.test(noPreviousLoadingUi.notice) &&
    !/前回の結果/.test(noPreviousLoadingUi.notice),
    JSON.stringify(noPreviousLoadingUi));
  await page.waitForFunction(() => {
    const button = document.querySelector(".iniadpp-assignment-dashboard__refresh");
    return button && !button.disabled;
  }, { timeout: 35000 });
  state.failPage = null;
  const noPreviousFailureUi = await sampleRefreshUi(page);
  const fin6 = await sampleDashboard(page);
  check("refresh failure: no-cache notice does not claim an old result is displayed",
    /前回の結果がないページ/.test(noPreviousFailureUi.notice) &&
    !/失敗したページは前回の結果/.test(noPreviousFailureUi.notice),
    noPreviousFailureUi.notice);
  check("refresh failure: page without a previous state is marked 未確認",
    fin6.badges["8"] === "unknown" && fin6.counts.pending === "1",
    JSON.stringify(fin6));

  // ---- wrap up ----
  console.log("\n== dialogs ==", JSON.stringify(dialogs));
  console.log("== console errors ==", JSON.stringify(consoleErrors.slice(0, 10)));
  console.log("== console warnings ==", JSON.stringify(consoleWarnings.slice(0, 10)));
  console.log("== page errors ==", JSON.stringify(pageErrors));
  const isExpectedFixture503 = (entry) => {
    const source = `${entry.text} ${entry.url}`;
    return /\b503\b/.test(entry.text) && /\/lesson\/8(?:\b|[?#])/.test(source);
  };
  const isExpectedInspectionWarning = (entry) =>
    /\[INIAD Plus\] Failed to inspect lesson tab:.*\/lesson\/8\b.*HTTP 503/.test(entry.text);
  const expectedConsoleErrors = consoleErrors.filter(isExpectedFixture503);
  const unexpectedConsoleErrors = consoleErrors.filter((entry) => !isExpectedFixture503(entry));
  const expectedConsoleWarnings = consoleWarnings.filter(isExpectedInspectionWarning);
  const unexpectedConsoleWarnings = consoleWarnings.filter((entry) => !isExpectedInspectionWarning(entry));
  check("browser: no unexpected dialogs", dialogs.length === 0, JSON.stringify(dialogs));
  check("browser: expected fixture 503 console errors were observed",
    expectedConsoleErrors.length === 2, JSON.stringify(expectedConsoleErrors));
  check("browser: no unexpected console errors",
    unexpectedConsoleErrors.length === 0, JSON.stringify(unexpectedConsoleErrors));
  check("browser: expected failure warnings were observed",
    expectedConsoleWarnings.length === 2, JSON.stringify(expectedConsoleWarnings));
  check("browser: no unexpected console warnings",
    unexpectedConsoleWarnings.length === 0, JSON.stringify(unexpectedConsoleWarnings));
  check("browser: no uncaught page errors", pageErrors.length === 0, JSON.stringify(pageErrors));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== ${failed.length === 0 ? "ALL PASS" : failed.length + " FAILED"} (${results.length} checks) =====`);

  await browser.close();
  browser = null;
  await new Promise((resolve) => server.close(resolve));
  process.exitCode = failed.length === 0 ? 0 : 1;
})().catch(async (e) => {
  console.error("DRIVER ERROR:", e);
  if (browser) {
    try { await browser.close(); } catch (closeError) { console.error("BROWSER CLOSE ERROR:", closeError); }
    browser = null;
  }
  if (server.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
  process.exitCode = 2;
});
