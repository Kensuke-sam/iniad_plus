$(function(){
    if(window.location.pathname == "/courses"){
        const result_timetable = localStorage["timetable"];

        if(result_timetable){
            let timetable_json;
            try{
                const result_timetable_decoded = decodeURIComponent(result_timetable);
                timetable_json = JSON.parse(result_timetable_decoded);
            }
            catch(error){
                console.error("Failed to parse timetable from localStorage.", error);
                return;
            }

            let now = new Date();
            let now_day = now.getDay() - 1;
            let now_hour = now.getHours();
            let now_minute = now.getMinutes();
            //1限9:00 2限10:40 3限13:00 4限14:45 5限16:00 6限18:15 7限19:55
            //0900 1040 1300 1445 1600 1815 1955

            const timetable_rows = Object.keys(timetable_json)
                .map(Number)
                .filter(Number.isInteger)
                .sort((a, b) => a - b)
                .map((key) => Array.isArray(timetable_json[key]) ? timetable_json[key] : []);

            const max_days = timetable_rows.reduce((max, row) => Math.max(max, row.length), 0);
            const timetable_json_day = Array.from({ length: max_days }, (_, dayIndex) => {
                return timetable_rows.map((row) => {
                    const cls = row[dayIndex];
                    return typeof cls === "string" ? cls : "";
                });
            });

            let now_hour2 = ("0" + now_hour).slice(-2);
            let now_minute2 = ("0" + now_minute).slice(-2);

            let time_str =  String(now_day) + now_hour2 + now_minute2;

            if(now_day == -1 || time_str > 51955) time_str = 0;

            const timelist = [
                [900, 1040, 1300, 1445, 1630, 1815, 1955],
                [10900, 11040, 11300, 11445, 11630, 11815, 11955],
                [20900, 21040, 21300, 21445, 21630, 21815, 21955],
                [30900, 31040, 31300, 31445, 31630, 31815, 31955],
                [40900, 41040, 41300, 41445, 41630, 41815, 41955],
                [50900, 51040, 51300, 51445, 51630, 51815, 51955],
            ];

            let timepointer = [];
            let timepointer2 = [];//オーバーフロー対策
            for(let thistimes of timelist){
                for(let thistime of thistimes){
                    if(time_str <= thistime){
                        timepointer.push(thistime);
                    }
                    else{
                        timepointer2.push(thistime);
                    }
                }
            }


            let cls = "";

            let break_ = false;

            for(let d of timepointer){
                if(break_) break;

                let cnt = 0;
                for(let thistimes of timelist){
                    if(break_) break;

                    let cnt2 = 0;
                    for(let thistime of thistimes){
                        if(d == thistime){
                            cls = timetable_json_day[cnt]?.[cnt2] || "";
                            if(cls != ""){
                                break_ = true;
                                break;
                            }
                        }

                        cnt2++;
                    }
                    cnt++;
                }
            }

            if(!break_){
                let break2_ = false;
                for(let d of timepointer2){
                    if(break2_) break;

                    let cnt = 0;
                    for(let thistimes of timelist){
                        if(break2_) break;

                        let cnt2 = 0;
                        for(let thistime of thistimes){
                            if(d == thistime){
                                cls = timetable_json_day[cnt]?.[cnt2] || "";
                                if(cls != ""){
                                    break2_ = true;
                                    break;
                                }
                            }

                            cnt2++;
                        }
                        cnt++;
                    }
                }
            }

            if(cls){
                const $alt = $('<div id="mycls" class="alert alert-warning"><i class="fa fa-exclamation-triangle"></i>次の講義は<b></b>です</div>');
                $alt.find("b").text(cls);
                $(".content-header").append($alt);
            }
        }

    }
});
