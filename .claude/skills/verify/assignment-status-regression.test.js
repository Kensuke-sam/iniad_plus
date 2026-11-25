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

assert.equal(
  sandbox.hasMoocsClosedAssignmentText("現在回答を受け付けていません。"),
  true,
  "closed answer notice was missed"
);
assert.equal(
  sandbox.hasMoocsClosedAssignmentText("現在回答を受け付けています。"),
  false,
  "open answer notice was mistaken for a closed assignment"
);
assert.equal(
  sandbox.hasMoocsClosedAssignmentText(
    "説明文では「現在回答を受け付けていません。」と表示される場合があります。"
  ),
  false,
  "quoted explanatory text was mistaken for a closed assignment notice"
);

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

// MOOCs keeps its submit button after saving text answers. Only the read-only
// server receipts, with the complete problem definition, can settle the state.
function answerField(name, type = '') {
  return { getAttribute(key) { return key === 'name' ? name : key === 'type' ? type : null; }, closest() { return null; } };
}
const receiptFields = [answerField('p1'), answerField('p2'), answerField('p3')];
const savedReceipts = { p1: {data:'first answer'}, p2: {data:'second answer'}, p3: {data:'third answer'} };
assert.equal(sandbox.areMoocsProblemAnswersSaved(receiptFields, savedReceipts), true);
assert.equal(sandbox.areMoocsProblemAnswersSaved(receiptFields, {p1:savedReceipts.p1}), false, 'one saved answer must not complete three questions');
assert.equal(sandbox.areMoocsProblemAnswersSaved(receiptFields, {...savedReceipts, p2:{data:'  '}}), false, 'a blank autosave is not a submission receipt');
assert.equal(sandbox.areMoocsProblemAnswersSaved(receiptFields, {...savedReceipts, p2:null}), false);
assert.equal(sandbox.areMoocsProblemAnswersSaved([answerField('upload','file')], {upload:{file:{filename:'report.txt',filetype:'text/plain'}}}), true);
assert.equal(sandbox.areMoocsProblemAnswersSaved([answerField('upload','file')], {upload:{data:'report.txt'}}), false, 'a file name in text is not an upload receipt');
const draftField = {...answerField('p1'), value:'changed draft'};
assert.equal(sandbox.doMoocsProblemValuesMatch([draftField],savedReceipts),false,'unsaved changes must not remain green');
assert.equal(sandbox.doMoocsProblemValuesMatch([{...draftField,value:'first answer'}],savedReceipts),true);
assert.equal(sandbox.doMoocsProblemValuesMatch([{...draftField,value:'a\r\nb'}],{p1:{data:'a\nb'}}),true);
const radios = [{...answerField('choice','radio'),value:'a',checked:false},{...answerField('choice','radio'),value:'b',checked:true}];
assert.equal(sandbox.doMoocsProblemValuesMatch(radios,{choice:{data:'b'}}),true);
assert.equal(sandbox.doMoocsProblemValuesMatch(radios,{choice:{data:'a'}}),false);

(async function checkSavedAnswerApi(){
  const lessonUrl = 'https://moocs.iniad.org/courses/2026/COT202/Lecture02/02';
  const prefix = '/assignments/2026/COT202/report-02';
  const container = {getAttribute(key){return key === 'data-urlprefix' ? prefix : null;}};
  const doc = {querySelectorAll(selector){return selector === '.problem-container[data-urlprefix]' ? [container] : [];}};
  sandbox.getMoocsLessonMainText = () => '課題';
  sandbox.DOMParser = function(){this.parseFromString = html => {
    assert.equal(html,'problem fields');
    return {querySelectorAll(){return receiptFields;}};
  };};
  let receipts = savedReceipts;
  let status = 'open';
  let errorPath = '';
  let redirected = false;
  let malformed = false;
  const requests = [];
  sandbox.fetch = async (url, options) => {
    requests.push({url,options});
    const pathname = new URL(url).pathname;
    const response = {ok:pathname !== errorPath,status:pathname === errorPath ? 503 : 200,url:redirected ? 'https://moocs.iniad.org/login' : url};
    response.json = async () => {
      if(malformed) throw new SyntaxError('private response must never be logged');
      return pathname.endsWith('/status') ? {status} : pathname.endsWith('/problem') ? {html:'problem fields'} : receipts;
    };
    return response;
  };
  assert.equal(await sandbox.inspectMoocsSavedAnswers(doc,lessonUrl),'submitted','saved text answers must not need a DOM submitted label');
  assert.deepEqual(requests.map(r=>new URL(r.url).pathname).sort(),[prefix+'/answers',prefix+'/problem',prefix+'/status'].sort());
  assert(requests.every(r=>!r.options.method || r.options.method === 'GET'),'inspection must never write or submit answers');
  assert(requests.every(r=>r.options.cache === 'no-store'));
  receipts = {p1:savedReceipts.p1};
  assert.equal(await sandbox.inspectMoocsSavedAnswers(doc,lessonUrl),'submit');
  status = 'closed';
  assert.equal(await sandbox.inspectMoocsSavedAnswers(doc,lessonUrl),'none','deadline closure alone does not prove submission');
  receipts = savedReceipts;
  assert.equal(await sandbox.inspectMoocsSavedAnswers(doc,lessonUrl),'submitted');
  status = 'network';
  await assert.rejects(sandbox.inspectMoocsSavedAnswers(doc,lessonUrl),/status is unavailable/);
  status = 'open';
  errorPath = prefix+'/answers';
  await assert.rejects(sandbox.inspectMoocsSavedAnswers(doc,lessonUrl),/HTTP 503/);
  errorPath = '';
  redirected = true;
  await assert.rejects(sandbox.inspectMoocsSavedAnswers(doc,lessonUrl),/redirected/);
  redirected = false;
  malformed = true;
  await assert.rejects(sandbox.inspectMoocsSavedAnswers(doc,lessonUrl),error=>error.message === 'MOOCs returned invalid answer information.');
  malformed = false;
  const badDoc = {querySelectorAll(){return [{getAttribute(){return 'https://example.invalid/assignments/fake';}}];}};
  const beforeBad = requests.length;
  await assert.rejects(sandbox.inspectMoocsSavedAnswers(badDoc,lessonUrl),/Invalid MOOCs answer endpoint/);
  assert.equal(requests.length,beforeBad,'an untrusted endpoint must not receive a request');
  console.log('ALL PASS: saved answer receipt, draft, file, GET-only, auth and failure regressions');
})().catch(error=>{console.error(error);process.exitCode=1;});
