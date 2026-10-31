/* 只读管理状态；不启动服务，也不改写 AdGuardHome 配置。 */
#ifndef PADAVAN_AGH_STATUS_HTTP_H
#define PADAVAN_AGH_STATUS_HTTP_H

struct agh_web_address {
    char host[64];
    unsigned int port;
    int valid;
};

static int agh_port(const char *value, unsigned int *port)
{
    char *end;
    unsigned long n;
    if (!value || !isdigit((unsigned char)*value)) return 0;
    errno = 0;
    n = strtoul(value, &end, 10);
    if (errno || *end || n > 65535) return 0;
    *port = (unsigned int)n;
    return 1;
}

static void agh_address(char *value, struct agh_web_address *out)
{
    char *port, *host = value;
    struct in_addr a4;
    struct in6_addr a6;
    out->valid = 0;
    if (*host == '[') {
        char *end = strchr(++host, ']');
        if (!end || end[1] != ':') return;
        *end = 0;
        port = end + 2;
    } else {
        port = strrchr(host, ':');
        if (!port || strchr(host, ':') != port) return;
        *port++ = 0;
    }
    if (strlen(host) >= sizeof(out->host) ||
        (inet_pton(AF_INET, host, &a4) != 1 && inet_pton(AF_INET6, host, &a6) != 1) ||
        !agh_port(port, &out->port)) return;
    strcpy(out->host, host);
    out->valid = 1;
}

static void agh_web_config(FILE *fp, struct agh_web_address *out, int *secure)
{
    char line[512], value[128];
    int section = 0, enabled = 0, force = 0;
    unsigned int https_port = 0;
    size_t count = 0;
    memset(out, 0, sizeof(*out));
    *secure = 0;
    /* 只识别官方程序写出的 http/tls 标量；未知结构显示不可用，不猜端口。 */
    while (count++ < 16384 && fgets(line, sizeof(line), fp)) {
        char *key = line, *colon, *v, *end;
        size_t indent = strspn(line, " ");
        if (!strchr(line, '\n') && !feof(fp)) {
            int ch;
            /* 证书等长字段不影响入口；截断的地址字段不能当成有效值。 */
            while ((ch = fgetc(fp)) != '\n' && ch != EOF) { }
            if (section == 1 && indent == 2 && !strncmp(key + indent, "address:", 8)) out->valid = 0;
            continue;
        }
        key += indent;
        if (!*key || *key == '\n' || *key == '#') continue;
        colon = strchr(key, ':');
        if (!colon) continue;
        *colon = 0;
        if (!indent) {
            section = !strcmp(key, "http") ? 1 : !strcmp(key, "tls") ? 2 : 0;
            continue;
        }
        if (indent != 2 || !section) continue;
        v = colon + 1;
        v += strspn(v, " \t");
        end = v + strcspn(v, "\r\n");
        while (end > v && isspace((unsigned char)end[-1])) --end;
        *end = 0;
        if ((*v == '\'' || *v == '"') && end > v+1 && end[-1] == *v) { ++v; end[-1] = 0; }
        if (strlen(v) >= sizeof(value)) {
            if (section == 1 && !strcmp(key, "address")) out->valid = 0;
            continue;
        }
        strcpy(value, v);
        if (section == 1 && !strcmp(key, "address")) agh_address(value, out);
        if (section == 2) {
            if (!strcmp(key, "enabled")) enabled = !strcmp(value, "true");
            if (!strcmp(key, "force_https")) force = !strcmp(value, "true");
            if (!strcmp(key, "port_https")) agh_port(value, &https_port);
        }
    }
    if (out->valid && enabled && https_port && (force || !out->port)) {
        out->port = https_port;
        *secure = 1;
    }
    if (!out->port) out->valid = 0;
}

static int agh_port_listens(const char *path, unsigned int port)
{
    char line[512], address[65];
    unsigned int local_port, state;
    int found = 0;
    FILE *fp = fopen(path, "r");
    if (!fp) return 0;
    while (fgets(line, sizeof(line), fp)) {
        if (sscanf(line, " %*u: %64[0-9A-Fa-f]:%x %*s %x", address, &local_port, &state) == 3 &&
            state == 0x0a && local_port == port) { found = 1; break; }
    }
    fclose(fp);
    return found;
}

static void do_agh_status(const char *url, FILE *stream)
{
    struct agh_web_address web;
    struct ifreq ifr;
    char lan[INET_ADDRSTRLEN] = "";
    int fd, secure = 0, running = pids("AdGuardHome") != 0;
    FILE *fp = fopen("/etc/storage/AdGuardHome.yaml", "r");
    (void)url;
    memset(&web, 0, sizeof(web));
    if (fp) { agh_web_config(fp, &web, &secure); fclose(fp); }
    memset(&ifr, 0, sizeof(ifr));
    snprintf(ifr.ifr_name, sizeof(ifr.ifr_name), "%s", IFNAME_BR);
    fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (fd >= 0) {
        if (ioctl(fd, SIOCGIFADDR, &ifr) == 0)
            inet_ntop(AF_INET, &((struct sockaddr_in *)&ifr.ifr_addr)->sin_addr, lan, sizeof(lan));
        close(fd);
    }
    /* 输出仅含校验过的数字地址，不泄露密码、上游 DNS 或配置原文。 */
    fprintf(stream, "{\"mode\":%d,\"running\":%s,\"lan\":\"%s\",\"web\":{\"known\":%s,\"host\":\"%s\",\"port\":%u,\"scheme\":\"%s\",\"listening\":%s}}\n",
        nvram_get_int("sw_mode"), running ? "true" : "false", lan,
        web.valid ? "true" : "false", web.valid ? web.host : "", web.port,
        secure ? "https" : "http", running && web.valid &&
        (agh_port_listens("/proc/net/tcp", web.port) || agh_port_listens("/proc/net/tcp6", web.port)) ? "true" : "false");
}
#endif
