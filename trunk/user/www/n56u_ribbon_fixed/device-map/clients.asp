<!DOCTYPE html>
<html>
<head>
<script>
// 设备列表是首页的详情子页；旧书签或失效提交也必须回到完整后台。
if (window.top === window.self) window.location.replace('/index.asp?flag=Client');
</script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/ui/base.css?v=1">
<link rel="stylesheet" href="/ui/icons.css?v=1">
<title></title>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="-1">

<link rel="shortcut icon" href="images/favicon.ico">
<link rel="icon" href="images/favicon.png">



<script type="text/javascript" src="/jquery.js"></script>
<script src="/ui/core.js?v=1"></script>
<link rel="stylesheet" href="/ui/bandwidth.css?v=1">
<script src="/ui/bandwidth.js?v=1"></script>


<script type="text/javascript" src="/state.js"></script>
<script src="/ui/state-modern.js?v=1"></script>
<script type="text/javascript" src="/client_function.js"></script>
<script>
var $j = jQuery.noConflict();

var ipmonitor = [<% get_static_client(); %>];
var wireless = {<% wl_auth_list(); %>};

var list_type = '<% nvram_get_x("", "macfilter_enable_x"); %>';
var list_of_BlockedClient = [<% get_nvram_list("FirewallConfig", "MFList"); %>];
var m_dhcp = [<% get_nvram_list("LANHostConfig", "ManualDHCPList"); %>];

var nmap_fullscan = '<% nvram_get_x("", "networkmap_fullscan"); %>';

var DEVICE_TYPE = ["", "<#Device_type_01_PC#>", "<#Device_type_02_RT#>", "<#Device_type_03_AP#>", "<#Device_type_04_NAS#>", "<#Device_type_05_IC#>", "<#Device_type_06_OD#>"];

var clients = getclients(1,0);
var unblocked_clients = new Array();
var blocked_clients = new Array();
var page_modified = 0;
var scan_deadline = 0;
var scan_timer = null;
var scan_failures = 0;
var scan_pending = false;
var client_request = false;
var submit_timer = null;
var scan_snapshot = ipmonitor.slice();
var client_refresh_time = '';
var client_refresh_label = '';
var ipmonitor_last = null;
var nmap_fullscan_last = null;
var wireless_last = null;

function initial(){
	if (sw_mode == "3") {
		list_type = '0';
	}
	flash_button();
	prepare_clients();
	show_clients();
	client_refresh_status('idle', '已载入设备列表');
	check_full_scan_done();
}

function prepare_clients(){
	var i, j, k;
	// 每次重新生成索引，避免设备离线后沿用上一次扫描的位置。
	unblocked_clients = [];
	blocked_clients = [];

	if(typeof parent.show_client_status === 'function')
		parent.show_client_status(clients.length);

	if(list_type == '0'){
		for(i = 0; i < clients.length; ++i){
			clients[i][7] = "u";
			unblocked_clients[i] = i;
		}
		$("alert_block").style.display = "none";
	}
	else if(list_type == '1'){
		for(i = 0; i < clients.length; ++i){
			if(checkDuplicateName(clients[i][2], list_of_BlockedClient)){
				clients[i][7] = "u";
				unblocked_clients[i] = i;
			}
			else{
				clients[i][7] = "b";
				blocked_clients[i] = i;
			}
		}
		$("alert_block").style.display = "block";
	}
	else{
		for(i = 0; i < list_of_BlockedClient.length; ++i){
			if(!checkDuplicateName(list_of_BlockedClient[i][0], clients)){
				k = clients.length;
				clients[k] = new Array(8);
				
				clients[k][0] = "*";
				clients[k][1] = "*";
				clients[k][2] = list_of_BlockedClient[i][0];
				clients[k][3] = null;
				clients[k][4] = null;
				clients[k][5] = "6";
				clients[k][6] = "0";
				clients[k][7] = "b";
				
				var mac_up = list_of_BlockedClient[i][0].toUpperCase();
				
				for(j = 0; j < m_dhcp.length; ++j){
					if (mac_up == m_dhcp[j][0].toUpperCase()){
						if (m_dhcp[j][2] != null && m_dhcp[j][2].length > 0)
							clients[k][0] = m_dhcp[j][2];
						clients[k][1] = m_dhcp[j][1];
						break;
					}
				}
			}
		}
		
		for(i = 0; i < clients.length; ++i){
			if(!checkDuplicateName(clients[i][2], list_of_BlockedClient)){
				clients[i][7] = "u";
				unblocked_clients[i] = i;
			}
			else{
				clients[i][7] = "b";
				blocked_clients[i] = i;
			}
		}
		$("alert_block").style.display = "none";
	}
}

