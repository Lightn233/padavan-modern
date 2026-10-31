/* 设备状态参数与通用校验；界面和轮询仅在 ui/state-modern.js 实现一次。 */
var sw_mode = '<% nvram_get_x("", "sw_mode"); %>';
var wan_route_x = '<% nvram_get_x("", "wan_route_x"); %>';
var wan_proto = '<% nvram_get_x("", "wan_proto"); %>';
var lan_proto = '<% nvram_get_x("", "lan_proto_x"); %>';
var log_float = '<% nvram_get_x("", "log_float_ui"); %>';
var reboot_schedule_support = '<% nvram_get_x("", "reboot_schedule_enable"); %>';
var log_stamp = 0;
var sysinfo = <% json_system_status(); %>;
var uptimeStr = "<% uptime(); %>";
var timezone = uptimeStr.substring(26,31);
var newformat_systime = uptimeStr.substring(8,11) + " " + uptimeStr.substring(5,7) + " " + uptimeStr.substring(17,25) + " " + uptimeStr.substring(12,16);  //Ex format: Jun 23 10:33:31 2008
var systime_millsec = Date.parse(newformat_systime); // millsec from system
var JS_timeObj = new Date(); // 1970.1.1
var cookie_pref = 'n56u_cookie_';
var ss_schedule_support = '<% nvram_get_x("", "ss_schedule_enable"); %>';
var uagent = navigator.userAgent.toLowerCase();
var is_ie11p = (/trident\/7\./).test(uagent);
var is_mobile = (/iphone|ipod|ipad|iemobile|android|blackberry|fennec/).test(uagent);

var new_wan_internet = '<% nvram_get_x("", "link_internet"); %>';
var id_check_status = 0;
var id_system_info = 0;

var cookie = {
	set: function(key, value, days) {
		document.cookie = cookie_pref + key + '=' + value + '; expires=' +
			(new Date(new Date().getTime() + ((days ? days : 14) * 86400000))).toUTCString() + '; path=/';
	},
	get: function(key) {
		var r = ('; ' + document.cookie + ';').match('; ' + cookie_pref + key + '=(.*?);');
		return r ? r[1] : null;
	},
	unset: function(key) {
		document.cookie = cookie_pref + key + '=; expires=' + (new Date(1)).toUTCString() + '; path=/';
	}
};

<% firmware_caps_hook(); %>

function get_ap_mode(){
	return (wan_route_x == 'IP_Bridged' || sw_mode == '3') ? true : false;
}

function unload_body(){
	disableCheckChangedStatus();
	no_flash_button();
	return true;
}

function enableCheckChangedStatus(flag){
	var tm_int_sec = 1;

	disableCheckChangedStatus();

	if (new_wan_internet == '0')
		tm_int_sec = 2;
	else if (new_wan_internet == '1')
		tm_int_sec = 5;

	id_check_status = setTimeout("get_changed_status();", tm_int_sec * 1000);
}

function disableCheckChangedStatus(){
	clearTimeout(id_check_status);
}

function update_internet_status(){
	if (new_wan_internet == '1')
		showMapWANStatus(1);
	else if(new_wan_internet == '2')
		showMapWANStatus(2);
	else
		showMapWANStatus(0);
}

function notify_status_internet(wan_internet){
	this.new_wan_internet = wan_internet;
	if((location.pathname == "/" || location.pathname == "/index.asp") && (typeof(update_internet_status) === 'function'))
		update_internet_status();
}

function notify_status_vpn_client(vpnc_state){
	if((location.pathname == "/vpncli.asp") && (typeof(update_vpnc_status) === 'function'))
		update_vpnc_status(vpnc_state);
}

function bytesToSize(bytes, precision){
	var absval = Math.abs(bytes);
	var kilobyte = 1024;
	var megabyte = kilobyte * 1024;
	var gigabyte = megabyte * 1024;
	var terabyte = gigabyte * 1024;

	if (absval < kilobyte)
		return bytes + ' B';
	else if (absval < megabyte)
		return (bytes / kilobyte).toFixed(precision) + ' KB';
	else if (absval < gigabyte)
		return (bytes / megabyte).toFixed(precision) + ' MB';
	else if (absval < terabyte)
		return (bytes / gigabyte).toFixed(precision) + ' GB';
	else
		return (bytes / terabyte).toFixed(precision) + ' TB';
}

