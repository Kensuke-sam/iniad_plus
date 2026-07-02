$(document).on("click", "#ace_dl_button", function(){
	if (window.location.pathname == "/ct/home") {
		let conf = confirm("jsonをダウンロードしますか?");
		if (conf) {
			let table = $(".stdlist")[0];
			if (!table) return;

			let tbody = $(table).find("tr");
			let result = {};
			for (let i = 1; i < 9; i++) {
				let l = [];
				if (!tbody[i]) {
					result[i] = l;
					continue;
				}

				let one_time = $(tbody[i]).find(".course");
				for (let i2 = 0; i2 < one_time.length; i2++) {
					let course = "";
					if ($(one_time[i2]).hasClass("course-cell")) {
						let link = $(one_time[i2]).find("a")[0];
						course = link ? link.textContent : "";
					}
					l.push(course);
				}
				result[i] = l;
			}
			let result_json = JSON.stringify(result, null, "");
			let link = document.createElement("a");
			let objectUrl = URL.createObjectURL(new Blob([result_json], {
				type: "application/json"
			}));
			link.href = objectUrl;
			link.download = ("timetable.json");
			link.click();
			setTimeout(function(){
				URL.revokeObjectURL(objectUrl);
			}, 0);
		}
	}
});
