#ifndef PADAVAN_UI_STATUS_HTTP_H
#define PADAVAN_UI_STATUS_HTTP_H

#include <wifi_runtime_status.h>

/* 仅存 RAM。状态接口不触发重启、提交配置、扫描或无线控制。 */
#define UI_OPERATION_FILE "/tmp/httpd-ui-operation"

static void ui_read_uuid(const char *path, char out[37])
{
    FILE *fp = fopen(path, "r");
    char value[38] = {0};
    size_t i;
    out[0] = '\0';
    if (!fp) return;
    if (!fgets(value, sizeof(value), fp)) value[0] = '\0';
    fclose(fp);
    if (strlen(value) < 36) return;
    for (i = 0; i < 36; ++i) {
        if ((i == 8 || i == 13 || i == 18 || i == 23) ? value[i] != '-' : !isxdigit((unsigned char)value[i]))
            return;
    }
    memcpy(out, value, 36);
    out[36] = '\0';
}

static int ui_pending_count(void)
{
    DIR *dir = opendir(DIR_RC_INCOMPLETE);
    struct dirent *entry;
    int count = 0;
    if (!dir) return -1;
    while ((entry = readdir(dir))) {
        if (entry->d_name[0] != '.') ++count;
    }
    closedir(dir);
    return count;
}

static void ui_wifi_json(webs_t wp, int band)
{
    struct iwreq wrq;
    struct padavan_wifi_runtime state;
    const char *ifname = IFNAME_2G_MAIN;
    int radio = nvram_get_int("rt_radio_x");
    int known = 0;
#if BOARD_HAS_5G_RADIO
    if (band == 5) {
        ifname = IFNAME_5G_MAIN;
        radio = nvram_get_int("wl_radio_x");
#ifdef USE_IWPRIV_RADIO_5G
        if (nvram_match("mlme_radio_wl", "0")) radio = 0;
#endif
    }
#else
    if (band == 5) radio = 0;
#endif
#if defined(USE_IWPRIV_RADIO_2G) || defined(USE_RT3352_MII)
    if (band == 2 && nvram_match("mlme_radio_rt", "0")) radio = 0;
#endif
    memset(&state, 0, sizeof(state));
    if (!radio) {
        state.state = PADAVAN_WIFI_DISABLED;
        known = 1;
    }
#ifdef BOARD_WIFI5_POLICY
    else {
        memset(&wrq, 0, sizeof(wrq));
        wrq.u.data.pointer = &state;
        wrq.u.data.length = sizeof(state);
        wrq.u.data.flags = PADAVAN_OID_WIFI_RUNTIME;
        if (wl_ioctl(ifname, RT_PRIV_IOCTL, &wrq) == 0 &&
            wrq.u.data.length == sizeof(state) && state.magic == PADAVAN_WIFI_RUNTIME_MAGIC &&
            state.state <= PADAVAN_WIFI_DISABLED) {
            known = 1;
            padavan_wifi_runtime_clamp(&state);
        } else memset(&state, 0, sizeof(state));
    }
#else
    (void)wrq;
    (void)ifname;
#endif
    websWrite(wp, "{\"known\":%s,\"state\":%u,\"channel\":%u,\"width\":%u,\"total\":%u,\"elapsed\":%u}",
              known ? "true" : "false", state.state, state.channel, state.width, state.cac_total, state.cac_elapsed);
}

static void do_ui_status(const char *url, FILE *stream)
{
    char boot[37], operation[37];
    struct sysinfo info;
    int mode = nvram_get_int("sw_mode");
    (void)url;
    memset(&info, 0, sizeof(info));
    sysinfo(&info);
    ui_read_uuid("/proc/sys/kernel/random/boot_id", boot);
    ui_read_uuid(UI_OPERATION_FILE, operation);
    websWrite(stream, "{\"version\":1,\"boot\":\"%s\",\"operation\":\"%s\",\"mode\":%d,\"uptime\":%ld,\"pending\":%d,\"wifi5\":",
              boot, operation, mode, info.uptime, ui_pending_count());
    ui_wifi_json(stream, 5);
    websWrite(stream, ",\"wifi2\":");
    ui_wifi_json(stream, 2);
    websWrite(stream, "}\n");
}

static int ej_ui_operation_baseline(int eid, webs_t wp, int argc, char **argv)
{
    char boot[37];
    (void)eid; (void)argc; (void)argv;
    ui_read_uuid("/proc/sys/kernel/random/boot_id", boot);
    websWrite(wp, "var uiBootBefore = \"%s\";\n", boot);
    return 0;
}

static int ej_ui_operation_prepare(int eid, webs_t wp, int argc, char **argv)
{
    char boot[37], operation[37];
    FILE *fp;
    unsigned int wifi = 0;
    (void)eid; (void)argc; (void)argv;
    ui_read_uuid("/proc/sys/kernel/random/boot_id", boot);
    ui_read_uuid("/proc/sys/kernel/random/uuid", operation);
    if (operation[0]) {
        fp = fopen(UI_OPERATION_FILE ".new", "w");
        if (!fp) operation[0] = '\0';
        else {
            int ok = fprintf(fp, "%s\n", operation) == 37;
            if (fclose(fp) != 0) ok = 0;
            if (!ok || rename(UI_OPERATION_FILE ".new", UI_OPERATION_FILE) != 0) {
                unlink(UI_OPERATION_FILE ".new");
                operation[0] = '\0';
            }
        }
    }
    if (restart_needed_bits & EVM_RESTART_WIFI5) wifi |= 1;
    if (restart_needed_bits & EVM_RESTART_WIFI2) wifi |= 2;
    websWrite(wp, "<script>apply_operation({\"version\":1,\"boot\":\"%s\",\"id\":\"%s\",\"reboot\":%s,\"wifi\":%u,\"mode\":%d});</script>\n",
              boot, operation, (restart_needed_bits & EVM_RESTART_REBOOT) ? "true" : "false", wifi, nvram_get_int("sw_mode"));
    return 0;
}
#endif