var menu_code="", menu1_code="", menu2_code="", tab_code="", footer_code;
var enabled2Gclass = '<% nvram_match_x("","rt_radio_x", "1", "btn-info"); %>';
var enabled5Gclass = '<% nvram_match_x("","wl_radio_x", "1", "btn-info"); %>';
var enabledGuest2Gclass = '<% nvram_match_x("","rt_guest_enable", "1", "btn-info"); %>';
var enabledGuest5Gclass = '<% nvram_match_x("","wl_guest_enable", "1", "btn-info"); %>';
var enabledBtnCommit = '<% nvram_match_x("","nvram_manual", "0", "display:none;"); %>';

// L3 = The third Level of Menu
var tabtitle = new Array(20);
var tablink = new Array(20);
tabtitle[0] = new Array("", "<#menu5_1_1#>", "<#menu5_1_2#>", "<#menu5_1_3#>", "<#menu5_1_4#>", "<#menu5_1_5#>", "<#menu5_1_6#>");
tabtitle[1] = new Array("", "<#menu5_1_1#>", "<#menu5_1_2#>", "<#menu5_1_3#>", "<#menu5_1_4#>", "<#menu5_1_5#>", "<#menu5_1_6#>");
tabtitle[2] = new Array("", "<#menu5_2_1#>", "<#menu5_2_2#>", "<#menu5_2_3#>", "<#menu5_2_4#>", "<#menu5_2_5#>", "<#menu5_2_6#>");
tabtitle[3] = new Array("", "<#menu5_3_1#>", "<#menu5_3_3#>", "<#menu5_3_4#>", "<#menu5_3_5#>", "<#menu5_3_6#>");
tabtitle[4] = new Array("", "<#menu5_5_1#>", "<#menu5_5_5#>", "<#menu5_5_2#>", "<#menu5_5_3#>", "<#menu5_5_4#>");
tabtitle[5] = new Array("", "<#menu5_4_3#>", "<#menu5_4_1#>", "<#menu5_4_2#>", "<#menu5_4_4#>", "<#menu5_4_5#>");
tabtitle[6] = new Array("", "<#menu5_6_2#>", "<#menu5_6_5#>", "<#menu5_6_1#>", "<#menu5_6_3#>", "<#menu5_6_4#>", "<#menu5_6_6#>");
tabtitle[7] = new Array("", "<#menu5_10_1#>", "<#menu5_10_2#>", "<#menu5_10_3#>");
tabtitle[8] = new Array("", "<#menu5_11#>", "<#menu5_12#>", "WAN", "", "", "", "", "", "", "");
tabtitle[9] = new Array("", "<#menu5_7_2#>", "<#menu5_7_3#>", "<#menu5_7_5#>", "<#menu5_7_6#>", "<#menu5_7_8#>");
if (found_app_scutclient()){
	tabtitle[10] = new Array("", "<#menu5_1_1#>","<#menu5_13_log#>");
}
if (found_app_dnsforwarder()){
	tabtitle[11] = new Array("", "<#menu5_1_1#>");
}
if (found_app_shadowsocks()){
	tabtitle[12] = new Array("", "<#menu5_1_1#>","<#menu5_16_20#>");
}
if (found_app_mentohust()){
	tabtitle[13] = new Array("", "<#menu5_1_1#>","<#menu5_13_log#>");
}
if (found_app_adbyby()){
	tabtitle[14] = new Array("", "<#menu5_20_1#>");
}
if (found_app_smartdns()||found_app_adguardhome()){
	tabtitle[15] = new Array("", "<#menu5_29#>");
}

if (found_app_aliddns()||found_app_zerotier()||found_app_ddnsto()||found_app_wireguard()){
	tabtitle[16] = new Array("", "<#menu5_30#>");
}
if (found_app_aldriver()){
	tabtitle[17] = new Array("", "<#menu5_36#>");
}
if (found_app_sqm()){
	tabtitle[18] = new Array("", "QoS限速");
}
if (found_app_frp()){
	tabtitle[19] = new Array("", "<#menu5_25#>");
}

//Level 3 Tab title

