/* 功能回归仅连接本地模拟页面；DOM 检查不替代真实浏览器和设备验收。 */
const {JSDOM,VirtualConsole,requestInterceptor}=require('./test-tools/node_modules/jsdom');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const R=__dirname,W=path.join(R,'candidate/trunk/user/www/n56u_ribbon_fixed'),BASE='http://127.0.0.1:8767';
const cases=[],windows=[];const delay=ms=>new Promise(r=>setTimeout(r,ms));
function check(name,fn){return Promise.resolve().then(fn).then(()=>cases.push({name,passed:true}));}
function setup(w,record){
 const names=new Set();for(const m of record.html.matchAll(/\bname=["']([^"']+)["']/g))names.add(m[1]);
 names.forEach(n=>{if(!(n in w.HTMLFormElement.prototype))Object.defineProperty(w.HTMLFormElement.prototype,n,{configurable:true,get(){return this.elements.namedItem(n);}});});
 w.HTMLFormElement.prototype.submit=function(){record.submits.push({path:new URL(this.action).pathname,fields:[...new w.FormData(this)]});};
 w.alert=()=>{};w.confirm=()=>false;w.scrollTo=()=>{};w.focus=()=>{};
 w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({measureText:t=>({width:String(t).length*7})},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});};
}
async function open(page){
 const html=await(await fetch(BASE+'/'+page)).text(),record={html,submits:[],errors:[]},vc=new VirtualConsole();vc.on('jsdomError',e=>record.errors.push(e.message));
 const dom=new JSDOM(html,{url:BASE+'/'+page,runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,resources:{interceptors:[requestInterceptor(req=>{assert(req.url.startsWith(BASE+'/'),'unexpected external request');})]},beforeParse:w=>setup(w,record)});
 windows.push(dom.window);await Promise.race([new Promise(r=>dom.window.addEventListener('load',()=>setTimeout(r,250))),delay(4000)]);
 assert.equal(record.errors.length,0,record.errors.join('\n'));return {w:dom.window,d:dom.window.document,record};
}
function fixture(html){const record={html,submits:[]};let dom=new JSDOM(html,{url:BASE,runScripts:'outside-only',pretendToBeVisual:true,beforeParse:w=>setup(w,record)});windows.push(dom.window);return dom.window;}
function script(w,relative){w.eval(fs.readFileSync(path.join(W,relative),'utf8'));}
(async()=>{
 const w=fixture('<button id="before">之前</button><form><div id="test_on_of"><input id="test_fake" type="checkbox"></div><input id="test_0" type="radio" name="test" value="0" checked><input id="test_1" type="radio" name="test" value="1"></form><a id="help">帮助</a><div id="modal" class="modal"><button>关闭</button></div><table id="nodes"></table><div id="chart"></div>');
 script(w,'jquery.js');script(w,'ui/core.js');script(w,'ui/table.js');script(w,'ui/chart.js');let clicks=0;
 w.PadavanUI.switchControl('test',()=>clicks++);let toggle=w.document.querySelector('[role=switch]');
 await check('开关反复切换同步原字段且只触发一次回调',()=>{for(let i=0;i<20;i++)toggle.click();assert.equal(clicks,20);assert.equal(new w.FormData(w.document.forms[0]).get('test'),'0');assert.equal(toggle.getAttribute('aria-checked'),'false');});
 await check('禁用开关不可修改，iState 保留既有调用',()=>{w.jQuery('#test_on_of').iClickable(false);toggle.click();assert.equal(clicks,20);w.jQuery('#test_on_of').iState(1);assert.equal(toggle.getAttribute('aria-checked'),'true');w.jQuery('#test_on_of').iClickable(true);toggle.click();assert.equal(clicks,21);});
 await check('确认框默认取消，Escape 取消并恢复焦点',async()=>{let previous=w.document.getElementById('before');previous.focus();let promise=w.PadavanUI.confirm('变更设置');await delay(0);assert.equal(w.document.activeElement.textContent,'取消');w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(await promise,false);assert.equal(w.document.activeElement,previous);});
 await check('确认框排队处理，不串用前次结果',async()=>{let a=w.PadavanUI.confirm('A'),b=w.PadavanUI.confirm('B');await delay(0);assert.equal(w.document.querySelectorAll('[role=dialog]').length,1);w.document.querySelector('.ui-dialog .btn-primary').click();assert.equal(await a,true);await delay(0);assert.equal(w.document.querySelector('.ui-dialog p').textContent,'B');w.document.querySelector('.ui-dialog button').click();assert.equal(await b,false);});
 await check('标签帮助保留文字及链接并过滤脚本属性',()=>{let h=w.document.getElementById('help');w.PadavanUI.popover(h,{content:'<b>说明</b><a href="https://example.com" onclick="alert(1)">文档</a><img src=x onerror="alert(1)"><a href="javascript:alert(1)">无效</a>'});let p=w.document.getElementById('uiHelpPopover');assert.equal(p.querySelector('img'),null);assert.equal(p.querySelector('[onclick]'),null);assert.equal(p.querySelectorAll('a[href]').length,1);w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(w.document.getElementById('uiHelpPopover'),null);});
 await check('节点表按 ID 独立多选，同名节点不合并',()=>{const rows=Array.from({length:20},(_,i)=>({ids:i+1,alias:'同名',ping:20-i}));w.jQuery('#nodes').bootstrapTable({uniqueId:'ids',pageSize:15,columns:[{checkbox:true},{field:'ids',title:'序号',sortable:true},{field:'alias',title:'别名'},{field:'ping',title:'延迟',sortable:true}],data:rows});let t=w.document.getElementById('nodes');t.querySelector('tbody input').click();t._uiTable.page=2;t._uiTable.render();t.querySelector('tbody input').click();assert.deepEqual([...w.jQuery('#nodes').bootstrapTable('getSelections')].map(x=>x.ids),[1,16]);t._uiTable.load(rows.filter(x=>x.ids!==1));assert.deepEqual([...w.jQuery('#nodes').bootstrapTable('getSelections')].map(x=>x.ids),[16]);});
 await check('节点表排序按数值处理',()=>{let t=w.document.getElementById('nodes');t._uiTable.sort='ping';t._uiTable.page=1;t._uiTable.desc=false;t._uiTable.render();assert.equal(t.querySelector('tbody tr td:nth-child(2)').textContent,'20');});
 await check('节点文本不作为 HTML 执行',()=>{let t=w.document.getElementById('nodes');t._uiTable.load([{ids:1,alias:'<img src=x onerror=alert(1)>',ping:1}]);assert.equal(t.querySelector('img'),null);assert(t.textContent.includes('<img'));});
 await check('节点表保留延迟颜色与文本省略并拒绝资源样式',()=>{let t=w.document.getElementById('nodes');t._uiTable.options.columns=[{field:'alias',title:'别名',align:'center',cellStyle:()=>({css:{'white-space':'nowrap','text-overflow':'ellipsis',overflow:'hidden','background-image':'url(https://invalid.example/a)'}})},{field:'ping',title:'延迟',cellStyle:value=>({css:{background:value<100?'#04B404':'#f44336',color:'#000'}})}];t._uiTable.load([{ids:1,alias:'长名称',ping:20}]);const cells=t.querySelectorAll('tbody td');assert.equal(cells[0].style.textAlign,'center');assert.equal(cells[0].style.textOverflow,'ellipsis');assert.equal(cells[0].style.backgroundImage,'');assert.equal(cells[1].style.background,'rgb(4, 180, 4)');});
 let host=w.document.getElementById('chart');Object.defineProperty(host,'clientWidth',{get:()=>800});
 let chart=new w.RouterChart.Chart({chart:{renderTo:'chart'},xAxis:{minRange:10000},tooltip:{valueDecimals:0,valueSuffix:' Mbps'},series:[{name:'下载',data:Array.from({length:61},(_,i)=>[i*1000,i])}],rangeSelector:{buttons:[{type:'all',text:'全部'}]}});
 chart.canvas.getBoundingClientRect=()=>({left:0,width:800});
 await check('图表缩放最小范围和前后平移',()=>{chart.setWindow(20000,20001);assert.equal(chart.extent.max-chart.extent.min,10000);chart.pan(1);assert.equal(chart.extent.min,25000);chart.bounds[0].value=0;chart.bounds[0].dispatchEvent(new w.Event('input'));assert.equal(chart.extent.min,0);});
 await check('图表整数精度、图例和动态数据',()=>{chart.inspect(50);assert(chart.tip.textContent.includes('0 Mbps'));assert(!chart.tip.textContent.includes('0.0 Mbps'));chart.legend.querySelector('button').click();assert.equal(chart.series[0].visible,false);chart.legend.querySelector('button').click();chart.series[0].addPoint([61000,99],true,true);assert.equal(chart.series[0].data.length,61);assert.equal(chart.series[0].data[60][1],99);chart.reset.click();assert.equal(chart.zoom,null);});
 const mode=await open('Advanced_OperationMode_Content.asp');
 await check('模式切换取消恢复路由模式且不提交',async()=>{mode.d.form.sw_mode.value='3';mode.w.setScenerion('3');const p=mode.w.saveMode();await delay(0);mode.d.querySelector('.ui-dialog button').click();await p;assert.equal(mode.d.form.sw_mode.value,'1');assert.equal(mode.record.submits.length,0);assert.equal(mode.w.modeSubmitting,false);});
 await check('模式切换确认只提交一次并等待实际重启',async()=>{mode.d.form.sw_mode.value='3';let p=mode.w.saveMode();await delay(0);await mode.w.saveMode();mode.d.querySelector('.ui-dialog .btn-primary').click();await p;assert.equal(mode.record.submits.length,1);assert(mode.record.submits[0].fields.some(x=>x[0]==='sw_mode'&&x[1]==='3'));assert.equal(mode.w.modeSubmitting,true);assert(!mode.d.body.textContent.includes('切换已完成'));});
 const agh=await open('Advanced_adguardhome.asp');
 for(const state of ['absent','busy','unsafe','failed','ready'])await check('AGH 备份按钮状态 '+state,()=>{agh.w.aghBackupRender({csrf:'mock-token',backup:{state,bytes:37*1048576,token:'mock'}});assert.equal(agh.d.getElementById('agh_backup_clean').disabled,state!=='ready');});
 await check('AGH 缺少令牌时不可清理',()=>{agh.w.aghBackupRender({backup:{state:'ready'}});assert(agh.d.getElementById('agh_backup_clean').disabled);});
 const wan=await open('Advanced_WAN_Content.asp');
 for(const proto of ['dhcp','static','pppoe','pptp','l2tp'])await check('WAN 类型联动 '+proto,()=>{wan.d.form.wan_proto.value=proto;wan.w.change_wan_type(proto,0);assert.equal(wan.record.submits.length,0);});
 await check('全局搜索可查找其他分类中的设置',()=>{let s=wan.d.querySelector('.ui-nav-search');s.value='IPv6';s.dispatchEvent(new wan.w.Event('input'));assert(wan.d.querySelectorAll('.ui-search-results a').length>0);});
 for(const page of ['Main_TrafficMonitor_realtime.asp','Main_TrafficMonitor_last24.asp','Main_TrafficMonitor_daily.asp']){
  const p=await open(page);
  await check('流量刷新不清空已加载数据 '+page,()=>{if(page.includes('realtime')){p.w.netdevs={LAN:{rx:10000,tx:5000}};p.w.eval_netdevs('');assert.equal(p.w.netdevs.LAN.rx,10000);}else if(page.includes('last24')){p.w.speed_history={LAN:{rx:[100,200],tx:[50,60]}};p.w.eval_netdevs('');assert.equal(p.w.speed_history.LAN.rx.length,2);}else{p.w.daily_history=[[20261031,100,200]];p.w.monthly_history=[[202610,300,400]];p.w.eval_history('');assert.equal(p.w.daily_history.length,1);assert.equal(p.w.monthly_history.length,1);}});
 }
 for(const page of ['Advanced_FirmwareUpgrade_Content.asp','Advanced_SettingBackup_Content.asp','Advanced_AiDisk_ftp.asp','Advanced_AiDisk_samba.asp']){
  const p=await open(page);
  await check('非空隐藏弹层脱离排版且保留原入口 '+page,()=>{
   const overlay=p.d.getElementById(page.includes('AiDisk')?'OverlayMask':'LoadingBar');assert(overlay&&overlay.children.length);
   assert.equal(p.w.getComputedStyle(overlay).position,'fixed');assert.equal(p.w.getComputedStyle(overlay).visibility,'hidden');
   if(page.includes('AiDisk')){overlay.style.visibility='visible';assert.equal(p.w.getComputedStyle(overlay).visibility,'visible');overlay.style.visibility='hidden';}
   else{p.w.showLoadingBar(30);assert.equal(p.w.getComputedStyle(overlay).position,'fixed');assert.equal(p.w.getComputedStyle(overlay).visibility,'visible');p.w.hideLoading();assert.equal(p.w.getComputedStyle(overlay).display,'none');}
   assert.equal(p.record.submits.length,0);
  });
 }
 const resourcePage=await open('Advanced_SettingBackup_Content.asp'),rw=resourcePage.w,rd=resourcePage.d;
 rw.clearTimeout(rw.id_system_info);
 const snapshot=(factor=1)=>({cpu:{total:1000*factor,busy:200*factor,user:100*factor,system:100*factor,idle:800*factor,nice:0,irq:0,sirq:0,iowait:0},ram:{total:1000,used:500,free:500,buffers:50,cached:200},swap:{total:0,used:0},uptime:{days:1,hours:2,minutes:3},lavg:'0.12 0.34 0.56',wifi2:{state:1,guest:0},wifi5:{state:1,guest:1},logmt:0});
 await check('CPU 使用率按采样差值计算且细分与总量一致',()=>{
  rw.setSystemInfo(snapshot());let next=snapshot(2);next.cpu.busy=700;next.cpu.user=400;next.cpu.system=300;next.cpu.idle=1300;rw.setSystemInfo(next);
  assert.equal(rd.getElementById('cpu_info').textContent,'50%');assert.equal(rd.querySelector('[role=meter]').getAttribute('aria-valuenow'),'50.0');
  assert(rd.querySelector('.ui-cpu-breakdown').textContent.includes('用户程序30%'));assert(rd.querySelector('.ui-cpu-breakdown').textContent.includes('系统内核20%'));
  assert.equal(rd.querySelector('.ui-resource-idle').textContent,'空闲 50%');
 });
 await check('内存四个分类不重复计算缓存，空闲不冒充可用',()=>{
  const bars=[...rd.querySelectorAll('.ui-memory-meter>span')].map(n=>parseFloat(n.style.width));assert.deepEqual(bars,[25,20,5,50]);assert.equal(bars.reduce((a,b)=>a+b),100);
  assert(rd.querySelector('.ui-memory-breakdown').textContent.includes('程序与系统250 KiB25%'));assert(rd.querySelector('.ui-memory-breakdown').textContent.includes('空闲500 KiB50%'));
  assert.equal(rd.querySelector('.ui-swap-line strong').textContent,'未启用');assert(!rd.querySelector('.ui-resource-body').textContent.includes('可用内存 500'));
 });
 await check('零增量及计数器重置显示采样中，下一次正常恢复',()=>{
  const a=snapshot(2);rw.setSystemInfo(a);rw.setSystemInfo(a);assert.equal(rd.getElementById('cpu_info').textContent,'采样中');assert.equal(rd.querySelector('[role=meter]').getAttribute('aria-valuenow'),null);
  rw.setSystemInfo(snapshot());assert.equal(rd.getElementById('cpu_info').textContent,'采样中');rw.setSystemInfo(snapshot(2));assert.equal(rd.getElementById('cpu_info').textContent,'20%');
 });
 await check('无效内存数据不显示负数、无穷值或伪造占用，交换空间单独显示',()=>{
  let a=snapshot(3);a.ram.total=0;a.swap={total:2048,used:512};rw.setSystemInfo(a);assert.equal(rd.getElementById('mem_info').textContent,'暂不可用');assert.equal(rd.querySelector('.ui-swap-line strong').textContent,'512 KiB / 2.00 MiB');assert(!/NaN|Infinity/.test(rd.querySelector('.ui-resource-body').textContent));
  a=snapshot(4);a.ram.cached=900;rw.setSystemInfo(a);assert.equal(rd.getElementById('mem_info').textContent,'暂不可用');rw.setSystemInfo(snapshot(5));assert.equal(rd.getElementById('mem_info').textContent,'500 KiB / 1000 KiB');
 });
 await check('负载保留 1/5/15 分钟标签且无线与启动时间更新不丢失',()=>{
  assert.deepEqual([...rd.querySelectorAll('.ui-load-grid dt')].map(n=>n.textContent),['1 分钟','5 分钟','15 分钟']);assert.deepEqual([...rd.querySelectorAll('.ui-load-grid dd')].map(n=>n.textContent),['0.12','0.34','0.56']);
  assert(rd.getElementById('wifi2_b').classList.contains('btn-info'));assert(!rd.getElementById('wifi2_b_g').classList.contains('btn-info'));assert(rd.getElementById('wifi5_b_g').classList.contains('btn-info'));assert.equal(rd.getElementById('uptime_info').textContent,'1 天 02 时 03 分');
 });
 await check('资源明细展开状态只保存在当前浏览器会话',async()=>{
  rd.querySelector('.ui-metric-details').open=true;await delay(10);assert.equal(rw.sessionStorage.getItem('padavan.resources.open'),'1');assert.equal(resourcePage.record.submits.length,0);
  rw.show_banner();rw.clearTimeout(rw.id_system_info);assert(rd.querySelector('.ui-metric-details').open);
 });
 await check('状态请求失败保留最后读数并提示过期，恢复后重新采样',()=>{
  rw.setSystemInfo(snapshot(6));rw.setSystemInfo(snapshot(7));const old=rd.getElementById('cpu_info').textContent,ajax=rw.jQuery.ajax,requests=[];
  rw.jQuery.ajax=()=>{let q=rw.jQuery.Deferred();q.abort=()=>q.reject({},'abort');requests.push(q);return q;};
  rw.get_system_info();rw.get_system_info();assert.equal(requests.length,1);requests[0].reject({},'timeout');rw.clearTimeout(rw.id_system_info);
  assert.equal(rd.getElementById('cpu_info').textContent,old);assert(rd.querySelector('.ui-metric-details').classList.contains('ui-resource-stale'));assert(rd.querySelector('.ui-resource-status').textContent.includes('状态更新失败'));
  rw.get_system_info();requests[1].resolve(snapshot(8));rw.clearTimeout(rw.id_system_info);assert.equal(rd.getElementById('cpu_info').textContent,'采样中');assert(!rd.querySelector('.ui-metric-details').classList.contains('ui-resource-stale'));
  rw.get_system_info();requests[2].resolve(snapshot(9));rw.clearTimeout(rw.id_system_info);assert.equal(rd.getElementById('cpu_info').textContent,'20%');
  Object.defineProperty(rd,'hidden',{configurable:true,value:true});rd.dispatchEvent(new rw.Event('visibilitychange'));rw.get_system_info();assert.equal(requests.length,3);assert(rd.querySelector('.ui-resource-status').textContent.includes('暂停刷新'));rw.jQuery.ajax=ajax;
 });
 const chartPage=await open('Advanced_System_Info.asp');chartPage.w.clearTimeout(chartPage.w.id_system_info);
 await check('新资源面板继续向原系统历史图表推送有效采样',()=>{
  chartPage.w.setSystemInfo(snapshot());chartPage.w.setSystemInfo(snapshot(2));const charts=chartPage.w.arrCharts;
  assert.equal(charts[0].series[0].data.at(-1)[1],20);assert.equal(charts[1].series[0].data.at(-1)[1],0.49);
  const n=charts[0].series[0].data.length;chartPage.w.setSystemInfo(snapshot(2));assert.equal(charts[0].series[0].data.length,n);
 });
 console.log(JSON.stringify({passed:true,count:cases.length,cases}));
})().catch(e=>{cases.push({name:'failure',passed:false,error:e.stack});console.error(e);process.exitCode=1;}).finally(()=>{windows.forEach(w=>w.close());fs.writeFileSync(path.join(R,'functional-results.json'),JSON.stringify({kind:'jsdom-functional-not-visual',passed:!process.exitCode,cases},null,2));});
