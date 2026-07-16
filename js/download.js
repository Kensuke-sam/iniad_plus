/*
MIT License

Copyright (c) 2019-2020 Issei Terada

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

$(function(){
    if(window.location.href.indexOf("docs.google.com/presentation/d/e") == -1) return;
    shouldStartPdfExport().then(function(shouldStart){
        if(!shouldStart) return;
        return runPdfExport();
    }).catch(function(err){
        console.error("[INIAD Plus PDF] エラー:", err);
        return notifyFailure(err);
    }).catch(function(err){
        console.error("[INIAD Plus PDF] エラー通知失敗:", err);
    });
});

function shouldRunPdfExport(){
    try {
        const url = new URL(window.location.href);
        return url.searchParams.get("download") === "true"
            || url.searchParams.get("iniadpp_download") === "1";
    } catch(err){
        return window.location.href.indexOf("download=true") !== -1;
    }
}

async function shouldStartPdfExport(){
    if(shouldRunPdfExport()) return true;
    // Google Slides が未知 query を正規化で落としても、active job と同じタブ・deckなら開始できる。
    const context = await getPdfJobContext();
    if(context.deckMatches === false){
        await abortPdfJobForWrongDeck(context);
        return false;
    }
    return context.ok === true;
}

function isActuallyVisibleGoogleSlidesControl(element){
    if(!element) return false;

    let current = element;
    while(current){
        if(current.hidden === true || current.inert === true) return false;
        if(typeof current.hasAttribute === "function"
            && (current.hasAttribute("hidden") || current.hasAttribute("inert"))){
            return false;
        }
        if(typeof current.getAttribute === "function"
            && (current.getAttribute("aria-hidden") || "").toLowerCase() === "true"){
            return false;
        }

        const style = window.getComputedStyle(current);
        if(style.display === "none"
            || style.visibility === "hidden"
            || style.visibility === "collapse"
            || style.contentVisibility === "hidden"
            || parseFloat(style.opacity) === 0){
            return false;
        }
        current = current.parentElement;
    }

    if(typeof element.getClientRects !== "function") return false;
    const rects = element.getClientRects();
    if(!rects || rects.length === 0) return false;
    let hasPositiveArea = false;
    for(let i = 0; i < rects.length; i++){
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
    return true;
}

function isGoogleSlidesBoundaryIndicated(direction){
    const isPrevious = direction < 0;
    const knownControlSelector = isPrevious
        ? ".punch-viewer-nav-v2-prev, .punch-viewer-nav-prev"
        : ".punch-viewer-nav-v2-next, .punch-viewer-nav-next";
    const labelPattern = isPrevious
        ? /^(?:(?:previous(?:\s+slide)?|prev|back)(?:\b|$)|(?:前のスライド|前へ|戻る)(?:\s|$|[:：]))/i
        : /^(?:(?:next(?:\s+slide)?|forward)(?:\b|$)|(?:次のスライド|次へ|進む)(?:\s|$|[:：]))/i;
    const candidates = new Set();

    document.querySelectorAll(knownControlSelector).forEach(function(element){
        candidates.add(element);
    });
    document.querySelectorAll("[aria-label]").forEach(function(element){
        const label = (element.getAttribute("aria-label") || "").trim();
        // スライド本文や拡張側UIにある同名ボタンは境界根拠にしない。
        if(labelPattern.test(label) && element.closest("[class*='punch-viewer']")){
            candidates.add(element);
        }
    });

    const controlRecords = [];
    candidates.forEach(function(candidate){
        const control = candidate.closest("button, [role='button']") || candidate;
        let record = controlRecords.find(function(item){ return item.control === control; });
        if(!record){
            record = { control: control, signalNodes: [] };
            controlRecords.push(record);
        }
        if(record.signalNodes.indexOf(candidate) === -1) record.signalNodes.push(candidate);
        if(record.signalNodes.indexOf(control) === -1) record.signalNodes.push(control);
    });
    const visibleControls = controlRecords.filter(function(record){
        return isActuallyVisibleGoogleSlidesControl(record.control);
    });

    if(visibleControls.length === 0) return false;
    return visibleControls.every(function(record){
        return record.signalNodes.some(function(node){
            return node.disabled === true
                || node.hasAttribute("disabled")
                || (node.getAttribute("aria-disabled") || "").toLowerCase() === "true";
        });
    });
}

function createPdfSlideNavigator(options){
    options = options || {};
    const sleep = options.sleep;
    const getCurrentPage = options.getCurrentPage;
    const getTotalPages = options.getTotalPages;
    const dispatchArrow = options.dispatchArrow;
    const isCurrentPageRenderable = options.isCurrentPageRenderable || function(){ return true; };
    const isBoundaryIndicated = options.isBoundaryIndicated || function(){ return false; };
    const expectedTotalPages = options.expectedTotalPages;
    const observationWindowsMs = options.observationWindowsMs || [3500, 3500, 3500];
    const pollIntervalMs = options.pollIntervalMs || 50;

    const movementResult = function(fromPage, direction, currentPage){
        if(currentPage === null){
            return { status: "failed", page: null, reason: "現在ページ番号を取得できませんでした" };
        }
        if(direction < 0 && currentPage < fromPage){
            return { status: "moved", page: currentPage };
        }
        if(direction > 0 && currentPage > fromPage){
            return { status: "moved", page: currentPage };
        }
        if(currentPage !== fromPage){
            return {
                status: "failed",
                page: currentPage,
                reason: "page " + fromPage + " から想定外の方向へ page " + currentPage + " に移動しました"
            };
        }
        return { status: "unchanged", page: currentPage };
    };

    const observeMovement = async function(fromPage, direction, timeoutMs){
        const startedAt = Date.now();
        while(Date.now() - startedAt < timeoutMs){
            const currentTotal = getTotalPages();
            if(currentTotal !== expectedTotalPages){
                return {
                    status: "failed",
                    page: getCurrentPage(),
                    reason: "スライド総数が処理中に変更されました"
                };
            }

            const result = movementResult(fromPage, direction, getCurrentPage());
            if(result.status !== "unchanged" && result.status !== "failed") return result;
            if(result.status === "failed" && result.page !== null) return result;
            await sleep(pollIntervalMs);
        }

        return movementResult(fromPage, direction, getCurrentPage());
    };

    const move = async function(fromPage, direction){
        if(direction !== -1 && direction !== 1){
            return { status: "failed", page: fromPage, reason: "移動方向が不正です" };
        }
        if(getTotalPages() !== expectedTotalPages){
            return { status: "failed", page: getCurrentPage(), reason: "スライド総数を確認できませんでした" };
        }

        const currentBeforeMove = movementResult(fromPage, direction, getCurrentPage());
        if(currentBeforeMove.status === "moved" || currentBeforeMove.status === "failed"){
            return currentBeforeMove;
        }

        // ページ番号そのものが端なら、非表示ページの推測なしで境界を確定できる。
        if((direction < 0 && fromPage <= 1)
            || (direction > 0 && fromPage >= expectedTotalPages)){
            return { status: "boundary", page: fromPage, confirmedBy: "page-number" };
        }

        // 同じ移動にキーを再送すると、遅延した入力が後から二重適用されて表示ページを飛ばし得る。
        // 入力は1回だけにして、複数の観測窓を連続させる。
        dispatchArrow(direction);
        let lastObservation = null;
        for(let windowIndex = 0; windowIndex < observationWindowsMs.length; windowIndex++){
            const result = await observeMovement(
                fromPage,
                direction,
                observationWindowsMs[windowIndex]
            );
            lastObservation = result;
            if(result.status === "moved"){
                result.observationWindow = windowIndex + 1;
                return result;
            }
            if(result.status === "failed" && result.page !== null){
                result.observationWindow = windowIndex + 1;
                return result;
            }
        }

        if(lastObservation && lastObservation.status === "failed"){
            return lastObservation;
        }
        if(!isCurrentPageRenderable()){
            return {
                status: "failed",
                page: getCurrentPage(),
                reason: "移動しない状態で表示中スライドを確認できませんでした"
            };
        }

        if(isBoundaryIndicated(direction)){
            return {
                status: "boundary",
                page: fromPage,
                confirmedBy: "disabled-navigation-control"
            };
        }
        return {
            status: "failed",
            page: fromPage,
            reason: "前後ナビゲーションが無効であることを確認できませんでした"
        };
    };

    return { move: move };
}

function createPdfRenderedSlideWaiter(options){
    const sleep = options.sleep;
    const getCurrentPage = options.getCurrentPage;
    const getRenderedSvg = options.getRenderedSvg;
    const getRenderedSvgSignature = options.getRenderedSvgSignature;
    const getPreviousRenderedSvg = options.getPreviousRenderedSvg;
    const getPreviousRenderedSvgSignature = options.getPreviousRenderedSvgSignature;
    const createObserver = options.createObserver || function(callback){
        return new MutationObserver(callback);
    };
    const now = options.now || function(){ return Date.now(); };
    const stableMs = options.stableMs === undefined ? 160 : options.stableMs;
    const timeoutMs = options.timeoutMs === undefined ? 20000 : options.timeoutMs;
    const pollIntervalMs = options.pollIntervalMs === undefined ? 80 : options.pollIntervalMs;

    const wait = async function(expectedPage){
        let candidatePage = null;
        let candidateSvg = null;
        let candidateSignature = "";
        let lastMutationAt = 0;
        let hasFreshRenderEvidence = false;
        let mutationDirty = false;
        let observer = null;
        const startedAt = now();

        const clearCandidate = function(){
            if(observer){
                observer.disconnect();
                observer = null;
            }
            candidatePage = null;
            candidateSvg = null;
            candidateSignature = "";
            lastMutationAt = 0;
            hasFreshRenderEvidence = false;
            mutationDirty = false;
        };

        const watchCandidate = function(page, svg){
            clearCandidate();
            candidatePage = page;
            candidateSvg = svg;
            candidateSignature = getRenderedSvgSignature(svg);
            lastMutationAt = now();
            hasFreshRenderEvidence = getPreviousRenderedSvg() === null
                || svg !== getPreviousRenderedSvg()
                || candidateSignature !== getPreviousRenderedSvgSignature();
            observer = createObserver(function(){
                lastMutationAt = now();
                hasFreshRenderEvidence = true;
                mutationDirty = true;
            });
            observer.observe(svg, {
                attributes: true,
                childList: true,
                characterData: true,
                subtree: true
            });
        };

        try {
            for(;;){
                const current = getCurrentPage();
                if(current === null || current < expectedPage){
                    clearCandidate();
                } else if(current > expectedPage){
                    throw new Error(
                        "page " + expectedPage
                        + " の描画待機中に page " + current + " まで進みました"
                    );
                } else {
                    const svg = getRenderedSvg();
                    if(!svg || !svg.children || svg.children.length === 0){
                        clearCandidate();
                    } else {
                        if(candidatePage !== current || candidateSvg !== svg){
                            watchCandidate(current, svg);
                        } else {
                            const currentTime = now();
                            // 静止確認中の毎ポーリング全量シリアライズを避け、変異を観測したときだけ署名を取り直す
                            if(mutationDirty){
                                mutationDirty = false;
                                candidateSignature = getRenderedSvgSignature(svg);
                            }
                            if(hasFreshRenderEvidence && currentTime - lastMutationAt >= stableMs){
                                return { page: current, svg: svg };
                            }
                        }
                    }
                }

                if(now() - startedAt > timeoutMs){
                    throw new Error(
                        "page " + expectedPage
                        + " の新しいスライド描画を確認できませんでした"
                    );
                }
                await sleep(pollIntervalMs);
            }
        } finally {
            if(observer) observer.disconnect();
        }
    };

    return { wait: wait };
}

async function verifyPdfFinalVisibleBoundary(options){
    const expectedPage = options.expectedPage;
    const expectedTotalPages = options.expectedTotalPages;
    const boundaryResult = options.boundaryResult;
    const sleep = options.sleep;
    const getCurrentPage = options.getCurrentPage;
    const getTotalPages = options.getTotalPages;
    const getRenderedSvg = options.getRenderedSvg;
    const isBoundaryIndicated = options.isBoundaryIndicated;
    const graceMs = options.graceMs === undefined ? 750 : options.graceMs;
    const pollIntervalMs = options.pollIntervalMs === undefined ? 50 : options.pollIntervalMs;
    const now = options.now || function(){ return Date.now(); };

    if(!boundaryResult || boundaryResult.status !== "boundary"
        || boundaryResult.page !== expectedPage){
        throw new Error("収集時の最後の表示ページ境界を確認できませんでした");
    }

    const hasBoundaryProof = function(){
        if(boundaryResult.confirmedBy === "page-number"){
            return expectedPage >= expectedTotalPages
                && getTotalPages() === expectedTotalPages;
        }
        if(boundaryResult.confirmedBy === "disabled-navigation-control"){
            return isBoundaryIndicated(1) === true;
        }
        return false;
    };
    const assertStableFinalState = function(){
        if(getCurrentPage() !== expectedPage){
            throw new Error("PDF最終確認中に page " + expectedPage + " から表示位置が変わりました");
        }
        const svg = getRenderedSvg();
        if(!svg || !svg.children || svg.children.length === 0){
            throw new Error("PDF最終確認中に最後の表示スライドを取得できなくなりました");
        }
        if(!hasBoundaryProof()){
            throw new Error("PDF最終確認中に最後の表示ページ境界を確認できなくなりました");
        }
    };

    assertStableFinalState();
    const startedAt = now();
    while(now() - startedAt < graceMs){
        await sleep(Math.min(pollIntervalMs, graceMs - (now() - startedAt)));
        assertStableFinalState();
    }
    return boundaryResult;
}

async function runPdfExport(){
    const sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };

    // background がある構成では、収集開始前に active job を確定して以降のterminal通知に使う。
    const jobContext = await getPdfJobContext();
    if(jobContext.deckMatches === false){
        await abortPdfJobForWrongDeck(jobContext);
        return;
    }
    if(jobContext.runtimeApi && !jobContext.ok && !jobContext.legacyManual){
        console.warn(
            "[INIAD Plus PDF] active job contextを取得できないため自動保存を無効化します:",
            jobContext.error || "unknown error"
        );
    }

    const waitFor = async function(check, opts){
        opts = opts || {};
        const timeout = opts.timeout || 15000;
        const interval = opts.interval || 80;
        const start = Date.now();
        for(;;){
            try {
                if(check()) return;
            } catch(e){}
            if(Date.now() - start > timeout){
                throw new Error(opts.message || "状態待機がタイムアウトしました");
            }
            await sleep(interval);
        }
    };

    const getCaption = function(){ return $(".docs-material-menu-button-flat-default-caption"); };
    const getTotalPages = function(){
        const v = parseInt(getCaption().attr("aria-setsize"), 10);
        return isNaN(v) ? null : v;
    };
    const getCurrentPage = function(){
        const v = parseInt(getCaption().text(), 10);
        return isNaN(v) ? null : v;
    };
    const getRenderedSvg = function(){
        return $('.punch-viewer-svgpage-svgcontainer:last>svg').get(0) || null;
    };
    const getRenderedSvgSignature = function(svg){
        if(!svg) return "";
        return [
            svg.getAttribute("viewBox") || "",
            svg.getAttribute("width") || "",
            svg.getAttribute("height") || "",
            svg.innerHTML || ""
        ].join("\u0000");
    };
    let previousRenderedSvg = null;
    let previousRenderedSvgSignature = "";
    const renderedSlideWaiter = createPdfRenderedSlideWaiter({
        sleep: sleep,
        getCurrentPage: getCurrentPage,
        getRenderedSvg: getRenderedSvg,
        getRenderedSvgSignature: getRenderedSvgSignature,
        getPreviousRenderedSvg: function(){ return previousRenderedSvg; },
        getPreviousRenderedSvgSignature: function(){ return previousRenderedSvgSignature; }
    });

    await waitFor(function(){
        const total = getTotalPages();
        const current = getCurrentPage();
        return getCaption().length > 0
            && total !== null && total > 0
            && current !== null && current >= 1 && current <= total;
    }, {
        timeout: 20000,
        message: "現在ページ番号と総ページ数の取得がタイムアウトしました"
    });

    const totalPages = getTotalPages();
    console.log("[INIAD Plus PDF] 総ページ数: " + totalPages);

    const navigator = createPdfSlideNavigator({
        sleep: sleep,
        getCurrentPage: getCurrentPage,
        getTotalPages: getTotalPages,
        expectedTotalPages: totalPages,
        isBoundaryIndicated: isGoogleSlidesBoundaryIndicated,
        isCurrentPageRenderable: function(){
            const svg = getRenderedSvg();
            return !!(svg && svg.children && svg.children.length > 0);
        },
        dispatchArrow: function(direction){
            const isPrevious = direction < 0;
            const keyCode = isPrevious ? 37 : 39;
            const key = isPrevious ? "ArrowLeft" : "ArrowRight";
            const eventOptions = {
                key: key,
                code: key,
                keyCode: keyCode,
                which: keyCode,
                bubbles: true,
                cancelable: true
            };
            document.dispatchEvent(new KeyboardEvent("keydown", eventOptions));
            document.dispatchEvent(new KeyboardEvent("keyup", eventOptions));
        }
    });

    const requireNavigationResult = function(result, context){
        if(result.status === "failed"){
            throw new Error(context + ": " + (result.reason || "スライド移動に失敗しました"));
        }
        return result;
    };

    // page 1 が非表示でも失敗しないよう、番号1ではなく「これ以上左へ進めない最初の表示ページ」へ移動する。
    let firstVisiblePage = getCurrentPage();
    // 後方移動前の表示をbaselineにする。captionだけ先行しても旧SVGを次ページとして採用しない。
    let firstRenderedSlide = await renderedSlideWaiter.wait(firstVisiblePage);
    previousRenderedSvg = firstRenderedSlide.svg;
    previousRenderedSvgSignature = getRenderedSvgSignature(firstRenderedSlide.svg);
    let backwardMoves = 0;
    for(;;){
        if(backwardMoves > totalPages){
            throw new Error("最初の表示ページへの移動回数が総ページ数を超えました");
        }
        const previousResult = requireNavigationResult(
            await navigator.move(firstVisiblePage, -1),
            "最初の表示ページへの移動に失敗しました"
        );
        if(previousResult.status === "boundary") break;
        firstVisiblePage = previousResult.page;
        firstRenderedSlide = await renderedSlideWaiter.wait(firstVisiblePage);
        previousRenderedSvg = firstRenderedSlide.svg;
        previousRenderedSvgSignature = getRenderedSvgSignature(firstRenderedSlide.svg);
        backwardMoves++;
    }

    const pages = [];
    const collectedPageNumbers = new Set();
    let pageTitle = "";
    let expectedPage = firstVisiblePage;
    let lastCollectedPage = null;
    let finalBoundaryResult = null;
    let pendingRenderedSlide = firstRenderedSlide;

    for(;;){
        if(collectedPageNumbers.size >= totalPages){
            throw new Error("表示ページの収集回数が総ページ数を超えました");
        }
        const renderedSlide = pendingRenderedSlide
            || await renderedSlideWaiter.wait(expectedPage);
        pendingRenderedSlide = null;
        const displayedPage = renderedSlide.page;

        if(displayedPage === null || displayedPage < 1 || displayedPage > totalPages){
            throw new Error("表示中スライドのページ番号が範囲外です");
        }
        if(displayedPage !== expectedPage){
            throw new Error(
                "page " + expectedPage
                + " の代わりに page " + displayedPage + " が描画されました"
            );
        }
        if(collectedPageNumbers.has(displayedPage)){
            throw new Error("page " + displayedPage + " を重複して収集しようとしました");
        }

        const svg = renderedSlide.svg;

        if(pages.length === 0){
            const title = $(".punch-viewer-svgpage-a11yelement").attr('aria-label');
            const titleArray = (title || "").split(":").slice(1);
            const pt = titleArray.join("");
            pageTitle = (pt && pt.trim() !== "") ? pt : $("title").text();
        }

        const imageNodes = $(svg).find("image").toArray();
        await Promise.all(imageNodes.map(async function(imgNode){
            const href = $(imgNode).attr("xlink:href") || $(imgNode).attr("href");
            if(!href || href.indexOf("data:") === 0) return;

            let url;
            try { url = new URL(href, window.location.href); } catch(e){ return; }
            if(url.protocol !== "https:") return;
            const host = url.hostname;
            const allowed = host === "docs.google.com"
                || host.endsWith(".googleusercontent.com")
                || host.endsWith(".gstatic.com");
            if(!allowed) return;

            try {
                // 1枚の画像取得が応答しないまま印刷用ページ生成全体を止めないよう上限を設ける
                const res = await fetch(url.toString(), {
                    credentials: "include",
                    signal: createPdfFetchTimeoutSignal(15000)
                });
                if(!res.ok) return;
                const contentType = res.headers.get("Content-Type") || "";
                if(!/^image\//i.test(contentType)) return;
                const blob = await res.blob();
                const dataUrl = await new Promise(function(resolve, reject){
                    const fr = new FileReader();
                    fr.onload = function(){ resolve(fr.result); };
                    fr.onerror = function(){ reject(new Error("FileReader failure")); };
                    fr.readAsDataURL(blob);
                });
                $(imgNode).attr("xlink:href", dataUrl);
            } catch(e){
                console.warn("[INIAD Plus PDF] page " + displayedPage + " 画像のbase64化に失敗:", e);
            }
        }));

        pages.push(new XMLSerializer().serializeToString(svg));
        collectedPageNumbers.add(displayedPage);
        lastCollectedPage = displayedPage;
        previousRenderedSvg = svg;
        previousRenderedSvgSignature = getRenderedSvgSignature(svg);

        const nextResult = requireNavigationResult(
            await navigator.move(displayedPage, 1),
            "page " + displayedPage + " から次の表示ページへの移動に失敗しました"
        );
        if(nextResult.status === "boundary"){
            finalBoundaryResult = nextResult;
            break;
        }
        expectedPage = nextResult.page;
    }

    if(lastCollectedPage === null || pages.length === 0){
        throw new Error("表示スライドを1ページも収集できませんでした");
    }
    await verifyPdfFinalVisibleBoundary({
        expectedPage: lastCollectedPage,
        expectedTotalPages: totalPages,
        boundaryResult: finalBoundaryResult,
        sleep: sleep,
        getCurrentPage: getCurrentPage,
        getTotalPages: getTotalPages,
        getRenderedSvg: getRenderedSvg,
        isBoundaryIndicated: isGoogleSlidesBoundaryIndicated
    });

    console.log("[INIAD Plus PDF] 全 " + pages.length + " ページの収集が完了");

    let pageResult = "";
    for(const pageSvg of pages){
        pageResult += "<section class='slide-page'>" + pageSvg + "</section>";
    }

    const safeName = ((pageTitle || "slides") + "").replace(/[\\/:*?"<>|]/g, "_");

    const style = [
        "@page { size: A4 landscape; margin: 0; }",
        "html, body { margin: 0; padding: 0; background: #fff; font-family: sans-serif; }",
        ".slide-page {",
        "  box-sizing: border-box;",
        "  width: 100vw;",
        "  height: 100vh;",
        "  display: flex;",
        "  align-items: center;",
        "  justify-content: center;",
        "  overflow: hidden;",
        "  page-break-after: always;",
        "  break-after: page;",
        "}",
        ".slide-page:last-child { page-break-after: auto; break-after: auto; }",
        ".slide-page > svg {",
        "  width: 100%;",
        "  height: 100%;",
        "  max-width: 100%;",
        "  max-height: 100%;",
        "}",
        "@media screen {",
        "  body { background: #eee; padding: 24px 0; }",
        "  .slide-page { width: min(90vw, 1280px); aspect-ratio: 16/9; height: auto; background: #fff; margin: 16px auto; box-shadow: 0 2px 12px rgba(0,0,0,.2); }",
        "  #iniadpp-hint { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: #28a745; color: #fff; padding: 12px 20px; border-radius: 6px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,.25); font-size: 14px; }",
        "  #iniadpp-hint button { margin-left: 12px; padding: 6px 14px; background: #fff; color: #28a745; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }",
        "}",
        "@media print {",
        "  #iniadpp-hint { display: none !important; }",
        "}"
    ].join("\n");

    const hint = '<div id="iniadpp-hint"><span id="iniadpp-hint-text">PDF を生成しています。完了まで少し待ってください。</span><button id="iniadpp-print-btn" type="button">印刷ダイアログを開く</button></div>';

    const result = "<!DOCTYPE html><html lang='ja'><head><meta charset='utf-8'><title>" + safeName + "</title><style>" + style + "</style></head><body>" + hint + pageResult + "</body></html>";

    document.open();
    document.write(result);
    document.close();
    document.title = safeName;
    console.log("[INIAD Plus PDF] 印刷用ページに置換しました");

    const triggerPrint = function(){
        try {
            window.focus();
            window.print();
        } catch(err){
            console.error("[INIAD Plus PDF] window.print() 失敗:", err);
        }
    };

    const btn = document.getElementById("iniadpp-print-btn");
    if(btn){
        btn.addEventListener("click", triggerPrint);
    }

    await sleep(250);

    const exportResult = await requestExport({
        filename: safeName + ".pdf"
    });
    if(exportResult === "saved"){
        updateHint("PDF を保存しています。このタブは自動で閉じます。");
        return;
    }

    if(exportResult === "manual"){
        updateHint("印刷ダイアログから PDF に保存してください。");
    } else {
        updateHint("自動保存に失敗しました。印刷ダイアログから PDF に保存してください。");
    }
    setTimeout(triggerPrint, 800);
}

const MANUAL_SAVE_ERRORS = [
    "manual-save-required",
    "firefox-manual-save-required",
    "inactive-tab"
];

let pdfJobContextCache = null;
let pdfWrongDeckAbortCache = null;
const pdfJobContextRetryDelayMs = 150;

async function getPdfJobContext(){
    const runtimeApi = getRuntimeApi();
    if(!runtimeApi){
        return { ok: false, runtimeApi: null, manual: true, error: "no-background-runtime" };
    }
    if(pdfJobContextCache && pdfJobContextCache.runtimeApi === runtimeApi){
        return pdfJobContextCache.promise;
    }
    const isFirefoxRuntime = typeof browser !== "undefined"
        && browser.runtime === runtimeApi;

    function requestOnce(){
        return Promise.resolve().then(function(){
            return runtimeApi.sendMessage({ type: "iniadpp:pdf-job-context" });
        }).then(function(response){
            if(response && response.ok && typeof response.jobId === "string" && response.jobId){
                const deckMatches = response.deckMatches !== false;
                return {
                    ok: deckMatches,
                    runtimeApi: runtimeApi,
                    jobId: response.jobId,
                    deckMatches: deckMatches,
                    error: deckMatches ? "" : "wrong-deck"
                };
            }
            if(isFirefoxRuntime && !response){
                return {
                    ok: false,
                    runtimeApi: runtimeApi,
                    manual: true,
                    legacyManual: true,
                    error: "unsupported-job-context"
                };
            }
            return {
                ok: false,
                runtimeApi: runtimeApi,
                retryable: true,
                error: response && response.error ? response.error : "invalid-job-context"
            };
        }).catch(function(err){
            if(isFirefoxRuntime){
                return {
                    ok: false,
                    runtimeApi: runtimeApi,
                    manual: true,
                    legacyManual: true,
                    retryable: true,
                    error: err && err.message ? err.message : String(err)
                };
            }
            return {
                ok: false,
                runtimeApi: runtimeApi,
                retryable: true,
                error: err && err.message ? err.message : String(err)
            };
        });
    }

    const promise = requestOnce().then(function(context){
        if(!context.retryable) return context;
        return new Promise(function(resolve){
            setTimeout(resolve, pdfJobContextRetryDelayMs);
        }).then(requestOnce);
    });
    pdfJobContextCache = { runtimeApi: runtimeApi, promise: promise };
    promise.then(function(context){
        if(context.ok || context.deckMatches === false || (context.legacyManual && !context.retryable)) return;
        if(pdfJobContextCache && pdfJobContextCache.promise === promise){
            pdfJobContextCache = null;
        }
    }, function(){
        if(pdfJobContextCache && pdfJobContextCache.promise === promise){
            pdfJobContextCache = null;
        }
    });
    return promise;
}

async function abortPdfJobForWrongDeck(context){
    if(!context || !context.runtimeApi || !context.jobId) return false;
    if(pdfWrongDeckAbortCache
        && pdfWrongDeckAbortCache.runtimeApi === context.runtimeApi
        && pdfWrongDeckAbortCache.jobId === context.jobId){
        return pdfWrongDeckAbortCache.promise;
    }

    const promise = Promise.resolve().then(function(){
        return context.runtimeApi.sendMessage({
            type: "iniadpp:pdf-failed",
            jobId: context.jobId,
            message: "PDF生成タブが対象スライドから移動したため、ジョブを終了しました"
        });
    }).then(function(){
        return true;
    }).catch(function(err){
        console.error("[INIAD Plus PDF] wrong-deckジョブ終了通知失敗:", err);
        return false;
    });
    pdfWrongDeckAbortCache = {
        runtimeApi: context.runtimeApi,
        jobId: context.jobId,
        promise: promise
    };
    return promise;
}

async function requestExport(payload){
    const context = await getPdfJobContext();
    if(!context.runtimeApi){
        return "manual";
    }
    if(context.deckMatches === false){
        await abortPdfJobForWrongDeck(context);
        return "failed";
    }
    if(!context.ok && !context.legacyManual){
        // active job がないタブ (手動保存タブ・ジョブ完了後の再読み込み) は失敗ではなく手動保存の正常経路
        if(context.error === "inactive-tab" || context.manual === true){
            return "manual";
        }
        console.error("[INIAD Plus PDF] job context不明のため自動保存を中止:", context.error);
        return "failed";
    }

    try {
        const message = Object.assign({ type: "iniadpp:pdf-ready" }, payload);
        if(context.ok) message.jobId = context.jobId;
        const response = await context.runtimeApi.sendMessage(message);
        if(response && response.ok && response.saved === true) return "saved";
        const reason = response && response.error ? response.error : "";
        if(MANUAL_SAVE_ERRORS.indexOf(reason) !== -1) return "manual";
        return "failed";
    } catch(err){
        console.error("[INIAD Plus PDF] 自動保存要求失敗:", err);
        return "failed";
    }
}

function createPdfFetchTimeoutSignal(timeoutMs){
    if(typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"){
        return AbortSignal.timeout(timeoutMs);
    }
    return undefined;
}

function updateHint(message){
    const el = document.getElementById("iniadpp-hint-text");
    if(el){
        el.textContent = message;
    }
}

async function notifyFailure(err){
    const message = "PDF生成中にエラーが発生しました:\n" + (err && err.message ? err.message : err);
    updateHint("自動保存に失敗しました。印刷ダイアログから PDF に保存してください。");

    const context = await getPdfJobContext();
    if(context.deckMatches === false){
        await abortPdfJobForWrongDeck(context);
    } else if(context.runtimeApi && (context.ok || context.legacyManual)){
        try {
            const failurePayload = {
                type: "iniadpp:pdf-failed",
                message: message
            };
            if(context.ok) failurePayload.jobId = context.jobId;
            await context.runtimeApi.sendMessage(failurePayload);
        } catch(sendErr){
            console.error("[INIAD Plus PDF] エラー通知失敗:", sendErr);
        }
    }

    alert(message);
}

function getRuntimeApi(){
    if(typeof browser !== "undefined" && browser.runtime && browser.runtime.sendMessage && hasBackgroundRuntime(browser.runtime)){
        return browser.runtime;
    }
    if(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage && hasBackgroundRuntime(chrome.runtime)){
        return chrome.runtime;
    }
    return null;
}

function hasBackgroundRuntime(runtime){
    if(!runtime || !runtime.getManifest) return false;
    try {
        const manifest = runtime.getManifest();
        return !!(manifest && manifest.background);
    } catch(err){
        return false;
    }
}
