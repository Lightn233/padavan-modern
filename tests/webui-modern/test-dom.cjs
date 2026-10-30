/* DOM 回归不代替浏览器视觉验收；网络仅指向固定模拟数据。 */
const {JSDOM,VirtualConsole,requestInterceptor}=require('./test-tools/node_modules/jsdom');
const fs=require('fs'),path=require('path'),vm=require('vm');
const base='http://127.0.0.1:8767', root=__dirname, reports=[];
const names=new Set();
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(path.join(dir,x.name)):[path.join(dir,x.name)]);}
files(path.join(root,'candidate/trunk/user/www/n56u_ribbon_fixed')).filter(p=>/\.(asp|htm|html|js)$/.test(p)).forEach(p=>{
 for(const m of fs.readFileSync(p,'utf8').matchAll(/\bname\s*=\s*["']([^"']+)["']/g))names.add(m[1]);
});
function resources(report){return {interceptors:[requestInterceptor(request=>{
 const url=request.url;
 if(!url.startsWith(base+'/')){report.blocked.push(url);return new Response('');}
 report.resources.push(url.slice(base.length));
})]};}
function fieldContract(doc){return [...doc.querySelectorAll('form')].filter(f=>f.name!=='titleForm').map(f=>({name:f.name,method:f.method,target:f.target,action:new URL(f.action).pathname,enctype:f.enctype,fields:[...f.querySelectorAll('input[name],select[name],textarea[name],button[name]')].map(n=>({name:n.name,type:n.type,options:n.options?[...n.options].map(x=>x.value):undefined})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))}));}
async function run(page){
 const report={page,errors:[],alerts:[],blocked:[],resources:[],syntax:[],formDifference:false};let dom;
 try{
  const html=await (await fetch(base+'/'+page)).text();
  const staticDom=new JSDOM(html,{url:base+'/'+page});
  const baselineHtml=await(await fetch(base+'/lab/baseline?path='+encodeURIComponent(page))).text();
  const baselineDom=new JSDOM(baselineHtml,{url:base+'/'+page});
  const old=fieldContract(baselineDom.window.document),now=fieldContract(staticDom.window.document);
  if(JSON.stringify(old)!==JSON.stringify(now)){report.formDifference={old,now};}
  [...staticDom.window.document.scripts].forEach((s,i)=>{if(!s.src&&s.textContent.trim()){try{new vm.Script(s.textContent,{filename:page+'#'+i});}catch(e){report.syntax.push(e.message);}}});
  baselineDom.window.close();staticDom.window.close();
  const vc=new VirtualConsole();vc.on('jsdomError',e=>report.errors.push(String(e.message)+(e.cause?.stack?'\n'+e.cause.stack.split('\n').slice(0,4).join('\n'):'')));
  dom=new JSDOM(html,{url:base+'/'+page,runScripts:'dangerously',resources:resources(report),pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
   // jsdom 未实现表单的命名子元素访问；补齐浏览器原有接口。
   names.forEach(n=>{if(!(n in w.HTMLFormElement.prototype))Object.defineProperty(w.HTMLFormElement.prototype,n,{configurable:true,get(){return this.elements.namedItem(n);}});});
   w.alert=s=>report.alerts.push(String(s));w.confirm=()=>false;w.scrollTo=()=>{};w.focus=()=>{};
   w.HTMLFormElement.prototype.submit=function(){report.submit={action:this.action,method:this.method};};
   w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({measureText:s=>({width:String(s).length*7})},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});};
  }});
  await Promise.race([new Promise(resolve=>dom.window.addEventListener('load',()=>setTimeout(resolve,1700))),new Promise(resolve=>setTimeout(resolve,6500))]);
  const d=dom.window.document;report.ready=d.readyState;report.shell=!!d.querySelector('.ui-app');report.forms=d.forms.length;report.switches=d.querySelectorAll('[role=switch]').length;
  report.unresolved=[...d.querySelectorAll('script[src],link[rel=stylesheet]')].filter(n=>(n.src||n.href).includes('<%')).map(n=>n.outerHTML);
  report.scriptErrors=dom.window.__errors||[];
 }catch(e){report.errors.push(e.stack);}finally{if(dom)dom.window.close();}
 reports.push(report);console.log(JSON.stringify({page,errors:report.errors,syntax:report.syntax,formDifference:!!report.formDifference,shell:report.shell,switches:report.switches}));
}
(async()=>{
 let pages=await(await fetch(base+'/lab/pages-all')).json();pages=pages.filter(p=>!p.includes('/')&&!/^(start_|Restart|Logout|reboot|apply|aidisk|error|Nologin|Upload|Updating)/i.test(p)&&!/_action\./.test(p));if(process.argv[2])pages=pages.filter(p=>p.includes(process.argv[2]));
 for(let i=0;i<pages.length;i+=3)await Promise.all(pages.slice(i,i+3).map(run));
 const result={kind:'jsdom-not-visual-browser',at:new Date().toISOString(),pages:reports,fixture:await(await fetch(base+'/lab/results')).json()};
 fs.writeFileSync(path.join(root,'dom-results.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({pages:reports.length,errorPages:reports.filter(r=>r.errors.length||r.syntax.length).length,formDifferences:reports.filter(r=>r.formDifference).length,unknownHooks:result.fixture.unknown_hooks}));
 if(reports.some(r=>r.errors.length||r.syntax.length||r.formDifference))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
