"""Offline regression of the current SCS function; no network/device actions."""
from pathlib import Path
import argparse, subprocess, tempfile
p=argparse.ArgumentParser()
p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2])
p.add_argument('--cc',default='cc')
p.add_argument('--qemu',default=None)
p.add_argument('--fixtures',type=Path,default=Path(__file__).resolve().parent)
a=p.parse_args()
source=(a.root/'trunk/linux-4.4.x/drivers/net/wireless/mediatek/mt76x3/phy/mt_phy.c').read_text()
start=source.index('INT MTSmartCarrierSense(RTMP_ADAPTER *pAd)')
body=source[start:source.index('\n}',start)+2]
assert 'div64_u64' in body and 'RxRatio = TotalTp ?' in body, 'Run against the guarded implementation.'
with tempfile.TemporaryDirectory(prefix='scs-regression-') as temp:
    path=Path(temp);test=path/'test.c';exe=path/'test'
    test.write_text((a.fixtures/'scs-test-prefix.c').read_text()+'\n'+body+'\n'+(a.fixtures/'scs-test-suffix.c').read_text())
    flags=['-static'] if a.qemu else ['-fsanitize=address,undefined','-fno-omit-frame-pointer']
    subprocess.run([a.cc,'-std=gnu99','-O1','-g',*flags,str(test),'-o',str(exe)],check=True)
    subprocess.run([a.qemu,str(exe)] if a.qemu else [str(exe)],check=True,timeout=30)
