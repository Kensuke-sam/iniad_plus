$(function(){
    if(window.location.hostname !== "moocs.iniad.org") return;

    markMoocsAssignmentTabs();
    setTimeout(markMoocsAssignmentTabs, 800);
    watchCurrentMoocsLessonRendering();
});

const iniadppAssignmentDashboardId = "iniadpp-assignment-dashboard";
const iniadppAssignmentClassPrefix = "iniadpp-assignment-tab-";
const iniadppAssignmentStateClasses = [
    iniadppAssignmentClassPrefix + "pending",
    iniadppAssignmentClassPrefix + "attendance",
    iniadppAssignmentClassPrefix + "submit",
    iniadppAssignmentClassPrefix + "submitted",
    iniadppAssignmentClassPrefix + "unknown"
].join(" ");
const iniadppLessonClassificationCache = {};
const iniadppLessonClassificationGeneration = {};
let iniadppAssignmentScanVersion = 0;
const iniadppAssignmentStateStorageKey = "iniadppAssignmentStates:v6";
const iniadppAssignmentStateCacheTtlMs = 30 * 60 * 1000;
const iniadppLessonFetchTimeoutMs = 15 * 1000;
const iniadppRenderedInspectionQuietMs = 1200;
const iniadppRenderedInspectionDebounceMs = 150;
const iniadppRenderedInspectionMaxWaitMs = 4500;
const iniadppRenderedInspectionTimeoutMs = 7000;
const iniadppRenderedInspectionMaxConcurrent = 3;
let iniadppRenderedInspectionActiveCount = 0;
const iniadppRenderedInspectionQueue = [];
let iniadppAssignmentAutoRefreshTimer = null;
let iniadppAssignmentAutoRefreshNeedsTrailingScan = false;
let iniadppAssignmentForcedRefreshPromise = null;
let iniadppAssignmentTrailingForcedRefreshRequested = false;
const iniadppAutoRefreshMinIntervalMs = 10 * 1000;
let iniadppLastForcedScanAt = 0;
let iniadppCurrentLessonSettled = false;
let iniadppCurrentLessonWatcherStop = null;
let iniadppCurrentLessonRemoteScanVersion = 0;

function markMoocsAssignmentTabs(forceReload){
    // 初期表示の800ms再走査を含め、強制更新中に別世代の走査を始めて結果を無効化しない
    if(iniadppAssignmentForcedRefreshPromise !== null){
        return iniadppAssignmentForcedRefreshPromise;
    }

    const tabItems = collectMoocsLessonTabs();
    if(!tabItems.length) return Promise.resolve({ failures: [] });

    // 強制再読込のときだけ破棄する。無条件に消すと初期表示の二重スキャンで確認中の結果まで捨ててしまう
    if(forceReload === true){
        iniadppLastForcedScanAt = Date.now();
        clearMoocsLessonClassificationCache();
    }

    const scanVersion = ++iniadppAssignmentScanVersion;
    renderMoocsAssignmentDashboard(tabItems);

    tabItems.forEach(function(item){
        // 前回の判定結果があれば先に表示し、再確認のたびに「確認中」へ戻さない
        const cachedState = readCachedMoocsAssignmentState(item.url);
        const renderedState = getReusableMoocsAssignmentState(item.$li.attr("data-iniadpp-assignment-state"));
        let previousState = cachedState || renderedState;
        if(previousState === "submit" &&
            isCurrentMoocsLessonUrl(item.url) &&
            hasMoocsClosedSubmissionScopes(document)){
            // 受付終了へ切り替わった直後だけ、以前の「未提出」を初期表示に再利用しない。
            previousState = "";
        }
        item.hadPreviousState = !!previousState;
        updateMoocsLessonTabState(item, previousState || "pending");
    });

    if(forceReload === true){
        setMoocsAssignmentRefreshState("loading", {
            hasPreviousState: tabItems.some(function(item){ return item.hadPreviousState === true; })
        });
    }

    const inspections = tabItems.map(function(item){
        return classifyMoocsLessonTab(item.url, forceReload === true)
            .then(function(kind){
                if(scanVersion !== iniadppAssignmentScanVersion){
                    return { ok: true, stale: true };
                }
                const state = kind || "none";
                const isClosedCurrentPageSettling = state === "none" &&
                    isCurrentMoocsLessonUrl(item.url) &&
                    hasMoocsClosedSubmissionScopes(document);
                const isWaitingForCurrentPageRendering = forceReload !== true &&
                    isCurrentMoocsLessonUrl(item.url) &&
                    !iniadppCurrentLessonSettled &&
                    (state === "attendance" ||
                        state === "submitted" ||
                        (state === "submit" && !hasMoocsDefinitiveUnsubmittedState(document)) ||
                        isClosedCurrentPageSettling);
                if(isWaitingForCurrentPageRendering){
                    // 現在ページは遅延描画で提出状態が変わることがある。
                    // 明示的な未提出状態でない色付き判定は、watcher の最終確認まで前回結果または「確認中」を維持する。
                    if(isClosedCurrentPageSettling && item.state === "submit"){
                        // 受付終了前の「未提出」だけを捨て、正しい提出済み・対象外キャッシュは維持する。
                        updateMoocsLessonTabState(item, "pending");
                        updateMoocsAssignmentDashboard();
                    }
                    return { ok: true, pendingRenderedVerification: true };
                }
                // 現在ページは動的描画が終わる前の判定を保存すると誤りが固定されるため、描画静止後の watcher に任せる
                if(forceReload === true || !isCurrentMoocsLessonUrl(item.url) || iniadppCurrentLessonSettled){
                    writeCachedMoocsAssignmentState(item.url, state);
                }
                updateMoocsLessonTabState(item, state);
                updateMoocsAssignmentDashboard();
                return { ok: true };
            })
            .catch(function(error){
                if(scanVersion !== iniadppAssignmentScanVersion){
                    return { ok: false, stale: true, hadPreviousState: item.hadPreviousState };
                }
                if(!item.state || item.state === "pending"){
                    // 前回の結果を表示中なら、通信失敗で「未確認」へ戻さない
                    updateMoocsLessonTabState(item, "unknown");
                }
                updateMoocsAssignmentDashboard();
                console.warn("[INIAD Plus] Failed to inspect lesson tab:", item.url, error);
                return { ok: false, hadPreviousState: item.hadPreviousState };
            });
    });

    updateMoocsAssignmentDashboard();

    const scanPromise = Promise.all(inspections).then(function(results){
        return {
            failures: results.filter(function(result){
                return result && result.ok === false && result.stale !== true;
            })
        };
    });

    if(forceReload !== true){
        return scanPromise;
    }

    const refreshResultPromise = scanPromise.then(function(summary){
        if(summary.failures.length){
            const allHavePreviousState = summary.failures.every(function(failure){
                return failure.hadPreviousState === true;
            });
            setMoocsAssignmentRefreshState("error", {
                allHavePreviousState: allHavePreviousState
            });
        } else {
            setMoocsAssignmentRefreshState("success");
        }
        return summary;
    }, function(error){
        console.warn("[INIAD Plus] Failed to refresh assignment dashboard:", error);
        const allHavePreviousState = tabItems.every(function(item){
            return item.hadPreviousState === true;
        });
        setMoocsAssignmentRefreshState("error", { allHavePreviousState: allHavePreviousState });
        return { failures: [{ hadPreviousState: allHavePreviousState }] };
    });

    iniadppAssignmentForcedRefreshPromise = refreshResultPromise.then(function(summary){
        finishMoocsForcedRefresh();
        return summary;
    }, function(error){
        // 表示更新側で例外が起きても in-flight ロックを残さず、次の再読込を可能にする。
        console.warn("[INIAD Plus] Assignment refresh completion failed:", error);
        try {
            setMoocsAssignmentRefreshState("error", {
                allHavePreviousState: tabItems.every(function(item){ return item.hadPreviousState === true; })
            });
        } catch(ignoredError){
            // UI自体が壊れていてもロック解放は続行する
        }
        finishMoocsForcedRefresh();
        return { failures: [{ hadPreviousState: false, error: error }] };
    });

    return iniadppAssignmentForcedRefreshPromise;
}