// 主动扫描会逐个探测地址；日常刷新只读取已有结果，不重新扫描。
function client_status(message){
	$("LoadingBar").style.display = "block";
	$("LoadingBar").querySelector('span').textContent = message;
}

function merge_scan_clients(previous, current){
	var merged = [], positions = Object.create(null);
	[previous, current].forEach(function(rows){
		rows.forEach(function(row){
			var mac = String(row[1] || '').replace(/:/g, '').toUpperCase();
			if (!/^[0-9A-F]{12}$/.test(mac)) return;
			if (positions[mac] === undefined) {
				positions[mac] = merged.length;
				merged.push(row);
			} else merged[positions[mac]] = row;
		});
	});
	return merged;
}

function check_full_scan_done(){
	clearTimeout(scan_timer);
	var scanning = nmap_fullscan == "1" || scan_pending;
	$("scan_clients").disabled = scanning;
	if (scanning){
		client_status('正在后台扫描，保留已知设备；仍可刷新列表');
		if (!scan_deadline) scan_deadline = Date.now() + 90000;
		if (Date.now() >= scan_deadline) { scan_failed(); return; }
		if (!scan_pending) scan_timer = setTimeout(update_clients, 2000);
	} else {
		if (scan_deadline) client_status('扫描完成，设备列表已更新');
		else $('LoadingBar').style.display = 'none';
		scan_deadline = 0;
		scan_failures = 0;
		scan_snapshot = ipmonitor.slice();
		$j('.popover_top, .popover_bottom').popover({placement: sw_mode == "3" ? 'top' : 'right'});
	}
}

function refresh_clients(){
	if (client_request) return;
	scan_failures = 0;
	update_clients(true);
}

// 手动刷新结果与后台扫描提示分开，避免轮询覆盖刚才的操作反馈。
function client_refresh_status(state, message){
	var box = $('client_refresh_feedback');
	box.setAttribute('data-state', state);
	box.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
	$('client_refresh_message').textContent = message;
}

function client_list_signature(rows){
	return JSON.stringify(rows.map(function(row){ return JSON.stringify(row); }).sort());
}

function client_wireless_signature(table){
	return JSON.stringify(Object.keys(table).sort().map(function(mac){ return [mac, table[mac]]; }));
}

function client_refresh_clock(){
	var now = new Date();
	function pad(n){ return ('0' + n).slice(-2); }
	return pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
}

function client_request_failed(manual, reason){
	if (manual) {
		var message = '刷新失败' + (reason ? '（' + reason + '）' : '') + '，保留上次列表；请重试';
		if (client_refresh_time) message += '。上次成功：' + client_refresh_time;
		client_refresh_status('error', message);
	}
	if (++scan_failures >= 3 || !scan_deadline || Date.now() >= scan_deadline) scan_failed();
	else scan_timer = setTimeout(update_clients, 2000);
}

