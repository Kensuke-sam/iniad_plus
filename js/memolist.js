$(function(){
    if(window.location.href !== "https://moocs.iniad.org/courses?memolists") return;

    $(".content-wrapper").empty();
    const addhtml = '<section class="content-header"><h1>保存したメモ一覧</h1></section><section class="content container-fluid"><ul class="mymemolist list-group list-group-flush"></ul></section>';
    $(".content-wrapper").append(addhtml);

    for(let stgkey in localStorage){
        let decodedstgkey;
        try { decodedstgkey = decodeURIComponent(stgkey); } catch(e) { continue; }
        if(decodedstgkey.indexOf("https://moocs.iniad.org") !== 0) continue;

        let list;
        try { list = JSON.parse(localStorage[stgkey]); } catch(e) { continue; }
        if(!Array.isArray(list)) continue;

        let hasContent = false;
        for(let content of list){
            if(typeof content === "string" && content !== ""){ hasContent = true; break; }
        }
        if(!hasContent) continue;

        const $li = $('<li class="list-group-item"><a></a></li>');
        $li.find("a").attr("href", decodedstgkey).text(decodedstgkey);
        $(".mymemolist").append($li);
    }
});
