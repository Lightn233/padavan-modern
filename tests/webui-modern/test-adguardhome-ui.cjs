/* 模拟真实状态响应、地址变化和页面生命周期，不连接设备或提交配置。 */
const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.PADAVAN_TEST_RESULTS||path.join(require('node:os').tmpdir(),'padavan-backend-tests'),source=process.env.PADAVAN_SOURCE||path.resolve(__dirname,'../..');fs.mkdirSync(path.join(root,'results'),{recursive:true});
const src=path.join(source,'trunk/user/www/n56u_ribbon_fixed');
const code=fs.readFileSync(path.join(src,'adguardhome_status_ui.js'),'utf8'),cases=[];
function test(name,url,run){
 const dom=new JSDOM('<form><input name="adg_enable" value="1"><select name="adg_redirect"><option selected value="3">3</option></select><a id="agh_web_link" hidden></a><div id="agh_web_state"></div></form>',{url,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,requests=[],timers=[];w.setTimeout=(f)=>{timers.push(f);return timers.length;};w.clearTimeout=()=>{};
 w.$j={ajax(opts){const req={opts,abort(){opts.error();opts.complete();}};requests.push(req);return req;}};
 w.eval(code);w.aghWebRefresh();
 const ready=(overrides={})=>({mode:1,running:true,lan:'192.168.2.1',web:{known:true,host:'0.0.0.0',scheme:'http',port:3000,listening:true},...overrides});
 const reply=(data)=>{const r=requests.at(-1);r.opts.success(data);r.opts.complete();};
 const link=w.document.getElementById('agh_web_link'),state=w.document.getElementById('agh_web_state');
 run({w,requests,timers,reply,ready,link,state});
 assert.equal(new w.FormData(w.document.forms[0]).get('adg_enable'),'1');
 assert.equal(new w.FormData(w.document.forms[0]).get('adg_redirect'),'3');
 w.close();cases.push(name);
}
test('路由模式当前入口','http://192.168.2.1/',({reply,ready,link})=>{reply(ready());assert.equal(link.href,'http://192.168.2.1:3000/');assert(!link.hidden);});
test('AP 服务停止时移除旧链接','http://192.168.2.1/',({reply,ready,link,w,state})=>{reply(ready());w.aghWebRefresh();reply(ready({mode:3,running:false,lan:'192.168.31.157'}));assert(link.hidden);assert(!link.hasAttribute('href'));assert(state.textContent.includes('AP'));});
test('AP 运行地址随 DHCP 变化','http://192.168.2.1/',({reply,ready,w,link})=>{reply(ready());w.aghWebRefresh();reply(ready({mode:3,lan:'192.168.31.157'}));assert.equal(link.href,'http://192.168.31.157:3000/');});
test('自定义端口与 TLS','https://router.lan/',({reply,ready,link})=>{const r=ready();r.web={...r.web,port:4443,scheme:'https'};reply(r);assert.equal(link.href,'https://router.lan:4443/');});
test('IPv6 管理地址','http://[2409::1234]/',({reply,ready,link})=>{const r=ready();r.web.host='::';reply(r);assert.equal(link.href,'http://[2409::1234]:3000/');});
test('固定绑定地址','http://192.168.2.1/',({reply,ready,link})=>{const r=ready();r.web.host='192.168.2.8';reply(r);assert.equal(link.href,'http://192.168.2.8:3000/');});
test('断连时不保留有效状态','http://192.168.2.1/',({reply,ready,w,requests,link,state})=>{reply(ready());w.aghWebRefresh();requests.at(-1).opts.error();requests.at(-1).opts.complete();assert(link.hidden);assert(state.textContent.includes('重试'));});
for(const [key,value] of [['port',65536],['port',0],['known',false],['listening',false],['host','::1'],['host','127.0.0.1'],['host','evil.example/path'],['scheme','javascript']])test('拒绝无效入口 '+key+'='+value,'http://192.168.2.1/',({reply,ready,link})=>{const r=ready();r.web[key]=value;reply(r);assert(link.hidden);});
test('页面隐藏与离开停止请求','http://192.168.2.1/',({w,requests,reply,ready,timers})=>{reply(ready());Object.defineProperty(w.document,'hidden',{value:true,configurable:true});w.document.dispatchEvent(new w.Event('visibilitychange'));w.aghWebRefresh();assert.equal(requests.length,1);Object.defineProperty(w.document,'hidden',{value:false,configurable:true});w.document.dispatchEvent(new w.Event('visibilitychange'));assert.equal(requests.length,2);w.dispatchEvent(new w.Event('pagehide'));timers.forEach(f=>f());assert.equal(requests.length,2);});
const page=fs.readFileSync(path.join(src,'Advanced_adguardhome.asp'),'utf8');assert(page.includes('https://github.com/AdguardTeam/AdGuardHome'));assert(!page.includes(':3000</a>'));
const report={passed:true,cases};fs.writeFileSync(path.join(root,'results/agh-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
