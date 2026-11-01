#include <stdlib.h>
#include <stdio.h>
#include <errno.h>
#include <string.h>
#include <fcntl.h> // fcntl
#include <unistd.h> // close
#include <sys/types.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/time.h>
#include <time.h>
#include <limits.h> // [LONG|INT][MIN|MAX]
#include <errno.h>  // errno
#include <unistd.h>
#include "dbapi.h"

//"list "
#define LIST_LEN 5

typedef enum {
    S2ISUCCESS = 0,
    S2IOVERFLOW,
    S2IUNDERFLOW,
    S2IINCONVERTIBLE
} STR2INT_ERROR;

static int ignore_result(dbclient *client);

static unsigned long long db_msec(void) {
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0)
        return 0;
    return (unsigned long long)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static int write_util(dbclient* client, int len, unsigned int delay) {
    int n, written = 0;
    unsigned long long start = db_msec();
    if (client->remote_fd < 0 || len < 0 || !client->buf || len > client->buf_max)
        return -1;
    while (written < len) {
        if (db_msec() - start >= delay)
            return -1;
        n = send(client->remote_fd, client->buf + written, len - written, MSG_NOSIGNAL);
        if (n > 0) {
            written += n;
            continue;
        }
        if (n == 0)
            return -1;
        if (errno == EINTR)
            continue;
        if (errno != EAGAIN && errno != EWOULDBLOCK)
            return -1;
        usleep(50);
    }
    return 0;
}

//TODO better for code reused
static int create_client_fd(char* sock_path) {
    int len, remote_fd;
    struct sockaddr_un remote;

    if(-1 == (remote_fd = socket(PF_UNIX, SOCK_STREAM, 0))) {
        //perror("socket");
        return -1;
    }

    remote.sun_family = AF_UNIX;
    strcpy(remote.sun_path, sock_path);
    len = strlen(remote.sun_path) + sizeof(remote.sun_family);
    if(-1 == connect(remote_fd, (struct sockaddr*)&remote, len)) {
        //perror("connect");
        close(remote_fd);
        return -1;
    }

    return remote_fd;
}

static int check_buf(dbclient* client, int len) {
    int clen;
    char *next;
    if (len < 0 || len > READ_MAX)
        return -1;
    clen = _max(len, BUF_MAX);
    if (client->buf && client->buf_max >= clen)
        return 0;
    next = realloc(client->buf, (size_t)clen + 1);
    if (!next)
        return -1;
    client->buf = next;
    client->buf_max = clen;
    return 0;
}

static int setnonblock(int fd) {
    int flags;

    flags = fcntl(fd, F_GETFL);
    if (flags < 0)
        return -1;
    flags |= O_NONBLOCK;
    return fcntl(fd, F_SETFL, flags);
}

static STR2INT_ERROR str2int(int *i, char *s, int base) {
  char *end;
  long  l;
  errno = 0;
  l = strtol(s, &end, base);

  if ((errno == ERANGE && l == LONG_MAX) || l > INT_MAX) {
    return S2IOVERFLOW;
  }
  if ((errno == ERANGE && l == LONG_MIN) || l < INT_MIN) {
    return S2IUNDERFLOW;
  }
  if (*s == '\0' || *end != '\0') {
    return S2IINCONVERTIBLE;
  }
  *i = l;
  return S2ISUCCESS;
}

int dbclient_start(dbclient* client) {
    char* socket_path = "/tmp/.skipd_server_sock";

    memset(client, 0, sizeof(dbclient));

    client->remote_fd = create_client_fd(socket_path);
    if(-1 == client->remote_fd) {
        system("/usr/sbin/skipd -d /etc/storage/db >/dev/null 2>&1 &");
        sleep(1);

        client->remote_fd = create_client_fd(socket_path);
        if(-1 == client->remote_fd) {
            return -1;
        }
    }

    if (setnonblock(client->remote_fd) < 0) {
        close(client->remote_fd);
        client->remote_fd = -1;
        return -1;
    }
    return 0;
}