function finishMoocsForcedRefresh(){
    const needsTrailingScan = iniadppAssignmentTrailingForcedRefreshRequested;
    iniadppAssignmentTrailingForcedRefreshRequested = false;
    iniadppAssignmentForcedRefreshPromise = null;

    if(needsTrailingScan){
        // 完了ハンドラ内で同じPromiseを再取得しないよう、次のtaskで1回だけ追走する。
        window.setTimeout(function(){
            if(iniadppAssignmentForcedRefreshPromise === null){
                markMoocsAssignmentTabs(true);
            }
        }, 0);
    }
}

function clearMoocsLessonClassificationCache(){
    Object.keys(iniadppLessonClassificationCache).forEach(function(key){
        delete iniadppLessonClassificationCache[key];
    });
}

function readMoocsAssignmentStateCache(){
    try {
        const raw = window.sessionStorage.getItem(iniadppAssignmentStateStorageKey);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch(error){
        return {};
    }
}

function readCachedMoocsAssignmentState(url){
    const entry = readMoocsAssignmentStateCache()[url];
    if(!entry || typeof entry.state !== "string" || typeof entry.at !== "number") return "";
    if(Date.now() - entry.at > iniadppAssignmentStateCacheTtlMs) return "";
    return entry.state;
}

function writeCachedMoocsAssignmentState(url, state){
    // 未確定の状態を残すと次回表示で誤った初期値になるため確定状態だけ保存する
    if(state === "pending" || state === "unknown") return;
    try {
        const cache = readMoocsAssignmentStateCache();
        cache[url] = { state: state, at: Date.now() };
        window.sessionStorage.setItem(iniadppAssignmentStateStorageKey, JSON.stringify(cache));
    } catch(error){
        // sessionStorage が使えない環境では前回結果の即時表示だけを諦める
    }
}

function hasMoocsConflictingCachedState(url){
    const cachedState = readCachedMoocsAssignmentState(url);
    return cachedState === "submitted" || cachedState === "attendance";
}

function applyMoocsLateAssignmentClassification(url, generation, kind){
    // 先行確定後の補正なので、より新しい判定が始まっていたら適用しない
    if(iniadppLessonClassificationGeneration[url] !== generation) return;

    iniadppLessonClassificationCache[url] = Promise.resolve(kind);

    const state = kind || "none";
    writeCachedMoocsAssignmentState(url, state);

    const $dashboard = $("#" + iniadppAssignmentDashboardId);
    const tabItems = $dashboard.data("tabItems") || [];
    let touched = false;

    tabItems.forEach(function(item){
        if(item.url !== url) return;
        updateMoocsLessonTabState(item, state);
        touched = true;
    });

    if(touched){
        updateMoocsAssignmentDashboard();
    }
}

function getReusableMoocsAssignmentState(state){
    if(typeof state !== "string") return "";
    return ["attendance", "submit", "submitted", "none"].indexOf(state) !== -1 ? state : "";
}

function scheduleMoocsAssignmentAutoRefresh(delayMs, options){
    const needsTrailingScan = !!(options && options.ensureTrailingScan);
    iniadppAssignmentAutoRefreshNeedsTrailingScan =
        iniadppAssignmentAutoRefreshNeedsTrailingScan || needsTrailingScan;

    if(iniadppAssignmentAutoRefreshTimer !== null){
        window.clearTimeout(iniadppAssignmentAutoRefreshTimer);
    }

    iniadppAssignmentAutoRefreshTimer = window.setTimeout(function(){
        iniadppAssignmentAutoRefreshTimer = null;
        const shouldEnsureTrailingScan = iniadppAssignmentAutoRefreshNeedsTrailingScan;
        iniadppAssignmentAutoRefreshNeedsTrailingScan = false;
        if(iniadppAssignmentForcedRefreshPromise !== null){
            if(shouldEnsureTrailingScan){
                iniadppAssignmentTrailingForcedRefreshRequested = true;
            }
            return;
        }
        markMoocsAssignmentTabs(true);
    }, delayMs);
}

function scheduleMoocsAssignmentAutoRefreshIfStale(delayMs){
    // focus / visibilitychange は受動的な再確認なので、提出起点などの既存予約を前倒し・後ろ倒ししない
    if(iniadppAssignmentAutoRefreshTimer !== null) return;

    // ウィンドウ切替のたびに全タブを再取得するとサーバー負荷と枠の奪い合いで反映がむしろ遅くなるため間隔を空ける。
    // ただし破棄すると別タブでの提出が反映されないままになるため、間隔明けまで遅延して1回だけ実行する
    const sinceForcedMs = Date.now() - iniadppLastForcedScanAt;
    if(sinceForcedMs < iniadppAutoRefreshMinIntervalMs){
        const deferredDelayMs = Math.max(delayMs, iniadppAutoRefreshMinIntervalMs - sinceForcedMs);
        scheduleMoocsAssignmentAutoRefresh(deferredDelayMs);
        return;
    }
    scheduleMoocsAssignmentAutoRefresh(delayMs);
}

function watchCurrentMoocsLessonRendering(){
    // 提出操作のたびに監視を張り直し、遅れて変わる現在ページの状態も取りこぼさない
    if(typeof iniadppCurrentLessonWatcherStop === "function"){
        iniadppCurrentLessonWatcherStop();
    }

    const url = normalizeMoocsUrl(window.location.href);
    const remoteScanVersion = iniadppCurrentLessonRemoteScanVersion;
    let observer = null;
    let quietTimerId = null;
    let capTimerId = null;
    let stopped = false;

    iniadppCurrentLessonSettled = false;

    function isStale(){
        return remoteScanVersion !== iniadppCurrentLessonRemoteScanVersion;
    }

    function stop(){
        if(stopped) return;
        stopped = true;
        if(observer){
            observer.disconnect();
            observer = null;
        }
        if(quietTimerId !== null){
            window.clearTimeout(quietTimerId);
            quietTimerId = null;
        }
        if(capTimerId !== null){
            window.clearTimeout(capTimerId);
            capTimerId = null;
        }
        if(iniadppCurrentLessonWatcherStop === stop){
            iniadppCurrentLessonWatcherStop = null;
            iniadppCurrentLessonSettled = true;
        }
    }

    iniadppCurrentLessonWatcherStop = stop;

    function scheduleQuietRecheck(){
        if(stopped) return;
        if(isStale()){
            stop();
            return;
        }
        if(quietTimerId !== null) window.clearTimeout(quietTimerId);
        quietTimerId = window.setTimeout(function(){
            quietTimerId = null;
            if(isStale()){
                stop();
                return;
            }
            applyCurrentMoocsLessonState(url, false);
        }, iniadppRenderedInspectionQuietMs);
    }

    try {
        observer = new MutationObserver(scheduleQuietRecheck);
        observer.observe(document, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["class", "style", "hidden", "inert", "aria-hidden", "disabled", "aria-disabled"]
        });
    } catch(error){
        observer = null;
    }

    capTimerId = window.setTimeout(function(){
        capTimerId = null;
        if(isStale()){
            stop();
            return;
        }
        applyCurrentMoocsLessonState(url, true);
        stop();
    }, iniadppRenderedInspectionMaxWaitMs);

    scheduleQuietRecheck();
}