function update_clients(manual) {
	if (client_request) return;
	manual = manual === true;
	clearTimeout(scan_timer);
	client_request = true;
	var button = $('refresh_list');
	var buttonLabel = $('client_refresh_label');
	if (!client_refresh_label) client_refresh_label = buttonLabel.textContent;
	var previous = client_list_signature(ipmonitor);
	var previousWireless = client_wireless_signature(wireless);
	button.disabled = true;
	if (manual) {
		buttonLabel.textContent = '刷新中…';
		button.setAttribute('data-loading', 'true');
		client_refresh_status('loading', '正在读取设备列表…');
	}
	// 先清空响应变量，异常页面不能冒用上一次结果显示成功。
	ipmonitor_last = null;
	nmap_fullscan_last = null;
	wireless_last = null;
	$j.ajax({
		url: '/lan_clients.asp', dataType: 'script', cache: false, timeout: 5000,
		error: function(xhr, status) {
			client_request_failed(manual, status === 'timeout' ? '请求超时' : '请求未成功');
		},
		success: function() {
			if (!Array.isArray(ipmonitor_last) || !ipmonitor_last.every(function(row){
				return Array.isArray(row) && row.length >= 6 && row.slice(0,6).every(function(value){ return typeof value === 'string'; });
			}) || !wireless_last || typeof wireless_last !== 'object' || Array.isArray(wireless_last) ||
				!Object.keys(wireless_last).every(function(mac){
					return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(mac) && typeof wireless_last[mac] === 'number' && isFinite(wireless_last[mac]);
				}) ||
				(nmap_fullscan_last !== '0' && nmap_fullscan_last !== '1' && nmap_fullscan_last !== 0 && nmap_fullscan_last !== 1)) {
				client_request_failed(manual, '返回数据异常');
				return;
			}
			scan_failures = 0;
			nmap_fullscan = nmap_fullscan_last;
			// 名单与无线信号一起刷新；不能合并旧关联，否则离线设备会残留旧 RSSI。
			wireless = wireless_last;
			// 兼容旧扫描程序逐步返回的结果；按 MAC 合并，不能按名称合并。
			if (nmap_fullscan == "1" || scan_pending) {
				scan_snapshot = merge_scan_clients(scan_snapshot, ipmonitor_last);
				ipmonitor = scan_snapshot.slice();
			} else ipmonitor = ipmonitor_last;
			clients = getclients(1,0);
			prepare_clients();
			show_clients();
			check_full_scan_done();
			if (manual) {
				client_refresh_time = client_refresh_clock();
				var message = '刷新成功 · ' + client_refresh_time + ' · 显示 ' + clients.length + ' 台设备';
				message += previous === client_list_signature(ipmonitor) ? ' · 列表无变化' : ' · 列表已更新';
				if (previousWireless !== client_wireless_signature(wireless)) message += ' · 无线状态已更新';
				client_refresh_status('success', message);
			}
		},
		complete: function() {
			client_request = false;
			button.disabled = false;
			buttonLabel.textContent = client_refresh_label;
			button.setAttribute('data-loading', 'false');
		}
	});
}

// 只缩短显示名称，完整名称继续用于解析和设备链接。
function short_client_name(name){
	var domain = '<% nvram_get_x("", "lan_domain"); %>';
	var suffix = '.' + domain;
	if (domain && name && name.length > suffix.length &&
		name.substr(name.length - suffix.length).toLowerCase() == suffix.toLowerCase())
		return name.substr(0, name.length - suffix.length);
	return name;
}

