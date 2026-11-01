<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/ui/base.css?v=1">
<link rel="stylesheet" href="/ui/icons.css?v=1">
<title><#Web_Title#></title>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="-1">

<link rel="shortcut icon" href="images/favicon.ico">
<link rel="icon" href="images/favicon.png">



<script type="text/javascript" src="/jquery.js"></script>
<script src="/ui/core.js?v=1"></script>

<script type="text/javascript" src="/state.js"></script>
<script src="/ui/state-modern.js?v=1"></script>
<script type="text/javascript" src="/popup.js"></script>
<script type="text/javascript" src="/disk_functions.js"></script>
<script type="text/javascript" src="/client_function.js"></script>
<script>
var $j = jQuery.noConflict();

<% disk_pool_mapping_info(); %>
<% available_disk_names_and_sizes(); %>
<% get_usb_ports_info(); %>
<% get_ext_ports_info(); %>

var all_disks = foreign_disks().concat(blank_disks());
var all_disk_interface = foreign_disk_interface_names().concat(blank_disk_interface_names());

var flag = '<% get_parameter("flag"); %>';
var disk_number = foreign_disks().length+blank_disks().length;

var ccount = <% get_static_ccount(); %>;

function initial(){
	show_banner(0);
	show_menu(1, -1, 0);
	show_footer();
	show_usb_ports();
	show_ata_pool();
	show_mmc_card();
	show_middle_status();
	show_client_status(ccount);
	bind_status_frame_size();
	['linkInternet', 'radioStatusLink', 'clientStatusLink'].forEach(function(id){
		document.getElementById(id).addEventListener('click', function(e){
			if(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
			// 只更新详情框，避免依赖浏览器对同名窗口的查找和重复导航。
			e.preventDefault();
			clickEvent(this.querySelector('.ui-map-symbol'));
			var frame = document.getElementById('statusframe');
			if(frame.getAttribute('src') !== this.getAttribute('href')) frame.src = this.getAttribute('href');
		});
	});
	set_default_choice();

	if (!support_2g_radio() && !support_5g_radio()) { // Remove radio row
		$("row_radio").style.display = "none";
	}

	if(sw_mode == '3')
		$("linkInternet").href = "/device-map/intranet.asp"

	update_internet_status();
}

// 详情内容会随设备数量和页面切换变化，不能继续使用固定高度截断操作区。
function bind_status_frame_size(){
	var frame = document.getElementById('statusframe');
	var observer = null, changes = null, timer = null;
	function fit(){
		timer = null;
		try {
			var doc = frame.contentDocument;
			if (!doc || !doc.body) return;
			// 先解除旧高度，设备变少时也能收起；一次绘制前完成测量和恢复。
			frame.style.height = '1px';
			var height = Math.ceil(Math.max(doc.body.scrollHeight, doc.body.getBoundingClientRect().height, doc.documentElement.scrollHeight, 180)) + 2;
			frame.style.height = height + 'px';
			frame.setAttribute('scrolling', 'no');
		} catch (e) {
			// 异常或跨来源页面保留滚动，不能把剩余内容藏起来。
			frame.style.height = '571px';
			frame.setAttribute('scrolling', 'auto');
		}
	}
	function schedule(){
		if (timer === null) timer = window.setTimeout(fit, 0);
	}
	function watch(){
		if (observer) observer.disconnect();
		if (changes) changes.disconnect();
		observer = changes = null;
		try {
			var doc = frame.contentDocument;
			if (doc && doc.body) {
				if (window.ResizeObserver) {
					observer = new ResizeObserver(schedule);
					observer.observe(doc.body);
				} else if (window.MutationObserver) {
					changes = new MutationObserver(schedule);
					changes.observe(doc.body, {childList:true, subtree:true, attributes:true, characterData:true});
				}
			}
		} catch (e) {}
		schedule();
	}
	frame.addEventListener('load', watch);
	window.addEventListener('resize', schedule);
	window.addEventListener('pagehide', function(){
		clearTimeout(timer);
		timer = null;
		if (observer) observer.disconnect();
		if (changes) changes.disconnect();
	});
	window.addEventListener('pageshow', watch);
	watch();
}

function detect_update_info(){
	var str = $("internetStatus").innerHTML;
	if(str == "<#QKSet_detect_freshbtn#>...")
		refreshpage();
}

function show_default_icon(){
	var icon_name = "iconClient";
	$("statusframe").src = "/device-map/clients.asp";
	clickEvent($(icon_name));
}

function set_default_choice(){
	var icon_name;
	if(flag && flag.length > 0 && sw_mode != "3"){
		if(flag == "Internet")
			$("statusframe").src = "/device-map/internet.asp";
		else if(flag == "Client")
			$("statusframe").src = "/device-map/clients.asp";
		else if(flag == "Router2g")
			$("statusframe").src = "/device-map/router2g.asp";
		else if(flag == "Router5g")
			$("statusframe").src = "/device-map/router.asp";
		else{
			show_default_icon();
			return;
		}
		if(flag == "Router2g" || flag == "Router5g")
			icon_name = "iconRouter";
		else
			icon_name = "icon"+flag;
		clickEvent($(icon_name));
	}else
		show_default_icon();
}

function setMapState(rowId, state){
	var row = document.getElementById(rowId);
	if(row) row.setAttribute('data-state', state);
}

function showMapWANStatus(flag){
	var state = flag === 1 ? 'online' : flag === 2 ? 'warning' : flag === 0 ? 'offline' : 'unknown';
	var label = flag === 1 ? '已连接' : flag === 2 ? '正在检测' : flag === 0 ? '未连接' : '等待状态更新';
	setMapState('row_internet', state);
	document.getElementById('internetStatus').textContent = label;
	document.getElementById('internetLabel').textContent = sw_mode == '3' ? '上级网络' : '互联网';
	document.getElementById('linkInternet').setAttribute('aria-label', (sw_mode == '3' ? '上级网络' : '互联网') + '：' + label + '，查看详情');
}

function show_middle_status(){
	var wifi = window.sysinfo || {}, hasTwo = support_2g_radio(), hasFive = support_5g_radio();
	var known = (!hasTwo || wifi.wifi2) && (!hasFive || wifi.wifi5);
	var two = known && hasTwo && Number(wifi.wifi2.state) > 0;
	var five = known && hasFive && Number(wifi.wifi5.state) > 0;
	var label = !known ? '等待状态更新' : two && five ? '双频已开启' : two ? '2.4 GHz 已开启' : five ? '5 GHz 已开启' : '无线已关闭';
	setMapState('row_radio', !known ? 'unknown' : two || five ? 'online' : 'offline');
	document.getElementById('radioStatus').textContent = label;
	document.getElementById('radioStatusLink').setAttribute('aria-label', '无线网络：' + label + '，查看设置');
	if(!support_2g_radio()) document.getElementById('radioStatusLink').href = '/device-map/router.asp';
}

function show_client_status(clients_count){
	// 未取得计数时不显示在线；不同设备仍按原有设备列表分别统计。
	var known = clients_count !== null && clients_count !== '' && /^\d+$/.test(String(clients_count));
	var count = known ? Number(clients_count) : 0;
	known = known && isFinite(count);
	var label = known ? count + ' 台设备' : '等待状态更新';
	setMapState('row_clients', !known ? 'unknown' : count > 0 ? 'online' : 'offline');
	document.getElementById('clientNumber').textContent = label;
	document.getElementById('clientStatusLink').setAttribute('aria-label', '已连接设备：' + label + '，查看列表');
}

function show_usb_ports(){
	var i;
	var dev_type_usb;
	var usb_ports_num = get_usb_ports_num();

	if (usb_ports_num < 1) {
		$("row_usb_port1").style.display = "none";
		return;
	}

	dev_type_usb = get_device_type_usb(1);
	switch(dev_type_usb){
		case "hub":
			hub_html(0);
			break;
		case "storage":
			for(i = 0; i < all_disks.length; ++i)
				if(foreign_disk_interface_names()[i] == "1"){
					disk_html(0, i);
					break;
				}
			break;
		case "printer":
			for(i = 0; i < printer_ports().length; ++i)
				if(printer_ports()[i] == "1"){
					printer_html(0, i);
					break;
				}
			break;
		case "modem_tty":
		case "modem_eth":
			for(i = 0; i < modem_ports().length; ++i)
				if(modem_ports()[i] == "1"){
					modem_html(0, i);
					break;
				}
			break;
		default:
			no_usb_device_html(0);
	}

	if (usb_ports_num < 2)
		return;

	$("row_usb_port2").style.display = "";

	dev_type_usb = get_device_type_usb(2);
	switch(dev_type_usb){
		case "hub":
			hub_html(1);
			break;
		case "storage":
			for(i = 0; i < all_disks.length; ++i)
				if(foreign_disk_interface_names()[i] == "2"){
					disk_html(1, i);
					break;
				}
			break;
		case "printer":
			for(i = 0; i < printer_ports().length; ++i)
				if(printer_ports()[i] == "2"){
					printer_html(1, i);
					break;
				}
			break;
		case "modem_tty":
		case "modem_eth":
			for(i = 0; i < modem_ports().length; ++i)
				if(modem_ports()[i] == "2"){
					modem_html(1, i);
					break;
				}
			break;
		default:
			no_usb_device_html(1);
	}
}

function show_ata_pool(){
	var i;
	var dev_found = 0;

	if (typeof(get_ata_support) !== 'function')
		return;

	if (!get_ata_support())
		return;

	$("row_ata_pool").style.display = "";

	for(i = 0; i < all_disks.length; ++i){
		if(foreign_disk_interface_names()[i] == "1000"){
			dev_found = 1;
			ata_html(i);
			break;
		}
	}

	if (!dev_found)
		no_device_html("sataIcon");
}

function show_mmc_card(){
	var i;
	var dev_found = 0;

	if (typeof(get_mmc_support) !== 'function')
		return;

	if (!get_mmc_support())
		return;

	$("row_mmc_slot").style.display = "";

	for(i = 0; i < all_disks.length; ++i){
		if(foreign_disk_interface_names()[i] == "2000"){
			dev_found = 1;
			mmc_html(i);
			break;
		}
	}

	if (!dev_found)
		no_device_html("cardIcon");
}

function dec_html(all_disk_order){
	var dec_html_code = '';
	var TotalSize;
	var all_accessable_size;
	var percentbar = 0;
	var alertPercentbar = 'progress-info';
	var mount_num = getDiskMountedNum(all_disk_order);

	if(mount_num > 0){
		if(all_disk_order < foreign_disks().length)
			TotalSize = simpleNum(foreign_disk_total_size()[all_disk_order]);
		else
			TotalSize = simpleNum(blank_disk_total_size()[all_disk_order-foreign_disks().length]);
		
		all_accessable_size = simpleNum2(computeallpools(all_disk_order, "size")-computeallpools(all_disk_order, "size_in_use"));
		
		percentbar = simpleNum2((all_accessable_size)/TotalSize*100);
		percentbar = Math.round(100-percentbar);
		if(percentbar >= 66 && percentbar < 85)
			alertPercentbar = 'progress-warning';
		else if(percentbar >= 85)
			alertPercentbar = 'progress-danger';
		dec_html_code += '<div id="diskquota">\n';
		dec_html_code += '<div style="margin-bottom: 10px;" class="progress ' + alertPercentbar + '"><div class="bar" style="width:'+percentbar+'%">'+(percentbar > 10 ? (percentbar + '%') : '')+'</div></div>';
		dec_html_code += '</div>\n';
		dec_html_code += '<strong><#Totaldisk#></strong>: '+TotalSize+' GB<br>\n';
		dec_html_code += '<span class="style1"><strong><#Availdisk#></strong>: '+(all_accessable_size)+' GB</span>\n';
	}else
		dec_html_code += '<span class="style1"><strong><#DISK_UNMOUNTED#></strong></span>\n';

	return dec_html_code;
}

function dec_share_icon(device_dec){
	device_dec.addClass("badge badge-success");
	device_dec.css({paddingLeft: '3px'});
	device_dec.html('<i class="icon-share icon-white"></i>');
}

function disk_html(device_order,all_disk_order){
	var device_icon = $("deviceIcon_"+device_order);
	var device_dec = $j("#deviceDec_"+device_order);
	var icon_html_code = '';
	var dec_html_code = '';
	var disk_model_name = "";

	if(all_disk_order < foreign_disks().length)
		disk_model_name = foreign_disk_model_info()[all_disk_order];
	else
		disk_model_name = blank_disks()[all_disk_order-foreign_disks().length];

	dec_html_code = dec_html(all_disk_order);

	icon_html_code += '<a href="device-map/disk.asp" target="statusframe" style="outline:0;">\n';
	icon_html_code += '    <div id="iconUSBdisk'+all_disk_order+'" class="big-icons big-icons-usbhdd" rel="rollover_disk" data-original-title="'+disk_model_name+'" data-content="'+(dec_html_code.replace(new RegExp('"', 'g'), "'"))+'" onclick="setSelectedDiskOrder(this.id);clickEvent(this);"></div>\n';
	icon_html_code += '</a>\n';

	device_icon.innerHTML = icon_html_code;

	dec_share_icon(device_dec);
}

function printer_html(device_seat, printer_order){
	var device_icon = $("deviceIcon_"+device_seat);
	var device_dec = $j("#deviceDec_"+device_seat);
	var icon_html_code = '';

	icon_html_code += '<a href="device-map/printer.asp" target="statusframe" style="outline:0;">\n';
	icon_html_code += '    <div id="iconPrinter'+printer_order+'" class="big-icons big-icons-printer" onclick="clickEvent(this);"></div>\n';
	icon_html_code += '</a>\n';

	device_icon.innerHTML = icon_html_code;

	dec_share_icon(device_dec);
}

function modem_html(device_seat, modem_order){
	var device_icon = $("deviceIcon_"+device_seat);
	var device_dec = $j("#deviceDec_"+device_seat);
	var icon_html_code = '';

	icon_html_code += '<a href="device-map/modem.asp" target="statusframe" style="outline:0;">\n';
	icon_html_code += '    <div id="iconModem'+modem_order+'" class="big-icons big-icons-modem" onclick="clickEvent(this);"></div>\n';
	icon_html_code += '</a>\n';

	device_icon.innerHTML = icon_html_code;

	dec_share_icon(device_dec);
}

function hub_html(device_seat){
	var device_icon = $("deviceIcon_"+device_seat);
	var device_dec = $j("#deviceDec_"+device_seat);
	var icon_html_code = '';

	icon_html_code += '<a href="device-map/hub.asp" target="statusframe" style="outline:0;">\n';
	icon_html_code += '    <div id="iconHub'+device_seat+'" class="big-icons big-icons-hub" onclick="clickEvent(this);"></div>\n';
	icon_html_code += '</a>\n';

	device_icon.innerHTML = icon_html_code;

	dec_share_icon(device_dec);
}

function ata_html(){
	var device_icon = $("sataIcon");
	var device_dec = $j("#sataDec");
	var icon_html_code = '';

	icon_html_code += '<a href="device-map/sata.asp" target="statusframe" style="outline:0;">\n';
	icon_html_code += '    <div id="iconSATA" class="big-icons big-icons-ata" onclick="clickEvent(this);"></div>\n';
	icon_html_code += '</a>\n';

	device_icon.innerHTML = icon_html_code;

	dec_share_icon(device_dec);
}

function mmc_html(all_disk_order){
	var device_icon = $("cardIcon");
	var device_dec = $j("#cardDec");
	var icon_html_code = '';
	var dec_html_code = '';
	var disk_model_name = "";

	if(all_disk_order < foreign_disks().length)
		disk_model_name = foreign_disk_model_info()[all_disk_order];
	else
		disk_model_name = blank_disks()[all_disk_order-foreign_disks().length];

	dec_html_code = dec_html(all_disk_order);

	icon_html_code += '<a href="device-map/disk.asp" target="statusframe" style="outline:0;">\n';
	icon_html_code += '    <div id="iconCard'+all_disk_order+'" class="big-icons big-icons-mmc" rel="rollover_disk" data-original-title="'+disk_model_name+'" data-content="'+(dec_html_code.replace(new RegExp('"', 'g'), "'"))+'" onclick="setSelectedDiskOrder(this.id);clickEvent(this);"></div>\n';
	icon_html_code += '</a>\n';

	device_icon.innerHTML = icon_html_code;

	dec_share_icon(device_dec);
}

function no_device_html(device_name){
	var device_icon = $(device_name);
	device_icon.innerHTML = '<div class="iconNo"></div>'
}

function no_usb_device_html(device_seat){
	no_device_html("deviceIcon_"+device_seat);
}


var avoidkey;
var lastClicked;
var lastName;
var clicked_device_order;

function get_clicked_device_order(){
	return clicked_device_order;
}

function clickEvent(obj){
	var icon;
	var ContainerWidth;
	var Containerpadding;
	var stitle;
	var seat;

	clicked_device_order = -1;

	if(obj.id == "iflock"){
		obj = $("big-icons-router-active");
	}

	if(obj.id.indexOf("Internet") > 0){
		icon = "big-icons-globe-active";
		ContainerWidth = "300px";
		Containerpadding = "5px";
		if (sw_mode == '3'){
			stitle = "<#statusTitle_Intranet#>";
			$("statusframe").src = "/device-map/intranet.asp";
		}else{
			stitle = "<#statusTitle_Internet#>";
			$("statusframe").src = "/device-map/internet.asp";
		}
	}
	else if(obj.id.indexOf("Router") > 0){
		icon = "big-icons-router-active";
		ContainerWidth = "320px";
		Containerpadding = "4px";
		stitle = "<#statusTitle_System#>";
	}
	else if(obj.id.indexOf("Client") > 0){
		icon = "big-icons-laptop-active";
		ContainerWidth = "396px";
		Containerpadding = "0px";
		stitle = "<#statusTitle_Client#>";
	}
	else if(obj.id.indexOf("USBdisk") > 0){
		icon = "big-icons-usbhdd-active";
		ContainerWidth = "556px";
		Containerpadding = "0px";
		stitle = "<#statusTitle_USB_Disk#>";
		$("statusframe").src = "/device-map/disk.asp";
	}
	else if(obj.id.indexOf("Printer") > 0){
		seat = obj.id.indexOf("Printer")+7;
		clicked_device_order = parseInt(obj.id.substring(seat, seat+1));
		icon = "big-icons-printer-active";
		ContainerWidth = "666px";
		Containerpadding = "0px";
		stitle = "<#statusTitle_Printer#>";
		$("statusframe").src = "/device-map/printer.asp";
	}
	else if(obj.id.indexOf("Modem") > 0){
		seat = obj.id.indexOf("Modem")+5;
		clicked_device_order = parseInt(obj.id.substring(seat, seat+1));
		icon = "big-icons-modem-active";
		ContainerWidth = "777px";
		Containerpadding = "0px";
		stitle = "<#statusTitle_Modem#>";
		$("statusframe").src = "/device-map/modem.asp";
	}
	else if(obj.id.indexOf("Hub") > 0){
		seat = obj.id.indexOf("Hub")+3;
		clicked_device_order = parseInt(obj.id.substring(seat, seat+1));
		icon = "big-icons-hub-active";
		ContainerWidth = "892px";
		Containerpadding = "0px";
		stitle = "<#statusTitle_Hub#>";
		$("statusframe").src = "/device-map/hub.asp";
	}
	else if(obj.id.indexOf("SATA") > 0){
		icon = "big-icons-ata-active";
		ContainerWidth = "892px";
		Containerpadding = "0px";
		stitle = "<#statusTitle_SATA#>";
		$("statusframe").src = "/device-map/sata.asp";
	}
	else if(obj.id.indexOf("Card") > 0){
		icon = "big-icons-mmc-active";
		ContainerWidth = "892px";
		Containerpadding = "0px";
		stitle = "<#statusTitle_Card#>";
		$("statusframe").src = "/device-map/disk.asp";
	}
	else if(obj.id.indexOf("No") > 0){
		icon = "iconNo";
	}

	$('statusContainer').style.width = ContainerWidth;
	$('statusContainer').style.paddingRight = Containerpadding;

	$j(".big-icons").removeClass("big-icons-globe-active big-icons-router-active big-icons-laptop-active big-icons-usb-active big-icons-usbhdd-active big-icons-printer-active big-icons-modem-active big-icons-hub-active big-icons-mmc-active big-icons-ata-active");
	$j(obj).addClass(icon);

	// show arrow right icon
	$j(".arrow-right").hide();
	$j(obj).parents('tr').find(".arrow-right").show();

	$('helpname').innerHTML = stitle;

	avoidkey = icon;
	lastClicked = obj;
	lastName = icon;
}

function mouseEvent(obj, key){
	var icon;

	if(obj.id.indexOf("Internet") > 0)
		icon = "iconInternet";
	else if(obj.id.indexOf("Router") > 0)
		icon = "iconRouter";
	else if(obj.id.indexOf("Client") > 0)
		icon = "iconClient";
	else if(obj.id.indexOf("USBdisk") > 0)
		icon = "iconUSBdisk";
	else if(obj.id.indexOf("Printer") > 0)
		icon = "iconPrinter";
	else if(obj.id.indexOf("No") > 0)
		icon = "iconNo";
	else
		alert("mouse over on wrong place!");

	if(avoidkey != icon){
		if(key)
			obj.style.background = 'url("/images/map-'+icon+'_r.gif") no-repeat';
		else
			obj.style.background = 'url("/images/map-'+icon+'.gif") no-repeat';
	}
}

$j(document).ready(function(){
	$j('div[rel=rollover_disk]').popover();
});
</script>

<style>
    .arrow-right{
        position: absolute;
        margin-top: -39px;
        margin-left: 69px;
        display: none;
    }

    .badge{
        padding: 2px;
        padding-bottom: 3px;
    }

    .table-big td{
        padding-top: 16px;
        padding-bottom: 16px;
    }

    .progress {
        background-image: -moz-linear-gradient(top, #f3f3f3, #dddddd);
        background-image: -ms-linear-gradient(top, #f3f3f3, #dddddd);
        background-image: -webkit-gradient(linear, 0 0, 0 100%, from(#f3f3f3), to(#dddddd));
        background-image: -webkit-linear-gradient(top, #f3f3f3, #dddddd);
        background-image: -o-linear-gradient(top, #f3f3f3, #dddddd);
        background-image: linear-gradient(top, #f3f3f3, #dddddd);
        filter: progid:dximagetransform.microsoft.gradient(startColorstr='#f3f3f3', endColorstr='#dddddd', GradientType=0);
    }
</style>
</head>

<body onunload="return unload_body();">

<div class="wrapper">
    <noscript>
        <div class="popup_bg" style="visibility:visible; z-index:999;">
            <div style="margin:200px auto; width:300px; background-color:#006699; color:#FFFFFF; line-height:150%; border:3px solid #FFF; padding:5px;"><#not_support_script#></p></div>
        </div>
    </noscript>

    <div class="container-fluid" style="padding-right: 0px">
        <div class="row-fluid">
            <div class="span3"><center><div id="logo"></div></center></div>
            <div class="span9" >
                <div id="TopBanner"></div>
            </div>
        </div>
    </div>

    <div id="Loading" class="popup_bg"></div>

    <iframe name="hidden_frame" id="hidden_frame" width="0" height="0" frameborder="0" scrolling="no" style="position: absolute;"></iframe>

    <form name="form">
    <input type="hidden" name="current_page" value="index.asp">
    <input type="hidden" name="preferred_lang" id="preferred_lang" value="<% nvram_get_x("", "preferred_lang"); %>">
    <input type="hidden" name="wl_auth_mode" value="<% nvram_get_x("",  "wl_auth_mode"); %>">
    <input type="hidden" name="wl_wpa_mode" value="<% nvram_get_x("",  "wl_wpa_mode"); %>">
    <input type="hidden" name="wl_wep_x" value="<% nvram_get_x("",  "wl_wep_x"); %>">
    <input type="hidden" name="rt_auth_mode" value="<% nvram_get_x("",  "rt_auth_mode"); %>">
    <input type="hidden" name="rt_wpa_mode" value="<% nvram_get_x("",  "rt_wpa_mode"); %>">
    <input type="hidden" name="rt_wep_x" value="<% nvram_get_x("",  "rt_wep_x"); %>">
    </form>

    <form name="rt_form">
    <input type="hidden" name="rt_ssid" value="">
    <input type="hidden" name="rt_wpa_mode" value="">
    <input type="hidden" name="rt_key1" value="">
    <input type="hidden" name="rt_key2" value="">
    <input type="hidden" name="rt_key3" value="">
    <input type="hidden" name="rt_key4" value="">
    <input type="hidden" name="rt_ssid2" value="">
    <input type="hidden" name="rt_key_type" value="">
    <input type="hidden" name="rt_auth_mode" value="">
    <input type="hidden" name="rt_wep_x" value="">
    <input type="hidden" name="rt_key" value="">
    <input type="hidden" name="rt_asuskey1" value="">
    <input type="hidden" name="rt_crypto" value="">
    <input type="hidden" name="rt_wpa_psk" value="">
    </form>

    <form name="wl_form">
    <input type="hidden" name="wl_ssid" value="">
    <input type="hidden" name="wl_wpa_mode" value="">
    <input type="hidden" name="wl_key1" value="">
    <input type="hidden" name="wl_key2" value="">
    <input type="hidden" name="wl_key3" value="">
    <input type="hidden" name="wl_key4" value="">
    <input type="hidden" name="wl_gmode" value="">
    <input type="hidden" name="wl_ssid2" value="">
    <input type="hidden" name="wl_key_type" value="">
    <input type="hidden" name="wl_auth_mode" value="">
    <input type="hidden" name="wl_wep_x" value="">
    <input type="hidden" name="wl_key" value="">
    <input type="hidden" name="wl_asuskey1" value="">
    <input type="hidden" name="wl_crypto" value="">
    <input type="hidden" name="wl_wpa_psk" value="">
    </form>

    <div class="container-fluid">
        <div class="row-fluid">
            <div class="span3">
                <!--Sidebar content-->
                <!--=====Beginning of Main Menu=====-->
                <div class="well sidebar-nav side_nav" style="padding: 0px;">
                    <ul id="mainMenu" class="clearfix"></ul>
                    <ul class="clearfix">
                        <li>
                            <div id="subMenu" class="accordion"></div>
                        </li>
                    </ul>
                </div>
            </div>

            <div class="span9">
                <!--Body content-->

                <div class="row-fluid">
                    <div class="span12 ui-network-map">
                        <div class="well" >
                            <div id="tabMenu"></div>

                            <table class="table table-big" aria-label="网络状态导航">
                                <tbody>
                                    <tr id="row_internet" data-state="unknown">
                                        <td>
                                            <a id="linkInternet" class="ui-map-card" href="/device-map/internet.asp" target="statusframe">
                                                <span id="iconInternet" class="big-icons big-icons-globe ui-map-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5h14M5 17.5h14"/></svg></span>
                                                <span class="ui-map-copy"><span id="internetLabel" class="ui-map-label">互联网</span><span id="internetStatus" class="ui-map-status" aria-live="polite">等待状态更新</span></span>
                                                <span class="ui-map-chevron" aria-hidden="true">›</span>
                                            </a>
                                            <div id="overDiv" style="position:absolute; visibility:hidden; z-index:1000;"></div>
                                            <div class="arrow-right" id="arrow-internet"></div>
                                        </td>
                                    </tr>
                                    <tr id="row_radio" data-state="unknown">
                                        <td>
                                            <a id="radioStatusLink" class="ui-map-card" href="/device-map/router2g.asp" target="statusframe">
                                                <span id="iconRouter" class="big-icons big-icons-router ui-map-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8a15.5 15.5 0 0 1 20 0M5 11.5a10.8 10.8 0 0 1 14 0M8.5 15a5.5 5.5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/></svg></span>
                                                <span class="ui-map-copy"><span class="ui-map-label">无线网络</span><span id="radioStatus" class="ui-map-status" aria-live="polite">等待状态更新</span></span>
                                                <span class="ui-map-chevron" aria-hidden="true">›</span>
                                            </a>
                                            <div class="arrow-right" id="arrow-router"></div>
                                        </td>
                                    </tr>
                                    <tr id="row_clients" data-state="unknown">
                                        <td>
                                            <a id="clientStatusLink" class="ui-map-card" href="/device-map/clients.asp" target="statusframe">
                                                <span id="iconClient" class="big-icons big-icons-laptop ui-map-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="16" height="12" rx="1.5"/><path d="M14 15v5m-4 0h8"/><rect x="2" y="10" width="6" height="11" rx="1.2"/><path d="M4.5 18.5h1"/></svg></span>
                                                <span class="ui-map-copy"><span class="ui-map-label">已连接设备</span><span id="clientNumber" class="ui-map-status" aria-live="polite">等待状态更新</span></span>
                                                <span class="ui-map-chevron" aria-hidden="true">›</span>
                                            </a>
                                            <div class="arrow-right" id="arrow-clients"></div>
                                        </td>
                                    </tr>
                                    <tr id="row_usb_port1">
                                        <td width="30%">
                                            <div id="deviceIcon_0" class="big-icons big-icons-usb"></div><span class="ui-map-label">USB 1</span>
                                            <div style="position: absolute; margin-top: -47px; margin-left: 50px;"><div id="deviceDec_0"></div></div>
                                            <div class="arrow-right" id="arrow-usb1"><img src="/bootstrap/img/arrow-right.png"></div>
                                        </td>
                                    </tr>
                                    <tr id="row_usb_port2" style="display:none">
                                        <td width="30%">
                                            <div id="deviceIcon_1" class="big-icons big-icons-usb"></div><span class="ui-map-label">USB 2</span>
                                            <div style="position: absolute; margin-top: -47px; margin-left: 50px;"><div id="deviceDec_1"></div></div>
                                            <div class="arrow-right" id="arrow-usb2"><img src="/bootstrap/img/arrow-right.png"></div>
                                        </td>
                                    </tr>
                                    <tr id="row_ata_pool" style="display:none">
                                        <td width="30%">
                                            <div id="sataIcon" class="big-icons big-icons-ata"></div><span class="ui-map-label">SATA 存储</span>
                                            <div style="position: absolute; margin-top: -47px; margin-left: 50px;"><div id="sataDec"></div></div>
                                            <div class="arrow-right" id="arrow-ata"><img src="/bootstrap/img/arrow-right.png"></div>
                                        </td>
                                    </tr>
                                    <tr id="row_mmc_slot" style="display:none">
                                        <td width="30%">
                                            <div id="cardIcon" class="big-icons big-icons-mmc"></div><span class="ui-map-label">存储卡</span>
                                            <div style="position: absolute; margin-top: -47px; margin-left: 50px;"><div id="cardDec"></div></div>
                                            <div class="arrow-right" id="arrow-mmc"><img src="/bootstrap/img/arrow-right.png"></div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            <div class="row-fluid">
                                <div class="span12">
                                    <div id="statusContainer" width="0" height="0" align="left" valign="top" ></div>
                                </div>
                            </div>

                        </div>
                    </div>

                    <div class="span12 ui-network-detail">
                        <div class="box well grad_colour_dark_blue">
                            <div id="statusIcon" style="display: none"></div>
                            <h2 id="helpname" class="box_head round_top"></h2>

                            <div class="round_bottom">
                                <iframe id="statusframe" name="statusframe" src="/device-map/clients.asp" frameborder="0" width="100%" height="571"></iframe>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div id="footer"></div>
    <script>
    if(flag == "Internet" || flag == "Client")
        $("statusframe").src = "";
        initial();
    </script>
</div>
</body>
</html>
