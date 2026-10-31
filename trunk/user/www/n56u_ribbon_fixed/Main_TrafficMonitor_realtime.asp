<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/ui/base.css?v=1">
<link rel="stylesheet" href="/ui/icons.css?v=1">
<title><#Web_Title#> - <#menu4_2#> : <#menu4_2_1#></title>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="-1">

<link rel="shortcut icon" href="images/favicon.ico">
<link rel="icon" href="images/favicon.png">



<script type="text/javascript" src="/jquery.js"></script>
<script src="/ui/core.js?v=1"></script>

<script type="text/javascript" src="/ui/chart.js"></script>

<script type="text/javascript" src="/net_speed_tabs.js"></script>
<script type="text/javascript" src="/state.js"></script>
<script src="/ui/state-modern.js?v=1"></script>
<script type="text/javascript" src="/popup.js"></script>
<script>
var $j = jQuery.noConflict();
<% netdev(); %>
var netdevs_prev = {};

var netChart;
var speed_rx = {};
var speed_tx = {};
var speed_history = {};
var netdev = "LAN";
var last_perf = 0;
var last_netdev = "";

var cprefix = "bw_rt_";
var updateAvgLen = 5;

var net_chart_rt = {
    chart: {
        renderTo: 'net_chart',
        zoomType: 'x',
        spacingRight: 15
    },
    title : {
        text: 'Wired: LAN',
        align: 'center'
    },
    xAxis: {
        type: 'datetime',
        minRange: 10*1000,
        title: {
            text: null
        },
        labels: {
            format: '{value:%H:%M:%S}'
        }
    },
    yAxis: {
        title: {
            text: '<#HSTOCK_Bandwidth#>'
        },
        min: 0,
        minRange: 0.04,
        opposite: false,
        startOnTick: false,
        showFirstLabel: false
    },
    plotOptions: {
        series: {
            animation: false
        },
        areaspline: {
            lineWidth: 1,
            fillOpacity: 0.3
        }
    },
    legend: {
        enabled: true,
        verticalAlign: 'top',
        floating: true,
        align: 'right'
    },
    rangeSelector: {
        buttons: [{
            count: 1,
            type: 'minute',
            text: '1M'
        },{
            count: 5,
            type: 'minute',
            text: '5M'
        },{
            count: 15,
            type: 'minute',
            text: '15M'
        },{
            type: 'all',
            text: 'All'
        }],
        inputEnabled: false,
        selected: 1
    },
    tooltip:{
        xDateFormat: '%H:%M:%S',
        valueSuffix: ' Mbps',
        valueDecimals: 2
    },
    series: [{
        type: 'areaspline',
        name: '<#Downlink#>',
        color: '#FF9000',
        gapSize: 5,
        threshold: null,
        data: (prepare_array_chart)()
    },{
        type: 'areaspline',
        name: '<#Uplink#>',
        color: '#003EBA',
        gapSize: 5,
        threshold: null,
        data: (prepare_array_chart)()
    }]
};

RouterChart.setOptions(RouterChart.locale);

$j(document).ready(function(){
	$j("#tabs a").click(function(){
		switchPage(this.id);
		return false;
	});
	if(get_ap_mode()){
		$j("#tab_tr_dy").parents('li').hide();
		$j("#tab_tr_mo").parents('li').hide();
	}
	if (!netChart) netChart = new RouterChart.Chart(net_chart_rt);
	invoke_timer(2);
});

window.performance = window.performance || {};
performance.now = (function() {
	return performance.now ||
	performance.mozNow ||
	performance.msNow ||
	performance.oNow ||
	performance.webkitNow ||
	function() { return new Date().getTime(); };
})();

function initial(){
    if (!netChart) netChart = new RouterChart.Chart(net_chart_rt);
	show_banner(0);
	show_menu(5, -1, 0);
	show_footer();

	var ifdesc = cookie.get(cprefix + 'tab');
	if (ifdesc)
		netdev = ifdesc;

	initTab();
	calc_speed(0);
}

