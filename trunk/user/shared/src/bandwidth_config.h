/* 访客总量与设备限速共用的配置格式；速率单位为 kbit/s，0 表示不限速。 */
#ifndef PADAVAN_BANDWIDTH_CONFIG_H
#define PADAVAN_BANDWIDTH_CONFIG_H
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#define BWL_MAX_DEVICES 32
#define BWL_MAX_RATE 1000000U
#define BWL_CONFIG_SIZE 2048
#define BWL_DEFAULT "1|0,0|0,0"
#define BWL_CONFIG_KEY "bandwidth_rules"
#ifndef BWL_RUNTIME
#define BWL_RUNTIME "/var/run/bandwidth"
#endif
#ifndef BWL_TC
#define BWL_TC "/bin/tc"
#endif
#ifndef BWL_IP
#define BWL_IP "/bin/ip"
#endif
struct bwl_device { char mac[18]; unsigned up, down; };
struct bwl_config {
    unsigned guest_up[2], guest_down[2], count;
    struct bwl_device devices[BWL_MAX_DEVICES];
};
static inline int bwl_rate(const char *s, unsigned *value)
{
    unsigned n=0;
    const unsigned char *p=(const unsigned char *)s;
    if (!p || !*p) return 0;
    for (; *p; ++p) {
        if (*p<'0' || *p>'9' || n>(BWL_MAX_RATE-(unsigned)(*p-'0'))/10U) return 0;
        n=n*10U+(unsigned)(*p-'0');
    }
    *value=n; return 1;
}
static inline int bwl_hex(unsigned char c)
{
    if(c>='0'&&c<='9')return c-'0';
    if(c>='A'&&c<='F')return c-'A'+10;
    if(c>='a'&&c<='f')return c-'a'+10;
    return -1;
}
static inline int bwl_mac(const char *s, char out[18])
{
    unsigned char b[6];
    unsigned i,any=0;
    if(!s||strlen(s)!=17)return 0;
    for(i=0;i<6;i++){
        int a=bwl_hex(s[i*3]),c=bwl_hex(s[i*3+1]);
        if(a<0||c<0||(i<5&&s[i*3+2]!=':'))return 0;
        b[i]=(unsigned char)(a*16+c);any|=b[i];
    }
    if(!any||(b[0]&1))return 0;
    snprintf(out,18,"%02X:%02X:%02X:%02X:%02X:%02X",b[0],b[1],b[2],b[3],b[4],b[5]);
    return 1;
}
static inline int bwl_pair(char *s, unsigned *up, unsigned *down)
{
    char *p=strchr(s,',');
    if(!p)return 0;
    *p++=0;
    return bwl_rate(s,up)&&bwl_rate(p,down);
}
static inline int bwl_parse(const char *s, struct bwl_config *out)
{
    char buf[BWL_CONFIG_SIZE],*p,*part;
    unsigned i;
    struct bwl_config next;
    if(!s||!*s)s=BWL_DEFAULT;
    if(strlen(s)>=sizeof(buf))return 0;
    memset(&next,0,sizeof(next));strcpy(buf,s);p=buf;
    part=strsep(&p,"|");if(strcmp(part,"1"))return 0;
    for(i=0;i<2;i++){
        part=strsep(&p,"|");
        if(!part||!bwl_pair(part,&next.guest_up[i],&next.guest_down[i]))return 0;
    }
    while(p){
        char *rates;
        struct bwl_device *d;
        if(next.count>=BWL_MAX_DEVICES)return 0;
        part=strsep(&p,"|");rates=strchr(part,',');if(!rates)return 0;*rates++=0;
        d=&next.devices[next.count];
        if(!bwl_mac(part,d->mac)||!bwl_pair(rates,&d->up,&d->down)||(!d->up&&!d->down))return 0;
        for(i=0;i<next.count;i++)if(!strcmp(d->mac,next.devices[i].mac))return 0;
        next.count++;
    }
    *out=next;return 1;
}
static inline int bwl_format(const struct bwl_config *cfg, char out[BWL_CONFIG_SIZE])
{
    unsigned i;int n;size_t used;
    if(cfg->count>BWL_MAX_DEVICES)return 0;
    n=snprintf(out,BWL_CONFIG_SIZE,"1|%u,%u|%u,%u",cfg->guest_up[0],cfg->guest_down[0],cfg->guest_up[1],cfg->guest_down[1]);
    if(n<0||n>=BWL_CONFIG_SIZE)return 0;
    used=(size_t)n;
    for(i=0;i<cfg->count;i++){
        n=snprintf(out+used,BWL_CONFIG_SIZE-used,"|%s,%u,%u",cfg->devices[i].mac,cfg->devices[i].up,cfg->devices[i].down);
        if(n<0||(size_t)n>=BWL_CONFIG_SIZE-used)return 0;
        used+=(size_t)n;
    }
    return 1;
}
static inline uint32_t bwl_revision(const char *s)
{
    uint32_t h=2166136261U;
    if(!s||!*s)s=BWL_DEFAULT;
    for(;*s;s++){h^=(unsigned char)*s;h*=16777619U;}
    return h;
}
static inline int bwl_set_device(struct bwl_config *cfg, const char *mac, unsigned up, unsigned down)
{
    char normalized[18];unsigned i;
    if(!bwl_mac(mac,normalized)||up>BWL_MAX_RATE||down>BWL_MAX_RATE)return 0;
    for(i=0;i<cfg->count;i++)if(!strcmp(normalized,cfg->devices[i].mac))break;
    if(!up&&!down){
        if(i<cfg->count){memmove(&cfg->devices[i],&cfg->devices[i+1],(cfg->count-i-1)*sizeof(cfg->devices[0]));cfg->count--;}
        return 1;
    }
    if(i==cfg->count){if(cfg->count>=BWL_MAX_DEVICES)return 0;cfg->count++;}
    strcpy(cfg->devices[i].mac,normalized);cfg->devices[i].up=up;cfg->devices[i].down=down;
    return 1;
}
#endif
