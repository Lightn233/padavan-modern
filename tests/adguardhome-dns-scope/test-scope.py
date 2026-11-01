from pathlib import Path
import json,os,subprocess,tempfile
R=Path(__file__).resolve().parent;root=R.parents[1];S=root/'trunk/user/adguardhome/adguardhome.sh'
subprocess.run(['busybox','ash','-n',str(S)],check=True)
source=S.read_text();fn=source[source.index('set_adg_ipv6_scope_rule()'):source.index('\nset_adg_rules()')]
cases=[('gua','    inet6 2001:db8:1::1/64 scope global\n','    inet6 fe80::1/64 scope link\n',0,True),('ula','    inet6 fd42::1/64 scope global\n','    inet6 fe80::1/64 scope link\n',0,True),('no-global','','    inet6 fe80::1/64 scope link\n',0,False),('tentative','    inet6 2001:db8::1/64 scope global tentative\n','    inet6 fe80::1/64 scope link\n',0,False),('deprecated','    inet6 2001:db8::1/64 scope global deprecated\n','    inet6 fe80::1/64 scope link\n',0,False),('failed-dad','    inet6 2001:db8::1/64 scope global dadfailed\n','    inet6 fe80::1/64 scope link\n',0,False),('no-link','    inet6 2001:db8::1/64 scope global\n','',0,False),('install-fails','    inet6 2001:db8::1/64 scope global\n','    inet6 fe80::1/64 scope link\n',7,True)]
results=[]
with tempfile.TemporaryDirectory(prefix='rm2100-scope-test-') as td:
 t=Path(td);(t/'ip').write_text('#!/bin/sh\ncase "$*" in *"scope global") printf "%s" "$GLOBAL";; *"scope link") printf "%s" "$LINK";; *) exit 8;; esac\n');(t/'ip6tables').write_text('#!/bin/sh\nprintf "%s\\n" "$*" >>"$CALLS"\nexit "$FAIL"\n')
 (t/'ip').chmod(0o700);(t/'ip6tables').chmod(0o700)
 for name,g,l,fail,expect in cases:
  calls=t/'calls';calls.write_text('');env={**os.environ,'PATH':str(t)+':'+os.environ['PATH'],'GLOBAL':g,'LINK':l,'FAIL':str(fail),'CALLS':str(calls)}
  mocks='''ip() { case "$*" in *"scope global") printf "%s" "$GLOBAL";; *"scope link") printf "%s" "$LINK";; *) return 8;; esac; }
ip6tables() { printf "%s\\n" "$*" >>"$CALLS"; return "$FAIL"; }
'''
  p=subprocess.run(['busybox','ash','-c',mocks+fn+'\nset_adg_ipv6_scope_rule\n'],env=env,capture_output=True,text=True)
  logged=calls.read_text();assert bool(logged)==expect,(name,logged);assert p.returncode==(1 if fail else 0),(name,p.stderr)
  if expect:assert '-A ADGHOME ! -s fe80::/10 -d fe80::1 -p udp --dport 5335 -j DNAT --to-destination [' in logged
  results.append({'name':name,'passed':True})
print(json.dumps({'passed':True,'cases':results}))
