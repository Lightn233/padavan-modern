#ifndef PADAVAN_WIFI_RUNTIME_STATUS_H
#define PADAVAN_WIFI_RUNTIME_STATUS_H

/* 固定长度的只读状态协议；不包含指针，不修改射频、DFS 或发射条件。 */
#define PADAVAN_OID_WIFI_RUNTIME 0x07e1
#define PADAVAN_WIFI_RUNTIME_MAGIC 0x57525331U
#define PADAVAN_WIFI_UNKNOWN 0
#define PADAVAN_WIFI_STARTING 1
#define PADAVAN_WIFI_CAC 2
#define PADAVAN_WIFI_SWITCHING 3
#define PADAVAN_WIFI_READY 4
#define PADAVAN_WIFI_DISABLED 5

struct padavan_wifi_runtime {
    unsigned int magic;
    unsigned int state;
    unsigned int channel;
    unsigned int width;
    unsigned int cac_total;
    unsigned int cac_elapsed;
};

/* 瞬时快照可能跨过一轮计数更新；只约束显示，不影响检测计时。 */
static inline void padavan_wifi_runtime_clamp(struct padavan_wifi_runtime *s)
{
    if (s->cac_elapsed > s->cac_total)
        s->cac_elapsed = s->cac_total;
    if (s->cac_total > 3600) {
        s->cac_total = 0;
        s->cac_elapsed = 0;
    }
}
#endif
