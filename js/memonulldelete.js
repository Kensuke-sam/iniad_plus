$(function(){
    const memoKeyPrefixes = [
        encodeURIComponent("https://moocs.iniad.org"),
        encodeURIComponent("https://www.ace.toyo.ac.jp")
    ];
    for(let stg in localStorage){
        let isMemoKey = false;
        for(let p of memoKeyPrefixes){
            if(stg.indexOf(p) === 0){ isMemoKey = true; break; }
        }
        if(!isMemoKey) continue;

        let list;
        try { list = JSON.parse(localStorage[stg]); } catch(e) { continue; }
        if(!Array.isArray(list)) continue;

        const looksLikeMemoArray = list.every(function(c){
            return c === null || c === undefined || typeof c === "string";
        });
        if(!looksLikeMemoArray) continue;

        const compacted = [];
        for(let i = 0; i < list.length; i++){
            if(typeof list[i] === "string" && list[i] !== ""){
                compacted.push(list[i]);
            }
        }

        if(compacted.length === 0){
            delete localStorage[stg];
        }
        else if(compacted.length !== list.length){
            localStorage[stg] = JSON.stringify(compacted);
        }
    }
});
