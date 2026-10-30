// 对网络中断、后台进度和重复操作进行确定性的回归验证。
const fs=require('fs'), vm=require('vm'), assert=require('assert');
const path=require('path');
const root=__dirname;
const src=fs.readFileSync(path.join(root,'candidate/trunk/user/www/n56u_ribbon_fixed/popup.js'),'utf8').replace(/<%[\s\S]*?%>/g,'');
const box={window:{}}; vm.createContext(box); vm.runInContext(src,box);
const C=box.window.UiOperationController;
let passed=0;
function check(name,fn){fn();passed++; console.log('PASS '+name);}
function setup(options={kind:'apply'}){
 let clock=0, seq=0, timers=new Map(), views=[], calls=[], aborted=0, completed=0;
 const env={now:()=>clock,setTimeout:(fn,ms)=>{let id=++seq;timers.set(id,{fn,at:clock+ms});return id;},clearTimeout:id=>timers.delete(id),render:v=>views.push(v),request:cb=>{const req={cb,aborted:false};calls.push(req);return {abort:()=>{req.aborted=true;aborted++;}};}};
 const c=new C(env); c.start({...options,done:()=>completed++});
 return {c,calls,views,get completed(){return completed;},get aborted(){return aborted;},last:()=>views.at(-1),advance(ms){let end=clock+ms;while(true){let item=[...timers.entries()].filter(([id,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!item)break;timers.delete(item[0]);clock=item[1].at;item[1].fn();}clock=end;},reply(data,error=null){const r=calls.at(-1);assert(r,'request expected');r.cb(error,data);},ack(wifi=0){c.ack({version:1,id:'op',boot:'old',wifi,reboot:false});this.advance(1000);},sample(extra={}){return {version:1,operation:'op',boot:'old',mode:1,pending:0,wifi5:{known:true,state:4},wifi2:{known:true,state:4},...extra};}};
}
check('没有保存响应时不能假成功',()=>{let t=setup();t.advance(31000);assert.equal(t.last().phase,'no_ack');assert.equal(t.completed,0);assert.equal(t.calls.length,0);});
check('普通保存等待后台事件结束',()=>{let t=setup();t.ack();t.reply(t.sample({pending:1}));assert.equal(t.last().phase,'applying');t.advance(2000);t.reply(t.sample());t.advance(800);assert.equal(t.completed,1);});
for(const total of [65,605]){
 check('DFS '+total+' 秒使用驱动时间',()=>{let t=setup();t.ack(1);t.reply(t.sample({wifi5:{known:true,state:2,total,elapsed:5,channel:60,width:160}}));assert.equal(t.last().percent,Math.floor(500/total));assert.equal(t.last().phase,'cac');t.advance(2000);t.reply(t.sample({wifi5:{known:true,state:2,total,elapsed:total,channel:60,width:160}}));assert.equal(t.last().percent,99);assert.equal(t.completed,0);t.advance(2000);t.reply(t.sample());t.advance(800);assert.equal(t.completed,1);});
}
check('雷达换信道重新计时',()=>{let t=setup();t.ack(1);t.reply(t.sample({wifi5:{known:true,state:2,total:65,elapsed:60,channel:60,width:160}}));t.advance(2000);t.reply(t.sample({wifi5:{known:true,state:2,total:65,elapsed:2,channel:100,width:80}}));assert.equal(t.last().percent,3);assert(t.last().detail.includes('100'));});
check('无效 DFS 时间不编造百分比',()=>{let t=setup();t.ack(1);t.reply(t.sample({wifi5:{known:true,state:2,total:0,elapsed:9}}));assert.equal(t.last().percent,null);});
check('无线尚未广播则持续等待',()=>{let t=setup();t.ack(1);t.reply(t.sample({wifi5:{known:true,state:1}}));assert.equal(t.last().phase,'wireless');assert(t.c.active);});
check('无线被关闭属于明确结果',()=>{let t=setup();t.ack(1);t.reply(t.sample({wifi5:{known:true,state:5}}));assert.equal(t.last().phase,'complete');});
check('旧驱动不冒充验证广播',()=>{let t=setup();t.ack(2);t.reply(t.sample({wifi2:{known:false,state:0}}));assert.equal(t.last().phase,'unverified');assert.equal(t.completed,0);});
check('同一启动记录不能证明重启',()=>{let t=setup({kind:'reboot',boot:'old',mode:'3'});t.reply(t.sample({mode:3}));assert.equal(t.last().phase,'rebooting');assert(t.c.active);});
check('新启动记录且目标模式一致',()=>{let t=setup({kind:'reboot',boot:'old',mode:'3'});t.reply(t.sample({boot:'new',mode:3}));t.advance(800);assert.equal(t.completed,1);});
check('重启后模式不一致报告错误',()=>{let t=setup({kind:'reboot',boot:'old',mode:'3'});t.reply(t.sample({boot:'new'}));assert.equal(t.last().phase,'mismatch');assert.equal(t.completed,0);});
check('断线后恢复重新读取状态',()=>{let t=setup({kind:'reboot',boot:'old'});t.reply(null,'network');assert.equal(t.last().phase,'reconnecting');t.advance(2000);t.reply(t.sample({boot:'new'}));assert.equal(t.last().phase,'complete');});
check('认证过期有可操作提示',()=>{let t=setup({kind:'reboot',boot:'old'});t.reply(null,'auth');assert(t.last().detail.includes('登录'));assert.equal(t.completed,0);});
check('超时不能显示成功',()=>{let t=setup({kind:'reboot',boot:'old',timeout:5});t.reply(null,'network');t.advance(5000);assert.equal(t.last().phase,'timeout');assert.equal(t.completed,0);});
check('应用期间意外重启',()=>{let t=setup();t.ack();t.reply(t.sample({boot:'new'}));assert.equal(t.last().phase,'interrupted');});
check('其他浏览器后续操作不可冒认',()=>{let t=setup();t.ack();t.reply(t.sample({operation:'other'}));assert.equal(t.last().phase,'superseded');});
check('丢失操作编号不能通过',()=>{let t=setup();t.ack();t.reply(t.sample({operation:''}));assert.equal(t.last().phase,'unverified');});
check('后台目录暂不可用继续等待',()=>{let t=setup();t.ack();t.reply(t.sample({pending:-1}));assert.equal(t.last().phase,'applying');assert(t.c.active);});
check('重复启动取消旧请求和计时器',()=>{let t=setup({kind:'reboot',boot:'old'});let old=t.calls[0];t.c.start({kind:'apply'});assert(old.aborted);old.cb(null,t.sample({boot:'new'}));assert.equal(t.last().phase,'submitting');t.advance(2000);assert.equal(t.completed,0);});
check('关闭后迟到响应不改变界面',()=>{let t=setup({kind:'reboot',boot:'old'});let n=t.views.length;t.c.stop();t.calls[0].cb(null,t.sample({boot:'new'}));t.advance(900000);assert.equal(t.views.length,n);});
check('旧计时接口不显示假百分比',()=>{let t=setup({kind:'legacy'});t.advance(3000);assert.equal(t.last().percent,null);assert.equal(t.completed,0);});
check('新操作取消前一操作的跳转',()=>{let t=setup();t.ack();t.reply(t.sample());t.c.start({kind:'apply'});t.advance(1000);assert.equal(t.completed,0);});
check('格式错误状态不能成功',()=>{let t=setup({kind:'reboot',boot:'old'});t.reply({version:2});assert.equal(t.last().phase,'reconnecting');});
fs.writeFileSync(path.join(root,'controller-tests.json'),JSON.stringify({passed:true,cases:passed,scope:'独立状态机模拟，非实机验收'},null,2));