function add_client_row(table, client, blocked, j){
	var row = table.tBodies[0].insertRow(-1);
	var typeCell = row.insertCell(0);
	var nameCell = row.insertCell(1);
	var ipCell = row.insertCell(2);
	var macCell = row.insertCell(3);
	var rssiCell = row.insertCell(4);
	var limitCell = row.insertCell(5);
	var blockCell = row.insertCell(6);
	
	var arpon = <% nvram_get_x("","dhcp_static_arp"); %>;
	var mdhcp = <% nvram_get_x("","dhcp_static_x"); %>;
	if (arpon == 1 && mdhcp == 1){
	   var j;
	   for(j = 0; j < m_dhcp.length; ++j){
	      if (client[2] == m_dhcp[j][0]){
	         client[0] = m_dhcp[j][2];
	         if (client[1] == m_dhcp[j][1]){
	            client[1] = m_dhcp[j][1];
	         }
	      }
	   }    
	}

	typeCell.style.textAlign = "center";
	typeCell.innerHTML = "<img title='"+ DEVICE_TYPE[client[5]]+"' src='/bootstrap/img/wl_device/" + client[5] +".gif'>";
	var displayName = short_client_name(client[0]);
	PadavanBandwidth.addDevice(limitCell, client[2], displayName);
	nameCell.title = client[0];
	if (client[6] == "1") {
		var nameLink = document.createElement('a');
		nameLink.href = 'http://' + client[0];
		nameLink.target = '_blank';
		nameLink.appendChild(document.createTextNode(displayName));
		nameCell.appendChild(nameLink);
	} else {
		nameCell.appendChild(document.createTextNode(displayName));
	}
	ipCell.innerHTML = (client[6] == "1") ? "<a href=http://" + client[1] + " target='blank'>" + client[1] + "</a>" : client[1];
	macCell.innerHTML = "<a target='_blank' href='https://services13.ieee.org/RST/standards-ra-web/rest/assignments/?registry=MAC&text=" + client[2].substr(0,6) + "'>" + mac_add_delimiters(client[2]) + "</a>";
	rssiCell.textContent = '—';
	rssiCell.title = '当前未取得本机无线信号数据；有线、经其他接入点连接或已离线的设备都可能没有此值。设备图标不代表当前连接方式。';
	if (client[3] == 10){
		var rssi = client[4];
		// 驱动用 -127 表示未取得有效采样，不把它作为真实信号强度展示。
		if (typeof rssi === 'number' && isFinite(rssi) && rssi > -127 && rssi < 0) {
			rssiCell.textContent = rssi + ' dBm';
			rssiCell.title = 'RM2100 接收到的无线信号强度；刷新列表会重新读取。';
		} else rssiCell.title = '无线已关联，但驱动尚未返回有效信号值。';
	}
	if(list_type != "1" && sw_mode != "3"){
		blockCell.style.textAlign = "center";
		blockCell.innerHTML = "<div class='icon icon-" + (blocked ? "plus" : "remove") + "' onClick='" + (blocked ? "unBlock" : "block") + "Client("+j+")' style='cursor:pointer;'></div>\n";
	}
}

function show_clients(){
	var i, j, k;
	var table1, table2;
	var addClient, clientType, clientName, clientIP, clientMAC, clientBlock;
	
	table1 = $('Clients_table');
	table2 = $('xClients_table');
	
	while (table1.tBodies[0].rows.length)
		table1.deleteRow(-1);
	while (table2.tBodies[0].rows.length)
		table2.deleteRow(-1);
	
	var hasBlocked = false;
	for(j=0, i=0, k=0; j < clients.length; j++){
		if(clients[j][7] == "u" || sw_mode == "3"){
			add_client_row(table1, clients[j], false, j);
			k++;
		}
		else if(clients[j][7] == "b"){
			add_client_row(table2, clients[j], true, j);
			hasBlocked = true;
			i++;
		}
	}

	table2.style.display = hasBlocked ? "inline" : "none";
	$('client_count').textContent = k + ' 台';

	var NDRow = "<tr><td colspan='7'><div class='alert alert-info'><#Nodata#></div></td></tr>";

	if (!table1.tBodies[0].rows.length)
		$j("#Clients_table tbody").append(NDRow);

	if (!table2.tBodies[0].rows.length && sw_mode != "3")
		$j("#xClients_table tbody").append(NDRow);
}

function sort(mode) {
	sort_mode = (sort_mode > 0) ? (mode * -1) : mode;
	localStorage.setItem('sortMode', sort_mode);
	clients = getclients(1,0);
	prepare_clients();
	show_clients();
}

