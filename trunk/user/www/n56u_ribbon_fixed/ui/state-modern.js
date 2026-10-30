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
  var details=node('details','ui-metric-details');details.appendChild(node('summary','','CPU 与内存明细'));
  var columns=node('div','row-fluid');['cpu_usage','mem_usage'].forEach(function(id){var box=node('div','span6');box.id=id;var table=node('table','table table-condensed');for(var i=0;i<4;i++){var row=node('tr');row.append(node('td','','—'),node('td','','—'));table.appendChild(row);}box.appendChild(table);columns.appendChild(box);});details.appendChild(columns);host.appendChild(details);
  if(log_float!=='0'){
   var panel=node('section','syslog_panel'),toggle=action('运行日志',function(){var open=panel.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));if(open)setLogData();},'syslog_panel_button');toggle.classList.add('handle');toggle.setAttribute('aria-expanded','false');
   var head=node('div','ui-log-head');head.append(node('strong','','系统日志'),action('<#CTL_clear#>',function(){clearlog();},'clearlog_btn'),action('关闭',function(){panel.classList.remove('open');toggle.setAttribute('aria-expanded','false');}));
   var clock=node('time');clock.id='system_time_log_area';head.appendChild(clock);
   var area=node('textarea');area.id='log_area';area.readOnly=true;area.rows=12;area.setAttribute('aria-label','系统日志');panel.append(toggle,head,area);host.appendChild(panel);updateClock();
  }
  show_loading_obj();show_top_status();
 };
 root.show_top_status=function(){
  clearTimeout(id_system_info);id_system_info=setTimeout(get_system_info,1000);
 };
 root.get_system_info=function(){
  clearTimeout(id_system_info);if(stopped||document.hidden||systemRequest)return;
  systemRequest=jq.ajax({url:'/system_status.json',dataType:'json',cache:false,timeout:6000});
  systemRequest.done(function(data){if(data&&data.cpu&&data.ram&&data.uptime){root.si_new=data;setSystemInfo(data);}}).always(function(){systemRequest=null;if(!stopped&&!document.hidden)id_system_info=setTimeout(get_system_info,2500);});
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
 document.addEventListener('visibilitychange',function(){if(document.hidden){clearTimeout(id_system_info);clearTimeout(id_check_status);if(systemRequest)systemRequest.abort();if(internetRequest)internetRequest.abort();}else if(!stopped){get_system_info();if(typeof update_internet_status==='function')get_changed_status();}});
 document.addEventListener('visibilitychange',function(){if(document.hidden)clearTimeout(clockTimer);else updateClock();});
 root.addEventListener('pagehide',function(){stopped=true;clearTimeout(clockTimer);clearTimeout(id_system_info);clearTimeout(id_check_status);if(systemRequest)systemRequest.abort();if(internetRequest)internetRequest.abort();});
 root.addEventListener('pageshow',function(e){if(e.persisted){stopped=false;updateClock();get_system_info();if(typeof update_internet_status==='function')get_changed_status();}});
})(window);

