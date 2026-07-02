$(function(){
    if(window.location.hostname !== "moocs.iniad.org") return;

    const $bodys = $(".media-body");
    let year = $(".active").first().text();
    year = year.split(" ")[1] || "";//一番手前にスペースがあるっぽいので
    const $courseTitle = $bodys.find(".media-heading");//コースのタイトル

    $courseTitle.each(function(index){
        let thistext = $(this).text();
        thistext = thistext.split("＆")[0];
        thistext = thistext.split("&")[0];
        thistext = thistext.split("（")[0];
        thistext = thistext.split("(")[0];

        const query = ["type:folder", year, thistext]
            .filter(function(part){ return part && part.trim(); })
            .join(" ");
        const $opendrive = $("<a></a>", {
            href: "https://drive.google.com/drive/u/0/search?q=" + encodeURIComponent(query),
            class: "btn btn-success drive-search",
            target: "_blank",
            rel: "noopener noreferrer"
        });

        $opendrive.append($("<i></i>").addClass("fa fa-folder-open"));
        $opendrive.append(document.createTextNode("ドライブで探す"));
        $bodys.eq(index).append($opendrive);
    });

});
