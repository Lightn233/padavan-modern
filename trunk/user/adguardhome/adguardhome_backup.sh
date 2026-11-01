#!/bin/sh
# 维护入口固定目录、持有服务锁；不启动或重启 AdGuardHome。
set -eu
umask 077
. "${RM_LOCK_LIBRARY:-/usr/libexec/lockdir.sh}"
root=/media/mtd_rwfs/AdGuardHome
lock=/tmp/.adguardhome_service_lock
helper=/usr/bin/adguardhome-backup
reply() { printf '{"state":"%s"}\n' "$1"; }
case "${1:-}" in status|clean) ;; *) reply invalid; exit 2 ;; esac
[ -x "$helper" ] || { reply unavailable; exit 0; }
awk '$2=="/media/mtd_rwfs" && $3=="ubifs" && (","$4",")~/,rw,/ {ok=1} END {exit !ok}' /proc/mounts || { reply unavailable; exit 0; }
if [ "$1" = status ]; then
    lockdir_take "$lock" 0 || { reply busy; exit 0; }
    trap 'lockdir_release "$lock"' 0
    "$helper" status || :
    exit 0
fi
token=${2:-}
case "$token" in ''|*[!0-9a-f-]*) reply invalid; exit 2 ;; esac
[ "${#token}" -le 511 ] || { reply invalid; exit 2; }
lockdir_take "$lock" 0 || { reply busy; exit 0; }
trap 'rm -f "$lock/result"; lockdir_release "$lock"' 0
trap 'exit 1' 1 2 15
set -- $(pidof AdGuardHome || :)
[ "$#" = 1 ] || { reply service-not-ready; exit 0; }
pid=$1
[ ! -e /tmp/adguardhome-state/manual-stop ] || { reply busy; exit 0; }
for path in "$root"/agh-update*; do [ ! -e "$path" ] || { reply updating; exit 0; }; done
# 仅允许已经完成现机运行核验的当前程序清理其回退备份。
hash=$(md5sum "$root/AdGuardHome" | cut -d' ' -f1)
[ "$hash" = "$(cat "$root/.validated-current" 2>/dev/null || :)" ] || { reply unverified; exit 0; }
if ! "$helper" clean "$token" "$pid" > "$lock/result"; then
    [ -s "$lock/result" ] || reply failed > "$lock/result"
fi
cat "$lock/result"
rm -f "$lock/result"