function applyCurrentMoocsLessonState(url, isFinal){
    let kind = "";
    try {
        kind = classifyMoocsLessonDocument(document);
    } catch(error){
        console.warn("[INIAD Plus] Failed to inspect current lesson rendering:", error);
        return false;
    }
    const state = kind || "none";
    const isClosedCurrentPageSettling = state === "none" && hasMoocsClosedSubmissionScopes(document);
    const $dashboard = $("#" + iniadppAssignmentDashboardId);
    const tabItems = $dashboard.data("tabItems") || [];
    if(isFinal !== true && (
        state === "attendance" ||
        state === "submitted" ||
        (state === "submit" && !hasMoocsDefinitiveUnsubmittedState(document)) ||
        isClosedCurrentPageSettling
    )){
        // 遅延描画の途中結果を先に出すと、出席・未提出・提出済みの色が現れたり消えたりする。
        // 明示的な未提出以外の色付き判定は監視上限まで確定を保留する。
        if(isClosedCurrentPageSettling){
            let resetStaleSubmit = false;
            tabItems.forEach(function(item){
                if(item.url !== url || item.state !== "submit") return;
                updateMoocsLessonTabState(item, "pending");
                resetStaleSubmit = true;
            });
            if(resetStaleSubmit){
                updateMoocsAssignmentDashboard();
            }
        }
        return false;
    }
    // 明示的な未提出は先に確定できる。それ以外は最終判定だけ保存する。
    if(isFinal === true || state === "submit"){
        writeCachedMoocsAssignmentState(url, state);
    }

    let touched = false;

    tabItems.forEach(function(item){
        if(item.url !== url || item.state === state) return;
        updateMoocsLessonTabState(item, state);
        touched = true;
    });

    if(touched){
        updateMoocsAssignmentDashboard();
    }
    return true;
}

function collectMoocsLessonTabs(){
    const items = [];
    const seen = {};

    $(".pagination li").each(function(){
        const $li = $(this);
        const $link = $li.children("a").first();
        const label = ($link.length ? $link.text() : $li.text()).replace(/\s+/g, "").trim();

        if(!/^\d+$/.test(label)) return;

        const rawHref = $link.attr("href");
        const url = resolveMoocsTabUrl(rawHref);
        if(!url || seen[url]) return;

        seen[url] = true;
        items.push({ $li: $li, label: label, url: url });
    });

    return items;
}

function updateMoocsLessonTabState(item, state){
    const normalizedState = state || "none";
    item.state = normalizedState;
    item.$li
        .removeClass(iniadppAssignmentStateClasses)
        .attr("data-iniadpp-assignment-state", normalizedState);

    if(normalizedState !== "none"){
        item.$li.addClass(iniadppAssignmentClassPrefix + normalizedState);
    }
}

function renderMoocsAssignmentDashboard(tabItems){
    let $dashboard = $("#" + iniadppAssignmentDashboardId);
    if(!$dashboard.length){
        $dashboard = $(buildMoocsAssignmentDashboardHtml());
        const $target = $(".content-header").first();
        if($target.length){
            $target.after($dashboard);
        } else {
            $(".content-wrapper").first().prepend($dashboard);
        }
    }

    $dashboard.data("tabItems", tabItems);
    updateMoocsAssignmentDashboard();
}

function buildMoocsAssignmentDashboardHtml(){
    return [
        '<section id="' + iniadppAssignmentDashboardId + '" class="iniadpp-assignment-dashboard">',
        '    <div class="iniadpp-assignment-dashboard__head">',
        '        <div>',
        '            <h2>課題・出席まとめ</h2>',
        '        </div>',
        '        <button type="button" class="iniadpp-assignment-dashboard__refresh" title="再読み込み" aria-label="課題・出席まとめを再読み込み">',
        '            <i class="fa fa-refresh" aria-hidden="true"></i>',
        '        </button>',
        '    </div>',
        '    <div class="iniadpp-assignment-dashboard__notice" role="status" hidden></div>',
        '    <div class="iniadpp-assignment-dashboard__stats">',
        '        <button type="button" class="iniadpp-assignment-dashboard__stat" data-filter="attendance">',
        '            <span class="iniadpp-assignment-dashboard__count" data-count="attendance">0</span>',
        '            <span>出席</span>',
        '        </button>',
        '        <button type="button" class="iniadpp-assignment-dashboard__stat" data-filter="submit">',
        '            <span class="iniadpp-assignment-dashboard__count" data-count="submit">0</span>',
        '            <span>未提出</span>',
        '        </button>',
        '        <button type="button" class="iniadpp-assignment-dashboard__stat" data-filter="submitted">',
        '            <span class="iniadpp-assignment-dashboard__count" data-count="submitted">0</span>',
        '            <span>提出済み</span>',
        '        </button>',
        '        <button type="button" class="iniadpp-assignment-dashboard__stat" data-filter="pending">',
        '            <span class="iniadpp-assignment-dashboard__count" data-count="pending">0</span>',
        '            <span>確認中</span>',
        '        </button>',
        '    </div>',
        '    <div class="iniadpp-assignment-dashboard__list" aria-busy="false"></div>',
        '</section>'
    ].join("");
}

function setMoocsAssignmentRefreshState(state, options){
    const $dashboard = $("#" + iniadppAssignmentDashboardId);
    if(!$dashboard.length) return;

    const isLoading = state === "loading";
    const $button = $dashboard.find(".iniadpp-assignment-dashboard__refresh");
    const $icon = $button.find(".fa-refresh");
    const $notice = $dashboard.find(".iniadpp-assignment-dashboard__notice");
    const $results = $dashboard.find(".iniadpp-assignment-dashboard__list");

    $results.attr("aria-busy", isLoading ? "true" : "false");
    $button
        .prop("disabled", isLoading)
        .attr("aria-busy", isLoading ? "true" : "false")
        .attr("title", isLoading ? "再読み込み中" : "再読み込み");
    $icon.toggleClass("iniadpp-assignment-dashboard__refresh-icon--spinning", isLoading);

    $notice
        .removeClass("iniadpp-assignment-dashboard__notice--loading iniadpp-assignment-dashboard__notice--success iniadpp-assignment-dashboard__notice--error")
        .addClass("iniadpp-assignment-dashboard__notice--" + state)
        .prop("hidden", false);

    if(state === "loading"){
        if(options && options.hasPreviousState === false){
            $notice.text("再読み込み中です。結果を確認しています。");
        } else {
            $notice.text("再読み込み中です。完了するまで前回の結果を表示しています。");
        }
        return;
    }

    if(state === "error"){
        if(options && options.allHavePreviousState === false){
            $notice.text("一部のページを再読み込みできませんでした。前回の結果がないページは「未確認」と表示しています。");
        } else {
            $notice.text("一部のページを再読み込みできませんでした。失敗したページは前回の結果を表示しています。");
        }
        return;
    }

    $notice.text("最新の結果に更新しました。");
}

function updateMoocsAssignmentDashboard(){
    const $dashboard = $("#" + iniadppAssignmentDashboardId);
    if(!$dashboard.length) return;

    const tabItems = $dashboard.data("tabItems") || [];
    const counts = countMoocsAssignmentStates(tabItems);
    const pendingCount = counts.pending + counts.unknown;

    $dashboard.find('[data-count="attendance"]').text(String(counts.attendance));
    $dashboard.find('[data-count="submit"]').text(String(counts.submit));
    $dashboard.find('[data-count="submitted"]').text(String(counts.submitted));
    $dashboard.find('[data-count="pending"]').text(String(pendingCount));
    $dashboard.find('[data-filter="attendance"]').prop("disabled", counts.attendance === 0);
    $dashboard.find('[data-filter="submit"]').prop("disabled", counts.submit === 0);
    $dashboard.find('[data-filter="submitted"]').prop("disabled", counts.submitted === 0);
    $dashboard.find('[data-filter="pending"]').prop("disabled", pendingCount === 0);

    renderMoocsAssignmentDashboardList($dashboard, tabItems);
}

