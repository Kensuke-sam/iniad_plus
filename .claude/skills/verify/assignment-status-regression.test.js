"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../../../js/moocs_assignment_tabs.js"),
  "utf8"
);

const sandbox = {
  AbortSignal,
  Map,
  MutationObserver: function MutationObserver(){},
  Promise,
  Set,
  URL,
  console,
  document: {},
  window: {
    location: {
      hostname: "example.invalid",
      href: "https://example.invalid/lesson/1",
      origin: "https://example.invalid",
    },
  },
  $: (value) => {
    if (typeof value === "function") return undefined;
    return { on() { return this; } };
  },
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "js/moocs_assignment_tabs.js" });

const actualUnsubmitted = [
  "状態: 未提出",
  "状態: 未回答です",
  "ファイル: 未アップロード",
  "Status: unsubmitted",
  "Status: Not yet submitted",
  "Status: Not-submitted",
];

for (const text of actualUnsubmitted) {
  assert.equal(
    sandbox.hasMoocsUnsubmittedMark(text),
    true,
    `actual unsubmitted state was missed: ${text}`
  );
}

const explanatoryText = [
  "未提出の場合は0点です",
  "未提出時は採点されません",
  "未提出の課題は0点です",
  "未提出では0点です",
  "未提出は評価対象外です",
  "未提出のまま期限を過ぎた場合",
  "未提出者へ連絡します",
  "未提出なら再提出してください",
  "未回答の学生は確認してください",
];

for (const text of explanatoryText) {
  assert.equal(
    sandbox.hasMoocsUnsubmittedMark(text),
    false,
    `explanatory text was mistaken for a state: ${text}`
  );
}

for (const text of [
  "未提出の課題は0点です。状態: 提出済み",
  "未提出では0点です。状態: 提出済み",
  "未提出は評価対象外です。ファイル: アップロード済み",
]) {
  assert.equal(
    sandbox.hasMoocsSubmittedMark(text),
    true,
    `submitted mark was masked by explanatory text: ${text}`
  );
}

console.log("ALL PASS: assignment status wording regression checks");
