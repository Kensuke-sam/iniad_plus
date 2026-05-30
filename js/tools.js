$(function(){
    const $sidebarMenu = $(".sidebar-menu");
    if($sidebarMenu.length === 0) return;

    cleanupExistingIniadplusMenuItems($sidebarMenu);

    const extension = '<li class="header iniadplus-menu-item">INIAD Plus</li>';
    $sidebarMenu.append(extension);

    const inserthtml = [
        '<li class="treeview iniadplus-menu-item" id="iniadplus-external-links">',
        '    <a href="#" id="iniadplus-external-links-toggle" aria-expanded="false">',
        '        <i class="fa fa-link"></i>',
        '        <span>',
        '            <span class="sidebar-menu-text">外部リンク</span>',
        '        </span>',
        '        <span class="pull-right-container">',
        '            <i class="fa fa-angle-left pull-right"></i>',
        '        </span>',
        '    </a>',
        '    <ul class="treeview-menu" style="display: none;">',
        '        <li>',
        '            <a href="https://iniad-lectures.slack.com" target="_blank" rel="noopener noreferrer"><span><span class="sidebar-menu-text">Slack</span></span></a>',
        '        </li>',
        '        <li>',
        '            <a href="https://www.ace.toyo.ac.jp/ct/home" target="_blank" rel="noopener noreferrer"><span><span class="sidebar-menu-text">ToyoNet-ACE</span></span></a>',
        '        </li>',
        '        <li>',
        '            <a href="https://ini-connect.net/" target="_blank" rel="noopener noreferrer"><span><span class="sidebar-menu-text">INI-connect</span></span></a>',
        '        </li>',
        '    </ul>',
        '</li>'
    ].join("");
    $sidebarMenu.append(inserthtml);

    const mymemo = [
        '<li class="iniadplus-menu-item">',
        '    <a id="mynote">',
        '        <i class="fa fa-sticky-note-o"></i>',
        '        <span>',
        '            <span class="sidevar-menu-text">このページのメモ</span>',
        '        </span>',
        '    </a>',
        '</li>'
    ].join("");
    $sidebarMenu.append(mymemo);

    const mymemolists = [
        '<li class="iniadplus-menu-item">',
        '    <a href="https://moocs.iniad.org/courses?memolists">',
        '        <i class="fa fa-list"></i>',
        '        <span>',
        '            <span class="sidevar-menu-text">メモを保存したページ一覧</span>',
        '        </span>',
        '    </a>',
        '</li>'
    ].join("");
    $sidebarMenu.append(mymemolists);
});

function cleanupExistingIniadplusMenuItems($sidebarMenu){
    $sidebarMenu.children(".iniadplus-menu-item").remove();

    $sidebarMenu.children("li.header").filter(function(){
        return $(this).text().trim() === "INIAD Plus";
    }).remove();

    $sidebarMenu.children("li").filter(function(){
        const label = $(this).children("a").first().text().replace(/\s+/g, " ").trim();
        return label === "外部リンク" ||
            label === "このページのメモ" ||
            label === "メモを保存したページ一覧";
    }).remove();
}

$(document)
    .off("click.iniadplusExternalLinks", "#iniadplus-external-links-toggle")
    .on("click.iniadplusExternalLinks", "#iniadplus-external-links-toggle", function(event){
        event.preventDefault();
        event.stopPropagation();

        const $item = $("#iniadplus-external-links");
        const $menu = $item.children(".treeview-menu");
        const willOpen = !$item.hasClass("menu-open");

        $item.toggleClass("active menu-open", willOpen);
        $(this).attr("aria-expanded", willOpen ? "true" : "false");
        $menu.stop(true, true).toggle(willOpen);
    });