function countMoocsAssignmentStates(tabItems){
    const counts = { attendance: 0, submit: 0, submitted: 0, pending: 0, unknown: 0, none: 0 };
    tabItems.forEach(function(item){
        const state = item.state || item.$li.attr("data-iniadpp-assignment-state") || "pending";
        counts[state] = (counts[state] || 0) + 1;
    });
    return counts;
}

function renderMoocsAssignmentDashboardList($dashboard, tabItems){
    const $list = $dashboard.find(".iniadpp-assignment-dashboard__list");
    const visibleItems = tabItems.filter(function(item){
        return item.state === "attendance" || item.state === "submit" || item.state === "submitted" || item.state === "unknown";
    });

    $list.empty();

    if(!visibleItems.length){
        const pending = tabItems.some(function(item){ return !item.state || item.state === "pending"; });
        const message = pending ? "確認しています" : "出席・提出ページは見つかりませんでした";
        $list.append($('<div class="iniadpp-assignment-dashboard__empty"></div>').text(message));
        return;
    }

    visibleItems.forEach(function(item){
        const stateLabel = getMoocsAssignmentStateLabel(item.state);
        const $link = $('<a class="iniadpp-assignment-dashboard__item"></a>');
        $link.attr("href", item.url);
        $link.append($('<span class="iniadpp-assignment-dashboard__badge"></span>')
            .addClass("iniadpp-assignment-dashboard__badge--" + item.state)
            .text(stateLabel));
        $link.append($('<span class="iniadpp-assignment-dashboard__page"></span>').text("ページ " + item.label));
        $list.append($link);
    });
}

function getMoocsAssignmentStateLabel(state){
    if(state === "attendance") return "出席";
    if(state === "submit") return "未提出";
    if(state === "submitted") return "提出済み";
    if(state === "unknown") return "未確認";
    return "確認中";
}

// content script は ace.toyo.ac.jp にも注入されるため、リスナ登録自体を MOOCs に限定する
if(window.location.hostname === "moocs.iniad.org"){
    $(document).on("click", ".iniadpp-assignment-dashboard__refresh", function(){
        markMoocsAssignmentTabs(true);
    });

    $(document).on("submit", "form", function(){
        if(isMoocsIgnoredElement(this)) return;
        watchCurrentMoocsLessonRendering();
        scheduleMoocsAssignmentAutoRefresh(2500, { ensureTrailingScan: true });
    });

    $(document).on("input change", ".problem-contents input, .problem-contents textarea, .problem-contents select", function(){
        if(isMoocsIgnoredElement(this) || !hasMoocsSavedAnswerContainer(document)) return;
        delete document.__iniadppSavedAnswerState;
        watchCurrentMoocsLessonRendering();
        scheduleMoocsAssignmentAutoRefresh(2500, { ensureTrailingScan: true });
    });

    $(document).on("click", "button, input[type='button'], input[type='submit'], a.btn", function(){
        if(isMoocsIgnoredElement(this)) return;

        const label = getMoocsControlLabel(this);
        if(/問題\s*を\s*開く/.test(label)){
            watchCurrentMoocsLessonRendering();
            scheduleMoocsAssignmentAutoRefresh(2500, { ensureTrailingScan: true });
        }
        if(/(提出|送信|保存|アップロード|submit|upload|save)/i.test(label)){
            watchCurrentMoocsLessonRendering();
            scheduleMoocsAssignmentAutoRefresh(2500, { ensureTrailingScan: true });
        }
    });

    window.addEventListener("pageshow", function(event){
        // pageshow は通常のページ表示でも発火するため、bfcache 復帰時だけ再確認する
        if(!event || event.persisted !== true) return;
        scheduleMoocsAssignmentAutoRefreshIfStale(300);
    });

    window.addEventListener("focus", function(){
        scheduleMoocsAssignmentAutoRefreshIfStale(300);
    });

    document.addEventListener("visibilitychange", function(){
        if(document.visibilityState === "visible"){
            scheduleMoocsAssignmentAutoRefreshIfStale(300);
        }
    });

    $(document).on("click", ".iniadpp-assignment-dashboard__stat", function(){
        const filter = $(this).attr("data-filter");
        const $dashboard = $("#" + iniadppAssignmentDashboardId);
        const tabItems = $dashboard.data("tabItems") || [];
        const targetStates = filter === "pending" ? ["pending", "unknown"] : [filter];
        // data-filter は attendance / submit(未提出) / submitted(提出済み) / pending
        const firstMatch = tabItems.find(function(item){
            const state = item.state || item.$li.attr("data-iniadpp-assignment-state") || "pending";
            return targetStates.indexOf(state) !== -1;
        });

        if(firstMatch && firstMatch.url){
            window.location.href = firstMatch.url;
        }
    });
}

function resolveMoocsTabUrl(rawHref){
    try {
        if(!rawHref || rawHref === "#"){
            return normalizeMoocsUrl(window.location.href);
        }

        const url = new URL(rawHref, window.location.href);
        if(url.origin !== window.location.origin) return "";

        return normalizeMoocsUrl(url.href);
    } catch(error){
        return "";
    }
}

function normalizeMoocsUrl(rawUrl){
    const url = new URL(rawUrl, window.location.href);
    url.hash = "";
    return url.href;
}

function isCurrentMoocsLessonUrl(url){
    return normalizeMoocsUrl(url) === normalizeMoocsUrl(window.location.href);
}

