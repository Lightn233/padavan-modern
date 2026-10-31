"""在 Linux 本地运行界面回归；只监听 127.0.0.1，不访问路由器。"""
from pathlib import Path
import argparse,shutil,subprocess,tempfile,tarfile,io,time,urllib.request,json
P=Path(__file__).resolve().parent;REPO=P.parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--baseline',default='5ffd6cc6433f58196d7ef23ac42bafc9c41734c9');parser.add_argument('--report',type=Path,default=Path('/tmp/padavan-webui-results'));args=parser.parse_args()
assert (P/'node_modules/jsdom').is_dir(),'请先在 tests/webui-modern 执行 npm ci'
version=tuple(map(int,subprocess.check_output(['node','-p','process.versions.node'],text=True).strip().split('.')))
assert (version[0]==24 and version>=(24,15,0)) or version[0]>=26,'需要 Node.js 24.15+ LTS（或 26+），不支持系统旧版 Node 20'
# 端口已占用时不能借用其他服务，避免测试写到错误进程。
import socket
with socket.socket() as s:s.bind(('127.0.0.1',8767))
with tempfile.TemporaryDirectory(prefix='padavan-webui-') as tmp:
 R=Path(tmp);web='trunk/user/www/n56u_ribbon_fixed';shutil.copytree(REPO/web,R/'candidate'/web)
 # 只展开网页和 HTTPD 基线；不复制工具链、下载包或整份仓库。
 data=subprocess.check_output(['git','-C',str(REPO),'archive',args.baseline,web,'trunk/user/httpd/src/web_ex.c'])
 with tarfile.open(fileobj=io.BytesIO(data)) as archive:
  for item in archive.getmembers():
   if not item.isfile():continue
   dst=(R/'baseline'/item.name).resolve();assert (R/'baseline').resolve() in dst.parents
   dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes(archive.extractfile(item).read())
 fixture=R/'fixtures';fixture.mkdir()
 for name,src in {'CN.dict':'trunk/user/www/dict/CN.dict','EN.header':'trunk/user/www/dict/EN.header','EN.footer':'trunk/user/www/dict/EN.footer','defaults.c':'trunk/user/shared/src/defaults.c','initial_web_hook.c':'trunk/user/httpd/src/initial_web_hook.c'}.items():
  source=REPO/src
  if name=='defaults.c' and not source.exists():source=REPO/'trunk/user/rc/src/defaults.c'
  shutil.copyfile(source,fixture/name)
 for name in ['mock_server.py','test-dom.cjs','test-functional.cjs','test-harness.html','test_controller.cjs']:shutil.copyfile(P/name,R/name)
 (R/'test-tools').mkdir();(R/'test-tools/node_modules').symlink_to(P/'node_modules',target_is_directory=True)
 server=subprocess.Popen(['python3',str(R/'mock_server.py')],stdout=subprocess.DEVNULL)
 failed=False
 try:
  for _ in range(50):
   if server.poll() is not None:raise RuntimeError('模拟服务器启动失败')
   try:
    urllib.request.urlopen('http://127.0.0.1:8767/lab/results',timeout=.2).close();break
   except OSError:time.sleep(.1)
  args.report.mkdir(parents=True,exist_ok=True)
  # 直接编译源码中的状态序列化函数，避免模拟服务器掩盖真实接口格式问题。
  status=subprocess.run(['python3',str(P/'test-status-json.py'),'--source',str(REPO/'trunk/user/httpd/src/web_ex.c'),'--baseline',str(R/'baseline/trunk/user/httpd/src/web_ex.c'),'--report',str(args.report/'status-json-native.json')],capture_output=True,text=True,timeout=60)
  (args.report/'status-json-native.log').write_text(status.stdout+status.stderr);failed|=status.returncode!=0
  for name in ['test_controller.cjs','test-dom.cjs','test-functional.cjs']:
   result=subprocess.run(['node',str(R/name)],cwd=R,capture_output=True,text=True,timeout=240)
   (args.report/(name+'.log')).write_text(result.stdout+result.stderr);failed|=result.returncode!=0
  for name in ['dom-results.json','functional-results.json']:
   if (R/name).exists():shutil.copyfile(R/name,args.report/name)
 finally:server.terminate();server.wait(timeout=5)
 print('FAIL' if failed else 'PASS',str(args.report));raise SystemExit(1 if failed else 0)
