"""以真实状态解析器在宿主机和 MIPS/QEMU 中做隔离回归。"""
from pathlib import Path
import argparse, json, subprocess, tempfile

p = argparse.ArgumentParser()
p.add_argument('--cc', default='gcc')
p.add_argument('--runner', nargs='*', default=[])
p.add_argument('--label', default='native')
p.add_argument('--source',type=Path,default=Path(__file__).resolve().parents[2]);p.add_argument('--results',type=Path,default=Path('/tmp/padavan-backend-tests'));a = p.parse_args()
root = a.results; (root/'results').mkdir(parents=True,exist_ok=True)
header = a.source/'trunk/user/httpd/src/adguardhome_status_http.h'
code = r'''#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <errno.h>
#include <assert.h>
#include <arpa/inet.h>
#include <net/if.h>
#include <sys/ioctl.h>
#include <unistd.h>
#define IFNAME_BR "br0"
static int pids(const char *s){(void)s;return 0;}
static int nvram_get_int(const char *s){(void)s;return 3;}
''' + header.read_text() + r'''
static int cases;
static void check(const char *yaml, int valid, const char *host, unsigned port, int tls){
 FILE *f=fmemopen((void*)yaml,strlen(yaml),"r");assert(f);
 struct agh_web_address a;int secure;agh_web_config(f,&a,&secure);fclose(f);
 assert(a.valid==valid);if(valid){assert(!strcmp(a.host,host));assert(a.port==port);assert(secure==tls);}cases++;
}
int main(void){
 check("http:\n  pprof:\n    port: 6060\n  address: 0.0.0.0:3000\ndns:\n  port: 5335\n",1,"0.0.0.0",3000,0);
 check("http:\n  address: '[::]:8080'\n",1,"::",8080,0);
 check("http:\n  address: \"192.168.31.157:3001\"\n",1,"192.168.31.157",3001,0);
 check("http:\n  address: 0.0.0.0:3000\ntls:\n  enabled: true\n  force_https: true\n  port_https: 4443\n",1,"0.0.0.0",4443,1);
 check("http:\n  address: '[::]:0'\ntls:\n  enabled: true\n  port_https: 443\n",1,"::",443,1);
 check("http:\n  address: 0.0.0.0:3000\ntls:\n  enabled: false\n  force_https: true\n  port_https: 443\n",1,"0.0.0.0",3000,0);
 check("http:\n  address: 0.0.0.0:0\n",0,"",0,0);
 check("http:\n  pprof:\n    address: 0.0.0.0:6060\n",0,"",0,0);
 check("http:\n  address: 0.0.0.0:65536\n",0,"",0,0);
 check("http:\n  address: 0.0.0.0:-1\n",0,"",0,0);
 check("http:\n  address: 0.0.0.0:3000evil\n",0,"",0,0);
 check("http:\n  address: example.com:3000\n",0,"",0,0);
 check("http:\n  address: [::1]:3000\n",1,"::1",3000,0);
 char large[3000];strcpy(large,"http:\n  address: 0.0.0.0:3000\ntls:\n  certificate_chain: ");
 size_t n=strlen(large);memset(large+n,'A',2000);strcpy(large+n+2000,"\n  enabled: false\n");check(large,1,"0.0.0.0",3000,0);
 strcpy(large,"http:\n  address: 0.0.0.0:3000\n  address: ");n=strlen(large);memset(large+n,'A',2000);strcpy(large+n+2000,"\n");check(large,0,"",0,0);
 strcpy(large,"http:\n  address: 0.0.0.0:3000\n  address: ");n=strlen(large);memset(large+n,'A',200);strcpy(large+n+200,"\n");check(large,0,"",0,0);
 char path[]="/tmp/agh-proc-test-XXXXXX";int fd=mkstemp(path);assert(fd>=0);FILE *fp=fdopen(fd,"w");
 fputs("header\n  0: 00000000:0BB8 00000000:0000 0A 0 0\n  1: 00000000:14D7 00000000:0000 01 0 0\n",fp);fclose(fp);
 assert(agh_port_listens(path,3000));assert(!agh_port_listens(path,5335));unlink(path);cases+=2;
 printf("{\"passed\":true,\"cases\":%d}\n",cases);
 return 0;
}
'''
with tempfile.TemporaryDirectory(prefix='agh-status-test-') as t:
    t = Path(t); (t/'test.c').write_text(code)
    flags = ['-std=gnu99','-Wall','-Wextra','-Werror','-Wno-unused-function','-O1']
    flags += ['-static'] if a.runner else ['-fsanitize=undefined','-fno-sanitize-recover=all']
    subprocess.run([a.cc,*flags,str(t/'test.c'),'-o',str(t/'test')],check=True)
    result = subprocess.run([*a.runner,str(t/'test')],text=True,capture_output=True,check=True)
report = {'compiler':a.cc,'runner':a.runner,**json.loads(result.stdout)}
(root/'results'/('agh-status-'+a.label+'.json')).write_text(json.dumps(report,indent=2))
print(json.dumps(report))
