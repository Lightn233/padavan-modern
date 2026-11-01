"""Run the SCS disable/enable regression against current source; no device access."""
from pathlib import Path
import os,subprocess,tempfile
R=Path(__file__).resolve().parent;root=R.parents[1]
driver=root/'trunk/linux-4.4.x/drivers/net/wireless/mediatek/mt76x3'
def function(path,signature):
 text=path.read_text();a=text.index(signature);b=text.index('\n}',a)+2;return text[a:b]
source=(R/'reset-prefix.c').read_text()+function(driver/'common/cmm_cfg.c','INT SetSCSEnable_Proc(')+function(driver/'phy/mt_phy.c','INT MTSmartCarrierSense(')+(R/'reset-suffix.c').read_text()
with tempfile.TemporaryDirectory(prefix='scs-reset-test-') as d:
 p=Path(d);(p/'test.c').write_text(source)
 subprocess.run([os.environ.get('CC','cc'),'-std=gnu99','-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer',str(p/'test.c'),'-o',str(p/'test')],check=True)
 subprocess.run([str(p/'test')],check=True)
