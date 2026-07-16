$(function(){
    if(window.location.pathname == "/courses"){
        if(localStorage.getItem("registedclass") != null){
            let classes_data = localStorage.getItem("registedclass");
            let classes_parsed;
            try{
                classes_parsed = JSON.parse(classes_data);
            }
            catch(error){
                console.error("Failed to parse registedclass from localStorage.", error);
                localStorage.removeItem("registedclass");
                return;
            }
            // 配列以外が保存されていると .flex を空にした後の反復で落ち、コース一覧が消えるため先に検証する
            if(!Array.isArray(classes_parsed)){
                localStorage.removeItem("registedclass");
                return;
            }

            let classes = $(".flex").children();

            let registclasses2 = $(".well");
            let textsh4_2 = $(registclasses2).find(".media-heading");
            let l_txt_2 = [];
            $(textsh4_2).each(function(index){
                l_txt_2.push($(this).text());
            });
            
            let l_txt_2_copy = Array.from(l_txt_2);

            $(".flex").empty();
            let cnt = 0;
            for(let oneclass of classes_parsed){
                cnt = 0;
                for(let onetxt of l_txt_2){
                    if(oneclass == onetxt){
                        $($(".flex")[0]).append(classes[cnt]);
                        l_txt_2_copy[cnt] = "";
                    }
                    cnt++;
                }
            }

            cnt = 0;
            for(let check of l_txt_2_copy){//新着のコースが来た場合にちゃんと反映されるようにするための処理
                if(check != ""){
                    $($(".flex")[0]).append(classes[cnt]);
                }
                cnt++;
            }

            classes = $(".container-fluid");
            classes_mysorted = $(classes).html();//元に戻すボタン対応のやつ
        }
    }
});