tablink[0] = new Array("", "Advanced_Wireless2g_Content.asp", "Advanced_WGuest2g_Content.asp", "Advanced_WMode2g_Content.asp", "Advanced_ACL2g_Content.asp", "Advanced_WSecurity2g_Content.asp", "Advanced_WAdvanced2g_Content.asp");
tablink[1] = new Array("", "Advanced_Wireless_Content.asp", "Advanced_WGuest_Content.asp", "Advanced_WMode_Content.asp", "Advanced_ACL_Content.asp", "Advanced_WSecurity_Content.asp", "Advanced_WAdvanced_Content.asp");
tablink[2] = new Array("", "Advanced_LAN_Content.asp", "Advanced_DHCP_Content.asp", "Advanced_GWStaticRoute_Content.asp", "Advanced_IPTV_Content.asp", "Advanced_Switch_Content.asp", "Advanced_WOL_Content.asp");
tablink[3] = new Array("", "Advanced_WAN_Content.asp", "Advanced_IPv6_Content.asp", "Advanced_VirtualServer_Content.asp", "Advanced_Exposed_Content.asp", "Advanced_DDNS_Content.asp");
tablink[4] = new Array("", "Advanced_BasicFirewall_Content.asp", "Advanced_Netfilter_Content.asp", "Advanced_URLFilter_Content.asp", "Advanced_MACFilter_Content.asp", "Advanced_Firewall_Content.asp");
tablink[5] = new Array("", "Advanced_AiDisk_others.asp", "Advanced_AiDisk_samba.asp", "Advanced_AiDisk_ftp.asp", "Advanced_Modem_others.asp", "Advanced_Printer_others.asp");
tablink[6] = new Array("", "Advanced_System_Content.asp", "Advanced_Services_Content.asp", "Advanced_OperationMode_Content.asp", "Advanced_FirmwareUpgrade_Content.asp", "Advanced_SettingBackup_Content.asp", "Advanced_Console_Content.asp");
tablink[7] = new Array("", "Advanced_Tweaks_Content.asp", "Advanced_Scripts_Content.asp", "Advanced_InetDetect_Content.asp");
tablink[8] = new Array("", "Main_WStatus2g_Content.asp", "Main_WStatus_Content.asp", "", "", "", "", "", "", "", "");
tablink[9] = new Array("", "Main_LogStatus_Content.asp", "Main_DHCPStatus_Content.asp", "Main_IPTStatus_Content.asp", "Main_RouteStatus_Content.asp", "Main_CTStatus_Content.asp");
if (found_app_scutclient()){
	scutclient_array = new Array("", "scutclient.asp", "scutclient_log.asp");
	tablink[10] = (scutclient_array);
}
if (found_app_dnsforwarder()){
	dns_forwarder_array = new Array("", "dns-forwarder.asp");
	tablink[11] = (dns_forwarder_array);
}
if (found_app_shadowsocks()){
	shadowsocks_array = new Array("","Shadowsocks.asp","Shadowsocks_log.asp");
	tablink[12] = (shadowsocks_array);
}
if (found_app_mentohust()){
	mentohust_array = new Array("","mentohust.asp","mentohust_log.asp");
	tablink[13] = (mentohust_array);
}
if (found_app_adbyby()){
	ad_array = new Array("","Advanced_adbyby.asp");
	tablink[14] = (ad_array);
}
if (found_app_smartdns()){
	smartdns_array = new Array("","Advanced_smartdns.asp");
	tablink[15] = (smartdns_array);
}else if (found_app_adguardhome()){
	adg_array = new Array("","Advanced_adguardhome.asp");
	tablink[15] = (adg_array);
}
if (found_app_aliddns()){
	aliddns_array = new Array("","Advanced_aliddns.asp");
	tablink[16] = (aliddns_array);
}else if (found_app_zerotier()){
	zerotier_array = new Array("","Advanced_zerotier.asp");
	tablink[16] = (zerotier_array);
}else if (found_app_ddnsto()){
	ddnsto_array = new Array("","Advanced_ddnsto.asp");
	tablink[16] = (ddnsto_array);
}else if (found_app_wireguard()){
	wireguard_array = new Array("","Advanced_wireguard.asp");
	tablink[16] = (wireguard_array);
}
if (found_app_aldriver()){
	aldriver_arry = new Array("","Advanced_aliyundrive.asp");
	tablink[17] = (aldriver_arry);
}
if (found_app_sqm()){
	sqm_array = new Array("","Advanced_SQM.asp");
	tablink[18] = (sqm_array);
}
if (found_app_frp()){
	frp_array = new Array("","Advanced_frp.asp");
	tablink[19] = (frp_array);
	tabtitle[9].push('<#menu5_25_1#>');
	tablink[9].push('Advanced_frp_log.asp');
}

