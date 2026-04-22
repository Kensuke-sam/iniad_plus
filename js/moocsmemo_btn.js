var memoclicked = false;

function memoui()
{
    $(".mymemo-contents").draggable();
    $(".mymemo-contents").resizable();
    $(".mymemo-contents").css({
        "position": "fixed",
        "z-index": "5"
    });//何故かバグるのでCSSを上書き
}

function createMemoNode(cnt, rand, text){
    const template = '<div class="mymemo-contents"><ul class="memoul"><li><i class="fa fa-trash memodelete" title="削除"></i></li><li><i class="fa fa-plus memonew" title="新規"></i></li><li><i class="fa fa-times memocross" title="閉じる"></i></li></ul><div class="mymemopd"></div><textarea rows="15" class="textarea-mymemo" placeholder="入力した文字はweb上に自動的に保存されます"></textarea><button class="btn btn-primary btn-sm memobtn"><i class="fa fa-download"></i>ダウンロード</button></div>';
    const $node = $(template);
    $node.attr("cnt", String(Number(cnt) || 0));
    $node.css("right", String(Number(rand) || 0) + "%");
    if(typeof text === "string" && text !== ""){
        $node.find("textarea.textarea-mymemo").val(text);
    }
    return $node;
}

function readMemoList(){
    const raw = localStorage[encodeURIComponent(window.location.origin + window.location.pathname)];
    if(!raw) return null;
    let parsed;
    try { parsed = JSON.parse(raw); } catch(e) { return null; }
    if(!Array.isArray(parsed)) return null;
    return parsed;
}

function writeMemoList(list){
    localStorage[encodeURIComponent(window.location.origin + window.location.pathname)] = JSON.stringify(list);
}

function decodeMemoItem(item){
    if(typeof item !== "string" || item === "") return "";
    try { return decodeURIComponent(item); } catch(e) { return ""; }
}

$(document).on("click", "#mynote", function(){
    if(!memoclicked){
        memoclicked = true;

        if($(".mymemo-contents").length != 0){
            $(".mymemo-contents").css({
                "display": "block"
            });
        }

        else{
            const memoList = readMemoList();

            if(memoList){
                let cnt = 0;
                let null_check = false;
                for(let item of memoList){
                    if(typeof item === "string" && item !== ""){
                        null_check = true;
                        const rand = Math.random() * 3 + 3;
                        $(".content-wrapper").prepend(createMemoNode(cnt, rand, decodeMemoItem(item)));
                    }
                    cnt++;
                }
                if(!null_check){//すべて消してしまった場合の処理
                    const rand = Math.random() * 3 + 3;
                    $(".content-wrapper").prepend(createMemoNode(0, rand, ""));
                }
            }

            else{//ない場合
                const rand = Math.random() * 3 + 3;
                $(".content-wrapper").prepend(createMemoNode(0, rand, ""));
            }

            memoui();
        }
    }
    else{
        memoclicked = false;
        $(".mymemo-contents").css({
            "display": "none"
        });
    }
});

$(document).on("click", ".memocross", function(){
    memoclicked = false;
    $($(this).parent().parent().parent()).css({
        "display": "none"
    });
});

$(document).on("click", ".memonew", function(){
    let contents = $(".mymemo-contents");
    let default_cnt = 0;
    contents.each(function(index){
        if(Number($(this).attr("cnt")) > default_cnt){
            default_cnt = Number($(this).attr("cnt"));
        }//最大値の取得
    });

    default_cnt++;

    const rand = Math.random() * 6 + 3;
    $(".content-wrapper").prepend(createMemoNode(default_cnt, rand, ""));
    memoui();
});

$(document).on("click", ".memodelete", function(){
    let cnt = Number($($(this).parent().parent().parent()).attr("cnt"));
    const list = readMemoList();
    if(list){
       list[cnt] = null;//データをなかったことにする(実際はnullがあるので注意)
       writeMemoList(list);
       $($(this).parent().parent().parent()).remove();
    }
    else{
        alert("何も保存されていない場合は削除できません");
    }

});

$(document).on("click", ".memobtn", function(){
    let textdl = $($($(this).parent()).find("textarea")).val();
    let link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([textdl],{
        type: "text/plain"
    }));
    link.download = $("title").text() + ".txt";
    link.click();
});

$(document).on("input", ".textarea-mymemo", function(){
    let text_localstg = $(this).val();
    let textarea_cnt = Number($($(this).parent()).attr("cnt"));
    let list = readMemoList();
    if(!Array.isArray(list)) list = [];

    list[textarea_cnt] = encodeURIComponent(text_localstg);//既存の書き換えの場合

    writeMemoList(list);
});

//クリックした時その要素が一番前に出るように
$(document).on("mousedown", ".mymemo-contents", function(){
    $(".mymemo-contents").css({
        "z-index": "5"
    });

    $(this).css({
        "z-index": "6"
    });
});
