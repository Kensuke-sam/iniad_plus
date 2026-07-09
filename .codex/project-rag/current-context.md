# Current Context: INIAD Plus - MOOCs PDF Helper

- project root: `/Users/hanesoubukensuke/Documents/myapps/iniad_plus`
- external-brain lane: `school_or_course_repo`
- seed status: `seeded`
- detected stack: browser extension (Chrome Manifest V3 / Firefox package scripts)
- verified current state: local repository and generated package artifacts checked on 2026-07-04; no live store submission status verified

## Stable Seed Signals

- `README.md` (doc): heading=INIAD Plus - MOOCs PDF Helper. <div align="center"> <img src="img/iniadpp128.png" width="96" alt="INIAD Plus icon"> **INIAD MOOCs の認可済み講義スライドを学習用 PDF として保存しやすくする Chrome / Firefox 拡張** [![GitHub](https://img.shields.io/badge/source-GitHub-181717?logo=github)](https://github.com/Kensuke-sam/iniad_plus)
- `manifest.json` (manifest:web): name=INIAD Plus - MOOCs PDF Helper; version=1.4.7; description includes PDF 作成, 課題・出席確認, Drive 資料検索
- `docs/chrome-web-store.md` (doc): heading=Chrome Web Store 提出メモ. Chrome Web Store 向け ZIP は「印刷用 PDF 作成補助」「課題・出席まとめ」「Drive 資料検索」の 3 機能に絞り、権限なし・background なしの構成にする。
- `docs/firefox-addons.md` (doc): heading=Firefox Add-ons 提出メモ. INIAD Plus を Firefox Add-ons に提出するときに、そのまま転記しやすい情報をまとめたメモです。 - 拡張機能名: `INIAD Plus - MOOCs PDF Helper` - 短縮名: `INIAD Plus` - 推奨カテゴリ: `教育` または `仕事効率化`
- `docs/privacy.md` (doc): heading=プライバシー説明. Drive 資料検索はユーザークリック時だけ Google Drive 検索 URL を開き、拡張機能は Drive 内容や検索結果を読み取らず保存・送信もしない。

## Work Log

- 2026-07-03: Restored the course-list `ドライブで探す` path for packaged builds by including `js/drive_buttons.js` in the Web Store package, hardening insertion after course buttons, bumping manifest version to 1.4.6, and regenerating local Chrome/Firefox ZIPs for verification.
- 2026-07-04: Changed assignment summary checks to use fresh scans and rendered hidden-frame inspection for pages whose static HTML still looks unsubmitted, so dynamic `アップロード済み` status can be detected without manually opening each tab.
- 2026-07-09: Sped up assignment summary reflection: last known states persist in sessionStorage and show instantly instead of 確認中, hidden-frame inspection resolves on DOM-quiet (1.2s) with a 4.5s late-correction watch instead of always waiting 4.5s, iframe concurrency capped at 3 with early slot release, stale-generation inspections are cancelled, pageshow refresh limited to bfcache restores with a 10s deferring throttle, and the current page gets its own render-settle watcher so premature verdicts are not cached.

## Next Actions

- Add links to Notion/GitHub/deployment/live sources only when they are safe and useful.
- Keep volatile current state out of global memory unless it becomes a durable rule.