int dbclient_bulk(dbclient* client, const char* command, const char* key, int nk, const char* value, int nv) {
    int n1,n2,nc;

    if (!command || !key || !value || strlen(command) > READ_MAX)
        return -1;
    nc = strlen(command);
    if(nk < 0 || nv < 0 || nk > READ_MAX || nv > READ_MAX ||
       nc + nk + nv + 3 > READ_MAX - HEADER_PREFIX) {
        return -1;
    }

    n1 = nc + nk + nv + 3;// replace key value\n
    if (check_buf(client, n1 + HEADER_PREFIX) < 0)
        return -1;
    n2 = sprintf(client->buf, "%s%07d %s ", MAGIC, n1, command);

    memcpy(client->buf + n2, key, nk);
    client->buf[n2+nk] = ' ';
    n2 += nk + 1;

    memcpy(client->buf + n2, value, nv);
    client->buf[n2+nv] = '\n';
    n2 += nv + 1;

    client->buf[n2] = '\0';

    if(0 == write_util(client, n1 + HEADER_PREFIX, 200)) {
        return ignore_result(client);
    }

    return -1;
}

static int read_util(dbclient* client, int len, unsigned int delay) {
    int n;
    unsigned long long start = db_msec();
    if (client->remote_fd < 0 || check_buf(client, len) < 0)
        return -1;
    client->buf_pos = 0;
    while (client->buf_pos < len) {
        if (db_msec() - start >= delay)
            return -3;
        n = recv(client->remote_fd, client->buf + client->buf_pos, len - client->buf_pos, 0);
        if (n > 0) {
            client->buf_pos += n;
            continue;
        }
        if (n == 0)
            return -1;
        if (errno == EINTR)
            continue;
        if (errno != EAGAIN && errno != EWOULDBLOCK)
            return -2;
        usleep(50);
    }
    return 0;
}

static int ignore_result(dbclient *client) {
    int n1, n2;
    char* magic = MAGIC;

    do {
        n1 = read_util(client, HEADER_PREFIX, 110);
        if(n1 < 0) {
            return n1;
        }

        if(0 != memcmp(client->buf, magic, MAGIC_LEN)) {
            //message error
            return -3;
        }

        client->buf[HEADER_PREFIX-1] = '\0';
        if(S2ISUCCESS != str2int(&n2, client->buf+MAGIC_LEN, 10)) {
            //message error
            return -4;
        }

        n1 = read_util(client, n2, 110);
        if(n1 < 0) {
            return n1;
        }
    } while(0);

    return 0;
}

static int parse_list_result(dbclient *client, char* prefix, webs_t wp, fn_db_parse fn) {
    int n1, n2;
    char *p1, *p2, *magic = MAGIC;

    for(;;) {
        n1 = read_util(client, HEADER_PREFIX, 110);
        if(n1 < 0) {
            return n1;
        }

        if(0 != memcmp(client->buf, magic, MAGIC_LEN)) {
            //message error
            return -3;
        }

        client->buf[HEADER_PREFIX-1] = '\0';
        if(S2ISUCCESS != str2int(&n2, client->buf+MAGIC_LEN, 10)) {
            //message error
            return -4;
        }

        n1 = read_util(client, n2, 510);
        if(n1 < 0) {
            return n1;
        }

        client->buf[n2] = '\0';

        if(NULL != strstr(client->buf, "__end__")) {
            break;
        }

        if (n2 <= LIST_LEN || strncmp(client->buf, "list ", LIST_LEN) != 0)
            return -4;
        p1 = client->buf + LIST_LEN;
        p2 = strchr(p1, ' ');
        if (!p2 || p2 == p1)
            return -4;
        *p2 = '\0';
        p2++;
        if(client->buf[n2-1] == '\n') {
            client->buf[n2-1] = '\0';
        }
        if(0 != (*fn)(client, wp, prefix, p1, p2)) {
            break;
        }
    }

    return 0;
}

int dbclient_list(dbclient* client, char* prefix, webs_t wp, fn_db_parse fn) {
    int n1, n2;

    if (!prefix || !fn || strlen(prefix) > READ_MAX - HEADER_PREFIX - 6)
        return -1;
    n1 = strlen("list") + strlen(prefix) + 2;//list prefix\n
    if (check_buf(client, n1 + HEADER_PREFIX) < 0)
        return -1;
    n2 = sprintf(client->buf, "%s%07d list %s\n", MAGIC, n1, prefix);
    if(0 != write_util(client, n1 + HEADER_PREFIX, 100)) {
        return -1;
    }

    return parse_list_result(client, prefix, wp, fn);
}

int dbclient_end(dbclient* client) {
    free(client->buf);
    client->buf = NULL;
    client->buf_max = client->buf_pos = 0;
    if (client->remote_fd >= 0)
        close(client->remote_fd);
    client->remote_fd = -1;

    return 0;
}