function calc_speed(now_perf){
    var x = Date.now(), selected = null, first = null;
    // 不把缺失期间的累计值塞进下一次短采样，也不保留已消失接口的旧选择项。
    Object.keys(netdevs_prev).forEach(function(name){
        if (!Object.prototype.hasOwnProperty.call(netdevs, name)) {
            delete netdevs_prev[name]; delete speed_history[name];
            delete speed_rx[name]; delete speed_tx[name];
        }
    });
    Object.keys(netdevs).forEach(function(name){
        var c = netdevs[name], p = netdevs_prev[name], h = speed_history[name];
        if (!c || !Number.isSafeInteger(c.rx) || !Number.isSafeInteger(c.tx) || c.rx < 0 || c.tx < 0) return;
        var elapsed = p ? now_perf - p.at : 0;
        var reset = !p || p.id !== c.id || c.rx < p.rx || c.tx < p.tx || elapsed <= 0 || elapsed > 10000;
        if (!h || reset) {
            h = speed_history[name] = {rx:[],tx:[],windowMs:[],rx_avg:0,tx_avg:0,rx_max:0,tx_max:0};
            speed_rx[name] = []; speed_tx[name] = [];
        } else {
            var rx = (c.rx-p.rx)*1000/elapsed, tx = (c.tx-p.tx)*1000/elapsed;
            h.rx.push(rx); h.tx.push(tx); h.windowMs.push(elapsed);
            if (h.rx.length > updateAvgLen) { h.rx.shift(); h.tx.shift(); h.windowMs.shift(); }
            var totalMs = h.windowMs.reduce(function(a,b){return a+b;},0);
            h.rx_avg = h.rx.reduce(function(a,b,i){return a+b*h.windowMs[i];},0)/totalMs;
            h.tx_avg = h.tx.reduce(function(a,b,i){return a+b*h.windowMs[i];},0)/totalMs;
            h.rx_max = Math.max(h.rx_max,rx); h.tx_max = Math.max(h.tx_max,tx);
            speed_rx[name].push([x,rx*8/1000000]); speed_tx[name].push([x,tx*8/1000000]);
            // 页面最多保留十五分钟，数组与图表使用同一批真实采样。
            while (speed_rx[name].length > 451 || (speed_rx[name].length && speed_rx[name][0][0] < x-900000)) {
                speed_rx[name].shift(); speed_tx[name].shift();
            }
        }
        h.rx_total=c.rx; h.tx_total=c.tx;
        netdevs_prev[name]={id:c.id,rx:c.rx,tx:c.tx,at:now_perf};
        if (!first) first=name;
        if (name===netdev) selected=name;
    });
    processTabs();
    selected=selected||first;
    if (selected) {
        setChartData(selected);
        E('sel_netif').value='speed-tab-'+selected;
        var upload=trafficReceiveIsUpload(selected);
        netChart.series[0].setData(prepareData(upload?speed_tx[selected]:speed_rx[selected]),false);
        netChart.series[1].setData(prepareData(upload?speed_rx[selected]:speed_tx[selected]),false);
        updateTab(speed_history[selected]);
    } else {
        netChart.series[0].setData([],false); netChart.series[1].setData([],false);
        updateTab({rx:[],tx:[],rx_total:0,tx_total:0});
    }
    last_perf=now_perf;
}

function eval_netdevs(response){
	var now_perf = performance.now();

	// 数据脚本由传输层加载，保留本轮返回值。

	calc_speed(now_perf);
	netChart.redraw();
}

function prepare_array(x){
    // 尚未采集的数据保持空白，不能预填十五分钟的零流量。
    return [];
}

function prepare_array_chart(){
	var x = (new Date()).getTime();
	x = parseInt(x/1000)*1000;
	return prepare_array(x);
}

function load_netdevs(){
	clearTimeout(idTimerPoll);
	$j.ajax({
		type: "get",
		url: "/update.cgi",
		data: {
			output: "netdev"
		},
		dataType: "script",
		cache: true,
		error: function(xhr){
			invoke_timer(2);
		},
		success: function(response){
			invoke_timer(2);
			eval_netdevs(response);
		}
	});
}

function prepareData(data){
	var newData = [];
	for(var i=0; i<data.length; i++)
		newData.push(data[i]);
	return newData;
}

function setChartTitle(ifdesc){
	var title = getTabDesc(ifdesc);
	if (title)
		netChart.setTitle({text: title}, null, false);
}

function setChartData(ifdesc){
	if (!ifdesc)
		return false;
	if (netdev != ifdesc){
		netdev = ifdesc;
		cookie.set(cprefix + 'tab', ifdesc, 14);
	}
	if (last_netdev != ifdesc && speed_rx[ifdesc] !== undefined && speed_tx[ifdesc] !== undefined){
		if (last_netdev != ""){
			netChart.series[0].setData(prepareData(trafficReceiveIsUpload(ifdesc)?speed_tx[ifdesc]:speed_rx[ifdesc]), false);
			netChart.series[1].setData(prepareData(trafficReceiveIsUpload(ifdesc)?speed_rx[ifdesc]:speed_tx[ifdesc]), false);
		}
		last_netdev = ifdesc;
		setChartTitle(ifdesc);
	}
}

function handleTabs(arrTabs){
	var o = E('sel_netif');
	var ifdesc = netdev;
	var tabName = 'speed-tab-' + ifdesc;
	free_options(o);
	for(var i=0; i<arrTabs.length; i++)
		add_option(o, arrTabs[i][1], arrTabs[i][0], arrTabs[i][0] === tabName);
	setChartData(ifdesc);
}

