$(function(){
    if(window.location.hostname !== "moocs.iniad.org") return;

    markMoocsAssignmentTabs();
    setTimeout(markMoocsAssignmentTabs, 800);
});

const iniadppAssignmentDashboardId = "iniadpp-assignment-dashboard";
const iniadppAssignmentClassPrefix = "iniadpp-assignment-tab-";
const iniadppAssignmentStateClasses = [
    iniadppAssignmentClassPrefix + "pending",
    iniadppAssignmentClassPrefix + "attendance",
    iniadppAssignmentClassPrefix + "submit",
    iniadppAssignmentClassPrefix + "unknown"
].join(" ");
const iniadppLessonClassificationCache = {};
let iniadppAssignmentScanVersion = 0;

function markMoocsAssignmentTabs(){
    const tabItems = collectMoocsLessonTabs();
    if(!tabItems.length) return;

    const scanVersion = ++iniadppAssignmentScanVersion;
    renderMoocsAssignmentDashboard(tabItems);

    tabItems.forEach(function(item){
        updateMoocsLessonTabState(item, "pending");
    });

    tabItems.forEach(function(item){
        classifyMoocsLessonTab(item.url)
            .then(function(kind){
                if(scanVersion !== iniadppAssignmentScanVersion) return;
                updateMoocsLessonTabState(item, kind || "none");
                updateMoocsAssignmentDashboard();
            })
            .catch(function(error){
                if(scanVersion !== iniadppAssignmentScanVersion) return;
                updateMoocsLessonTabState(item, "unknown");
                updateMoocsAssignmentDashboard();
                console.warn("[INIAD Plus] Failed to inspect lesson tab:", item.url, error);
            });
    });

    updateMoocsAssignmentDashboard();
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
        '            <span>提出</span>',
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
    $dashboard.find('[data-count="pending"]').text(String(pendingCount));
    $dashboard.find('[data-filter="attendance"]').prop("disabled", counts.attendance === 0);
    $dashboard.find('[data-filter="submit"]').prop("disabled", counts.submit === 0);
    $dashboard.find('[data-filter="pending"]').prop("disabled", pendingCount === 0);

    renderMoocsAssignmentDashboardList($dashboard, tabItems);
}

function countMoocsAssignmentStates(tabItems){
    const counts = { attendance: 0, submit: 0, pending: 0, unknown: 0, none: 0 };
    tabItems.forEach(function(item){
        const state = item.state || item.$li.attr("data-iniadpp-assignment-state") || "pending";
        counts[state] = (counts[state] || 0) + 1;
    });
    return counts;
}

function renderMoocsAssignmentDashboardList($dashboard, tabItems){
    const $list = $dashboard.find(".iniadpp-assignment-dashboard__list");
    const visibleItems = tabItems.filter(function(item){
        return item.state === "attendance" || item.state === "submit" || item.state === "unknown";
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
    if(state === "submit") return "提出";
    if(state === "unknown") return "未確認";
    return "確認中";
}

$(document).on("click", ".iniadpp-assignment-dashboard__refresh", function(){
    Object.keys(iniadppLessonClassificationCache).forEach(function(key){
        delete iniadppLessonClassificationCache[key];
    });
    markMoocsAssignmentTabs();
});

$(document).on("click", ".iniadpp-assignment-dashboard__stat", function(){
    const filter = $(this).attr("data-filter");
    const $dashboard = $("#" + iniadppAssignmentDashboardId);
    const tabItems = $dashboard.data("tabItems") || [];
    const targetStates = filter === "pending" ? ["pending", "unknown"] : [filter];
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

        return normalizeMoocsUrl(new URL(rawHref, window.location.href).href);
    } catch(error){
        return "";
    }
}

function normalizeMoocsUrl(rawUrl){
    const url = new URL(rawUrl, window.location.href);
    url.hash = "";
    return url.href;
}

function classifyMoocsLessonTab(url){
    if(normalizeMoocsUrl(url) === normalizeMoocsUrl(window.location.href)){
        return Promise.resolve(classifyMoocsLessonDocument(document));
    }

    if(Object.prototype.hasOwnProperty.call(iniadppLessonClassificationCache, url)){
        return iniadppLessonClassificationCache[url];
    }

    iniadppLessonClassificationCache[url] = fetch(url, {
        credentials: "include",
        cache: "force-cache"
    })
        .then(function(response){
            if(!response.ok) throw new Error("HTTP " + response.status);
            return response.text();
        })
        .then(function(html){
            const parsed = new DOMParser().parseFromString(html, "text/html");
            return classifyMoocsLessonDocument(parsed);
        })
        .catch(function(error){
            delete iniadppLessonClassificationCache[url];
            throw error;
        });

    return iniadppLessonClassificationCache[url];
}

function classifyMoocsLessonDocument(doc){
    const text = normalizeMoocsText(getMoocsLessonMainText(doc));

    if(isMoocsAttendanceAssignment(text)){
        return "attendance";
    }

    return hasMoocsSubmissionField(doc) ? "submit" : "";
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

function hasMoocsSubmissionField(doc){
    const fields = doc.querySelectorAll("textarea, select, input");

    for(let i = 0; i < fields.length; i++){
        const field = fields[i];
        const type = (field.getAttribute("type") || "").toLowerCase();

        if(["hidden", "submit", "button", "reset", "search"].indexOf(type) !== -1) continue;
        if(isMoocsIgnoredElement(field)) continue;

        const scope = field.closest("form, .box, .panel, .well, section, article, .content") || field.parentElement;
        const scopeText = normalizeMoocsText(scope ? scope.textContent : "");

        if(isMoocsSubmissionScope(scopeText)){
            return true;
        }
    }

    return hasMoocsSubmitButton(doc);
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
    return /(提出|課題|回答|解答|アップロード|ファイル|assignment|answer|submit|upload)/i.test(text);
}

function isMoocsAttendanceAssignment(text){
    return /(出席|出欠|attendance)/i.test(text);
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