//Level 2 Menu
menuL2_title = new Array(20)
menuL2_title = new Array("", "<#menu5_11#>", "<#menu5_12#>", "<#menu5_2#>", "<#menu5_3#>", "<#menu5_5#>", "<#menu5_4#>", "<#menu5_6#>", "<#menu5_10#>", "<#menu5_9#>", "<#menu5_7#>");
if (found_app_scutclient()){
	menuL2_title.push("<#menu5_13#>");
} else menuL2_title.push("");

if (found_app_dnsforwarder()){
	menuL2_title.push("<#menu5_15#>");
} else menuL2_title.push("");

if (found_app_shadowsocks()){
	menuL2_title.push("<#menu5_16#>");
} else menuL2_title.push("");

if (found_app_mentohust()){
	menuL2_title.push("mentohust");
} else menuL2_title.push("");

if (found_app_adbyby()){
	menuL2_title.push("<#menu5_20#>");
} else menuL2_title.push("");

if (found_app_smartdns()||found_app_adguardhome()){
	menuL2_title.push("<#menu5_29#>");
} else menuL2_title.push("");

if (found_app_aliddns()||found_app_zerotier()||found_app_ddnsto()||found_app_wireguard()){
	menuL2_title.push("<#menu5_30#>");
} else menuL2_title.push("");

if (found_app_aldriver()){
	menuL2_title.push("<#menu5_36#>");
} else menuL2_title.push("");

if (found_app_sqm()){
	menuL2_title.push("QoS限速");
} else menuL2_title.push("");

if (found_app_frp()){
	menuL2_title.push("<#menu5_25#>");
} else menuL2_title.push("");

menuL2_link  = new Array("", tablink[0][1], tablink[1][1], tablink[2][1], tablink[3][1], tablink[4][1], tablink[5][1], tablink[6][1], tablink[7][1], support_2g_radio() ? tablink[8][1] : "Main_EStatus_Content.asp", tablink[9][1]);
if (found_app_scutclient()){
	menuL2_link.push(scutclient_array[1]);
} else menuL2_link.push("");

if (found_app_dnsforwarder()){
	menuL2_link.push(dns_forwarder_array[1]);
} else menuL2_link.push("");

if (found_app_shadowsocks()){
	menuL2_link.push(shadowsocks_array[1]);
} else menuL2_link.push("");

if (found_app_mentohust()){
	menuL2_link.push(mentohust_array[1]);
} else menuL2_link.push("");

if (found_app_adbyby()){
	menuL2_link.push(ad_array[1]);
}  else menuL2_link.push("");

if (found_app_smartdns()){
	menuL2_link.push(smartdns_array[1]);
} else if (found_app_adguardhome()){
	menuL2_link.push(adg_array[1]);
} else menuL2_link.push("");

if (found_app_aliddns()){
	menuL2_link.push(aliddns_array[1]);
} else if (found_app_zerotier()){
	menuL2_link.push(zerotier_array[1]);
} else if (found_app_ddnsto()){
	menuL2_link.push(ddnsto_array[1]);
} else if (found_app_wireguard()){
	menuL2_link.push(wireguard_array[1]);
} else menuL2_link.push("");

if (found_app_aldriver()){
	menuL2_link.push(aldriver_arry[1]);
} else menuL2_link.push("");

if (found_app_sqm()){
	menuL2_link.push(sqm_array[1]);
} else menuL2_link.push("");

if (found_app_frp()){
	menuL2_link.push(frp_array[1]);
} else menuL2_link.push("");

//Level 1 Menu in Gateway, Router mode
menuL1_title = new Array("", "<#menu1#>", "", "<#menu2#>", "<#menu6#>", "<#menu4#>", "<#menu5_8#>", "<#menu5#>");
menuL1_link = new Array("", "index.asp", "", "vpnsrv.asp", "vpncli.asp", "Main_TrafficMonitor_realtime.asp", "Advanced_System_Info.asp", "as.asp");
menuL1_icon = new Array("", "icon-home", "icon-hdd", "icon-retweet", "icon-globe", "icon-tasks", "icon-random", "icon-wrench");

if (!found_app_vpnsvr()) {
	menuL1_title[3] = '';
	menuL1_link[3] = '';
	menuL1_icon[3] = '';
}
if (!found_app_vpncli()) {
	menuL1_title[4] = '';
	menuL1_link[4] = '';
	menuL1_icon[4] = '';
}