function tabSelect(tabName){
	var ifdesc = tabName.replace('speed-tab-', '');
	setChartData(ifdesc);
	updateTab(speed_history[ifdesc]);

	netChart.redraw();
}

function switchPage(id){
	if(id == "tab_bw_24")
		location.href = "/Main_TrafficMonitor_last24.asp";
	else if(id == "tab_tr_dy")
		location.href = "/Main_TrafficMonitor_daily.asp#DY";
	else if(id == "tab_tr_mo")
		location.href = "/Main_TrafficMonitor_daily.asp#MO";
	return false;
}

</script>
<style>
#tabs {margin-bottom: 0px;}
.table-stat td {padding: 4px 8px;}
</style>
</head>

<body onload="initial();" >

<div class="wrapper">
    <div class="container-fluid" style="padding-right: 0px">
        <div class="row-fluid">
            <div class="span3"><center><div id="logo"></div></center></div>
            <div class="span9">
                <div id="TopBanner"></div>
            </div>
        </div>
    </div>

    <div id="Loading" class="popup_bg"></div>

    <iframe name="hidden_frame" id="hidden_frame" src="" width="0" height="0" frameborder="0"></iframe>

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
                    <div class="span12">
                        <div class="box well grad_colour_dark_blue">
                            <h2 class="box_head round_top"><#menu4#> - <#menu4_2_1#></h2>
                            <div class="round_bottom">
                                <div class="row-fluid">
                                    <div id="tabMenu" class="submenuBlock"></div>

                                    <div align="right" style="margin: 3px 8px 0px 0px;">
                                        <select id="sel_netif" style="width: 200px; margin-bottom: 5px;" onchange="tabSelect(this.value);">
                                        </select>
                                    </div>

                                    <div style="margin-bottom: 0px; margin: -36px 0px 0px 0px;">
                                        <ul id="tabs" class="nav nav-tabs">
                                            <li class="active"><a href="javascript:void(0)" id="tab_bw_rt"><#menu4_2_1#></a></li>
                                            <li><a href="javascript:void(0)" id="tab_bw_24"><#menu4_2_2#></a></li>
                                            <li><a href="javascript:void(0)" id="tab_tr_dy"><#menu4_2_3#></a></li>
                                            <li><a href="javascript:void(0)" id="tab_tr_mo"><#menu4_2_4#></a></li>
                                        </ul>
                                    </div>

                                    <center>
                                        <table style="width: 100%; margin-top: 6px; margin-bottom: 6px;">
                                            <tr>
                                                <td width="100%" align="center" style="text-align: center">
                                                    <div id="net_chart" style="width: 850px; padding-left: 5px;"></div>
                                                </td>
                                            </tr>
                                        </table>
                                    </center>

                                    <table width="100%" align="center" cellpadding="4" cellspacing="0" class="table table-stat">
                                        <tr>
                                            <th width="9%"><#Color#></th>
                                            <th width="11%"><#Network#></th>
                                            <th width="20%" style="text-align: right"><#Current#></th>
                                            <th width="20%" style="text-align: right"><#Average#></th>
                                            <th width="20%" style="text-align: right"><#Maximum#></th>
                                            <th width="20%" style="text-align: right"><#Total#></th>
                                        </tr>
                                        <tr>
                                            <td width="9%" style="text-align:center; vertical-align: middle;">
                                                <div id="rx-sel" class="span12" style="border-radius: 5px;"></div>
                                            </td>
                                            <td width="11%"><#Downlink#></td>
                                            <td width="20%" align="center" valign="top" style="text-align:right;font-weight: bold;"><span id="rx-current"></span></td>
                                            <td width="20%" align="center" valign="top" style="text-align:right" id="rx-avg"></td>
                                            <td width="20%" align="center" valign="top" style="text-align:right" id="rx-max"></td>
                                            <td width="20%" align="center" valign="top" style="text-align:right" id="rx-total"></td>
                                        </tr>
                                        <tr>
                                            <td width="9%" style="text-align:center; vertical-align: middle;">
                                                <div id="tx-sel" class="span12" style="border-radius: 5px;"></div>
                                            </td>
                                            <td width="11%"><#Uplink#></td>
                                            <td width="20%" align="center" valign="top" style="text-align:right;font-weight: bold;"><span id="tx-current"></span></td>
                                            <td width="20%" align="center" valign="top" style="text-align:right" id='tx-avg'></td>
                                            <td width="20%" align="center" valign="top" style="text-align:right" id='tx-max'></td>
                                            <td width="20%" align="center" valign="top" style="text-align:right" id='tx-total'></td>
                                        </tr>
                                    </table>

                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div id="footer"></div>
</div>

</body>
</html>
