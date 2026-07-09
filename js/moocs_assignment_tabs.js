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
const iniadppAssignmentStateStorageKey = "iniadppAssignmentStates";
const iniadppAssignmentStateCacheTtlMs = 30 * 60 * 1000;
const iniadppRenderedInspectionQuietMs = 1200;
const iniadppRenderedInspectionDebounceMs = 150;
const iniadppRenderedInspectionMaxWaitMs = 4500;
const iniadppRenderedInspectionTimeoutMs = 7000;
const iniadppRenderedInspectionMaxConcurrent = 3;
let iniadppRenderedInspectionActiveCount = 0;
const iniadppRenderedInspectionQueue = [];
let iniadppAssignmentAutoRefreshTimer = null;
let iniadppAssignmentAutoRefreshDueAt = 0;
const iniadppAutoRefreshMinIntervalMs = 10 * 1000;
let iniadppLastForcedScanAt = 0;
let iniadppCurrentLessonSettled = false;

function markMoocsAssignmentTabs(forceReload){
    const tabItems = collectMoocsLessonTabs();
    if(!tabItems.length) return;

    // 強制再読込のときだけ破棄する。無条件に消すと初期表示の二重スキャンで確認中の結果まで捨ててしまう
    if(forceReload === true){
        iniadppLastForcedScanAt = Date.now();
        clearMoocsLessonClassificationCache();
    }

    const scanVersion = ++iniadppAssignmentScanVersion;
    renderMoocsAssignmentDashboard(tabItems);

    tabItems.forEach(function(item){
        // 前回の判定結果があれば先に表示し、再確認のたびに「確認中」へ戻さない
        updateMoocsLessonTabState(item, readCachedMoocsAssignmentState(item.url) || "pending");
    });

    tabItems.forEach(function(item){
        classifyMoocsLessonTab(item.url, forceReload === true)
            .then(function(kind){
                if(scanVersion !== iniadppAssignmentScanVersion) return;
                const state = kind || "none";
                // 現在ページは動的描画が終わる前の判定を保存すると誤りが固定されるため、描画静止後の watcher に任せる
                if(!isCurrentMoocsLessonUrl(item.url) || iniadppCurrentLessonSettled){
                    writeCachedMoocsAssignmentState(item.url, state);
                }
                updateMoocsLessonTabState(item, state);
                updateMoocsAssignmentDashboard();
            })
            .catch(function(error){
                if(scanVersion !== iniadppAssignmentScanVersion) return;
                if(!item.state || item.state === "pending"){
                    // 前回の結果を表示中なら、通信失敗で「未確認」へ戻さない
                    updateMoocsLessonTabState(item, "unknown");
                }
                updateMoocsAssignmentDashboard();
                console.warn("[INIAD Plus] Failed to inspect lesson tab:", item.url, error);
            });
    });

    updateMoocsAssignmentDashboard();
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

function scheduleMoocsAssignmentAutoRefresh(delayMs){
    if(iniadppAssignmentAutoRefreshTimer !== null){
        window.clearTimeout(iniadppAssignmentAutoRefreshTimer);
    }

    iniadppAssignmentAutoRefreshDueAt = Date.now() + delayMs;
    iniadppAssignmentAutoRefreshTimer = window.setTimeout(function(){
        iniadppAssignmentAutoRefreshTimer = null;
        markMoocsAssignmentTabs(true);
    }, delayMs);
}

function scheduleMoocsAssignmentAutoRefreshIfStale(delayMs){
    // ウィンドウ切替のたびに全タブを再取得するとサーバー負荷と枠の奪い合いで反映がむしろ遅くなるため間隔を空ける。
    // ただし破棄すると別タブでの提出が反映されないままになるため、間隔明けまで遅延して1回だけ実行する
    const sinceForcedMs = Date.now() - iniadppLastForcedScanAt;
    if(sinceForcedMs < iniadppAutoRefreshMinIntervalMs){
        const deferredDelayMs = Math.max(delayMs, iniadppAutoRefreshMinIntervalMs - sinceForcedMs);
        // フォーム提出起点など、先に予約済みのより早い再確認を後ろへ延ばさない
        if(iniadppAssignmentAutoRefreshTimer !== null && iniadppAssignmentAutoRefreshDueAt <= Date.now() + deferredDelayMs){
            return;
        }
        scheduleMoocsAssignmentAutoRefresh(deferredDelayMs);
        return;
    }
    scheduleMoocsAssignmentAutoRefresh(delayMs);
}

function watchCurrentMoocsLessonRendering(){
    // 現在ページは iframe 検査を通らないため、動的描画の完了を自前で監視して判定を確定させる
    const url = normalizeMoocsUrl(window.location.href);
    let observer = null;
    let quietTimerId = null;
    let capTimerId = null;

    function stop(){
        iniadppCurrentLessonSettled = true;
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
    }

    function scheduleQuietRecheck(){
        if(iniadppCurrentLessonSettled) return;
        if(quietTimerId !== null) window.clearTimeout(quietTimerId);
        quietTimerId = window.setTimeout(function(){
            quietTimerId = null;
            applyCurrentMoocsLessonState(url, false);
        }, iniadppRenderedInspectionQuietMs);
    }

    try {
        observer = new MutationObserver(scheduleQuietRecheck);
        observer.observe(document, { childList: true, subtree: true, characterData: true });
    } catch(error){
        observer = null;
    }

    capTimerId = window.setTimeout(function(){
        capTimerId = null;
        applyCurrentMoocsLessonState(url, true);
        stop();
    }, iniadppRenderedInspectionMaxWaitMs);

    scheduleQuietRecheck();
}

function applyCurrentMoocsLessonState(url, isFinal){
    const kind = classifyMoocsLessonDocument(document);
    const state = kind || "none";
    // 描画途中の静止点での中間判定は、遅れて描画される提出済み表示を取り違えて格下げしうるため、
    // 格上げ(提出済み/出席)だけ即保存し、格下げは最終確定時のみ保存する
    if(isFinal === true || state === "submitted" || state === "attendance"){
        writeCachedMoocsAssignmentState(url, state);
    }

    const $dashboard = $("#" + iniadppAssignmentDashboardId);
    const tabItems = $dashboard.data("tabItems") || [];
    let touched = false;

    tabItems.forEach(function(item){
        if(item.url !== url || item.state === state) return;
        updateMoocsLessonTabState(item, state);
        touched = true;
    });

    if(touched){
        updateMoocsAssignmentDashboard();
    }
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
        '<section id="' + iniadppAssignmentDashboardId + '" class="iniadpp-assignment-dashboard" aria-live="polite">',
        '    <div class="iniadpp-assignment-dashboard__head">',
        '        <div>',
        '            <h2>課題・出席まとめ</h2>',
        '            <p>この講義のページ別チェック</p>',
        '        </div>',
        '        <button type="button" class="iniadpp-assignment-dashboard__refresh" title="再読み込み" aria-label="課題・出席まとめを再読み込み">',
        '            <i class="fa fa-refresh" aria-hidden="true"></i>',
        '        </button>',
        '    </div>',
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
        '    <div class="iniadpp-assignment-dashboard__list"></div>',
        '</section>'
    ].join("");
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

$(document).on("click", ".iniadpp-assignment-dashboard__refresh", function(){
    markMoocsAssignmentTabs(true);
});

$(document).on("submit", "form", function(){
    scheduleMoocsAssignmentAutoRefresh(2500);
});

$(document).on("click", "button, input[type='submit'], a.btn", function(){
    const label = normalizeMoocsText($(this).text() || $(this).val() || "");
    if(/(提出|送信|保存|アップロード|submit|upload|save)/i.test(label)){
        scheduleMoocsAssignmentAutoRefresh(2500);
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
    if(isCurrentMoocsLessonUrl(url)){
        return Promise.resolve(classifyMoocsLessonDocument(document));
    }

    if(!forceReload && Object.prototype.hasOwnProperty.call(iniadppLessonClassificationCache, url)){
        return iniadppLessonClassificationCache[url];
    }

    const generation = (iniadppLessonClassificationGeneration[url] || 0) + 1;
    iniadppLessonClassificationGeneration[url] = generation;

    // 未表示タブの提出状態は古い HTTP キャッシュを拾うとずれるため、毎回最新を取りに行く。
    iniadppLessonClassificationCache[url] = fetch(url, {
        credentials: "include",
        cache: "no-store"
    })
        .then(function(response){
            if(!response.ok) throw new Error("HTTP " + response.status);
            return response.text();
        })
        .then(function(html){
            const parsed = new DOMParser().parseFromString(html, "text/html");
            const staticKind = classifyMoocsLessonDocument(parsed);
            if(staticKind !== "submit"){
                return staticKind;
            }

            return classifyMoocsLessonTabInRenderedFrame(url, function(lateKind){
                if(!lateKind) return;
                applyMoocsLateAssignmentClassification(url, generation, lateKind);
            }, function(){
                // 強制再読込で新しい判定が始まっていたら、古い世代の iframe 検査は起こさない・続けない
                return iniadppLessonClassificationGeneration[url] !== generation;
            })
                .then(function(renderedKind){
                    return renderedKind || staticKind;
                })
                .catch(function(error){
                    console.warn("[INIAD Plus] Failed to inspect rendered lesson tab:", url, error);
                    return staticKind;
                });
        })
        .catch(function(error){
            delete iniadppLessonClassificationCache[url];
            throw error;
        });

    return iniadppLessonClassificationCache[url];
}

function classifyMoocsLessonTabInRenderedFrame(url, onLateUpdate, isStale){
    // 隠し iframe を同時に大量に開くと読み込みを奪い合って全体が遅くなるため、同時実行数を絞る
    return new Promise(function(resolve, reject){
        iniadppRenderedInspectionQueue.push(function(){
            if(typeof isStale === "function" && isStale()){
                // 実行待ちの間に新しい判定へ置き換えられた検査は iframe を開かずに終える
                iniadppRenderedInspectionActiveCount--;
                pumpMoocsRenderedInspectionQueue();
                resolve("");
                return;
            }
            inspectMoocsLessonTabRenderedFrame(url, onLateUpdate, isStale, function(){
                iniadppRenderedInspectionActiveCount--;
                pumpMoocsRenderedInspectionQueue();
            }).then(resolve, reject);
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

function inspectMoocsLessonTabRenderedFrame(url, onLateUpdate, isStale, onComplete){
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
            if(!resolvedEarly){
                resolve(kind);
            } else if(kind !== "submit" && typeof onLateUpdate === "function"){
                // 未提出として先に確定した後に提出済み等が描画されたケースの補正
                onLateUpdate(kind);
            }
            cleanup();
        }

        function fail(error){
            if(done) return;
            done = true;
            if(!resolvedEarly){
                reject(error);
            }
            cleanup();
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
                finish("");
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

            const kind = classifyMoocsLessonDocument(doc);
            const now = Date.now();

            if(kind !== "submit" || now - loadedAt >= iniadppRenderedInspectionMaxWaitMs){
                finish(kind);
                return;
            }

            if(!resolvedEarly && now - lastMutationAt >= iniadppRenderedInspectionQuietMs && !hasMoocsConflictingCachedState(url)){
                // 描画が静止したら未提出として先に反映し、遅れて描画される提出済み表示は maxWait まで監視して補正する。
                // 前回「提出済み/出席」と確定しているページは、描画待ちの取り違えで格下げしないよう maxWait まで待ちきる
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
                observer.observe(doc, { childList: true, subtree: true, characterData: true });
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
            "width:1px",
            "height:1px",
            "left:-9999px",
            "top:-9999px",
            "border:0",
            "opacity:0",
            "pointer-events:none"
        ].join(";");

        (document.body || document.documentElement).appendChild(iframe);
    });
}

function classifyMoocsLessonDocument(doc){
    const text = normalizeMoocsText(getMoocsLessonMainText(doc));

    if(isMoocsResubmissionAssignment(text)){
        return "";
    }

    if(isMoocsAttendanceAssignment(text)){
        return "attendance";
    }

    const scopes = collectMoocsSubmissionScopes(doc);
    if(!scopes.length){
        return "";
    }

    // 説明文の「提出しましたら〜」等での誤判定を避けるため、提出フォーム近傍だけを見る。
    // 複数の提出欄が混在するページは、すべて提出済みのときだけ提出済み扱いにする
    const allSubmitted = scopes.every(function(scope){
        return hasMoocsSubmittedMark(normalizeMoocsText(scope.textContent));
    });

    return allSubmitted ? "submitted" : "submit";
}

function hasMoocsSubmittedMark(text){
    // ステータス表示の語彙だけに絞り、「未提出」「Unsubmitted」「Not submitted」を除外する
    // MOOCs のファイル提出欄は「提出済み」ではなく「アップロード済み」と表示される
    return /(提出\s*済|回答\s*済|解答\s*済|送信\s*済|アップロード\s*済|(?<!un)(?<!not\s)submitted)/i.test(text);
}

function getMoocsLessonMainText(doc){
    const root = doc.querySelector(".content-wrapper") || doc.body;
    if(!root) return "";

    const clone = root.cloneNode(true);
    const ignoredNodes = clone.querySelectorAll([
        "#" + iniadppAssignmentDashboardId,
        ".main-sidebar",
        ".main-header",
        ".sidebar",
        ".navbar",
        ".pagination",
        ".iniadplus-menu-item",
        ".iniadpp-download-group",
        ".mymemo-contents"
    ].join(","));

    for(let i = 0; i < ignoredNodes.length; i++){
        ignoredNodes[i].parentNode.removeChild(ignoredNodes[i]);
    }

    return clone.textContent || "";
}

function collectMoocsSubmissionScopes(doc){
    const scopes = [];
    const fields = doc.querySelectorAll("textarea, select, input");

    for(let i = 0; i < fields.length; i++){
        const field = fields[i];
        const type = (field.getAttribute("type") || "").toLowerCase();

        if(["hidden", "submit", "button", "reset", "search"].indexOf(type) !== -1) continue;
        if(isMoocsIgnoredElement(field)) continue;

        const scope = field.closest("form, .box, .panel, .well, section, article, .content") || field.parentElement;
        const scopeText = normalizeMoocsText(scope ? scope.textContent : "");

        if(!isMoocsSubmissionScope(scopeText)) continue;
        if(scope && scopes.indexOf(scope) === -1){
            scopes.push(scope);
        }
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

function hasMoocsSubmitButton(doc){
    const buttons = doc.querySelectorAll("button, input[type='submit'], a.btn");

    for(let i = 0; i < buttons.length; i++){
        const button = buttons[i];
        if(isMoocsIgnoredElement(button)) continue;

        const label = normalizeMoocsText(button.textContent || button.value || "");
        if(/(提出|送信|保存|アップロード|submit|upload)/i.test(label)){
            return true;
        }
    }

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
    return !!element.closest([
        "#" + iniadppAssignmentDashboardId,
        ".main-sidebar",
        ".main-header",
        ".sidebar",
        ".navbar",
        ".pagination",
        ".iniadplus-menu-item",
        ".iniadpp-download-group",
        ".mymemo-contents"
    ].join(","));
}

function normalizeMoocsText(text){
    return String(text || "").replace(/\s+/g, " ").trim();
}