function show_menu(L1, L2, L3){
	var i;
	var num_ephy = support_num_ephy();
	if (num_ephy < 2)
		num_ephy = 2;
	if (num_ephy > 8)
		num_ephy = 8;
	if(sw_mode == '3'){
		tabtitle[2].splice(3,1);//LAN
		tablink[2].splice(3,1);
		tabtitle[3].splice(1,5);//WAN
		tablink[3].splice(1,5);
		tabtitle[4].splice(1,5);//firewall
		tablink[4].splice(1,5);
		tabtitle[5].splice(4,1);//USB
		tablink[5].splice(4,1);
		tabtitle[9].splice(2,4);//log
		tablink[9].splice(2,4);
		tablink[2][1] = "Advanced_APLAN_Content.asp";
		menuL2_link[3] = tablink[2][1];
		menuL2_link[4] = "";  //remove WAN
		menuL2_title[4] = "";
		menuL2_link[5] = "";  //remove Firewall
		menuL2_title[5] = "";
		
		if (lan_proto == '1'){
			tabtitle[2].splice(2,1);
			tablink[2].splice(2,1);
		}
	}else{
		if(sw_mode == '4'){
			tablink[3].splice(3,2);
			tabtitle[3].splice(3,2);
		}
		if(!support_ipv6()){
			tablink[3].splice(2,1);
			tabtitle[3].splice(2,1);
		}
	}

	for (i=0;i<num_ephy;i++){
		tablink[8][i+3] = "Main_EStatus_Content.asp#"+i.toString();
		if (i>0)
			tabtitle[8][i+3] = "LAN"+i.toString();
	}

	if(num_ephy<8){
		tabtitle[8].splice(3+num_ephy,8-num_ephy);
		tablink[8].splice(3+num_ephy,8-num_ephy);
	}

	if(!support_2g_radio()){
		menuL2_link[1] = "";  //remove 2G
		menuL2_title[1] = "";
		tabtitle[0].splice(1,6);
		tablink[0].splice(1,6);
		tabtitle[8].splice(1,1);
		tablink[8].splice(1,1);
	}

	if(!support_5g_radio()){
		menuL2_link[2] = "";  //remove 5GHz
		menuL2_title[2] = "";
		tabtitle[1].splice(1,6);
		tablink[1].splice(1,6);
		var idx = support_2g_radio() ? 2 : 1;
		tabtitle[8].splice(idx,1);
		tablink[8].splice(idx,1);
	}

	if(!support_storage()){
		tabtitle[5].splice(1,5);
		tablink[5].splice(1,5);
		menuL2_link[6] = "";  //remove USB
		menuL2_title[6] = "";
	}else{
		if(!support_usb()){
			tabtitle[5].splice(4,2);
			tablink[5].splice(4,2);
		}
		if(!found_app_smbd() && !found_app_ftpd()){
			tabtitle[5].splice(2,2);
			tablink[5].splice(2,2);
		}
		else if(!found_app_smbd()){
			tabtitle[5].splice(2,1);
			tablink[5].splice(2,1);
		}
		else if(!found_app_ftpd()){
			tabtitle[5].splice(3,1);
			tablink[5].splice(3,1);
		}
	}

	for(i = 1; i <= menuL1_title.length-1; i++){
		if(menuL1_title[i] == "")
			continue;
		else if(L1 == i && L2 <= 0)
			menu1_code += '<li class="active" id="option'+i+'"><a href="javascript:;"><i class="'+menuL1_icon[i]+'"></i>&nbsp;&nbsp;'+menuL1_title[i]+'</a></li>\n';
		else
			menu1_code += '<li id="option'+i+'"><a href="'+menuL1_link[i]+'" title="'+menuL1_link[i]+'"><i class="'+menuL1_icon[i]+'"></i>&nbsp;&nbsp;'+menuL1_title[i]+'</a></li>\n';
	}

	$("mainMenu").innerHTML = menu1_code;

	for(var i = 1; i <= menuL2_title.length-1; ++i){
		if(menuL2_title[i] == "")
			continue;
		else if(L2 == i)
			menu2_code += '<a href="javascript: void(0)" style="color: #005580; font-weight: bold"><i class="icon-minus"></i>&nbsp;&nbsp;'+menuL2_title[i]+'</a>\n';
		else
			menu2_code += '<a href="'+menuL2_link[i]+'"><i class="icon-minus"></i>&nbsp;&nbsp;'+menuL2_title[i]+'</a>\n';
	}
	$("subMenu").innerHTML = menu2_code;

	if(L3){
		tab_code = '<ul class="nav nav-tabs" style="margin-bottom: 0px;">\n';
		for(var i = 1; i < tabtitle[L2-1].length; ++i){
			if(tabtitle[L2-1][i] == "")
				continue;
			if(L3 == i){
				tab_ref = "javascript: void(0)";
				if (L2==9 && i>0 && tablink[L2-1][i].indexOf("#")>0)
					tab_ref = tablink[L2-1][i];
				tab_code += '<li class="active"><a href="' +tab_ref+ '">'+tabtitle[L2-1][i]+'</a></li>\n';
			}else
				tab_code += '<li><a href="' +tablink[L2-1][i]+ '">'+tabtitle[L2-1][i]+'</a></li>\n';
		}
		tab_code += '</ul>\n';
		$("tabMenu").innerHTML = tab_code;
	}
	else
		$("tabMenu").innerHTML = "";
}

