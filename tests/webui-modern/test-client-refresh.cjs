/* 验证快速刷新、完整扫描、并发和出错恢复，禁止访问路由器。 */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=process.env.PADAVAN_SOURCE||path.resolve(__dirname,'../..');
const R=process.env.PADAVAN_TEST_RESULTS||path.join(root,'test-results/client-refresh');fs.mkdirSync(R,{recursive:true});
const C=path.join(root,'trunk/user/www/n56u_ribbon_fixed');
const clients=fs.readFileSync(path.join(C,'device-map/clients.asp'),'utf8');
const apply=fs.readFileSync(path.join(C,'start_apply.htm'),'utf8');
const cases=[];function test(name,fn){fn();cases.push(name);}
function fn(src,name){const start=src.indexOf('function '+name+'(');assert(start>=0);const end=src.indexOf('\nfunction ',start+1),tag=src.indexOf('\n</script>',start);return src.slice(start,Math.min(end<0?Infinity:end,tag<0?Infinity:tag));}
function setup(){
 const span={textContent:''},nodes={refresh_list:{disabled:false},scan_clients:{disabled:false},LoadingBar:{style:{},querySelector:()=>span}};
 const state={submitted:0,timers:[],ajax:[],now:100};
 const form={action_mode:{},action_script:{},flag:{},submit(){state.submitted++;}};
 const jq=()=>({popover(){}});jq.ajax=o=>state.ajax.push(o);
 const ctx={document:{form},parent:{},$:id=>nodes[id],$j:jq,scan_deadline:0,scan_timer:null,submit_timer:null,scan_failures:0,scan_pending:false,client_request:false,nmap_fullscan:'0',Date:{now:()=>state.now},setTimeout(f,ms){const t={f,ms};state.timers.push(t);return t;},clearTimeout(t){if(t)t.cancelled=true;},sw_mode:'1',ipmonitor:[['192.168.2.2','00:11:22:33:44:55','same']],scan_snapshot:[],getclients(){return ctx.ipmonitor;},prepare_clients(){},show_clients(){}};
 ctx.scan_snapshot=ctx.ipmonitor.slice();vm.createContext(ctx);
 for(const name of ['client_status','merge_scan_clients','check_full_scan_done','refresh_clients','scan_failed','networkmap_refresh_started','networkmap_update','update_clients'])vm.runInContext(fn(clients,name),ctx);
 function reply(rows,busy){ctx.ipmonitor_last=rows;ctx.nmap_fullscan_last=busy;const a=state.ajax.at(-1);a.success();a.complete();}
 return {ctx,nodes,state,span,form,reply};
}
test('普通刷新只读列表，不提交全网扫描',()=>{const x=setup();x.ctx.refresh_clients();assert.equal(x.state.submitted,0);assert.equal(x.state.ajax.length,1);assert.equal(x.state.ajax[0].url,'/lan_clients.asp');assert.equal(x.state.ajax[0].timeout,5000);assert(x.nodes.refresh_list.disabled);x.reply([],0);assert(!x.nodes.refresh_list.disabled);});
test('连续快速刷新不并发请求',()=>{const x=setup();x.ctx.refresh_clients();x.ctx.refresh_clients();assert.equal(x.state.ajax.length,1);});
test('完整扫描使用隐藏框，重复点击只提交一次',()=>{const x=setup();assert(/id="refreshForm"[^>]*target="applyFrame"/.test(clients));x.ctx.networkmap_update('networkmap_refresh');x.ctx.networkmap_update('networkmap_refresh');assert.equal(x.state.submitted,1);assert(x.nodes.scan_clients.disabled);assert(!x.nodes.refresh_list.disabled);assert.equal(x.state.timers.at(-1).ms,15000);});
test('提交未返回时快速刷新不会清空已有设备或取消扫描',()=>{const x=setup();x.ctx.networkmap_update('networkmap_refresh');x.ctx.refresh_clients();x.reply([],0);assert.equal(x.ctx.ipmonitor.length,1);assert(x.nodes.scan_clients.disabled);assert(x.ctx.scan_pending);});
test('扫描期间只按 MAC 合并，同名设备保持独立',()=>{const x=setup();x.ctx.networkmap_update('networkmap_refresh');x.ctx.networkmap_refresh_started();x.ctx.update_clients();x.reply([['192.168.2.3','00:11:22:33:44:66','same']],1);assert.equal(x.ctx.ipmonitor.length,2);assert(!x.nodes.refresh_list.disabled);assert(x.nodes.scan_clients.disabled);});
test('同一 MAC 地址更新 IP，不保留旧位置',()=>{const x=setup();const rows=x.ctx.merge_scan_clients(x.ctx.ipmonitor,[['192.168.2.99','00:11:22:33:44:55','new']]);assert.equal(rows.length,1);assert.equal(rows[0][0],'192.168.2.99');});
test('扫描完成采用最终结果，移除已离线的旧记录',()=>{const x=setup();x.ctx.networkmap_update('networkmap_refresh');x.ctx.networkmap_refresh_started();x.ctx.update_clients();x.reply([],0);assert.equal(x.ctx.ipmonitor.length,0);assert(!x.nodes.scan_clients.disabled);assert.equal(x.ctx.scan_deadline,0);});
test('三次后台请求失败恢复操作并保留原列表',()=>{const x=setup();x.ctx.networkmap_update('networkmap_refresh');x.ctx.networkmap_refresh_started();for(let i=0;i<3;i++){x.ctx.update_clients();const a=x.state.ajax.at(-1);a.error();a.complete();}assert.equal(x.ctx.ipmonitor.length,1);assert(!x.nodes.refresh_list.disabled);assert(!x.nodes.scan_clients.disabled);assert(x.span.textContent.includes('重试'));});
test('普通刷新失败立即报告，支持再次刷新',()=>{const x=setup();x.ctx.refresh_clients();x.state.ajax[0].error();x.state.ajax[0].complete();assert(x.span.textContent.includes('重试'));x.ctx.refresh_clients();assert.equal(x.state.ajax.length,2);});
test('扫描超时有界，恢复扫描入口',()=>{const x=setup();x.ctx.networkmap_update('networkmap_refresh');x.ctx.networkmap_refresh_started();x.state.now=100000;x.ctx.check_full_scan_done();assert(!x.nodes.scan_clients.disabled);assert.equal(x.ctx.scan_deadline,0);});
test('应用结果不触发页面跳转',()=>{let called=0;const ctx={action_script:'networkmap_refresh',parent:{networkmap_refresh_started(){called++;}},getflag:'nodetect',page_modified:1,setTimeout(){throw Error('发生重定向');}};vm.createContext(ctx);vm.runInContext(fn(apply,'initial'),ctx);ctx.initial();assert.equal(called,1);});
test('刷新与完整扫描的按钮入口独立',()=>{assert(/id="refresh_list"[^>]*onclick="refresh_clients\(\);"/.test(clients));assert(/id="scan_clients"/.test(clients));});
test('新扫描清空索引，时间框保留最小宽度',()=>{assert(/function prepare_clients\(\)[\s\S]*?unblocked_clients = \[\];[\s\S]*?blocked_clients = \[\];/.test(clients));assert(fs.readFileSync(path.join(C,'ui/base.css'),'utf8').includes('min-width:3.5em;padding:7px 6px'));});
const result={passed:true,cases};fs.writeFileSync(path.join(R,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
