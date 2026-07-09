"use strict";
const https = require("https");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const PORT = 8443;
const REPO = "/Users/hanesoubukensuke/Documents/myapps/iniad_plus";
const HERE = __dirname;

// ---- fixture server ----------------------------------------------------
const state = { p3: "unsubmitted" };
const requestLog = [];

function shell(body) {
  const links = [1, 2, 3, 4, 5, 6]
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
  if (n === 1) return `<p>このページは講義スライドのみです。</p>`;
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
  return `<p>参考資料のページです。</p>`;
}

const server = https.createServer(
  {
    key: fs.readFileSync(path.join(HERE, "key.pem")),
    cert: fs.readFileSync(path.join(HERE, "cert.pem")),
  },
  (req, res) => {
    const m = req.url.match(/^\/lesson\/(\d+)$/);
    requestLog.push({ t: Date.now(), url: req.url });
    if (m) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(shell(pageBody(Number(m[1]))));
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

// ---- main --------------------------------------------------------------
(async () => {
  server.listen(PORT);
  const chromeDir = path.join(HERE, "browsers");
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

  const browser = await puppeteer.launch({
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
  page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

  // ---- Phase 1: cold load ----
  console.log("\n== Phase 1: cold load ==");
  await page.goto("https://moocs.iniad.org:8443/lesson/1", { waitUntil: "domcontentloaded" });
  const tl1 = await watch(page, 10000, 150);
  const fin1 = tl1[tl1.length - 1];
  console.log("final:", JSON.stringify(fin1));
  check("dashboard appeared", tl1.length > 0);
  check("P2 static submitted", fin1.badges["2"] === "submitted", `at ${firstAt(tl1, 2, "submitted")}ms`);
  check("P3 unsubmitted", fin1.badges["3"] === "submit", `at ${firstAt(tl1, 3, "submit")}ms`);
  const p4submitAt = firstAt(tl1, 4, "submit");
  const p4submittedAt = firstAt(tl1, 4, "submitted");
  check("P4 provisional 未提出 then corrected to 提出済み",
    p4submitAt !== null && p4submittedAt !== null && p4submitAt < p4submittedAt,
    `submit@${p4submitAt}ms -> submitted@${p4submittedAt}ms`);
  check("P5 attendance", fin1.badges["5"] === "attendance");
  check("P1/P6 none", fin1.badges["1"] === "none" && fin1.badges["6"] === "none",
    `p1=${fin1.badges["1"]} p6=${fin1.badges["6"]}`);
  check("pending count 0 at end", fin1.counts.pending === "0");
  const p3At = firstAt(tl1, 3, "submit");
  check("true-unsubmitted resolves < 4500ms (old impl was >5200ms)", p3At !== null && p3At < 4500, `${p3At}ms`);
  await page.screenshot({ path: path.join(HERE, "cold.png") });

  const ss = await page.evaluate(() => sessionStorage.getItem("iniadppAssignmentStates"));
  const ssObj = ss ? JSON.parse(ss) : {};
  const ssStates = {};
  Object.keys(ssObj).forEach((u) => { ssStates[u.replace(/^.*\/lesson\//, "")] = ssObj[u].state; });
  console.log("sessionStorage:", JSON.stringify(ssStates));
  check("sessionStorage has all 6 pages",
    ["1", "2", "3", "4", "5", "6"].every((k) => ssStates[k]),
    JSON.stringify(ssStates));
  check("sessionStorage P4 corrected to submitted", ssStates["4"] === "submitted", ssStates["4"]);

  // ---- Phase 2: warm reload ----
  console.log("\n== Phase 2: warm reload (instant display from cache) ==");
  await page.reload({ waitUntil: "domcontentloaded" });
  const tl2 = await watch(page, 6000, 50);
  const first2 = tl2[0];
  console.log("first sample:", JSON.stringify(first2));
  check("warm: states visible immediately (first sample non-pending)",
    first2 && first2.badges["2"] === "submitted" && first2.badges["3"] === "submit" &&
    first2.badges["4"] === "submitted" && first2.badges["5"] === "attendance",
    `at ${first2 && first2.at}ms: ${JSON.stringify(first2 && first2.badges)}`);
  const regressed = tl2.some((s) =>
    ["2", "3", "4", "5"].some((k) => s.badges[k] === "pending"));
  check("warm: never regresses to 確認中", !regressed);
  if (first2 && first2.at < 1500) await page.screenshot({ path: path.join(HERE, "warm.png") });

  // ---- Phase 3: submit on P3 then manual refresh ----
  console.log("\n== Phase 3: P3 becomes submitted -> refresh button ==");
  state.p3 = "submitted";
  const t3 = Date.now();
  await page.click(".iniadpp-assignment-dashboard__refresh");
  const tl3 = await watch(page, 5000, 100);
  const p3newAt = firstAt(tl3, 3, "submitted");
  const p3pending = tl3.some((s) => s.badges["3"] === "pending");
  check("P3 flips to 提出済み after refresh", p3newAt !== null, `at ${p3newAt}ms`);
  check("P3 shows stale 未提出 (not 確認中) while re-checking", !p3pending);
  await page.screenshot({ path: path.join(HERE, "after-submit.png") });

  // ---- Phase 4: focus storm throttle (defer, not drop) ----
  console.log("\n== Phase 4: focus/visibility storm within 10s throttle ==");
  const reqBefore = lessonRequestsSince(0);
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    }
  });
  await new Promise((r) => setTimeout(r, 2500));
  const stormReqs = lessonRequestsSince(0) - reqBefore;
  check("storm: no immediate rescan burst (throttled)", stormReqs === 0, `${stormReqs} lesson fetches in 2.5s`);
  // deferred single scan should fire once the 10s window (from phase-3 refresh) elapses
  const waitMs = Math.max(0, 10000 - (Date.now() - t3)) + 3000;
  await new Promise((r) => setTimeout(r, waitMs));
  const deferredReqs = lessonRequestsSince(0) - reqBefore;
  check("storm: deferred rescan fired exactly once after window",
    deferredReqs >= 4 && deferredReqs <= 6, `${deferredReqs} lesson fetches (expect 5: pages 2-6)`);

  // ---- Phase 5: rapid double refresh ----
  console.log("\n== Phase 5: double-click refresh ==");
  await page.click(".iniadpp-assignment-dashboard__refresh");
  await new Promise((r) => setTimeout(r, 300));
  await page.click(".iniadpp-assignment-dashboard__refresh");
  const tl5 = await watch(page, 7000, 200);
  const fin5 = tl5[tl5.length - 1];
  check("double refresh: final states correct",
    fin5.badges["2"] === "submitted" && fin5.badges["3"] === "submitted" &&
    fin5.badges["4"] === "submitted" && fin5.badges["5"] === "attendance" &&
    fin5.counts.pending === "0",
    JSON.stringify(fin5.badges));

  // ---- wrap up ----
  console.log("\n== dialogs ==", JSON.stringify(dialogs));
  console.log("== console errors ==", JSON.stringify(consoleErrors.slice(0, 10)));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== ${failed.length === 0 ? "ALL PASS" : failed.length + " FAILED"} (${results.length} checks) =====`);

  await browser.close();
  server.close();
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => { console.error("DRIVER ERROR:", e); process.exit(2); });
