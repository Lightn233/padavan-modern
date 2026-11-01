#!/usr/bin/env python3
"""Run the production address-key selector against address-state transitions."""
from pathlib import Path
import re,subprocess
root=Path(__file__).resolve().parents[2]
source=(root/'trunk/user/adguardhome/adguardhome_watch.sh').read_text()
block=source.split('address_key=$(ip addr show dev br0',1)[1].split('sort | md5sum',1)[0]
program=re.search(r"awk '([^']+)'",block)[1]
def key(text):return subprocess.check_output(['busybox','awk',program],input=text.encode())
active='    inet6 2001:db8::1/64 scope global \n       valid_lft 3600sec preferred_lft 1800sec\n'
for flag in ['tentative','deprecated','dadfailed']:
 assert key(active)!=key(active.replace('scope global ','scope global '+flag+' ')),flag
assert key(active)==key(active.replace('3600sec','3599sec').replace('1800sec','1799sec'))
assert key(active)!=key(active.replace('2001:db8::1','2001:db8::2'))
assert key('    inet 192.0.2.1/24 brd 192.0.2.255 scope global br0\n')
print('Six production address-state checks passed')
