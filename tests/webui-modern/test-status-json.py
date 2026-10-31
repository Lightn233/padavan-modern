"""抽取实际 C 状态钩子，以原生与 MIPS 执行结果验证标准 JSON，不使用模拟服务器代答。"""
from pathlib import Path
import argparse,json,subprocess,tempfile,hashlib,datetime
parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);parser.add_argument('--baseline',type=Path);parser.add_argument('--cc',default='gcc');parser.add_argument('--runner',nargs='*',default=[]);parser.add_argument('--report',type=Path,required=True);a=parser.parse_args()
def function(source,name):
 start=source.index(name+'(');start=source.rfind('\n',0,start)+1;end=source.index('\n}\n',start)+3;return source[start:end]
def code(source,empty=False):
 structures=source[source.index('struct cpu_stats {'):source.index('void get_cpudata(')]
 macros=source[source.index('#define LOAD_INT'):source.index('static int ej_system_status_hook(')]
 readers=function(source,'get_cpudata')+'\n'+function(source,'get_memdata')
 # 读取失败场景保留未写入的结构体，检验钩子的初始化行为。
 if empty:readers='void get_cpudata(struct cpu_stats *s){(void)s;}\nvoid get_memdata(struct mem_stats *s){(void)s;}\n'
 return '''#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include <sys/sysinfo.h>
#include <sys/stat.h>
typedef FILE *webs_t;
static void websWrite(FILE *f,const char *fmt,...){va_list args;va_start(args,fmt);vfprintf(f,fmt,args);va_end(args);}
'''+structures+readers+'''
void get_wifidata(struct wifi_stats *s,int band){s->radio=1;s->ap_guest=band?0:1;}
'''+macros+function(source,'ej_system_status_hook')+'\nint main(void){return ej_system_status_hook(0,stdout,0,NULL);}\n'
result={'time':datetime.datetime.now().astimezone().isoformat(),'source_sha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'compiler':a.cc,'runner':a.runner,'passed':False,'cases':[]}
with tempfile.TemporaryDirectory(prefix='status-json-test-') as tmp:
 tmp=Path(tmp)
 def execute(source,label,empty=False):
  c=tmp/(label+'.c');binary=tmp/label;c.write_text(code(source,empty));cmd=[a.cc,'-std=gnu99','-Wall','-Wextra','-Werror','-Wno-unused-parameter','-Wno-unused-but-set-variable','-o',str(binary),str(c)]
  if a.runner:cmd.insert(1,'-static')
  subprocess.run(cmd,check=True,capture_output=True,text=True);return subprocess.check_output(a.runner+[str(binary)],timeout=15,text=True)
 if a.baseline:
  raw=execute(a.baseline.read_text(),'before')
  try:json.loads(raw);raise AssertionError('预期旧格式不能被 JSON 解析，实际不符')
  except json.JSONDecodeError:result['cases'].append({'name':'旧状态输出复现 JSON 解析失败','passed':True})
 source=a.source.read_text()
 for empty in [False,True]:
  raw=execute(source,'empty' if empty else 'after',empty);status=json.loads(raw)
  assert set(status)=={'lavg','uptime','ram','swap','cpu','wifi2','wifi5','logmt'}
  assert all(isinstance(x,int) and x>=0 for x in status['cpu'].values())
  assert status['cpu']['total']==status['cpu']['busy']+status['cpu']['idle']+status['cpu']['iowait']
  assert status['ram']['used']==status['ram']['total']-status['ram']['free']
  if empty:assert all(x==0 for x in status['cpu'].values()) and all(x==0 for x in status['ram'].values())
  else:assert status['cpu']['total']>0 and status['ram']['total']>0
  assert '0x' not in raw
  result['cases'].append({'name':'读取失败初始化为零' if empty else '实际 proc 数据符合标准 JSON','passed':True})
 result['passed']=True
a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))
