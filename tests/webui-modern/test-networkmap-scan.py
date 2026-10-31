"""测试真实扫描函数的地址覆盖、批次边界与完成顺序，不访问网络。"""
from pathlib import Path
import argparse,json,subprocess,tempfile,shlex,re
p=argparse.ArgumentParser()
p.add_argument('--source',type=Path,default=Path(__file__).resolve().parents[2])
p.add_argument('--cc',default='gcc');p.add_argument('--runner',default='')
p.add_argument('--cflags',default='');a=p.parse_args()
prefix=r'''
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <arpa/inet.h>
#include <sys/time.h>
static unsigned int scan_now,scan_max,scan_net;
static int scan_block,networkmap_fullscan,arp_sockfd;
static struct in_addr my_ipaddr;
static unsigned int seen[1024],sent,total,rounds,resets,inits,max_batch;
static void net_clients_reset(void){resets++;}
static void nmap_init(void){inits++;}
static int sent_arppacket(int fd,struct in_addr *a){unsigned int n=ntohl(a->s_addr)-scan_net;(void)fd;assert(n>0&&n<scan_max&&n<1024);assert(!seen[n]);assert(a->s_addr!=my_ipaddr.s_addr);seen[n]=1;sent++;total++;return 0;}
static void nmap_receive_arp(void){rounds++;if(sent>max_batch)max_batch=sent;assert(sent<=BATCH_LIMIT);sent=0;}
static int fake_setsockopt(int a,int b,int c,const void*d,socklen_t e){(void)a;(void)b;(void)c;(void)d;(void)e;return 0;}
static void nvram_set_int_temp(const char*a,int b){(void)a;assert(b==0);if(BATCH_LIMIT>1)assert(sent==0);}
#define setsockopt fake_setsockopt
#define NMP_DEBUG(...) ((void)0)
'''
tail=r'''
int main(void){
 unsigned int masks[]={3,7,15,255,511},m,own,n,cases=0,reference_rounds=0;
 for(m=0;m<sizeof(masks)/sizeof(masks[0]);m++)for(own=1;own<masks[m];own++){
  memset(seen,0,sizeof(seen));scan_now=0;scan_max=masks[m];scan_net=0xac1f0000;my_ipaddr.s_addr=htonl(scan_net|own);scan_block=0;networkmap_fullscan=1;sent=total=rounds=resets=inits=max_batch=0;
  while(networkmap_fullscan){assert(rounds<1024);nmap_iterate();}
  assert(total==scan_max-2);assert(resets==1&&inits==1);
  for(n=1;n<scan_max;n++)assert(seen[n]==(n!=own));
  if(scan_max==255&&own==1)reference_rounds=rounds;
  cases++;
 }
 scan_now=0;scan_block=1;networkmap_fullscan=1;sent=total=rounds=resets=inits=max_batch=0;nmap_iterate();assert(!networkmap_fullscan&&total==0&&rounds==1);
 puts("{\"address_coverage\":true,\"no_duplicates\":true,\"skip_router\":true,\"skip_network_broadcast\":true,\"blocked_scan\":true,\"final_batch_before_completion_checked\":true}");
 printf("{\"cases\":%u,\"subnet24_receive_rounds\":%u}\n",cases+1,reference_rounds);return 0;
}
'''
s=(a.source/'trunk/user/networkmap/src/networkmap.c').read_text(encoding='utf-8')
batch=int(re.search(r'#define\s+SCAN_BATCH_SIZE\s+(\d+)',s)[1]);assert 1<batch<=32
begin=s.index('static void\nnmap_iterate(void)');end=s.index('\n}\n',begin)+3
with tempfile.TemporaryDirectory(prefix='padavan-nmap-test-') as tmp:
 d=Path(tmp);src=d/'scan.c';binary=d/'scan'
 src.write_text('#define BATCH_LIMIT '+str(batch)+'\n#define SCAN_BATCH_SIZE '+str(batch)+'\n'+prefix+s[begin:end]+tail)
 flags=shlex.split(a.cflags) if a.cflags else ([] if a.runner else ['-fsanitize=address,undefined','-g'])
 subprocess.run(shlex.split(a.cc)+['-Wall','-Wextra','-Werror']+flags+['-o',str(binary),str(src)],check=True)
 result=subprocess.run(shlex.split(a.runner)+[str(binary)],text=True,capture_output=True,check=True)
 data=[json.loads(x) for x in result.stdout.splitlines()]
 assert data[-1]['cases']==787 and data[-1]['subnet24_receive_rounds']<=34
 print(json.dumps({'passed':True,'checks':data,'network_access':False}))
