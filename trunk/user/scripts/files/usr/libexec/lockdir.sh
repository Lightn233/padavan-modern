#!/bin/sh
# FD 9 is reserved for short maintenance operations. Keep the lock inode:
# unlinking it would allow a second owner while another waiter uses the old one.
# Long-lived children must close inherited descriptors 8 and 9 before exec.
lockdir_take()
{
    local lock_path=$1 lock_wait=${2:-0} lock_tries=0
    mkdir -p -m 700 "$lock_path" || return 2
    exec 9>>"$lock_path/.lock" || return 2
    while ! busybox flock -n 9; do
        if [ "$lock_tries" -ge "$lock_wait" ]; then
            exec 9>&-
            return 1
        fi
        lock_tries=$((lock_tries+1))
        sleep 1
    done
    if ! printf '%s\n' "$$" > "$lock_path/pid"; then
        busybox flock -u 9
        exec 9>&-
        return 2
    fi
}

lockdir_release()
{
    [ "$(cat "$1/pid" 2>/dev/null)" != "$$" ] || rm -f "$1/pid"
    busybox flock -u 9
    exec 9>&-
}

lockdir_available()
(
    [ -d "$1" ] || exit 0
    exec 9>>"$1/.lock" || exit 2
    busybox flock -n 9
)
