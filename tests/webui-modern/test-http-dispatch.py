"""只在隔离进程中检查请求分派与解码边界；不向设备发送异常请求。"""
from pathlib import Path
import argparse,datetime,json,subprocess,tempfile
p=argparse.ArgumentParser();p.add_argument('--candidate',action='store_true');p.add_argument('--cc',default='gcc');p.add_argument('--runner',nargs='*',default=[]);p.add_argument('--label',default='native');p.add_argument('--source',type=Path,default=Path(__file__).resolve().parents[2]);p.add_argument('--results',type=Path,default=Path('/tmp/padavan-backend-tests'));a=p.parse_args();a.candidate=True
root=a.results; (root/'results').mkdir(parents=True,exist_ok=True)
base=a.source/'trunk/user/httpd/src'
text=(base/'httpd.c').read_text()
def function(name):
    start=text.index(name+'(');start=text.rfind('\n',0,start)+1
    return text[start:text.index('\n}\n',start)+3]
code=r'''#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <sys/stat.h>
#include <assert.h>
#define HTTP_METHOD_GET 1
#define HTTP_METHOD_HEAD 2
#define HTTP_METHOD_POST 3
#define LOGIN_TIMEOUT 600
typedef struct {int len,key;} uaddr;
typedef struct {uaddr usa;int fd;} conn_item_t;
struct mime_handler {const char *pattern,*mime_type,*extra_header;void (*input)(const char*,FILE*,int,char*);void (*output)(const char*,FILE*);int need_auth;};
static int http_has_lang=1,http_input_error,auth_calls,input_calls,output_calls,status;
static uaddr login_ip;static unsigned long login_timestamp=100;
static unsigned long uptime(void){return 100;}
static void reset_login_data(void){login_ip.len=0;}
static int is_uaddr_localhost(const uaddr *p){return p->key==0;}
static int is_uaddr_equal(const uaddr *a,const uaddr *b){return a->key==b->key;}
static void usockaddr_to_uaddr(const uaddr *a,uaddr *b){*b=*a;}
static int match(const char *a,const char *b){return strcmp(a,b)==0;}
static int set_preferred_lang(char *p){(void)p;return 1;}
static time_t tdate_parse(char *p){(void)p;return 0;}
static void send_error(int s,const char *a,const char *b,const char *d,FILE *f){(void)a;(void)b;(void)d;(void)f;status=s;}
static void send_headers(int s,const char *a,const char *b,const char *d,struct stat *st,FILE *f){(void)a;(void)b;(void)d;(void)st;(void)f;status=s;}
static int auth_check(const char *s){auth_calls++;return s!=NULL;}
static void send_authenticate(FILE *f){(void)f;status=401;}
static void http_logout(const uaddr *a){(void)a;}
static void http_login(const uaddr *a){(void)a;}
static void eat_post_data(FILE *f,int n){(void)f;(void)n;}
static void try_pull_data(FILE *f,int n){(void)f;(void)n;}
static void do_uncgi_query(char *s){(void)s;}
static void do_cgi_clear(void){}
static void do_file(const char *s,FILE *f){(void)s;(void)f;}
static void do_ej(const char *s,FILE *f){(void)s;(void)f;}
static void mock_input(const char *s,FILE *f,int n,char *b){(void)s;(void)f;(void)n;(void)b;input_calls++;}
static void mock_output(const char *s,FILE *f){(void)s;(void)f;output_calls++;}
static struct mime_handler mime_handlers[]={
 {"audit.json","application/json",NULL,mock_input,mock_output,1},
 {"Nologin.asp","text/html",NULL,NULL,do_ej,1},
 {NULL,NULL,NULL,NULL,NULL,0}
};
'''+ 'static int\n'+function('http_login_check')+'static int\n'+function('parse_content_length')+'static void\n'+function('handle_request')+r'''
static void trial(const char *label,int locked,const char *method){
 char request[128];snprintf(request,sizeof(request),"%s /audit.json HTTP/1.0\r\nContent-Length: 0\r\n\r\n",method);
 FILE *f=fmemopen(request,strlen(request),"r");assert(f);
 conn_item_t item={{1,123},-1};login_ip=(uaddr){locked,456};
 auth_calls=input_calls=output_calls=status=0;handle_request(f,&item);fclose(f);
 if(locked){assert(auth_calls==0&&output_calls==1&&status==200);}else{assert(auth_calls==1&&output_calls==0&&status==401);}
 printf("{\"case\":\"%s\",\"auth_calls\":%d,\"input_calls\":%d,\"output_calls\":%d,\"status\":%d}\n",label,auth_calls,input_calls,output_calls,status);
}
int main(void){trial("no_active_login",0,"GET");trial("different_active_login_GET",1,"GET");trial("different_active_login_POST",1,"POST");return 0;}
'''
if a.candidate:
    code=code.replace('auth_calls==0&&output_calls==1&&status==200','auth_calls==0&&input_calls==0&&output_calls==0&&status==403')
    code=code.replace('return s!=NULL;', 'return s && strcspn(s,"\\r\\n")==strlen("Basic dGVzdDp0ZXN0") && !strncmp(s,"Basic dGVzdDp0ZXN0",strlen("Basic dGVzdDp0ZXN0"));')
    code=code.replace('{"audit.json","application/json",NULL,mock_input,mock_output,1},', '{"audit.json","application/json",NULL,mock_input,mock_output,1},\n {"public.js","text/javascript",NULL,NULL,mock_output,0},')
    extra=r'''
static void normal_case(const char *label,int owner,int client,const char *method,const char *path,const char *auth,int expected_status,int expected_auth,int expected_input,int expected_output){
 char request[512];snprintf(request,sizeof(request),"%s /%s HTTP/1.0\r\n%sContent-Length: 0\r\n\r\n",method,path,auth);
 FILE *f=fmemopen(request,strlen(request),"r");assert(f);
 conn_item_t item={{1,client},-1};login_ip=(uaddr){owner!=0,owner};
 auth_calls=input_calls=output_calls=status=0;handle_request(f,&item);fclose(f);
 fprintf(stderr,"case=%s status=%d auth=%d input=%d output=%d\n",label,status,auth_calls,input_calls,output_calls);
 assert(status==expected_status&&auth_calls==expected_auth&&input_calls==expected_input&&output_calls==expected_output);
 printf("{\"case\":\"%s\",\"auth_calls\":%d,\"input_calls\":%d,\"output_calls\":%d,\"status\":%d}\n",label,auth_calls,input_calls,output_calls,status);
}
static void normal_cases(void){
 const char *good="Authorization: Basic dGVzdDp0ZXN0\r\n";
 normal_case("valid_first_login",0,123,"GET","audit.json",good,200,1,0,1);
 normal_case("valid_same_client_get",123,123,"GET","audit.json",good,200,1,0,1);
 normal_case("valid_same_client_post",123,123,"POST","audit.json",good,200,1,1,1);
 normal_case("same_client_missing_auth",123,123,"GET","audit.json","",401,1,0,0);
 normal_case("same_client_wrong_auth",123,123,"GET","audit.json","Authorization: Basic wrong\r\n",401,1,0,0);
 normal_case("different_client_with_auth",456,123,"GET","audit.json",good,403,0,0,0);
 normal_case("public_resource_foreign_login",456,123,"GET","public.js","",200,0,0,1);
 normal_case("occupied_page_still_visible",456,123,"GET","index.asp","",200,0,0,0);
 normal_case("localhost_behavior_preserved",456,0,"GET","audit.json","",200,0,0,1);
}
'''
    code=code.replace('int main(void){', extra+'\nint main(void){normal_cases();')
