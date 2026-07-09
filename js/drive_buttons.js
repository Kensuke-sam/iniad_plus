$(function(){
    if(window.location.hostname !== "moocs.iniad.org") return;
    if(window.location.pathname !== "/courses") return;

    function getCourseYear(){
        let year = "";
        $(".active").each(function(){
            const match = $(this).text().match(/20\d{2}/);
            if(match){
                year = match[0];
                return false;
            }
        });

        if(year) return year;

        const activeText = $(".active").first().text().trim();
        return activeText.split(/\s+/)[1] || "";
    }

    function normalizeCourseTitle(text){
        return text
            .replace(/\s+/g, " ")
            .trim()
            .split(/[＆&（(]/)[0]
            .trim();
    }

    function getCourseRoot($title){
        const $root = $title.closest(".well, .media, .box, [class*='col-']");
        if($root.length) return $root.first();
        return $title.parent();
    }

    function getButtonHost($title){
        const $mediaBody = $title.closest(".media-body");
        if($mediaBody.length) return $mediaBody.first();
        return $title.parent();
    }

    function createDriveButton(query, courseTitle){
        const $opendrive = $("<a></a>", {
            href: "https://drive.google.com/drive/u/0/search?q=" + encodeURIComponent(query),
            class: "btn btn-success drive-search",
            target: "_blank",
            rel: "noopener noreferrer",
            title: courseTitle + " をGoogle Driveで探す",
            "aria-label": courseTitle + " をGoogle Driveで探す"
        });

        $opendrive.append($("<i></i>").addClass("fa fa-folder-open").attr("aria-hidden", "true"));
        $opendrive.append(document.createTextNode(" ドライブで探す"));
        return $opendrive;
    }

    function appendDriveButtons(){
        const year = getCourseYear();

        $(".media-heading").each(function(){
            const $title = $(this);
            const courseTitle = normalizeCourseTitle($title.text());
            if(!courseTitle) return;

            const $root = getCourseRoot($title);
            if($root.find(".drive-search").length) return;

            const query = ["type:folder", year, courseTitle]
                .filter(function(part){ return part && part.trim(); })
                .join(" ");
            const $opendrive = createDriveButton(query, courseTitle);
            const $courseButton = $root.find("a.btn, button.btn").filter(function(){
                return /Course|コース/.test($(this).text());
            }).first();

            if($courseButton.length){
                $courseButton.after(" ", $opendrive);
                return;
            }

            getButtonHost($title).append(" ", $opendrive);
        });
    }

    let appendScheduled = false;
    function scheduleAppendDriveButtons(){
        if(appendScheduled) return;
        appendScheduled = true;
        window.setTimeout(function(){
            appendScheduled = false;
            appendDriveButtons();
        }, 50);
    }

    appendDriveButtons();

    const target = document.querySelector(".container-fluid") || document.body;
    if(window.MutationObserver && target){
        new MutationObserver(scheduleAppendDriveButtons).observe(target, {
            childList: true,
            subtree: true
        });
    }
});
