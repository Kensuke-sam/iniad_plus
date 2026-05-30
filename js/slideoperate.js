$(function(){
    if($(".embed-responsive").length != 0){
        const slidedefaultbtn = '<div class="btn-group"><button class="btn btn-primary" id="slidedefault"><i class="fa fa-file"></i> スライド位置を元に戻す</button><a href="/courses?slideoperate" class="btn btn-success" target="_blank"><i class="fa fa-question-circle"></i>スライド操作の説明</a></div>';
        $($(".pad-block")[0]).prepend(slidedefaultbtn);
    }
});

$(document).on("click", "#slidedefault", function(){
    $(".embed-responsive").css({
        "transform": "scale(1) translate(0px, 0px)"
    });
});