function go_setting(band){
	if(band == "2")
		location.href = "Advanced_Wireless2g_Content.asp";
	else
		location.href = "Advanced_Wireless_Content.asp";
}

function go_wguest(band){
	if(band == "2")
		location.href = "Advanced_WGuest2g_Content.asp";
	else
		location.href = "Advanced_WGuest_Content.asp";
}

function checkTime(i){
	if (i<10)
		{i="0" + i}
	return i;
}

function submit_language(){
	if($("select_lang").value != $("preferred_lang").value){
		showLoading();
		
		with(document.titleForm){
			action = "/start_apply.htm";
			
			if(location.pathname == "/")
				current_page.value = "/index.asp";
			else
				current_page.value = location.pathname;
			
			preferred_lang.value = $("select_lang").value;
			flag.value = "set_language";
			
			submit();
		}
	}
}

function reset_btn_commit(btn_id){
	var $j = jQuery.noConflict();
	var $btn=$j('#'+btn_id);
	$btn.removeClass('alert-error').removeClass('alert-success');
}

function clearlog(){
	var $j = jQuery.noConflict();
	$j.post('/apply.cgi',
	{
		'action_mode': ' ClearLog ',
		'current_page': 'Main_LogStatus_Content.asp'
	});
	setLogData();
}

function kb_to_gb(kilobytes){
	if(typeof(kilobytes) == "string" && kilobytes.length == 0)
		return 0;
	return (kilobytes*1024)/(1024*1024*1024);
}

function simpleNum(num){
	if(typeof(num) == "string" && num.length == 0)
		return 0;
	return parseInt(kb_to_gb(num)*1000)/1000;
}

function simpleNum2(num){
	if(typeof(num) == "string" && num.length == 0)
		return 0;
	return parseInt(num*1000)/1000;
}

function simpleNum3(num){
	if(typeof(num) == "string" && num.length == 0)
		return 0;
	return parseInt(num)/1024;
}

function $(){
	var elements = new Array();

	for(var i = 0; i < arguments.length; ++i){
		var element = arguments[i];
	if(typeof element == 'string')
		element = document.getElementById(element);
		
		if(arguments.length == 1)
			return element;
		
		elements.push(element);
	}

	return elements;
}

function E(e) {
	return (typeof(e) === 'string') ? document.getElementById(e) : e;
}

function getElementsByName_iefix(tag, name){
	var tagObjs = document.getElementsByTagName(tag);
	var objsName;
	var targetObjs = new Array();
	var targetObjs_length;

	if(!(typeof(name) == "string" && name.length > 0))
		return [];

	for(var i = 0, targetObjs_length = 0; i < tagObjs.length; ++i){
		objsName = tagObjs[i].getAttribute("name");
		
		if(objsName && objsName.indexOf(name) == 0){
			targetObjs[targetObjs_length] = tagObjs[i];
			++targetObjs_length;
		}
	}

	return targetObjs;
}

function getElementsByClassName_iefix(tag, name){
	var tagObjs = document.getElementsByTagName(tag);
	var objsName;
	var targetObjs = new Array();
	var targetObjs_length;

	if(!(typeof(name) == "string" && name.length > 0))
		return [];

	for(var i = 0, targetObjs_length = 0; i < tagObjs.length; ++i){
		if(navigator.appName == 'Netscape')
			objsName = tagObjs[i].getAttribute("class");
		else
			objsName = tagObjs[i].getAttribute("className");
		
		if(objsName == name){
			targetObjs[targetObjs_length] = tagObjs[i];
			++targetObjs_length;
		}
	}

	return targetObjs;
}

function showtext(obj, str){
	if(obj)
		obj.innerHTML = str;//*/
}

