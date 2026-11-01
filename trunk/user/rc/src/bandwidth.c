/* 只管理本组件的 qdisc/IFB；不清空其他流控，也不改写加速偏好。 */
#include <stdio.h>
#include "rc.h"
#include <bandwidth_config.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <stdarg.h>
#include <unistd.h>
#include <errno.h>
#include <time.h>

#define BWL_ROOT "7a10:"
#define BWL_GUEST "7a20:"
#define BWL_PREF "49152"
static const char *bwl_ifb[3]={"bwl_up","bwl_g2","bwl_g5"};
static const char *bwl_ports[3]={IFNAME_BR,IFNAME_2G_GUEST,
#if BOARD_HAS_5G_RADIO
 IFNAME_5G_GUEST
#else
 ""
#endif
};
static const char *bwl_reason="none";
static int bwl_created_ingress[3];

static int bwl_run(const char *program,...)
{
    char *args[48];const char *s;int n=0;va_list ap;
    args[n++]=(char *)program;va_start(ap,program);
    while((s=va_arg(ap,const char *))!=NULL){if(n>=47){va_end(ap);return -1;}args[n++]=(char *)s;}
    va_end(ap);args[n]=NULL;
    return _eval(args,NULL,5,NULL);
}
#define TC(...) bwl_run(BWL_TC,__VA_ARGS__,NULL)
#define IP(...) bwl_run(BWL_IP,__VA_ARGS__,NULL)
static void bwl_status(const char *state,const char *config,const char *requested)
{
    FILE *f;char path[128];struct timespec stamp={0,0};
    mkdir(BWL_RUNTIME,0700);
    snprintf(path,sizeof(path),BWL_RUNTIME "/status.%ld",(long)getpid());
    f=fopen(path,"w");if(!f)return;
    /* 应用批次与请求修订号分开记录，回退仍保留实际生效配置的修订号。 */
    clock_gettime(CLOCK_MONOTONIC,&stamp);
    fprintf(f,"{\"state\":\"%s\",\"reason\":\"%s\",\"revision\":\"%08x\",\"requested_revision\":\"%08x\",\"generation\":\"%ld.%09ld.%ld\"}\n",state,bwl_reason,bwl_revision(config),bwl_revision(requested),(long)stamp.tv_sec,stamp.tv_nsec,(long)getpid());
    if(fclose(f)==0)rename(path,BWL_RUNTIME "/status.json");else unlink(path);
}
static int bwl_readfile(const char *path,char *out,size_t size)
{
    FILE *f=fopen(path,"r");size_t n;int extra;
    if(!f)return 0;
    n=fread(out,1,size-1,f);extra=fgetc(f);fclose(f);
    if(extra!=EOF)return 0;
    out[n]=0;return 1;
}
static int bwl_enabled(const struct bwl_config *cfg)
{
    unsigned i;
    if(get_ap_mode())return 0;
    if(cfg->count)return 1;
    for(i=0;i<2;i++)if(*bwl_ports[i+1]&&is_interface_up(bwl_ports[i+1])&&(cfg->guest_up[i]||cfg->guest_down[i]))return 1;
    return 0;
}
int bandwidth_limits_requested(void)
{
    struct bwl_config cfg;
    return bwl_parse(nvram_safe_get(BWL_CONFIG_KEY),&cfg)&&bwl_enabled(&cfg);
}
/* 默认队列可替换；自定义队列发生冲突时拒绝覆盖。 */
static int bwl_qdisc(const char *dev,int *owned_root,int *ingress)
{
    char cmd[96],line[512],kind[40],handle[40];FILE *f;int ok=1;
    *owned_root=*ingress=0;
    snprintf(cmd,sizeof(cmd),BWL_TC " qdisc show dev %s",dev);f=popen(cmd,"r");if(!f)return 0;
    while(fgets(line,sizeof(line),f)){
        if(sscanf(line,"qdisc %39s %39s",kind,handle)!=2)continue;
        if(!strcmp(kind,"ingress"))*ingress=1;
        if(!strcmp(kind,"clsact"))ok=0;
        if(strstr(line," root ")){
            if(!strcmp(handle,BWL_ROOT)||!strcmp(handle,BWL_GUEST))*owned_root=1;
            else if(strcmp(handle,"0:"))ok=0;
        }
    }
    if(pclose(f))ok=0;
    return ok;
}
static int bwl_filters(const char *dev,int *has_own,int *has_other)
{
    char cmd[128],line[768];FILE *f;
    *has_own=*has_other=0;
    snprintf(cmd,sizeof(cmd),BWL_TC " filter show dev %s parent ffff:",dev);f=popen(cmd,"r");if(!f)return 0;
    while(fgets(line,sizeof(line),f))if(!strncmp(line,"filter ",7)){
        if(strstr(line," pref " BWL_PREF " "))*has_own=1;else *has_other=1;
    }
    return pclose(f)==0;
}
static int bwl_ifb_ours(unsigned i)
{
    char path[96],alias[96];
    snprintf(path,sizeof(path),"/sys/class/net/%s/ifalias",bwl_ifb[i]);
    return bwl_readfile(path,alias,sizeof(alias))&&!strcmp(alias,"padavan-bandwidth\n");
}
static int bwl_preflight(void)
{
    unsigned i;int root,ingress,own,other;char path[96];
    if(access(BWL_TC,X_OK)){bwl_reason="missing_tc";return 0;}
    for(i=0;i<3;i++){
        if(!*bwl_ports[i])continue;
        snprintf(path,sizeof(path),"/sys/class/net/%s",bwl_ifb[i]);
        if(access(path,F_OK)==0&&!bwl_ifb_ours(i)){bwl_reason="ifb_conflict";return 0;}
        snprintf(path,sizeof(path),"/sys/class/net/%s",bwl_ports[i]);
        if(access(path,F_OK))continue;
        if(!bwl_qdisc(bwl_ports[i],&root,&ingress)){bwl_reason="qdisc_conflict";return 0;}
        if(ingress&&(!bwl_filters(bwl_ports[i],&own,&other)||other||!own)){bwl_reason="ingress_conflict";return 0;}
    }
    return 1;
}
static void bwl_cleanup(void)
{
    unsigned i;int root,ingress,own,other;char path[96];
    if(access(BWL_TC,X_OK))return;
    for(i=0;i<3;i++){
        if(!*bwl_ports[i])continue;
        snprintf(path,sizeof(path),"/sys/class/net/%s",bwl_ports[i]);
        if(access(path,F_OK)){if(bwl_ifb_ours(i))IP("link","del",bwl_ifb[i]);continue;}
        bwl_qdisc(bwl_ports[i],&root,&ingress);
        if(root)TC("qdisc","del","dev",bwl_ports[i],"root");
        if(ingress&&bwl_filters(bwl_ports[i],&own,&other)&&own){
            TC("filter","del","dev",bwl_ports[i],"parent","ffff:","protocol","all","pref",BWL_PREF);
            if(!other)TC("qdisc","del","dev",bwl_ports[i],"ingress");
        }
        else if(ingress&&bwl_created_ingress[i]&&bwl_filters(bwl_ports[i],&own,&other)&&!own&&!other)
            TC("qdisc","del","dev",bwl_ports[i],"ingress");
        bwl_created_ingress[i]=0;
        if(bwl_ifb_ours(i))IP("link","del",bwl_ifb[i]);
    }
}
static int bwl_ingress(unsigned i)
{
    int root,ingress;
    if(IP("link","add",bwl_ifb[i],"type","ifb"))return 0;
    if(IP("link","set","dev",bwl_ifb[i],"alias","padavan-bandwidth")){IP("link","del",bwl_ifb[i]);return 0;}
    if(IP("link","set",bwl_ifb[i],"up"))return 0;
    if(!bwl_qdisc(bwl_ports[i],&root,&ingress))return 0;
    if(!ingress){
        if(TC("qdisc","add","dev",bwl_ports[i],"handle","ffff:","ingress"))return 0;
        bwl_created_ingress[i]=1;
    }
    return TC("filter","add","dev",bwl_ports[i],"parent","ffff:","protocol","all","pref",BWL_PREF,"u32","match","u32","0","0","action","mirred","egress","redirect","dev",bwl_ifb[i])==0;
}
static int bwl_tbf(const char *dev,unsigned rate)
{
    char speed[24],burst[24];unsigned bytes=rate>32000?64000:rate*2;
    if(bytes<1600)bytes=1600;
    snprintf(speed,sizeof(speed),"%ukbit",rate);snprintf(burst,sizeof(burst),"%u",bytes);
    return TC("qdisc","add","dev",dev,"root","handle",BWL_GUEST,"tbf","rate",speed,"burst",burst,"latency","100ms")==0;
}
static int bwl_devices(const struct bwl_config *cfg,int up)
{
    const char *dev=up?bwl_ifb[0]:bwl_ports[0];unsigned i,n=0;
    for(i=0;i<cfg->count;i++)if(up?cfg->devices[i].up:cfg->devices[i].down)n++;
    if(!n)return 1;
    if(up&&!bwl_ingress(0))return 0;
    if(TC("qdisc","add","dev",dev,"root","handle",BWL_ROOT,"htb","default","fffe"))return 0;
    if(TC("class","add","dev",dev,"parent",BWL_ROOT,"classid","7a10:fffe","htb","rate","10000mbit","ceil","10000mbit","quantum","1514"))return 0;
    for(i=0;i<cfg->count;i++){
        const struct bwl_device *d=&cfg->devices[i];unsigned rate=up?d->up:d->down;char id[24],speed[24],pref[16];
        if(!rate)continue;
        snprintf(id,sizeof(id),"7a10:%x",i+1);snprintf(speed,sizeof(speed),"%ukbit",rate);snprintf(pref,sizeof(pref),"%u",i+10);
        if(TC("class","add","dev",dev,"parent",BWL_ROOT,"classid",id,"htb","rate",speed,"ceil",speed,"quantum","1514"))return 0;
        if(TC("qdisc","add","dev",dev,"parent",id,"fq_codel"))return 0;
        if(TC("filter","add","dev",dev,"parent",BWL_ROOT,"protocol","all","pref",pref,"u32","match","ether",up?"src":"dst",d->mac,"flowid",id))return 0;
    }
    return 1;
}
static int bwl_install(const struct bwl_config *cfg)
{
    unsigned i;
    const char *modules[]={"ifb","sch_htb","sch_tbf","sch_ingress","cls_u32","act_mirred",NULL};
    for(i=0;modules[i];i++)module_smart_load(modules[i],NULL);
    if(!bwl_devices(cfg,1)||!bwl_devices(cfg,0))return 0;
    for(i=0;i<2;i++){
        if(!*bwl_ports[i+1]||!is_interface_up(bwl_ports[i+1]))continue;
        if(cfg->guest_up[i]&&(!bwl_ingress(i+1)||!bwl_tbf(bwl_ifb[i+1],cfg->guest_up[i])))return 0;
        if(cfg->guest_down[i]&&!bwl_tbf(bwl_ports[i+1],cfg->guest_down[i]))return 0;
    }
    return 1;
}
void stop_bandwidth_limits(void)
{
    int fd;
    mkdir(BWL_RUNTIME,0700);fd=open(BWL_RUNTIME "/lock",O_CREAT|O_RDWR,0600);
    if(fd<0)return;
    if(flock(fd,LOCK_EX)){close(fd);return;}
    bwl_cleanup();unlink(BWL_RUNTIME "/applied");bwl_reason="none";bwl_status("stopped",nvram_safe_get(BWL_CONFIG_KEY),nvram_safe_get(BWL_CONFIG_KEY));
    flock(fd,LOCK_UN);close(fd);
}
void restart_bandwidth_limits(void)
{
    char config[BWL_CONFIG_SIZE],previous[BWL_CONFIG_SIZE];struct bwl_config cfg,oldcfg;
    int fd,have_old=0,was_active;FILE *f;
    mkdir(BWL_RUNTIME,0700);fd=open(BWL_RUNTIME "/lock",O_CREAT|O_RDWR,0600);
    if(fd<0)return;
    /* 等待前一轮结束后重读配置，避免并发保存丢失最后一次申请。 */
    if(flock(fd,LOCK_EX)){close(fd);return;}
    bwl_reason="none";
    if(!bwl_parse(nvram_safe_get(BWL_CONFIG_KEY),&cfg)||!bwl_format(&cfg,config)){
        bwl_reason="invalid_config";bwl_status("error",nvram_safe_get(BWL_CONFIG_KEY),nvram_safe_get(BWL_CONFIG_KEY));goto done;
    }
    if(!bwl_enabled(&cfg)){
        was_active=access(BWL_RUNTIME "/applied",F_OK)==0||access(BWL_RUNTIME "/accel-block",F_OK)==0;
        bwl_cleanup();unlink(BWL_RUNTIME "/applied");bwl_status(get_ap_mode()?"unsupported_mode":"disabled",config,config);
        unlink(BWL_RUNTIME "/accel-block");
        if(was_active)reload_nat_modules();
        goto done;
    }
    if(!bwl_preflight()){bwl_status("error",config,config);goto done;}
    have_old=bwl_readfile(BWL_RUNTIME "/applied",previous,sizeof(previous))&&bwl_parse(previous,&oldcfg);
    f=fopen(BWL_RUNTIME "/accel-block","w");
    if(!f){bwl_reason="state_write_failed";bwl_status("error",config,config);goto done;}
    fclose(f);reload_nat_modules();
    /* 未能停用快路径时不能报告限速成功，避免流量绕过队列。 */
    if(access("/sys/module/hw_nat",F_OK)==0||access("/sys/module/fast_classifier",F_OK)==0){
        bwl_reason="accel_stop_failed";bwl_status("error",config,config);goto done;
    }
    bwl_cleanup();
    if(!bwl_install(&cfg)){
        bwl_cleanup();bwl_reason="apply_failed";
        if(have_old&&bwl_install(&oldcfg))bwl_status("rolled_back",previous,config);
        else {bwl_cleanup();unlink(BWL_RUNTIME "/applied");bwl_status("error",config,config);}
        logmessage("Bandwidth","限速应用失败，请检查流控状态和系统日志");goto done;
    }
    f=fopen(BWL_RUNTIME "/applied.new","w");
    if(!f||fputs(config,f)<0){if(f)fclose(f);bwl_reason="state_write_failed";bwl_status("error",config,config);goto done;}
    if(fclose(f)||rename(BWL_RUNTIME "/applied.new",BWL_RUNTIME "/applied")){
        bwl_reason="state_write_failed";bwl_status("error",config,config);goto done;
    }
    bwl_status("active",config,config);
done:
    flock(fd,LOCK_UN);close(fd);
}