function classifyMoocsLessonTab(url, forceReload){
    const isCurrentLesson = isCurrentMoocsLessonUrl(url);
    if(isCurrentLesson && forceReload !== true && !hasMoocsSavedAnswerContainer(document)){
        return Promise.resolve(classifyMoocsLessonDocument(document));
    }

    if(isCurrentLesson){
        // 強制更新では現在ページも no-store + rendered frame で読み直し、別タブでの提出を反映する
        iniadppCurrentLessonRemoteScanVersion++;
    }

    if(!forceReload && Object.prototype.hasOwnProperty.call(iniadppLessonClassificationCache, url)){
        return iniadppLessonClassificationCache[url];
    }

    const generation = (iniadppLessonClassificationGeneration[url] || 0) + 1;
    iniadppLessonClassificationGeneration[url] = generation;

    // 未表示タブの提出状態は古い HTTP キャッシュを拾うとずれるため、毎回最新を取りに行く。
    // 応答しないサーバーで強制更新の in-flight ロックが解放されないままにならないよう上限を設ける。
    iniadppLessonClassificationCache[url] = fetch(url, {
        credentials: "include",
        cache: "no-store",
        signal: createMoocsFetchTimeoutSignal(iniadppLessonFetchTimeoutMs)
    })
        .then(function(response){
            if(!response.ok) throw new Error("HTTP " + response.status);
            assertMoocsInspectionResponseUrl(response, url);
            return response.text();
        })
        .then(async function(html){
            const parsed = new DOMParser().parseFromString(html, "text/html");
            const savedAnswerState = await inspectMoocsSavedAnswers(parsed, url);
            if(savedAnswerState !== null){
                if(isCurrentLesson && iniadppLessonClassificationGeneration[url] === generation){
                    document.__iniadppSavedAnswerState = savedAnswerState;
                }
                return savedAnswerState;
            }
            const staticKind = classifyMoocsLessonDocument(parsed);
            const staticText = normalizeMoocsText(getMoocsLessonMainText(parsed));
            const staticClosedWithSubmissionScopes = hasMoocsClosedSubmissionScopes(parsed);
            // 色付き状態は静的HTMLだけで即決せず、遅延描画が終わった状態で確定する。
            // none は全資料ページを iframe 監視しないよう、静的DOMに対象controlか受付終了中の提出欄がある場合だけ検証する。
            const needsStableRenderedVerification = staticKind === "attendance" ||
                staticKind === "submitted" ||
                (!staticKind && !isMoocsResubmissionAssignment(staticText) &&
                    (hasMoocsOpenQuestionControl(parsed) || staticClosedWithSubmissionScopes));

            if(needsStableRenderedVerification){
                // 直近の確定結果と静的判定が一致するページは、遅延描画で結果が変わる見込みが薄いため
                // 非強制スキャンでは 4.5 秒の隠しフレーム再検証を省く。強制再読込では常にフル検証する
                if(forceReload !== true &&
                    (staticKind === "attendance" || staticKind === "submitted") &&
                    readCachedMoocsAssignmentState(url) === staticKind){
                    return staticKind;
                }

                const renderedVerification = classifyMoocsLessonTabInRenderedFrame(url, null, function(){
                    return iniadppLessonClassificationGeneration[url] !== generation;
                }, {
                    waitForFinalClassification: true,
                    allowEarlyResolve: false
                });

                return renderedVerification
                    .then(function(renderedKind){
                        return typeof renderedKind === "string" ? renderedKind : staticKind;
                    })
                    .catch(function(error){
                        console.warn("[INIAD Plus] Failed to verify stable lesson classification:", url, error);
                        throw error;
                    });
            }

            if(staticKind !== "submit") return staticKind;

            return classifyMoocsLessonTabInRenderedFrame(url, function(lateKind){
                if(typeof lateKind !== "string") return;
                applyMoocsLateAssignmentClassification(url, generation, lateKind);
            }, function(){
                // 強制再読込で新しい判定が始まっていたら、古い世代の iframe 検査は起こさない・続けない
                return iniadppLessonClassificationGeneration[url] !== generation;
            }, {
                allowEarlyResolve: forceReload !== true
            })
                .then(function(renderedKind){
                    // 空文字は「対象なし」という有効な描画結果。null/undefined の中断時だけ静的結果へ戻す。
                    return typeof renderedKind === "string" ? renderedKind : staticKind;
                })
                .catch(function(error){
                    console.warn("[INIAD Plus] Failed to inspect rendered lesson tab:", url, error);
                    throw error;
                });
        })
        .catch(function(error){
            delete iniadppLessonClassificationCache[url];
            throw error;
        });

    return iniadppLessonClassificationCache[url];
}

function classifyMoocsLessonTabInRenderedFrame(url, onLateUpdate, isStale, options){
    // 隠し iframe を同時に大量に開くと読み込みを奪い合って全体が遅くなるため、同時実行数を絞る
    return new Promise(function(resolve, reject){
        iniadppRenderedInspectionQueue.push(function(){
            let released = false;
            function releaseQueueSlot(){
                if(released) return;
                released = true;
                iniadppRenderedInspectionActiveCount--;
                pumpMoocsRenderedInspectionQueue();
            }

            if(typeof isStale === "function" && isStale()){
                // 実行待ちの間に新しい判定へ置き換えられた検査は iframe を開かずに終える
                releaseQueueSlot();
                resolve(null);
                return;
            }

            let inspectionPromise;
            try {
                inspectionPromise = inspectMoocsLessonTabRenderedFrame(
                    url,
                    onLateUpdate,
                    isStale,
                    releaseQueueSlot,
                    options
                );
            } catch(error){
                releaseQueueSlot();
                reject(error);
                return;
            }

            Promise.resolve(inspectionPromise).then(function(kind){
                releaseQueueSlot();
                resolve(kind);
            }, function(error){
                releaseQueueSlot();
                reject(error);
            });
        });
        pumpMoocsRenderedInspectionQueue();
    });
}

function pumpMoocsRenderedInspectionQueue(){
    while(iniadppRenderedInspectionActiveCount < iniadppRenderedInspectionMaxConcurrent && iniadppRenderedInspectionQueue.length){
        iniadppRenderedInspectionActiveCount++;
        const run = iniadppRenderedInspectionQueue.shift();
        run();
    }
}

function inspectMoocsLessonTabRenderedFrame(url, onLateUpdate, isStale, onComplete, options){
    return new Promise(function(resolve, reject){
        const iframe = document.createElement("iframe");
        let done = false;
        let resolvedEarly = false;
        let loadTimeoutId = null;
        let capTimerId = null;
        let inspectTimerId = null;
        let observer = null;
        let loadedAt = 0;
        let lastMutationAt = 0;
        const waitForFinalClassification = !!(options && options.waitForFinalClassification);
        const allowEarlyResolve = !(options && options.allowEarlyResolve === false);

        function releaseSlot(){
            if(typeof onComplete === "function"){
                const callback = onComplete;
                onComplete = null;
                callback();
            }
        }

        function cleanup(){
            if(loadTimeoutId !== null) window.clearTimeout(loadTimeoutId);
            if(capTimerId !== null) window.clearTimeout(capTimerId);
            if(inspectTimerId !== null) window.clearTimeout(inspectTimerId);
            if(observer){
                observer.disconnect();
                observer = null;
            }
            iframe.onload = null;
            if(iframe.parentNode){
                iframe.parentNode.removeChild(iframe);
            }
            releaseSlot();
        }

        function finish(kind){
            if(done) return;
            done = true;
            try {
                if(!resolvedEarly){
                    resolve(kind);
                } else if(kind !== "submit" && typeof onLateUpdate === "function"){
                    // 未提出として先に確定した後に提出済み等が描画されたケースの補正
                    onLateUpdate(kind);
                }
            } catch(error){
                console.warn("[INIAD Plus] Failed to apply a late lesson classification:", error);
            } finally {
                cleanup();
            }
        }

        function fail(error){
            if(done) return;
            done = true;
            try {
                if(!resolvedEarly){
                    reject(error);
                }
            } finally {
                cleanup();
            }
        }

        function scheduleInspection(delayMs){
            if(done) return;
            if(inspectTimerId !== null) window.clearTimeout(inspectTimerId);
            inspectTimerId = window.setTimeout(inspectRenderedDocument, Math.max(60, delayMs));
        }

        function inspectRenderedDocument(){
            if(done) return;

            if(typeof isStale === "function" && isStale()){
                // 新しい判定に置き換えられた古い検査は打ち切って枠を返す
                finish(null);
                return;
            }

            let doc = null;
            try {
                doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
            } catch(error){
                fail(error);
                return;
            }

            if(!doc || !doc.body){
                fail(new Error("Rendered tab document is unavailable."));
                return;
            }

            let kind = "";
            try {
                kind = classifyMoocsLessonDocument(doc);
            } catch(error){
                fail(error);
                return;
            }
            const now = Date.now();

            if(waitForFinalClassification){
                if(now - loadedAt >= iniadppRenderedInspectionMaxWaitMs){
                    finish(kind);
                }
                return;
            }

            if(kind !== "submit" || now - loadedAt >= iniadppRenderedInspectionMaxWaitMs){
                finish(kind);
                return;
            }

            if(allowEarlyResolve &&
                !resolvedEarly &&
                now - lastMutationAt >= iniadppRenderedInspectionQuietMs &&
                !hasMoocsConflictingCachedState(url) &&
                hasMoocsDefinitiveUnsubmittedState(doc)){
                // 明示的な「未提出」表示や操作可能な「問題を開く」がある場合だけ赤表示を先行確定する。
                // 入力欄があるだけの曖昧な状態は、遅れて「アップロード済み」が描画される可能性があるため待ちきる。
                resolvedEarly = true;
                releaseSlot();
                resolve(kind);
            }

            if(!resolvedEarly){
                const capRemainingMs = iniadppRenderedInspectionMaxWaitMs - (now - loadedAt);
                const quietRemainingMs = iniadppRenderedInspectionQuietMs - (now - lastMutationAt);
                scheduleInspection(quietRemainingMs > 0 ? Math.min(capRemainingMs, quietRemainingMs) : capRemainingMs);
            }
        }

        iframe.onload = function(){
            if(done) return;

            if(loadTimeoutId !== null){
                window.clearTimeout(loadTimeoutId);
                loadTimeoutId = null;
            }

            loadedAt = Date.now();
            lastMutationAt = loadedAt;

            let doc = null;
            try {
                doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
            } catch(error){
                fail(error);
                return;
            }

            if(!doc || !doc.body){
                fail(new Error("Rendered tab document is unavailable."));
                return;
            }

            if(observer){
                observer.disconnect();
                observer = null;
            }

            try {
                observer = new MutationObserver(function(){
                    if(done) return;
                    lastMutationAt = Date.now();
                    scheduleInspection(iniadppRenderedInspectionDebounceMs);
                });
                observer.observe(doc, {
                    childList: true,
                    subtree: true,
                    characterData: true,
                    attributes: true,
                    attributeFilter: ["class", "style", "hidden", "inert", "aria-hidden", "disabled", "aria-disabled"]
                });
            } catch(error){
                observer = null;
            }

            if(capTimerId !== null) window.clearTimeout(capTimerId);
            capTimerId = window.setTimeout(inspectRenderedDocument, iniadppRenderedInspectionMaxWaitMs);

            inspectRenderedDocument();
        };

        loadTimeoutId = window.setTimeout(function(){
            fail(new Error("Rendered tab inspection timed out."));
        }, iniadppRenderedInspectionTimeoutMs);

        iframe.setAttribute("aria-hidden", "true");
        iframe.setAttribute("tabindex", "-1");
        iframe.src = url;
        iframe.style.cssText = [
            "position:absolute",
            // 実ページ相当の幅を持たせ、警告や操作要素のゼロサイズ判定をviewport幅で歪めない。
            "width:1024px",
            "height:768px",
            "left:-9999px",
            "top:-9999px",
            "border:0",
            "opacity:0",
            "pointer-events:none"
        ].join(";");

        try {
            (document.body || document.documentElement).appendChild(iframe);
        } catch(error){
            fail(error);
        }
    });
}

