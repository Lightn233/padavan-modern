"""Execute the production receive-reorder timeout function with sequence/clock fixtures."""
from pathlib import Path
import os,subprocess,tempfile
R=Path(__file__).resolve().parent
root=R.parents[1]
source=(root/'trunk/linux-4.4.x/drivers/net/wireless/mediatek/mt76x3/common/ba_action.c').read_text()
start=source.index('void ba_flush_reordering_timeout_mpdus(');end=source.index('\n\n/* ',start)
assert 'NdisGetSystemUpTime(&mpdu_blk->rx_time);' in source
text=(R/'prefix.c').read_text()+'\n'+source[start:end]+'\n'+(R/'suffix.c').read_text()
with tempfile.TemporaryDirectory(prefix='mt7603-reorder-') as temp:
 p=Path(temp);(p/'test.c').write_text(text)
 for monitor in [False,True]:
  exe=p/('monitor' if monitor else 'plain')
  command=[os.environ.get('CC','cc'),'-std=gnu99','-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer','-no-pie']
  if monitor:command+=['-DCONFIG_BA_REORDER_MONITOR']
  subprocess.run(command+[str(p/'test.c'),'-o',str(exe)],check=True)
  subprocess.run([str(exe)],check=True)