function blockClient(unBlockedClient_order){
	var str = "";

	if(list_type == "1"){
		alert("<#macfilter_alert_str1#>");
		return;
	}
	this.selectedClientOrder = unBlockedClient_order;

	str += '<#block_Comfirm1#> "';
	str += (clients[unBlockedClient_order][0] == null)?clients[unBlockedClient_order][2]:clients[unBlockedClient_order][0];
	str += '" ?\n';
	str += '<#block_Comfirm2#>';

	if(confirm(str)){
		set_filter_rule("add");
		do_block_client();
	}
}

function unBlockClient(blockedClient_order){
	var str = "";

	if(list_type == "1"){
		alert("<#macfilter_alert_str1#>");
		return;
	}

	this.selectedClientOrder = blockedClient_order;

	str += '<#unblock_Comfirm1#> "';
	str += (clients[blockedClient_order][0] == null)?clients[blockedClient_order][2]:clients[blockedClient_order][0];
	str += '" "<#unblock_Comfirm2#>';

	if(confirm(str)){
		set_filter_rule("del");
		do_unblock_client();
	}
}

function do_block_client(){
	if(!checkDuplicateName(clients[this.selectedClientOrder][2], list_of_BlockedClient)){
		document.macfilterForm.action_mode.value = " Add ";
		document.macfilterForm.macfilter_list_x_0.value = clients[this.selectedClientOrder][2];
	}
	else{
		document.macfilterForm.target = "applyFrame";
		document.macfilterForm.action_mode.value = " Restart ";
		document.macfilterForm.macfilter_list_x_0.disabled = true;
	}
	document.macfilterForm.submit();
}

function do_unblock_client(){
	document.macfilterForm.action_mode.value = " Del ";
	document.macfilterForm.submit();
}

function set_filter_rule(action){
	if(action == "add")
		;
	else if(action == "del"){
		for(var i = 0; i < list_of_BlockedClient.length; ++i){
			if(list_of_BlockedClient[i][0] == clients[this.selectedClientOrder][2]){
				free_options($("MFList_s"));
				add_option($("MFList_s"), null, i, 1);
			}
		}
	}
}

function done_validating(action, group_id){
	$("applyFrame").src = "";
	page_modified = 1;
	if(group_id == "MFList"){
		if(action == " Add ")
			refreshpage();
		else if(action == " Del ")
			refreshpage();
	}
}

function submit_macfilter(){
	document.macfilterForm.target = "applyFrame";
	document.macfilterForm.action_mode.value = " Restart ";
	document.macfilterForm.next_page.value = location.pathname;
	document.macfilterForm.submit();
}

function build_submitrule(){
	if(document.macfilterForm.modified.value == "1"){
		if(list_type != "1")
			submit_macfilter();
		else
			refreshpage();
	}
	else
		refreshpage();
}

function applyRule(){
	parent.showLoading();
	build_submitrule();
}

function showLoading(restart_time2){
	parent.showLoading(restart_time2);
}

function scan_failed(){
	clearTimeout(scan_timer);
	clearTimeout(submit_timer);
	scan_deadline = 0;
	scan_pending = false;
	$("scan_clients").disabled = false;
	client_status('未能完成更新，保留上次列表；请重试');
}

function networkmap_refresh_started(){
	// 提交结果只通知当前子页，外层管理界面保持不变。
	clearTimeout(submit_timer);
	scan_pending = false;
	nmap_fullscan = "1";
	scan_deadline = Date.now() + 90000;
	scan_failures = 0;
	check_full_scan_done();
}

function networkmap_update(s){
	if ($("scan_clients").disabled || client_request) return;
	$("scan_clients").disabled = true;
	scan_pending = true;
	scan_snapshot = ipmonitor.slice();
	scan_deadline = Date.now() + 90000;
	client_status('正在后台扫描，保留已知设备；仍可刷新列表');
	clearTimeout(scan_timer);
	clearTimeout(submit_timer);
	submit_timer = setTimeout(scan_failed, 15000);
	document.form.action_mode.value = "";
	document.form.action_script.value = s;
	document.form.flag.value = "nodetect";
	document.form.submit();
}

</script>

