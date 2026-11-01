/* 限速管理复用已有 HTTP 认证，并用随机令牌与修订号防止跨页误覆盖。 */
#include <bandwidth_config.h>
#include <ctype.h>
#ifndef BWL_EXEC
#define BWL_EXEC "/sbin/bandwidthctl"
#endif
static int bwl_http_post;
static char bwl_http_csrf[65];
static void do_bandwidth_post(const char *url,FILE *stream,int clen,char *boundary)
{
    bwl_http_post=0;do_html_apply_post(url,stream,clen,boundary);
    if(!http_input_error)bwl_http_post=1;
}
static int bwl_make_csrf(void)
{
    unsigned char bytes[32];size_t n,i;FILE *f;
    if(bwl_http_csrf[0])return 1;
    f=fopen("/dev/urandom","rb");if(!f)return 0;
    n=fread(bytes,1,sizeof(bytes),f);fclose(f);if(n!=sizeof(bytes))return 0;
    for(i=0;i<sizeof(bytes);i++)snprintf(bwl_http_csrf+i*2,3,"%02x",bytes[i]);
    return 1;
}
/* 必须在启动子进程前读取，快速完成的本次结果也不能被误当成旧批次。 */
static void bwl_previous_generation(char out[64])
{
    char saved[512],*p,*end;size_t n;FILE *f;
    out[0]=0;f=fopen(BWL_RUNTIME "/status.json","r");if(!f)return;
    n=fread(saved,1,sizeof(saved)-1,f);fclose(f);saved[n]=0;
    p=strstr(saved,"\"generation\":\"");if(!p)return;
    p+=strlen("\"generation\":\"");end=strchr(p,'"');
    if(!end||end==p||(size_t)(end-p)>=64)return;
    for(char *v=p;v<end;v++)if(!isdigit((unsigned char)*v)&&*v!='.')return;
    memcpy(out,p,(size_t)(end-p));out[end-p]=0;
}
static void do_bandwidth(const char *url,FILE *stream)
{
    struct bwl_config cfg;char config[BWL_CONFIG_SIZE],revision[9],status[512],previous_generation[64]="";
    const char *error=NULL,*action,*value,*csrf,*rev;unsigned up,down,i;
    int post=bwl_http_post,changed=0,valid;FILE *f;size_t n;
    (void)url;bwl_http_post=0;
    if(!bwl_make_csrf()){fputs("{\"ok\":false,\"error\":\"unavailable\"}",stream);return;}
    valid=bwl_parse(nvram_safe_get(BWL_CONFIG_KEY),&cfg)&&bwl_format(&cfg,config);
    if(!valid){fputs("{\"ok\":false,\"error\":\"invalid_config\"}",stream);return;}
    snprintf(revision,sizeof(revision),"%08x",bwl_revision(config));
    if(post){
        action=get_cgi("action");csrf=get_cgi("csrf");rev=get_cgi("revision");
        if(!get_login_safe()||!csrf||strcmp(csrf,bwl_http_csrf))error="forbidden";
        else if(!rev||strcmp(rev,revision))error="conflict";
        else if(get_ap_mode())error="unsupported_mode";
        else if(access(BWL_TC,X_OK)||access(BWL_EXEC,X_OK))error="unavailable";
        else if(!bwl_rate(get_cgi("up"),&up)||!bwl_rate(get_cgi("down"),&down))error="invalid_rate";
        else if(action&&!strcmp(action,"device")){
            if(!bwl_set_device(&cfg,get_cgi("mac"),up,down))error="invalid_device_or_full";
        }else if(action&&!strcmp(action,"guest")){
            value=get_cgi("band");
            if(value&&(!strcmp(value,"2")||!strcmp(value,"5"))){i=!strcmp(value,"2")?0:1;cfg.guest_up[i]=up;cfg.guest_down[i]=down;}
            else error="invalid_band";
        }else error="invalid_action";
        if(!error){
            char next[BWL_CONFIG_SIZE];
            if(!bwl_format(&cfg,next))error="invalid_config";
            else if(strcmp(config,next)){
                /* 单个配置项整体写入，其他设备的规则不受本次修改影响。 */
                if(nvram_set(BWL_CONFIG_KEY,next))error="save_failed";
                else {strcpy(config,next);snprintf(revision,sizeof(revision),"%08x",bwl_revision(config));nvram_commit_safe();changed=1;}
            }
            if(!error){
                pid_t child=0;char *args[]={BWL_EXEC,"start",NULL};
                bwl_previous_generation(previous_generation);
                if(_eval(args,NULL,0,&child))error="apply_start_failed";
                else changed=1; /* 相同配置重试也必须等待新的运行结果。 */
            }
        }
    }
    if(error){fprintf(stream,"{\"ok\":false,\"error\":\"%s\"}",error);return;}
    snprintf(status,sizeof(status),"{\"state\":\"%s\",\"reason\":\"none\",\"revision\":\"%s\"}",get_ap_mode()?"unsupported_mode":(cfg.count||cfg.guest_up[0]||cfg.guest_down[0]||cfg.guest_up[1]||cfg.guest_down[1])?"pending":"disabled",revision);
    if(!changed&&(f=fopen(BWL_RUNTIME "/status.json","r"))){
        char saved[512];n=fread(saved,1,sizeof(saved)-1,f);fclose(f);saved[n]=0;
        if(n>2&&saved[0]=='{'&&strchr(saved,'}')&&strstr(saved,"\"state\":"))strcpy(status,saved);
    }
    fprintf(stream,"{\"ok\":true,\"csrf\":\"%s\",\"revision\":\"%s\",\"previous_generation\":\"%s\",\"router_mode\":%s,\"available\":%s,\"max_devices\":%u,\"status\":%s,\"guest\":[{\"band\":2,\"up\":%u,\"down\":%u},{\"band\":5,\"up\":%u,\"down\":%u}],\"devices\":[",
        bwl_http_csrf,revision,previous_generation,get_ap_mode()?"false":"true",access(BWL_TC,X_OK)==0&&access(BWL_EXEC,X_OK)==0?"true":"false",BWL_MAX_DEVICES,status,cfg.guest_up[0],cfg.guest_down[0],cfg.guest_up[1],cfg.guest_down[1]);
    for(i=0;i<cfg.count;i++)fprintf(stream,"%s{\"mac\":\"%s\",\"up\":%u,\"down\":%u}",i?",":"",cfg.devices[i].mac,cfg.devices[i].up,cfg.devices[i].down);
    fputs("]}\n",stream);
}
