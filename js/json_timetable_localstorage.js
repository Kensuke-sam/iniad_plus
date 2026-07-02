$(document).on("change", "#uploadjsonfile", function(e){
    let files = e.target && e.target.files;
    let jsonfile = files && files[0];
    if (!jsonfile) return;

    let reader = new FileReader();

    $(reader).on("load", function(){
        localStorage.setItem("timetable", encodeURIComponent(reader.result));
        alert("登録が完了しました");
        window.location = window.location.href;
    });

    $(reader).on("error", function(){
        alert("ファイルの読み込みに失敗しました");
    });

    reader.readAsText(jsonfile);
});
