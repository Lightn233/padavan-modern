"""在 Ubuntu 中抽取原 C 函数验证；仿真 proc 输入，不接触路由器配置。"""
from pathlib import Path
import argparse,datetime,json,subprocess,tempfile
p=argparse.ArgumentParser();p.add_argument('--cc',default='gcc');p.add_argument('--runner',nargs='*',default=[]);p.add_argument('--label',default='native');p.add_argument('--candidate',action='store_true');p.add_argument('--source',type=Path,default=Path(__file__).resolve().parents[2]);p.add_argument('--results',type=Path,default=Path('/tmp/padavan-backend-tests'));a=p.parse_args();a.candidate=True
root=a.results; (root/'results').mkdir(parents=True,exist_ok=True)
base=a.source/'trunk/user'
stats=(base/'rc/src/rstats.c').read_text()
web=(base/'httpd/src/web_ex.c').read_text()
def function(text,name):
    start=text.index(name+'(');start=text.rfind('\n',0,start)+1
    end=text.index('\n}\n',start)+3
    return text[start:end]

prefix='''#define _GNU_SOURCE
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <time.h>
#include <signal.h>
#include <ctype.h>
#include <errno.h>
#include "bsd_queue.h"
'''
decl=stats[stats.index('#define SMIN'):stats.index('// ===========================================')]
rstats_code=prefix+'''#define RSTATS_INTERVAL 60
#define IFDESCS_MAX_NUM 12
#define BOARD_NUM_ETH_EPHY 4
#define IFDESC_WAN "WAN"
#define IFDESC_WISP "WISP"
'''+decl+'''
static FILE *fixture_open(const char *name,const char *mode){
    static char empty[]="headers\\nheaders\\n";
    (void)name;(void)mode;return fmemopen(empty,strlen(empty),"r");
}
static const char *get_ifname_descriptor(const char *n,int m,int *i,int *w){(void)n;(void)m;(void)i;(void)w;return NULL;}
static int phy_status_port_bytes(int i,uint64_t *r,uint64_t *t){(void)i;(void)r;(void)t;return -1;}
static int get_wan_wisp_active(void *p){(void)p;return 1;}
static int is_system_time_valid(struct tm *t){(void)t;return 1;}
static void save_history_raw(long ticks){(void)ticks;}
#define fopen fixture_open
'''+''.join(function(stats,n) for n in ['bump_history','fill_speed_gaps','iterate_netdev','process_rstats'])+'''
static void reset(void){
    speed_item_t *p,*next;
    SLIST_FOREACH_SAFE(p,&g_speed_list.head,entries,next){free(p);}
    memset(&g_speed_list,0,sizeof(g_speed_list));g_uptime_now=0;g_uptime_old=0;
    memset(g_history,0,MAX_HISTORY_IF*sizeof(*g_history));
}
int main(void){
    uint64_t c[2]={1000,1000};
    g_history=calloc(MAX_HISTORY_IF,sizeof(*g_history));assert(g_history);
    iterate_netdev("WAN",1,1,1,c);c[0]+=6000;iterate_netdev("WAN",1,1,1,c);
    speed_item_t *p=SLIST_FIRST(&g_speed_list.head);
    assert(p->speed[1][0]==100);
    printf("{\\"normal_bytes_per_second\\":%u,",p->speed[1][0]);
    reset();c[0]=0x80000000ull;c[1]=0;iterate_netdev("WAN",1,1,1,c);
    c[0]=1000;iterate_netdev("WAN",1,1,1,c);
    uint64_t reset_bytes=g_history[0].daily[g_history[0].dailyp].counter[0];
    assert(reset_bytes==2147484647ull);
    printf("\\"reset_charged_bytes\\":%llu,",(unsigned long long)reset_bytes);
    reset();c[0]=1000;iterate_netdev("WAN",1,1,1,c);
    c[0]=104857600;iterate_netdev("WAN",2,1,1,c);
    uint64_t recreated=g_history[0].daily[g_history[0].dailyp].counter[0];
    assert(recreated==104857600);
    printf("\\"recreated_interface_charged_bytes\\":%llu,",(unsigned long long)recreated);
    reset();c[0]=10;iterate_netdev("VPNC",1,0,1,c);
    for(int tick=1;tick<=MAX_NSPEED;tick++){g_uptime_now=tick*RSTATS_INTERVAL;process_rstats();}
    assert(SLIST_EMPTY(&g_speed_list.head));assert(g_speed_list.count==1);
    printf("\\"expired_list_empty\\":true,\\"expired_count\\":%d,\\"missing_minutes\\":%d}\\n",g_speed_list.count,MAX_NSPEED);
    reset();free(g_history);return 0;
}
'''