function classifyMoocsLessonDocument(doc){
    const text = normalizeMoocsText(getMoocsLessonMainText(doc));
    const isClosed = isMoocsClosedAssignment(doc);

    if(isMoocsResubmissionAssignment(text)){
        return "";
    }

    // MOOCs のテキスト回答は提出ボタンが残り、完了の文字を表示しない。
    // 入力の有無では決めず、正規の読み取りAPIで確認した保存状態を使う。
    if(hasMoocsSavedAnswerContainer(doc)){
        return typeof doc.__iniadppSavedAnswerState === "string" ? doc.__iniadppSavedAnswerState : "unknown";
    }

    if(isClosed){
        const closedScopeTextMemo = new Map();
        const closedScopes = collectMoocsSubmissionScopes(doc, closedScopeTextMemo);
        const allClosedScopesSubmitted = closedScopes.length > 0 && closedScopes.every(function(scope){
            return hasMoocsSubmittedMark(getMoocsComparableTextMemoized(scope, closedScopeTextMemo));
        });

        // 受付終了自体は提出の証拠ではない。提出欄に明示的な完了表示がある場合だけ提出済みにする。
        return allClosedScopesSubmitted ? "submitted" : "";
    }

    if(isMoocsAttendanceAssignment(text)){
        return "attendance";
    }

    // 問題をまだ開ける状態では、途中保存の「アップロード済み」があっても最終提出前として扱う
    if(hasMoocsOpenQuestionAction(doc)){
        return "submit";
    }

    const scopeTextMemo = new Map();
    const scopes = collectMoocsSubmissionScopes(doc, scopeTextMemo);
    if(!scopes.length){
        return "";
    }

    // 説明文の「提出しましたら〜」等での誤判定を避けるため、提出フォーム近傍だけを見る。
    // 複数の提出欄が混在するページは、すべて提出済みのときだけ提出済み扱いにする
    const allSubmitted = scopes.every(function(scope){
        return hasMoocsSubmittedMark(getMoocsComparableTextMemoized(scope, scopeTextMemo));
    });

    return allSubmitted ? "submitted" : "submit";
}

function hasMoocsSavedAnswerContainer(doc){
    if(!doc || typeof doc.querySelectorAll !== "function") return false;
    if(isMoocsAttendanceAssignment(getMoocsLessonMainText(doc)) ||
        isMoocsResubmissionAssignment(getMoocsLessonMainText(doc))) return false;
    return doc.querySelectorAll(".problem-container[data-urlprefix]").length > 0;
}

function assertMoocsInspectionResponseUrl(response, expectedUrl){
    if(!response.url) return;
    const actual = new URL(response.url, expectedUrl);
    const expected = new URL(expectedUrl);
    if(actual.origin !== expected.origin || actual.pathname !== expected.pathname){
        throw new Error("MOOCs inspection was redirected away from the requested page.");
    }
}

async function readMoocsInspectionJson(url){
    const response = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
        signal: createMoocsFetchTimeoutSignal(iniadppLessonFetchTimeoutMs)
    });
    if(!response.ok) throw new Error("HTTP " + response.status);
    assertMoocsInspectionResponseUrl(response, url);
    let data;
    try {
        data = await response.json();
    } catch(error){
        // API本文や回答内容を例外ログへ出さない。
        throw new Error("MOOCs returned invalid answer information.");
    }
    if(!data || typeof data !== "object" || Array.isArray(data)){
        throw new Error("MOOCs returned invalid answer information.");
    }
    return data;
}

async function inspectMoocsSavedAnswers(doc, lessonUrl){
    if(!hasMoocsSavedAnswerContainer(doc)) return null;
    const containers = Array.from(doc.querySelectorAll(".problem-container[data-urlprefix]"));
    const results = await Promise.all(containers.map(async function(container){
        const prefix = new URL(container.getAttribute("data-urlprefix"), lessonUrl);
        if(prefix.origin !== new URL(lessonUrl).origin ||
            !/^\/assignments\//.test(prefix.pathname) || prefix.search || prefix.hash){
            throw new Error("Invalid MOOCs answer endpoint.");
        }
        const base = prefix.href.replace(/\/$/, "");
        const status = await readMoocsInspectionJson(base + "/status");
        if(["open", "closed", "graded"].indexOf(status.status) === -1){
            throw new Error("MOOCs answer status is unavailable.");
        }
        const problemUrl = new URL(base + "/problem");
        const lang = container.getAttribute("data-lang");
        if(lang) problemUrl.searchParams.set("lang", lang);
        const [problem, answers] = await Promise.all([
            readMoocsInspectionJson(problemUrl.href),
            readMoocsInspectionJson(base + "/answers")
        ]);
        if(typeof problem.html !== "string") throw new Error("MOOCs problem definition is unavailable.");
        const problemDoc = new DOMParser().parseFromString(problem.html, "text/html");
        const fields = Array.from(problemDoc.querySelectorAll("input[name], textarea[name], select[name]"))
            .filter(function(field){
                return !field.closest(".nosubmit") &&
                    ["hidden", "button", "submit", "reset"].indexOf((field.getAttribute("type") || "").toLowerCase()) === -1;
            });
        if(!fields.length) throw new Error("MOOCs answer fields are unavailable.");
        let saved = areMoocsProblemAnswersSaved(fields, answers);
        if(saved && isCurrentMoocsLessonUrl(lessonUrl)){
            const liveContainers = Array.from(document.querySelectorAll(".problem-container[data-urlprefix]"));
            const live = liveContainers.find(function(element){
                return element.getAttribute("data-urlprefix") === container.getAttribute("data-urlprefix");
            });
            if(live){
                const liveFields = Array.from(live.querySelectorAll(".problem-contents input[name], .problem-contents textarea[name], .problem-contents select[name]"));
                saved = doMoocsProblemValuesMatch(liveFields, answers);
            }
        }
        return saved ? "submitted" : (status.status === "open" ? "submit" : "none");
    }));
    if(results.some(function(state){ return state === "submit"; })) return "submit";
    return results.every(function(state){ return state === "submitted"; }) ? "submitted" : "none";
}