<style>
    .table th, .table td{vertical-align: middle; text-align: center;}
    .client-toolbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px 24px;padding:20px 4px 16px;}
    .client-heading{flex:1 1 290px;min-width:0;}
    .client-heading h3{display:flex;align-items:center;gap:10px;margin:0;font-size:16px;font-weight:600;color:#26364d;}
    .client-count{display:inline-flex;align-items:center;min-height:24px;padding:1px 9px;border-radius:6px;background:#edf4ff;color:#2465ba;font-size:12px;font-weight:500;}
    .client-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;}
    .client-actions .btn{width:auto;min-width:88px;font-size:13px;}
    .client-actions svg{width:16px;height:16px;flex:none;}
    #refresh_list[data-loading="true"] svg{animation:client-refresh-spin .8s linear infinite;}
    .client-refresh-feedback{display:flex;align-items:baseline;gap:7px;min-height:22px;margin-top:5px;color:#64748b;font-size:12px;line-height:1.65;}
    .client-refresh-mark{flex:0 0 auto;width:8px;height:8px;border-radius:50%;background:currentColor;}
    .client-refresh-feedback[data-state="loading"]{color:#2563eb;}
    .client-refresh-feedback[data-state="loading"] .client-refresh-mark{width:12px;height:12px;box-sizing:border-box;background:transparent;border:2px solid #bfdbfe;border-top-color:#2563eb;animation:client-refresh-spin .8s linear infinite;}
    .client-refresh-feedback[data-state="success"]{color:#15803d;}
    .client-refresh-feedback[data-state="error"]{color:#b91c1c;}
    .client-scan-notice{padding:9px 12px;margin:0 0 12px;border:1px solid #dce8fa;border-radius:8px;background:#f0f6ff;color:#395c87;font-size:12px;}
    #Clients_table{margin-top:0;}
    @keyframes client-refresh-spin{to{transform:rotate(360deg);}}
    @media(max-width:600px){.client-toolbar{padding-top:14px;gap:10px;}.client-actions{width:100%;}.client-actions .btn{flex:1;padding:8px 10px;min-width:0;}.client-heading{flex-basis:100%;}}
    @media(prefers-reduced-motion:reduce){.client-refresh-feedback[data-state="loading"] .client-refresh-mark,#refresh_list[data-loading="true"] svg{animation:none;}}
</style>

</head>

<body class="body_iframe" >

<iframe name="applyFrame" id="applyFrame" src="" width="0" height="0" frameborder="0" scrolling="no" style="position: absolute;"></iframe>

<div id="loadingBarBlock" class="loadingBarBlock" align="center" style="display: none;">
</div>

<form method="post" name="macfilterForm" id="macfilterForm" action="/start_apply.htm" target="applyFrame" style="position: absolute; margin-left: -10000px;">
<input type="hidden" name="action_mode" value="">
<input type="hidden" name="sid_list" value="FirewallConfig;General;">
<input type="hidden" name="group_id" value="MFList">
<input type="hidden" name="current_page" value="/device-map/clients.asp">
<input type="hidden" name="next_page" value="/device-map/clients.asp">
<input type="hidden" name="modified" value="<% nvram_get_x("", "MFList"); %>">
<input type="hidden" name="macfilter_enable_x" value="2">
<input type="hidden" name="macfilter_list_x_0" value="">
<input type="hidden" name="macfilter_time_x_0" value="00002359">
<input type="hidden" name="macfilter_date_x_0" value="1111111">
<select name="MFList_s" id="MFList_s" multiple="true" style="visibility:hidden; width:0px; height:0px;"></select>
</form>

<div id="unBlockedClients_table"></div>

<div class="client-toolbar">
    <div class="client-heading">
        <h3><#ConnectedClient#><span id="client_count" class="client-count"></span></h3>
        <div id="client_refresh_feedback" class="client-refresh-feedback" data-state="idle" role="status" aria-live="polite" aria-atomic="true" aria-busy="false">
            <span class="client-refresh-mark" aria-hidden="true"></span>
            <span id="client_refresh_message">正在载入设备列表…</span>
        </div>
    </div>
    <div class="client-actions" role="group" aria-label="设备列表操作">
        <button type="button" id="refresh_list" class="btn btn-primary" onclick="refresh_clients();"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6.1A8 8 0 0 1 19.7 11M4.3 13a8 8 0 0 0 13.6 4.9"/></svg><span id="client_refresh_label">刷新列表</span></button>
        <button type="button" id="scan_clients" class="btn" onclick="networkmap_update('networkmap_refresh');" title="主动探测整个局域网，需要等待扫描完成；扫描期间仍显示已知设备。">扫描新设备</button>
        <button type="button" id="applyClient" class="btn" onclick="applyRule();"><#CTL_apply#></button>
    </div>
</div>
<div id="LoadingBar" class="client-scan-notice" style="display:none;"><span><#Device_Searching#></span></div>
<table id="Clients_table" width="100%" align="center" cellpadding="1" class="table">
    <caption class="hide"><#ConnectedClient#></caption>
    <thead>
        <tr>
            <th width="8%"><a href="javascript:sort(0)"><#Type#></a></th>
            <th><a href="javascript:sort(1)"><#Computer_Name#></a></th>
            <th width="20%"><a href="javascript:sort(2)">IP</a></th>
            <th width="24%"><a href="javascript:sort(3)">MAC</a></th>
            <th width="8%" id="col_rssi"><a href="javascript:sort(4)">RSSI</a></th>
            <th>限速 (Mbps)</th>
            <th width="0%" id="col_block"></th>
        </tr>
    </thead>
    <tbody>
    </tbody>
</table>

<div id="blockedClients_table"></div>
<table id="xClients_table" width="100%" align="center" class="table">
    <thead>
        <tr>
            <th colspan="7" style="text-align: center;"><#BlockedClient#></th>
        </tr>
        <tr>
            <th width="8%"><#Type#></th>
            <th><#Computer_Name#></th>
            <th width="20%">IP</th>
            <th width="24%">MAC</th>
            <th width="8%" id="col_unrssi">RSSI</th>
            <th>限速 (Mbps)</th>
            <th width="0%" id="col_unblock"></th>
        </tr>
    </thead>
    <tbody>
    </tbody>
</table>

<div id="alert_block" class="alert alert-danger" style="margin-top:40px; display: none;">
    <p><a href="/Advanced_MACFilter_Content.asp" target="_parent"><#menu5_5_3#></a> <#macfilter_alert_str1#></p>
</div>

<form method="post" name="form" id="refreshForm" action="/start_apply.htm" target="applyFrame">
<input type="hidden" name="sid_list" value="LANHostConfig;">
<input type="hidden" name="group_id" value="">
<input type="hidden" name="action_mode" value="">
<input type="hidden" name="action_script" value="">
<input type="hidden" name="current_page" value="/device-map/clients.asp">
<input type="hidden" name="next_page" value="/device-map/clients.asp">
<input type="hidden" name="flag" value="">
</form>

<script>
	if (!support_2g_radio() && !support_5g_radio()) {
		$("col_rssi").width = "0%";
		$("col_rssi").innerHTML = "";
		$("col_unrssi").width = "0%";
		$("col_unrssi").innerText = "";
	}
	if (sw_mode != "3") {
		if (list_type != "1") {
			$("col_block").width = "12%";
			$("col_unblock").width = "12%";
			$("col_block").innerHTML = "<#Block#>";
			$("col_unblock").innerHTML = "<#unBlock#>";
		}
	} else {
		$("applyClient").style.display = "none";
		$("xClients_table").style.display = "none";
	}
</script>

<script>
	initial();
	function loading() {
		$("loadingBarBlock").style.display = "none";
	}
	if (window.attachEvent) {
		window.attachEvent('onload', loading);
	} else {
		window.addEventListener('load', loading, false);
	}
</script>
</body>
</html>