structs=web[web.index('struct cpu_stats {'):web.index('void get_cpudata(')]
memcode=prefix+structs+'''
static const char *fixture;
static FILE *fixture_open(const char *name,const char *mode){(void)name;(void)mode;return fmemopen((void*)fixture,strlen(fixture),"r");}
#define fopen fixture_open
'''+function(web,'get_cpudata')+function(web,'get_memdata')+'''
int main(void){
    struct mem_stats normal={0},reordered={0},legacy={0};struct cpu_stats c={0};
    fixture="MemTotal: 100000 kB\\nMemFree: 20000 kB\\nMemAvailable: 55000 kB\\nBuffers: 10000 kB\\nCached: 30000 kB\\n";get_memdata(&normal);
    assert(normal.total==100000&&normal.free==20000&&normal.buffers==10000&&normal.cached==30000);
    fixture="MemTotal: 100000 kB\\nMemFree: 20000 kB\\nBuffers: 10000 kB\\nCached: 30000 kB\\nMemAvailable: 55000 kB\\n";get_memdata(&reordered);
    assert(reordered.buffers==0&&reordered.cached==0);
    fixture="MemTotal: 100000 kB\\nMemFree: 20000 kB\\nBuffers: 10000 kB\\nCached: 30000 kB\\n";get_memdata(&legacy);
    assert(legacy.buffers==0&&legacy.cached==30000);
    fixture="cpu 100 0 50 800 20 5 25 0 0 0\\n";get_cpudata(&c);
    assert(c.busy==180&&c.total==1000);
    printf("{\\"normal_memory\\":true,\\"reordered_buffers\\":%lu,\\"reordered_cached\\":%lu,\\"no_available_buffers\\":%lu,\\"no_available_cached\\":%lu,\\"cpu_busy\\":%llu,\\"cpu_total\\":%llu}\\n",reordered.buffers,reordered.cached,legacy.buffers,legacy.cached,c.busy,c.total);
    return 0;
}
'''

if a.candidate:
    rstats_code=rstats_code.replace('reset_bytes==2147484647ull','reset_bytes==0').replace('recreated==104857600','recreated==0').replace('g_speed_list.count==1','g_speed_list.count==0')
    # 此夹具在零时刻创建接口，之后才推进第一个一分钟采样周期。
    rstats_code=rstats_code.replace('iterate_netdev("VPNC",1,0,1,c);','iterate_netdev("VPNC",1,0,0,c);')
    rstats_code=rstats_code.replace('reset();free(g_history);return 0;', '''
    reset();c[0]=0xfffffff0ull;c[1]=0;iterate_netdev("WAN",1,1,1,c);
    c[0]+=6000;iterate_netdev("WAN",1,1,1,c);
    assert(g_history[0].daily[g_history[0].dailyp].counter[0]==6000);
    reset();c[0]=100;iterate_netdev("WAN",1,1,1,c);
    p=SLIST_FIRST(&g_speed_list.head);p->skips=2;c[0]=60000000;
    iterate_netdev("WAN",1,1,1,c);
    assert(g_history[0].daily[g_history[0].dailyp].counter[0]==0);
    c[0]+=6000;iterate_netdev("WAN",1,1,1,c);
    assert(g_history[0].daily[g_history[0].dailyp].counter[0]==6000);
    reset();free(g_history);return 0;''')
    memcode=memcode.replace('reordered.buffers==0&&reordered.cached==0','reordered.buffers==10000&&reordered.cached==30000').replace('legacy.buffers==0&&legacy.cached==30000','legacy.buffers==10000&&legacy.cached==30000')
    memcode=memcode.replace('struct mem_stats normal={0},reordered={0},legacy={0};','struct mem_stats normal={0},reordered={0},legacy={0},invalid={0};')
    memcode=memcode.replace('fixture="cpu 100', '''assert(normal.available_known&&normal.available==55000);
    assert(!legacy.available_known);
    fixture="Cached: 333 kB\\nUnknown: 800 kB\\nMemFree: -12 kB\\nMemTotal: 999 kB\\nBuffers: 222 kB\\n";get_memdata(&invalid);
    assert(invalid.total==999&&invalid.free==0&&invalid.cached==333&&invalid.buffers==222);
    fixture="cpu 100''')
report={'time':datetime.datetime.now().astimezone().isoformat(),'compiler':a.cc,'runner':a.runner,'scope':'候选回归' if a.candidate else '原 C 函数隔离复现','cases':[]}
with tempfile.TemporaryDirectory(prefix='rm2100-metrics-audit-') as tmp:
    tmp=Path(tmp)
    for name,code in [('rstats',rstats_code),('resources',memcode)]:
        source=tmp/(name+'.c');exe=tmp/name;source.write_text(code)
        flags=['-std=gnu99','-O1','-g','-Wall','-Wextra','-Wno-unused-variable','-Wno-format','-I'+str(a.source/'trunk/user/shared/src/include')]
        if a.runner:flags+=['-static']
        else:flags+=['-fsanitize=undefined','-fno-sanitize-recover=all']
        build=subprocess.run([a.cc,*flags,str(source),'-o',str(exe)],capture_output=True,text=True)
        if build.returncode:raise RuntimeError(build.stderr)
        result=subprocess.run(a.runner+[str(exe)],capture_output=True,text=True,timeout=30)
        if result.returncode:raise RuntimeError(result.stdout+'\n'+result.stderr)
        report['cases'].append({'name':name,'observed':json.loads(result.stdout),'build_stderr':build.stderr,'run_stderr':result.stderr})
(root/'results').mkdir(exist_ok=True)
(root/'results'/('metrics-c-'+('fixed-' if a.candidate else '')+a.label+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