report={'time':datetime.datetime.now().astimezone().isoformat(),'scope':'隔离函数回归，handler 仅记数，不执行配置操作','candidate':a.candidate,'compiler':a.cc,'runner':a.runner,'cases':[]}
flags=['-std=gnu99','-O1','-static'] if a.runner else ['-std=gnu99','-O1','-fsanitize=undefined','-fno-sanitize-recover=all']
with tempfile.TemporaryDirectory(prefix='rm2100-http-audit-') as tmp:
    tmp=Path(tmp)
    source=tmp/'dispatch.c';source.write_text(code);exe=tmp/'dispatch'
    subprocess.run([a.cc,*flags,str(source),'-o',str(exe)],check=True)
    result=subprocess.run(a.runner+[str(exe)],capture_output=True,text=True,timeout=10)
    if result.returncode: raise RuntimeError(result.stderr)
    report['cases']=[json.loads(line) for line in result.stdout.splitlines()]
    source=tmp/'base64-audit.c'
    source.write_text((base/'base64.c').read_text()+r'''
#include <stdio.h>
int main(void){unsigned char out[16]={0};const char bad[]={-1,'Y','Q','=','=',0};int n=b64_decode(bad,out,sizeof(out));printf("%d %d\n",n,out[0]);return 0;}
''')
    exe=tmp/'base64-audit'
    subprocess.run([a.cc,'-fsigned-char',*flags,str(source),'-o',str(exe)],check=True)
    result=subprocess.run(a.runner+[str(exe)],capture_output=True,text=True,timeout=10)
    if a.candidate: assert result.returncode==0 and result.stdout.strip()=='1 97',result
    else: assert result.returncode!=0 and 'out of bounds' in result.stderr
    report['base64_signed_char']={'returncode':result.returncode,'sanitizer':result.stderr}
    if a.candidate:
        source.write_text((base/'base64.c').read_text()+r'''
#include <assert.h>
#include <string.h>
int main(void){
 unsigned char out[32];const char *encoded[]={"","Zg==","Zm8=","Zm9v","Zm9vYg==","Zm9vYmE=","Zm9vYmFy","dGVzdDp0ZXN0"};
 const char *plain[]={"","f","fo","foo","foob","fooba","foobar","test:test"};
 for(unsigned i=0;i<sizeof(encoded)/sizeof(encoded[0]);i++){
  memset(out,0xcc,sizeof(out));int n=b64_decode(encoded[i],out,sizeof(out));assert(n==(int)strlen(plain[i]));assert(!memcmp(out,plain[i],n));assert(out[n]==0xcc);
 }
 memset(out,0xcc,sizeof(out));assert(b64_decode("Zm9vYmFy",out,2)==2);assert(out[2]==0xcc);
 assert(b64_decode("Zm9v",out,0)==0);
 for(int c=128;c<256;c++){char s[]={(char)c,'Y','Q','=','=',0};assert(b64_decode(s,out,sizeof(out))==1&&out[0]=='a');}
 return 0;
}
''')
        for char_mode in ['-fsigned-char','-funsigned-char']:
            subprocess.run([a.cc,char_mode,*flags,str(source),'-o',str(exe)],check=True)
            subprocess.run(a.runner+[str(exe)],check=True,timeout=10)
        report['base64_regression']={'known_vectors':8,'bounded_output':True,'all_high_bytes':True,'both_char_modes':True}
(root/'results'/('http-fixed-'+a.label+'.json' if a.candidate else 'http-isolated.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
