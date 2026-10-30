#ifndef PADAVAN_WAN_DIAGNOSTIC_H
#define PADAVAN_WAN_DIAGNOSTIC_H

enum ui_wan_issue {
    UI_WAN_NONE = 0,
    UI_WAN_ACCOUNT_BUSY = 1,
    UI_WAN_AUTH_REJECTED = 2,
    UI_WAN_NO_PADO = 3,
    UI_WAN_NO_PADS = 4,
    UI_WAN_PEER_CLOSED = 5,
    UI_WAN_NEGOTIATION_TIMEOUT = 6
};

/* 只返回固定错误类型；运营商原文中的账号、服务器文字不会传给网页。 */
static int ui_ppp_issue_line(const char *line, int previous)
{
    if (strstr(line, "authentication succeeded") || strstr(line, "local  IP address") ||
        strstr(line, "pppd ") || strstr(line, "Terminating on signal")) return UI_WAN_NONE;
    if (strstr(line, "login limit") && strstr(line, "exceeded")) return UI_WAN_ACCOUNT_BUSY;
    if (strstr(line, "authentication failed"))
        return previous == UI_WAN_ACCOUNT_BUSY ? previous : UI_WAN_AUTH_REJECTED;
    if (strstr(line, "Timeout waiting for PADO")) return UI_WAN_NO_PADO;
    if (strstr(line, "Timeout waiting for PADS")) return UI_WAN_NO_PADS;
    if (strstr(line, "LCP: timeout") || strstr(line, "IPCP: timeout")) return UI_WAN_NEGOTIATION_TIMEOUT;
    if (strstr(line, "LCP terminated by peer") || strstr(line, "PADT received"))
        return previous ? previous : UI_WAN_PEER_CLOSED;
    return previous;
}

static int ui_ppp_recent_issue(void)
{
    FILE *fp;
    long pid;
    char marker[48], process[64], line[2048];
    int issue = UI_WAN_NONE;
    long size;
    fp = fopen("/var/run/ppp-wan0.pid", "r");
    if (!fp) return UI_WAN_NONE;
    if (fscanf(fp, "%ld", &pid) != 1) pid = 0;
    fclose(fp);
    if (pid <= 1 || pid > 4194304) return UI_WAN_NONE;
    snprintf(process, sizeof(process), "/proc/%ld/comm", pid);
    fp = fopen(process, "r");
    if (!fp) return UI_WAN_NONE;
    if (!fgets(line, sizeof(line), fp)) line[0] = '\0';
    fclose(fp);
    if (strcmp(line, "pppd\n")) return UI_WAN_NONE;
    snprintf(marker, sizeof(marker), "pppd[%ld]:", pid);
    fp = fopen("/tmp/syslog.log", "r");
    if (!fp) return UI_WAN_NONE;
    /* 限制每次读取量，避免管理页面轮询反复扫描整份日志。 */
    if (fseek(fp, 0, SEEK_END) != 0 || (size = ftell(fp)) < 0) {fclose(fp); return UI_WAN_NONE;}
    if (size > 65536) {
        fseek(fp, -65536, SEEK_END);
        while (fgets(line, sizeof(line), fp) && !strchr(line, '\n')) {}
    } else rewind(fp);
    while (fgets(line, sizeof(line), fp)) {
        char *message = strstr(line, marker);
        if (message) issue = ui_ppp_issue_line(message + strlen(marker), issue);
        if (!strchr(line, '\n')) {
            while (fgets(line, sizeof(line), fp) && !strchr(line, '\n')) {}
        }
    }
    fclose(fp);
    return issue;
}
#endif