function areMoocsProblemAnswersSaved(fields, answers){
    return fields.every(function(field){
        const name = field.getAttribute("name");
        if(!Object.prototype.hasOwnProperty.call(answers, name)) return false;
        const answer = answers[name];
        if(!answer || typeof answer !== "object") return false;
        if((field.getAttribute("type") || "").toLowerCase() === "file"){
            return !!(answer.file && answer.file.filename && answer.file.filetype);
        }
        return typeof answer.data === "string" && answer.data.trim().length > 0;
    });
}

function doMoocsProblemValuesMatch(fields, answers){
    const names = new Set();
    return fields.filter(function(field){
        return !field.closest(".nosubmit") &&
            ["hidden", "button", "submit", "reset", "file"].indexOf((field.getAttribute("type") || "").toLowerCase()) === -1;
    }).every(function(field){
        const name = field.getAttribute("name");
        if(names.has(name)) return true;
        names.add(name);
        const type = (field.getAttribute("type") || "").toLowerCase();
        let value = field.value;
        if(type === "radio" || type === "checkbox"){
            const checked = fields.find(function(other){ return other.getAttribute("name") === name && other.checked; });
            value = checked ? checked.value : "";
        } else if(field.multiple && field.selectedOptions){
            value = Array.from(field.selectedOptions).map(function(option){ return option.value; }).join(",");
        }
        return !!answers[name] && String(value || "").replace(/\r\n/g, "\n") ===
            String(answers[name].data || "").replace(/\r\n/g, "\n");
    });
}

function isMoocsClosedAssignment(doc){
    if(!doc || typeof doc.querySelectorAll !== "function") return false;

    const notices = doc.querySelectorAll([
        ".alert",
        ".alert-warning",
        ".alert-danger",
        ".callout",
        "[role='alert']",
        "[role='status']"
    ].join(","));

    for(let i = 0; i < notices.length; i++){
        const notice = notices[i];
        // 検証用iframe自体は意図的に非表示なので、要素自身と文書内祖先の可視性だけを見る。
        if(!isMoocsVisibleElement(notice, { skipCheckVisibility: true })) continue;
        if(hasMoocsClosedAssignmentText(getMoocsComparableText(notice))){
            return true;
        }
    }

    return false;
}

function hasMoocsClosedSubmissionScopes(doc){
    return isMoocsClosedAssignment(doc) && collectMoocsSubmissionScopes(doc).length > 0;
}

function hasMoocsClosedAssignmentText(text){
    const normalizedText = normalizeMoocsText(text);
    return /^(?:[!！⚠]\s*)*現在(?:\s*は)?\s*[、,:：]?\s*(?:回答|解答|提出|送信)\s*を\s*受け付けて\s*いません(?:[。.!！]|$)/.test(normalizedText);
}

function hasMoocsSubmittedMark(text){
    const normalizedText = normalizeMoocsText(text);
    if(hasMoocsUnsubmittedMark(normalizedText)) return false;

    // MOOCs のファイル提出欄は「提出済み」ではなく「アップロード済み」と表示される
    return /(提出\s*済|回答\s*済|解答\s*済|送信\s*済|アップロード\s*済|\bsubmitted\b)/i.test(normalizedText);
}

function hasMoocsUnsubmittedMark(text){
    // text node の境界で語が連結されても見落とさないよう、英語側は先頭の word boundary に依存しない。
    // 「未提出の場合は0点」「未提出の課題は0点」「未提出では0点」のような説明文で、
    // 同じ提出欄にある実際の「提出済み」表示を打ち消さないよう、条件・説明へ続く表現は除外する。
    return /(未\s*(?:提出|回答|解答|送信|アップロード)(?:\s*済)?(?!\s*(?:(?:の\s*)?(?:場合|とき|時|際)|の\s*(?:まま|方|人|学生|者|課題|回答|解答|提出物|ファイル)|者|は|が|では|でも|だと|だが|なら|ならば|であれば|ですと|になる|になります|となる|となります))|(?:unsubmitted|not(?:[\s-]+yet)?[\s-]+submitted))/i.test(text);
}

function hasMoocsDefinitiveUnsubmittedState(doc){
    if(hasMoocsOpenQuestionAction(doc)) return true;

    const scopeTextMemo = new Map();
    const scopes = collectMoocsSubmissionScopes(doc, scopeTextMemo);
    return scopes.some(function(scope){
        return hasMoocsUnsubmittedMark(getMoocsComparableTextMemoized(scope, scopeTextMemo));
    });
}

function getMoocsLessonMainText(doc){
    const root = doc.querySelector(".content-wrapper") || doc.body;
    if(!root) return "";

    return getMoocsComparableText(root);
}

function getMoocsComparableTextMemoized(root, memo){
    if(memo.has(root)) return memo.get(root);
    const text = getMoocsComparableText(root);
    memo.set(root, text);
    return text;
}

function getMoocsComparableText(root){
    if(!root) return "";

    const clone = root.cloneNode(true);
    const ignoredNodes = clone.querySelectorAll(getMoocsIgnoredSelector());

    for(let i = 0; i < ignoredNodes.length; i++){
        ignoredNodes[i].parentNode.removeChild(ignoredNodes[i]);
    }

    // textContent は </p><span> の境界を空白なしで連結するため、text node ごとに区切って比較する
    const textParts = [];
    const walker = clone.ownerDocument.createTreeWalker(clone, 4);
    while(walker.nextNode()){
        textParts.push(walker.currentNode.nodeValue || "");
    }

    return normalizeMoocsText(textParts.join(" "));
}

function getMoocsIgnoredSelector(){
    return [
        "#" + iniadppAssignmentDashboardId,
        ".main-sidebar",
        ".main-header",
        ".sidebar",
        ".navbar",
        ".pagination",
        ".iniadplus-menu-item",
        ".iniadpp-download-group",
        ".mymemo-contents",
        "script",
        "style",
        "template",
        "noscript"
    ].join(",");
}