function showhtmlspace(ori_str){
	var str = "", head, tail_num;

	head = ori_str;
	while((tail_num = head.indexOf(" ")) >= 0){
		str += head.substring(0, tail_num);
		str += "&nbsp;";
		
		head = head.substr(tail_num+1, head.length-(tail_num+1));
	}
	str += head;

	return str;
}

function showhtmland(ori_str){
	var str = "", head, tail_num;

	head = ori_str;
	while((tail_num = head.indexOf("&")) >= 0){
		str += head.substring(0, tail_num);
		str += "&amp;";
		
		head = head.substr(tail_num+1, head.length-(tail_num+1));
	}
	str += head;

	return str;
}

// A dummy function which just returns its argument. This was needed for localization purpose
function translate(str){
	return str;
}

function trim(str){
	return str.replace(/^\s+|\s+$/g, '');
}

function validate_string(string_obj, flag){
	if(string_obj.value.charAt(0) == '"'){
		if(flag != "noalert")
			alert('<#JS_validstr1#> ["]');
		
		string_obj.value = "";
		string_obj.focus();
		
		return false;
	}
	else{
		invalid_char = "";
		
		for(var i = 0; i < string_obj.value.length; ++i){
			if(string_obj.value.charAt(i) < ' ' || string_obj.value.charAt(i) > '~'){
				invalid_char = invalid_char+string_obj.value.charAt(i);
			}
		}
		
		if(invalid_char != ""){
			if(flag != "noalert")
				alert("<#JS_validstr2#> '"+invalid_char+"' !");
			string_obj.value = "";
			string_obj.focus();
			
			return false;
		}
	}
	
	return true;
}

function validate_hex(obj){
	var obj_value = obj.value
	var re = new RegExp("[^a-fA-F0-9]+","gi");
	if(re.test(obj_value))
		return false;
	else
		return true;
}

function validate_psk(psk_obj){
	var psk_length = psk_obj.value.length;
	if(psk_length < 8){
		alert("<#JS_passzero#>");
		psk_obj.value = "00000000";
		psk_obj.focus();
		psk_obj.select();
		
		return false;
	}
	if(psk_length > 64){
		alert("<#JS_PSK64Hex#>");
		psk_obj.value = psk_obj.value.substring(0, 64);
		psk_obj.focus();
		psk_obj.select();
		
		return false;
	}
	if(psk_length >= 8 && psk_length <= 63 && !validate_string(psk_obj)){
		alert("<#JS_PSK64Hex#>");
		psk_obj.value = "00000000";
		psk_obj.focus();
		psk_obj.select();
		
		return false;
	}
	if(psk_length == 64 && !validate_hex(psk_obj)){
		alert("<#JS_PSK64Hex#>");
		psk_obj.value = "00000000";
		psk_obj.focus();
		psk_obj.select();
		
		return false;
	}
	return true;
}

function checkDuplicateName(newname, targetArray){
	var existing_string = targetArray.join(',');
	existing_string = ","+existing_string+",";
	var newstr = ","+trim(newname)+",";
	
	var re = new RegExp(newstr, "gi");
	var matchArray = existing_string.match(re);
	
	if(matchArray != null)
		return true;
	else
		return false;
}

function alert_error_msg(error_msg){
	alert(error_msg);
	refreshpage();
}

function refreshpage(seconds){
	if(typeof(seconds) == "number")
		setTimeout("refreshpage()", seconds*1000);
	else
		location.href = location.href;
}

function hideLinkTag(){
	if(document.all){
		var tagObjs = document.all.tags("a");
		
		for(var i = 0; i < tagObjs.length; ++i)
			tagObjs(i).outerHTML = tagObjs(i).outerHTML.replace(">"," hidefocus=true>");
	}
}

function buttonOver(o){	//Lockchou 1206 modified
	o.style.color = "#FFFFFF";
	o.style.background = "url(/images/bgaibutton.gif) #ACCCE1";
	o.style.cursor = "hand";
}

function buttonOut(o){	//Lockchou 1206 modified
	o.style.color = "#000000";
	o.style.background = "url(/images/bgaibutton0.gif) #ACCCE1";
}

function flash_button(){
	if(navigator.appName.indexOf("Microsoft") < 0)
		return;
	
	var btnObj = getElementsByClassName_iefix("input", "button");
	
	for(var i = 0; i < btnObj.length; ++i){
		btnObj[i].onmouseover = function(){
				buttonOver(this);
			};
		
		btnObj[i].onmouseout = function(){
				buttonOut(this);
			};
	}
}

