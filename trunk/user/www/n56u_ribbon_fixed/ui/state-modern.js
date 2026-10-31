/* 页面生命周期和状态轮询集中管理，切换页面或隐藏标签后停止无效请求。 */
(function(root){
 'use strict';
 var UI=root.PadavanUI, jq=root.jQuery, systemRequest=null, internetRequest=null, stopped=false,clockTimer=null,clockBase=null;
 function updateClock(){
  clearTimeout(clockTimer);var area=document.getElementById('system_time_log_area');if(!area||stopped||document.hidden)return;
  if(!clockBase&&Number.isFinite(root.systime_millsec))clockBase={time:root.systime_millsec,start:Date.now()};
  area.textContent=clockBase?new Date(clockBase.time+Date.now()-clockBase.start).toLocaleString():'设备时间暂不可用';clockTimer=setTimeout(updateClock,1000);
 }
 function node(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
 function action(text,handler,id){var b=node('button','btn btn-small',text);b.type='button';if(id)b.id=id;b.addEventListener('click',handler);return b;}
 var resources=null,previousCpu=null,previousCpuAt=0,lastResourceUpdate=null;
 var cpuParts=[['user','用户程序'],['system','系统内核'],['sirq','软中断'],['irq','硬件中断'],['nice','低优先级程序'],['iowait','等待 I/O'],['other','其他 CPU 时间']];
 var memoryParts=[['other','程序与系统'],['cached','文件缓存'],['buffers','缓冲区'],['free','空闲']];
 function finiteValue(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0;}
 function percent(value){return value.toFixed(1).replace(/\.0$/,'')+'%';}
 function memorySize(kib){return kib>=1048576?(kib/1048576).toFixed(2)+' GiB':kib>=1024?(kib/1024).toFixed(2)+' MiB':kib.toFixed(0)+' KiB';}
 function textAt(id,text){var target=document.getElementById(id);if(target)target.textContent=text;}
 function cpuSample(current,previous){
  var keys=['total','busy','user','system','sirq','irq','nice','idle','iowait'];
  if(!previous||keys.some(function(k){return !Number.isSafeInteger(current[k])||current[k]<0||!Number.isSafeInteger(previous[k])||previous[k]<0;}))return null;
  var total=current.total-previous.total,result={};if(total<=0)return null;
  // 重启、计数器回绕或读数不完整时等待下一次采样，不生成负值或伪造零负载。
  for(var i=1;i<keys.length;i++){var key=keys[i],delta=current[key]-previous[key];if(delta<0||delta>total)return null;result[key]=delta*100/total;}
  result.other=result.busy-result.user-result.system-result.sirq-result.irq-result.nice;
  if(result.other<-.01||Math.abs(result.busy+result.idle+result.iowait-100)>.01)return null;
  result.other=Math.max(0,result.other);return result;
 }
 function memorySample(ram){
  if(!ram||['total','free','buffers','cached'].some(function(k){return !finiteValue(ram[k]);})||ram.total<=0||ram.free+ram.buffers+ram.cached>ram.total)return null;
  // 后端 used 包含缓存，分类条只分配一次；这里没有冒充内核的 MemAvailable。
  return {total:ram.total,used:ram.total-ram.free,free:ram.free,cached:ram.cached,buffers:ram.buffers,other:ram.total-ram.free-ram.cached-ram.buffers};
 }
 function resourceHelp(label,content){
  var help=node('button','ui-resource-help','?');help.type='button';help.setAttribute('aria-label',label+'说明');
  function show(){UI.popover(help,{title:label,content:content});}help.addEventListener('click',show);help.addEventListener('focus',show);help.addEventListener('mouseenter',show);return help;
 }
 function resourceCard(title,help){
  var card=node('section','ui-resource-card'),head=node('div','ui-resource-heading');head.append(node('h2','',title),resourceHelp(title,help));card.appendChild(head);return card;
 }
 function metricRow(label,key,kind){
  var row=node('div','ui-resource-row'),name=node('dt'),dot=node('i','ui-memory-dot ui-memory-'+key),value=node('dd');
  if(kind==='memory'){dot.setAttribute('aria-hidden','true');name.appendChild(dot);}name.appendChild(document.createTextNode(label));
  value.textContent='—';row.append(name,value);return {row:row,value:value};
 }
 function mountResources(host){
  var details=node('details','ui-metric-details'),summary=node('summary','ui-resource-summary');
  var title=node('span','ui-resource-title','CPU 与内存'),brief=node('span','ui-resource-brief','正在读取设备状态'),hint=node('span','ui-resource-toggle');
  hint.setAttribute('aria-hidden','true');summary.append(title,brief,hint);details.appendChild(summary);
  var body=node('div','ui-resource-body'),status=node('div','ui-resource-status','等待采样'),grid=node('div','ui-resource-grid');body.append(status,grid);details.appendChild(body);
  var cpu=resourceCard('CPU 使用情况','按两次采样间的 CPU 时间计算，表示整机平均占用。软中断常见于网络处理；等待 I/O 单独展示，不计入忙碌占比。'),cpuLead=node('div','ui-resource-lead'),cpuNumber=node('strong','ui-resource-number','—'),cpuCaption=node('span','ui-resource-caption','等待两次有效采样'),idle=node('span','ui-resource-idle','空闲 —');
  var cpuValue=node('div');cpuValue.append(cpuNumber,cpuCaption);cpuLead.append(cpuValue,idle);
  var cpuBar=node('div','ui-resource-meter'),cpuFill=node('span','ui-resource-fill');cpuBar.setAttribute('role','meter');cpuBar.setAttribute('aria-label','CPU 使用率');cpuBar.setAttribute('aria-valuemin','0');cpuBar.setAttribute('aria-valuemax','100');cpuBar.appendChild(cpuFill);
  var cpuList=node('dl','ui-cpu-breakdown'),cpuRows={};cpuParts.forEach(function(item){var field=metricRow(item[1],item[0]);cpuRows[item[0]]=field;cpuList.appendChild(field.row);if(item[0]==='other')field.row.hidden=true;});
  var loadHead=node('div','ui-load-heading');loadHead.append(node('span','','平均负载'),resourceHelp('平均负载','分别是过去 1、5、15 分钟内运行或等待运行、以及不可中断等待的任务数，不是百分比。判断是否拥堵还需结合 CPU 数量和 I/O 情况。'));
  var loads=node('dl','ui-load-grid'),loadValues=[];['1 分钟','5 分钟','15 分钟'].forEach(function(label){var field=node('div'),value=node('dd','','—');field.append(node('dt','',label),value);loads.appendChild(field);loadValues.push(value);});
  cpu.append(cpuLead,cpuBar,cpuList,loadHead,loads);
  var memory=resourceCard('内存分布','程序与系统 = 总量 − 空闲 − 文件缓存 − 缓冲区，包含程序和内核等占用。已分配包含缓存；不是所有缓存都能立即回收，因此不将其标成可用内存。'),memoryLead=node('div','ui-resource-lead'),memoryNumber=node('strong','ui-resource-number','—'),memoryCaption=node('span','ui-resource-caption','已分配 / 系统总量'),memoryTotal=node('span','ui-resource-idle','总量 —');
  var memoryValue=node('div');memoryValue.append(memoryNumber,memoryCaption);memoryLead.append(memoryValue,memoryTotal);
  var memoryBar=node('div','ui-memory-meter'),memoryRows={},memorySegments={};memoryBar.setAttribute('role','img');memoryBar.setAttribute('aria-label','内存分布，等待数据');
  var memoryList=node('dl','ui-memory-breakdown');memoryParts.forEach(function(item){var segment=node('span','ui-memory-'+item[0]);segment.setAttribute('aria-hidden','true');memoryBar.appendChild(segment);memorySegments[item[0]]=segment;var field=metricRow(item[1],item[0],'memory');memoryRows[item[0]]=field;memoryList.appendChild(field.row);});
  var swap=node('div','ui-swap-line'),swapValue=node('strong','','—');swap.append(node('span','','交换空间'),swapValue);
  memory.append(memoryLead,memoryBar,memoryList,swap,node('p','ui-resource-note','缓存可按需回收；空闲少不等于内存不足。'));
  grid.append(cpu,memory);host.appendChild(details);
  resources={details:details,brief:brief,status:status,cpuNumber:cpuNumber,cpuCaption:cpuCaption,idle:idle,cpuBar:cpuBar,cpuFill:cpuFill,cpuRows:cpuRows,loadValues:loadValues,memoryNumber:memoryNumber,memoryCaption:memoryCaption,memoryTotal:memoryTotal,memoryBar:memoryBar,memoryRows:memoryRows,memorySegments:memorySegments,swap:swapValue};
  try{details.open=sessionStorage.getItem('padavan.resources.open')==='1';}catch(e){}
  details.addEventListener('toggle',function(){try{sessionStorage.setItem('padavan.resources.open',details.open?'1':'0');}catch(e){}});
 }
 function resourceStatus(message,stale){if(!resources)return;resources.status.textContent=message;resources.details.classList.toggle('ui-resource-stale',!!stale);}
 function renderResources(data,cpu){
  var memory=memorySample(data.ram),r=resources;
  textAt('cpu_info',cpu?percent(cpu.busy):'采样中');
  textAt('mem_info',memory?memorySize(memory.free)+' / '+memorySize(memory.total):'暂不可用');
  if(!r)return;
  r.brief.textContent='CPU '+(cpu?percent(cpu.busy):'采样中')+' · 内存'+(memory?'已分配 '+percent(memory.used*100/memory.total):'暂不可用');
  r.cpuNumber.textContent=cpu?percent(cpu.busy):'—';r.cpuCaption.textContent=cpu?'整机使用率':'等待两次有效采样';r.idle.textContent='空闲 '+(cpu?percent(cpu.idle):'—');
  r.cpuFill.style.width=cpu?cpu.busy+'%':'0%';r.cpuBar.classList.toggle('ui-resource-unavailable',!cpu);
  r.cpuBar.setAttribute('aria-valuetext',cpu?'CPU 使用率 '+percent(cpu.busy):'等待两次有效采样');if(cpu)r.cpuBar.setAttribute('aria-valuenow',cpu.busy.toFixed(1));else r.cpuBar.removeAttribute('aria-valuenow');
  cpuParts.forEach(function(item){var row=r.cpuRows[item[0]];row.value.textContent=cpu?percent(cpu[item[0]]):'—';if(item[0]==='other')row.row.hidden=!cpu||cpu.other<.05;});
  var loads=typeof data.lavg==='string'?data.lavg.trim().split(/\s+/):[],loadHost=document.getElementById('la_info');if(loadHost)loadHost.replaceChildren();
  r.loadValues.forEach(function(value,i){var valid=/^\d+(?:\.\d+)?$/.test(loads[i]||''),text=valid?loads[i]:'—';value.textContent=text;if(loadHost){var chip=node('span','ui-load-chip',text);chip.title=[1,5,15][i]+' 分钟平均负载';chip.setAttribute('aria-label',chip.title+' '+text);chip.appendChild(node('small','',[1,5,15][i]+' 分'));loadHost.appendChild(chip);}});
  r.memoryNumber.textContent=memory?percent(memory.used*100/memory.total):'—';r.memoryCaption.textContent=memory?'已分配 '+memorySize(memory.used)+'（含缓存）':'等待有效内存数据';r.memoryTotal.textContent=memory?'总量 '+memorySize(memory.total):'总量 —';
  var memoryLabel=[];memoryParts.forEach(function(item){var key=item[0],part=memory?memory[key]*100/memory.total:0;r.memorySegments[key].style.width=part+'%';r.memoryRows[key].value.replaceChildren(node('span','',memory?memorySize(memory[key]):'—'),node('small','',memory?percent(part):'—'));if(memory)memoryLabel.push(item[1]+' '+memorySize(memory[key]));});
  r.memoryBar.setAttribute('aria-label',memory?'内存分布：'+memoryLabel.join('，'):'内存数据暂不可用');
  var swap=data.swap;r.swap.textContent=swap&&finiteValue(swap.total)&&finiteValue(swap.used)&&swap.used<=swap.total?(swap.total===0?'未启用':memorySize(swap.used)+' / '+memorySize(swap.total)):'暂不可用';
 }
 root.showSystemInfo=function(cpu,force){
  var data=root.sysinfo;if(!data||!data.ram)return;renderResources(data,cpu);
  var uptime=data.uptime;if(uptime&&['days','hours','minutes'].every(function(k){return finiteValue(uptime[k]);}))textAt('uptime_info',uptime.days+' 天 '+String(uptime.hours).padStart(2,'0')+' 时 '+String(uptime.minutes).padStart(2,'0')+' 分');
  [2,5].forEach(function(band){var wifi=data['wifi'+band]||{};[['','state'],['_g','guest']].forEach(function(pair){var button=document.getElementById('wifi'+band+'_b'+pair[0]);if(button)button.classList.toggle('btn-info',Number(wifi[pair[1]])>0);});});
  var scriptButton=document.getElementById('button_script2');if(scriptButton)scriptButton.classList.toggle('btn-info','<% nvram_get_x("", "sdns_enable"); %>'==='1');
  if(data.logmt!==undefined)setLogStamp(data.logmt);
  if(force&&cpu&&typeof root.getSystemJsonData==='function')root.getSystemJsonData(cpu,data.ram);
 };
 root.setSystemInfo=function(data){
  if(!data||!data.cpu||!data.ram||!data.uptime)return false;
  var now=Date.now(),cpu=previousCpu&&now-previousCpuAt<15000?cpuSample(data.cpu,previousCpu):null;
  previousCpu=Object.assign({},data.cpu);previousCpuAt=now;root.sysinfo=data;root.si_new=data;
  root.showSystemInfo(cpu,1);lastResourceUpdate=new Date(now).toLocaleTimeString('zh-CN',{hour12:false});
  resourceStatus('更新于 '+lastResourceUpdate+' · 约每 2.5 秒刷新'+(!cpu?' · CPU 采样中':''),false);return true;
 };
 root.show_banner=function(){
  var host=document.getElementById('TopBanner');if(!host)return;
  host.replaceChildren();
  var form=node('form');form.name='titleForm';form.id='titleForm';form.method='post';form.action='/start_apply.htm';form.target='hidden_frame';
  [['current_page',''],['sid_list','LANGUAGE;'],['action_mode',' Apply '],['preferred_lang',''],['flag','']].forEach(function(pair){var input=node('input');input.type='hidden';input.name=pair[0];input.value=pair[1];form.appendChild(input);});host.appendChild(form);
  var grid=node('section','ui-stat-grid');grid.setAttribute('aria-label','设备运行状态');
  [['<#SI_LoadCPU#>','cpu_info','-- %','/Advanced_System_Info.asp#CPU'],['<#SI_FreeMem#>','mem_info','-- / --','/Advanced_System_Info.asp#MEM'],['<#SI_Uptime#>','uptime_info','--','/Main_LogStatus_Content.asp'],['<#SI_LoadAvg#>','la_info','--','/Advanced_System_Info.asp']].forEach(function(item){
   var card=node('a','ui-stat');card.href=item[3];card.appendChild(node('span','ui-stat-caption',item[0].replace(/[:：]$/,'')));var v=node('strong','ui-stat-value',item[2]);v.id=item[1];card.appendChild(v);grid.appendChild(card);
  });host.appendChild(grid);
  var strip=node('div','ui-device-strip'),radios=node('div','ui-radio-links');radios.appendChild(node('span','ui-subtle','无线网络'));
  [2,5].forEach(function(band){if(band===2&&!support_2g_radio()||band===5&&!support_5g_radio())return;radios.appendChild(action(band===2?'2.4 GHz':'5 GHz',function(){go_setting(band);},'wifi'+band+'_b'));var guest=action('访客 '+(band===2?'2.4G':'5G'),function(){go_wguest(band);},'wifi'+band+'_b_g');radios.appendChild(guest);});
  var commands=node('div','ui-device-actions'),firm=node('a','ui-firmware');firm.href='/Advanced_FirmwareUpgrade_Content.asp';var ver=node('span');ver.id='firmver';ver.textContent='<% nvram_get_x("", "firmver_sub"); %>';firm.append('固件 ',ver);commands.appendChild(firm);
  if(enabledBtnCommit.indexOf('none')<0)commands.appendChild(action('<#CTL_Commit#>',function(){commit();},'commit_btn'));
  commands.append(action('<#BTN_FREEMEMORY#>',function(){freememory();},'freememory_trash'),action('<#BTN_REBOOT#>',function(){reboot();},'reboto_btn'),action('<#t1Logout#>',function(){logout();},'logout_btn'));
  strip.append(radios,commands);host.appendChild(strip);
  mountResources(host);
  if(log_float!=='0'){
   var panel=node('section','syslog_panel'),toggle=action('运行日志',function(){var open=panel.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));if(open)setLogData();},'syslog_panel_button');toggle.classList.add('handle');toggle.setAttribute('aria-expanded','false');
   var head=node('div','ui-log-head');head.append(node('strong','','系统日志'),action('<#CTL_clear#>',function(){clearlog();},'clearlog_btn'),action('关闭',function(){panel.classList.remove('open');toggle.setAttribute('aria-expanded','false');}));
   var clock=node('time');clock.id='system_time_log_area';head.appendChild(clock);
   var area=node('textarea');area.id='log_area';area.readOnly=true;area.rows=12;area.setAttribute('aria-label','系统日志');panel.append(toggle,head,area);host.appendChild(panel);updateClock();
  }
  show_loading_obj();show_top_status();
 };
 root.show_top_status=function(){
  previousCpu=root.sysinfo&&root.sysinfo.cpu?Object.assign({},root.sysinfo.cpu):null;previousCpuAt=Date.now();root.showSystemInfo(null,0);
  clearTimeout(id_system_info);id_system_info=setTimeout(get_system_info,1000);
 };
 root.get_system_info=function(){
  clearTimeout(id_system_info);if(stopped||document.hidden||systemRequest)return;
  systemRequest=jq.ajax({url:'/system_status.json',dataType:'json',cache:false,timeout:6000});
  function failed(){previousCpu=null;resourceStatus('状态更新失败'+(lastResourceUpdate?'，保留 '+lastResourceUpdate+' 的读数':'，等待重试'),true);}
  systemRequest.done(function(data){if(!setSystemInfo(data))failed();}).fail(function(xhr,status){if(status!=='abort')failed();}).always(function(){systemRequest=null;if(!stopped&&!document.hidden)id_system_info=setTimeout(get_system_info,2500);});
 };
 root.get_changed_status=function(){
  clearTimeout(id_check_status);if(stopped||document.hidden||internetRequest)return;
  internetRequest=jq.ajax({url:'/internet_status.json',dataType:'json',cache:false,timeout:6000});
  internetRequest.done(function(data){if(data){notify_status_internet(String(data.internet));notify_status_vpn_client(String(data.vpn));}}).always(function(){internetRequest=null;if(!stopped&&!document.hidden)id_check_status=setTimeout(get_changed_status,5000);});
 };
 root.show_loading_obj=function(){var host=document.getElementById('Loading');if(host)host.replaceChildren();};
 root.logout=function(){UI.confirm('<#JS_logout#>',{title:'退出管理',accept:'退出登录'}).then(function(ok){if(ok){UI.dirty(false);location.href='/Logout.asp';}});};
 root.reboot=function(){UI.confirm('<#Main_content_Login_Item7#>',{title:'重启设备',accept:'确认重启'}).then(function(ok){if(!ok)return;UI.dirty(false);uiRebootWait({done:function(){location.href='/';}});jq.post('/apply.cgi',{action_mode:' Reboot '}).fail(function(){UI.toast('连接已中断，正在核对设备是否进入重启。');});});};
 root.commit=function(){UI.confirm('<#Commit_confirm#>',{title:'保存到闪存',accept:'确认保存'}).then(function(ok){if(!ok)return;jq.ajax({url:'/apply.cgi',type:'POST',dataType:'json',data:{action_mode:' CommitFlash ',nvram_action:'commit_nvram'},timeout:15000}).done(function(r){UI.toast(r&&r.sys_result===0?'已保存到闪存':'保存失败，请检查系统日志。');}).fail(function(){UI.toast('未收到保存响应，请核对设备状态后再试。');});});};
 root.freememory=function(){jq.ajax({url:'/apply.cgi',type:'POST',data:{action_mode:' FreeMemory ',current_page:'Main_LogStatus_Content.asp'},timeout:15000}).done(function(){UI.toast('已请求回收可释放的缓存');get_system_info();}).fail(function(){UI.toast('未收到响应，请查看系统日志');});};
 root.passwordShowHide=function(id){var n=document.getElementById(id);if(n)n.type=n.type==='password'?'text':'password';};
 root.setLogData=function(){var area=document.getElementById('log_area');if(!area)return;jq.ajax({url:'/log_content.asp',dataType:'text',timeout:6000}).done(function(data){var bottom=area.scrollHeight-area.scrollTop-area.clientHeight<32;area.value=data;if(bottom)area.scrollTop=area.scrollHeight;});};
 root.setLogStamp=function(mt){if(log_stamp&&log_stamp!==mt){var panel=document.querySelector('.syslog_panel');if(panel&&panel.classList.contains('open'))setLogData();}log_stamp=mt;};
 root.show_footer=function(){var host=document.getElementById('footer');if(host)host.innerHTML='<div class="copyright"><#footer_copyright_desc#></div><div class="ui-subtle">界面图标：<a href="https://www.freepik.com" target="_blank" rel="noopener noreferrer">Freepik</a> · 开源组件许可随源码提供</div>';};
 document.addEventListener('visibilitychange',function(){if(document.hidden){previousCpu=null;resourceStatus('页面已隐藏，暂停刷新',true);clearTimeout(id_system_info);clearTimeout(id_check_status);if(systemRequest)systemRequest.abort();if(internetRequest)internetRequest.abort();}else if(!stopped){get_system_info();if(typeof update_internet_status==='function')get_changed_status();}});
 document.addEventListener('visibilitychange',function(){if(document.hidden)clearTimeout(clockTimer);else updateClock();});
 root.addEventListener('pagehide',function(){stopped=true;previousCpu=null;clearTimeout(clockTimer);clearTimeout(id_system_info);clearTimeout(id_check_status);if(systemRequest)systemRequest.abort();if(internetRequest)internetRequest.abort();});
 root.addEventListener('pageshow',function(e){if(e.persisted){stopped=false;updateClock();get_system_info();if(typeof update_internet_status==='function')get_changed_status();}});
})(window);