function collectMoocsSubmissionScopes(doc, scopeTextMemo){
    const scopes = [];
    const textMemo = scopeTextMemo || new Map();
    const fields = doc.querySelectorAll("textarea, select, input");

    for(let i = 0; i < fields.length; i++){
        const field = fields[i];
        const type = (field.getAttribute("type") || "").toLowerCase();

        if(["hidden", "submit", "button", "reset", "search"].indexOf(type) !== -1) continue;
        if(isMoocsIgnoredElement(field)) continue;

        const scope = field.closest("form, .box, .panel, .well, section, article, .content") || field.parentElement;
        if(!scope || scopes.indexOf(scope) !== -1) continue;

        // 同じスコープに属するフィールドごとに大きなサブツリーを clone + 全文走査し直さない
        const scopeText = getMoocsComparableTextMemoized(scope, textMemo);

        if(!isMoocsSubmissionScope(scopeText)) continue;
        scopes.push(scope);
    }

    if(!scopes.length && hasMoocsSubmitButton(doc)){
        // 提出欄が特定できない提出ページはページ全体を1つのスコープとして扱う
        const root = doc.querySelector(".content-wrapper") || doc.body;
        if(root){
            scopes.push(root);
        }
    }

    return scopes;
}

function hasMoocsOpenQuestionAction(doc){
    const actions = doc.querySelectorAll("button, input[type='button'], input[type='submit'], a.btn");

    for(let i = 0; i < actions.length; i++){
        const action = actions[i];
        if(!isMoocsActionableControl(action)) continue;
        if(/問題\s*を\s*開く/.test(getMoocsControlLabel(action))){
            return true;
        }
    }

    return false;
}

function hasMoocsOpenQuestionControl(doc){
    const controls = doc.querySelectorAll("button, input[type='button'], input[type='submit'], a.btn");

    for(let i = 0; i < controls.length; i++){
        const control = controls[i];
        if(isMoocsIgnoredElement(control)) continue;
        if(/問題\s*を\s*開く/.test(getMoocsControlLabel(control))){
            return true;
        }
    }

    return false;
}

function hasMoocsSubmitButton(doc){
    const buttons = doc.querySelectorAll("button, input[type='submit'], a.btn");

    for(let i = 0; i < buttons.length; i++){
        const button = buttons[i];
        if(!isMoocsActionableControl(button)) continue;

        const label = getMoocsControlLabel(button);
        if(/(提出|送信|保存|アップロード|submit|upload)/i.test(label)){
            return true;
        }
    }

    return false;
}

function getMoocsControlLabel(control){
    const text = normalizeMoocsText(control.textContent || "");
    if(text) return text;

    const value = normalizeMoocsText(control.value || control.getAttribute("value") || "");
    if(value) return value;

    return normalizeMoocsText(control.getAttribute("aria-label") || "");
}

function isMoocsActionableControl(control){
    if(!control || isMoocsIgnoredElement(control)) return false;
    if(control.disabled === true || control.hasAttribute("disabled")) return false;
    if(String(control.getAttribute("aria-disabled") || "").toLowerCase() === "true") return false;

    return isMoocsVisibleElement(control, { requirePointerInteraction: true });
}

function isMoocsVisibleElement(element, options){
    if(!element || isMoocsIgnoredElement(element)) return false;

    const requirePointerInteraction = !!(options && options.requirePointerInteraction);
    const skipCheckVisibility = !!(options && options.skipCheckVisibility);
    const ownerDocument = element.ownerDocument;
    const view = ownerDocument && ownerDocument.defaultView;
    const isRenderedDocument = !!(view && ownerDocument.documentElement && ownerDocument.documentElement.contains(element));
    let current = element;

    while(current && current.nodeType === 1){
        if(current.hidden === true || current.inert === true || current.hasAttribute("hidden") || current.hasAttribute("inert")){
            return false;
        }
        if(String(current.getAttribute("aria-hidden") || "").toLowerCase() === "true") return false;
        if(current.classList && (current.classList.contains("hidden") || current.classList.contains("d-none"))){
            return false;
        }

        const inlineStyle = current.style;
        if(inlineStyle && (
            inlineStyle.display === "none" ||
            inlineStyle.visibility === "hidden" ||
            inlineStyle.visibility === "collapse" ||
            inlineStyle.contentVisibility === "hidden" ||
            parseFloat(inlineStyle.opacity) === 0 ||
            (requirePointerInteraction && inlineStyle.pointerEvents === "none")
        )){
            return false;
        }

        if(isRenderedDocument && typeof view.getComputedStyle === "function"){
            const computedStyle = view.getComputedStyle(current);
            const opacity = parseFloat(computedStyle.opacity);
            if(computedStyle.display === "none" ||
                computedStyle.visibility === "hidden" ||
                computedStyle.visibility === "collapse" ||
                computedStyle.contentVisibility === "hidden" ||
                (!Number.isNaN(opacity) && opacity <= 0) ||
                (requirePointerInteraction && computedStyle.pointerEvents === "none") ||
                isMoocsFullyClippedStyle(computedStyle)){
                return false;
            }

            if(current !== element && computedStyle.display !== "contents" && typeof current.getBoundingClientRect === "function"){
                const bounds = current.getBoundingClientRect();
                const clipsOverflow = [computedStyle.overflow, computedStyle.overflowX, computedStyle.overflowY]
                    .some(function(value){ return value === "hidden" || value === "clip"; });
                if(clipsOverflow && bounds && (bounds.width <= 0 || bounds.height <= 0)) return false;
            }
        }

        current = current.parentElement;
    }

    // DOMParser で作った静的文書にはレイアウト情報がないため、属性・inline style の確認だけに留める。
    // 現在ページと描画確認iframeでは、実際に面積を持つ要素だけを可視とみなす。
    if(isRenderedDocument){
        if(!skipCheckVisibility && typeof element.checkVisibility === "function"){
            try {
                if(!element.checkVisibility({
                    checkOpacity: true,
                    checkVisibilityCSS: true,
                    opacityProperty: true,
                    visibilityProperty: true
                })){
                    return false;
                }
            } catch(error){
                // 未対応オプションのブラウザーでは rect 検査へフォールバックする
            }
        }

        if(typeof element.getClientRects !== "function") return false;
        const rects = element.getClientRects();
        let hasPositiveArea = false;
        for(let i = 0; rects && i < rects.length; i++){
            if(rects[i].width > 0 && rects[i].height > 0){
                hasPositiveArea = true;
                break;
            }
        }
        if(!hasPositiveArea) return false;

        if(typeof element.getBoundingClientRect === "function"){
            const bounds = element.getBoundingClientRect();
            if(!bounds || bounds.width <= 0 || bounds.height <= 0) return false;
        }
    }

    return true;
}

function isMoocsFullyClippedStyle(style){
    const clip = String(style.clip || "").toLowerCase().replace(/\s+/g, "");
    if(/^rect\(0(?:px)?,?0(?:px)?,?0(?:px)?,?0(?:px)?\)$/.test(clip)) return true;

    const clipPath = String(style.clipPath || style.webkitClipPath || "").toLowerCase().replace(/\s+/g, " ").trim();
    if(/^inset\((?:50%|100%)(?: (?:50%|100%)){0,3}\)$/.test(clipPath)) return true;
    return false;
}

function isMoocsSubmissionScope(text){
    if(isMoocsResubmissionAssignment(text)) return false;

    return /(提出|課題|回答|解答|アップロード|ファイル|assignment|answer|submit|upload)/i.test(text);
}

function isMoocsAttendanceAssignment(text){
    return /(出席|出欠|小テスト|attendance)/i.test(text);
}

function isMoocsResubmissionAssignment(text){
    return /(課題\s*再提出|再提出\s*課題|resubmission|re-?submission)/i.test(text);
}

function isMoocsIgnoredElement(element){
    return !!element.closest(getMoocsIgnoredSelector());
}

function normalizeMoocsText(text){
    return String(text || "").replace(/\s+/g, " ").trim();
}

function createMoocsFetchTimeoutSignal(timeoutMs){
    if(typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"){
        return AbortSignal.timeout(timeoutMs);
    }
    return undefined;
}