function no_flash_button(){
	if(navigator.appName.indexOf("Microsoft") < 0)
		return;

	var btnObj = getElementsByClassName_iefix("input", "button");

	for(var i = 0; i < btnObj.length; ++i){
		btnObj[i].onmouseover = "";
		
		btnObj[i].onmouseout = "";
	}
}

function gotoprev(formObj){
	var prev_page = formObj.prev_page.value;

	if(prev_page == "/")
		prev_page = "/index.asp";

	formObj.action = prev_page;
	formObj.target = "_parent";
	formObj.submit();
}

function add_option(selectObj, str, value, selected){
	var tail = selectObj.options.length;

	if(typeof(str) != "undefined")
		selectObj.options[tail] = new Option(str);
	else
		selectObj.options[tail] = new Option();

	if(typeof(value) != "undefined")
		selectObj.options[tail].value = value;
	else
		selectObj.options[tail].value = "";

	if(selected == 1)
		selectObj.options[tail].selected = selected;
}

function free_options(selectObj){
	if(selectObj == null)
		return;

	for(var i = selectObj.options.length-1; i >= 0; --i){
		selectObj.options[i].value = null;
		selectObj.options[i] = null;
	}
}

function blocking(obj_id, show){
	var state = show?'block':'none';

	if(document.getElementById)
		$(obj_id).style.display = state;
	else if(document.layers)
		document.layers[obj_id].display = state;
	else if(document.all)
		document.all[obj_id].style.display = state;
}

function inputCtrl(obj, flag){
	obj.disabled = (flag == 0);
}

// add eagle23
jQuery(document).ready(function(){
    var $j = jQuery.noConflict();

    $j("#logo").click(function(){
        location.href = '/';
    });

    // tabindex navigation
    $j(function(){
        var tabindex = 1;
        $j('input,select').each(function() {
            if (this.type != "hidden"  && this.type != 'radio') {
                var $input = $j(this);
                $input.attr("tabindex", tabindex);
                tabindex++;
            }
        });
    });


});

// fix for ie
String.prototype.nl2br = function(){
    return this.replace(/\n/g, "\n\r");
}

/**
 * Local Storage HTML5 Standart
 * http://www.w3.org/TR/webstorage/
 */
/**
 * ckeck if localStorage available
 * @return void
 */
function isLocalStorageAvailable(){
    try {
        return 'localStorage' in window && window['localStorage'] !== null;
    } catch (e) {
        return false;
    }
}

/**
 * set value to localStorage
 * @param name string
 * @param value mixed
 */
function setToLocalStorage(name, value){
    if(isLocalStorageAvailable()){
        try {
            localStorage.setItem(name, value);
        } catch (e) {
            if (e == QUOTA_EXCEEDED_ERR) {
            }
        }
    }
}

/**
 * get from localStorage
 * @param name
 * @return mixed
 */
function getFromLocalStorage(name){
    if(isLocalStorageAvailable()){
        return localStorage.getItem(name);
    }
}

/**
 * remove from localStorage
 * @param name
 * @return void
 */
function removeFromLocalStorage(name){
    if(isLocalStorageAvailable()){
        localStorage.removeItem(name);
    }
}



// 只展示固定映射，不显示运营商返回的账号等原始认证内容。
function wanIssueText(code){
    var messages = {
        1:"运营商拒绝拨号：宽带账号已有在线会话，超过允许的连接数。请断开其他使用该账号的设备；若没有其他设备，请联系运营商清理残留会话。",
        2:"运营商拒绝认证。请核对宽带账号、密码和账号状态；这不一定表示密码错误。",
        3:"等待 PPPoE 服务器响应超时（PADO）。请检查 WAN 接线、光猫桥接和运营商线路。",
        4:"PPPoE 服务器未确认会话（PADS 超时）。目前尚未进入账号认证，可能与已有会话、接入限制或线路异常有关。",
        5:"运营商终止了 PPP 连接，设备正在按现有设置重新连接。",
        6:"PPP 链路或地址协商超时，请检查运营商线路和拨号日志。"
    };
    return messages[code] || "";
}
function renderWanIssue(element, status, issue){
    var text = status === 0 ? "" : wanIssueText(issue);
    element.textContent = text ? "本次拨号进程最近一次失败：" + text : "";
    element.style.display = text ? "block" : "none";
}
