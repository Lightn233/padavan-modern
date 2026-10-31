/* 对候选的实际页面函数输入计数序列，核对显示和数据保留边界。 */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=process.env.PADAVAN_TEST_RESULTS||path.join(require('node:os').tmpdir(),'padavan-backend-tests'),source=process.env.PADAVAN_SOURCE||path.resolve(__dirname,'../..');fs.mkdirSync(path.join(root,'results'),{recursive:true});
const base=path.join(source,'trunk/user/www/n56u_ribbon_fixed');
const page=fs.readFileSync(path.join(base,'Main_TrafficMonitor_realtime.asp'),'utf8');
const tabs=fs.readFileSync(path.join(base,'net_speed_tabs.js'),'utf8');
const historyPage=fs.readFileSync(path.join(base,'Main_TrafficMonitor_last24.asp'),'utf8');
function func(text,name){const start=text.indexOf('function '+name+'(');assert(start>=0);const end=text.indexOf('\n}',start);return text.slice(start,end+2);}
function context(){
 const elements={};const c={Date,Number,Math,Object,parseInt,RouterChart:{},netdevs:{},netdevs_prev:{},speed_rx:{},speed_tx:{},speed_history:{},netdev:'LAN',last_netdev:'LAN',last_perf:0,updateAvgLen:5,
 netChart:{series:[{setData(d){this.points=d;}},{setData(d){this.points=d;}}]},E:id=>elements[id]||(elements[id]={}),handleTabs(){c.updates++;},updates:0,setChartData(name){c.netdev=name;}};
 vm.createContext(c);vm.runInContext(tabs,c);vm.runInContext(['prepare_array','prepareData','calc_speed'].map(n=>func(page,n)).join('\n'),c);return c;
}
const cases=[];function test(name,run){run(context());cases.push(name);}
test('启动不伪造历史数据',c=>{assert.equal(c.prepare_array(0).length,0);c.netdevs={LAN:{id:2,rx:100,tx:200}};c.calc_speed(0);assert.equal(c.speed_rx.LAN.length,0);assert.equal(c.E('rx-current').textContent,'—');});
test('正常速率与首笔平均值',c=>{c.netdevs={LAN:{id:2,rx:100,tx:200}};c.calc_speed(0);c.netdevs.LAN={id:2,rx:1048676,tx:200};c.calc_speed(2000);assert.equal(c.speed_rx.LAN[0][1],4.194304);assert.equal(c.speed_history.LAN.rx_avg,524288);assert.equal(c.netChart.series[1].points[0][1],4.194304);assert.equal(c.netChart.series[0].points[0][1],0);});
test('WAN 接收仍为下行',c=>{c.netdev='WAN';c.netdevs={WAN:{id:2,rx:0,tx:0}};c.calc_speed(0);c.netdevs.WAN.rx=1000000;c.calc_speed(2000);assert.equal(c.netChart.series[0].points[0][1],4);});
test('改代次和计数下降重新采样',c=>{c.netdevs={LAN:{id:2,rx:1000000,tx:100}};c.calc_speed(0);c.netdevs.LAN={id:3,rx:104857600,tx:100};c.calc_speed(2000);assert.equal(c.speed_rx.LAN.length,0);c.netdevs.LAN.rx=100;c.calc_speed(4000);assert.equal(c.speed_rx.LAN.length,0);c.netdevs.LAN.rx=1100;c.calc_speed(6000);assert.equal(c.speed_rx.LAN[0][1],0.004);});
test('缺失后恢复不放大流量',c=>{c.netdevs={LAN:{id:2,rx:0,tx:0}};c.calc_speed(0);c.netdevs={};c.calc_speed(2000);c.netdevs={LAN:{id:2,rx:6000000,tx:0}};c.calc_speed(6000);assert.equal(c.speed_rx.LAN.length,0);});
test('长轮询中断重新采样',c=>{c.netdevs={LAN:{id:2,rx:0,tx:0}};c.calc_speed(0);c.netdevs.LAN.rx=6000000;c.calc_speed(60000);assert.equal(c.speed_rx.LAN.length,0);});
test('50000 笔采样仍有界',c=>{for(let i=0;i<50000;i++){c.netdevs={LAN:{id:2,rx:i*1000,tx:i*2000}};c.calc_speed(i*2000);}assert(c.speed_rx.LAN.length<=451);assert(c.speed_history.LAN.rx.length<=5);});
test('跨越 32 位不丢增量',c=>{c.netdevs={LAN:{id:2,rx:0xfffffff0,tx:0}};c.calc_speed(0);c.netdevs.LAN.rx+=6000;c.calc_speed(2000);assert.equal(c.speed_rx.LAN[0][1],0.024);});
test('第一项变化也刷新接口选择',c=>{c.tabs=[['speed-tab-LAN','LAN',3]];c.speed_history={WAN:{}};c.processTabs();assert.equal(c.updates,1);});
test('LAN/WAN 历史累计方向一致且不修改原始数据',c=>{const h={rx:[1],tx:[2],rx_avg:3,tx_avg:4,rx_total:5,tx_total:6};const lan=c.trafficView(h,'LAN');assert.equal(lan.rx_total,6);assert.equal(lan.rx[0],2);assert.equal(c.trafficView(h,'WAN'),h);assert.equal(h.rx_total,5);});
test('24 小时图首次加载使用所选接口方向',c=>{c.data_period=60;c.getNextTime=()=>1000;c.speed_history.LAN={rx:[100],tx:[200]};vm.runInContext(['prepareData','prepare_array_chart'].map(n=>func(historyPage,n)).join('\n'),c);assert.equal(c.prepare_array_chart(0)[0][1],0.0016);assert.equal(c.prepare_array_chart(1)[0][1],0.0008);assert.equal(Object.hasOwn(c,'i'),false);});
const report={passed:true,cases};fs.writeFileSync(path.join(root,'results/traffic-fixed.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
