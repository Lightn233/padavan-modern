"""仅监听回环的界面验收服务。固定模拟数据，不连接或改动真实路由器。"""
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from urllib.parse import urlparse,parse_qs,quote
import re,json,time,mimetypes,threading
R=Path(__file__).resolve().parent;W=R/'candidate/trunk/user/www/n56u_ribbon_fixed';H=R/'baseline/trunk/user/httpd/src/web_ex.c'
source=H.read_text(encoding='utf-8');defaults=dict(re.findall(r'\{\s*"([^"]+)"\s*,\s*"([^"\n]*)"', (R/'fixtures/defaults.c').read_text(encoding='utf-8')))
defaults.update({'sw_mode':'1','wan_route_x':'IP_Routed','wan_proto':'pppoe','lan_ipaddr':'192.168.2.1','lan_netmask':'255.255.255.0','lan_gateway':'192.168.2.1','lan_proto_x':'0','dhcp_start':'192.168.2.100','dhcp_end':'192.168.2.244','computer_name':'RM2100','productid':'RM2100','firmver_sub':'U9D4 · 界面验收','preferred_lang':'CN','wl_country_code':'AU','wl_channel':'60','wl_HT_BW':'3','wl_ssid':'ASUS_5G','rt_ssid':'ASUS','wl_wpa_psk':'test-only-password','rt_wpa_psk':'test-only-password','wl_gmode':'2','rt_gmode':'2','wl_auth_mode':'psk','wl_wpa_mode':'2','wl_crypto':'aes','wl_radio_x':'1','rt_radio_x':'1','link_internet':'1','wan_status_t':'Connected','http_username':'admin','http_passwd':'test-only-password','time_zone':'CST-8','wl_radio_date_x':'1111111','rt_radio_date_x':'1111111','wl_radio_time_x':'00002359','rt_radio_time_x':'00002359','wl_radio_time2_x':'00002359','rt_radio_time2_x':'00002359'})
translations={}
for name in ['EN.header','EN.footer','CN.dict']:
 for line in (R/'fixtures'/name).read_text(encoding='utf-8',errors='replace').splitlines():
  if '=' in line and not line.startswith('#'):k,v=line.split('=',1);translations[k]=v.replace('ZVMODELVZ','RM2100').replace('ZVCOPYRVZ','Padavan 开源社区')
unknown=set();posts=[];boot='11111111-1111-4111-8111-111111111111';operation='22222222-2222-4222-8222-222222222222'
def function(name,value):return 'function '+name+'(){return '+json.dumps(value,ensure_ascii=False)+';}\n'
def system():
 t=int(time.monotonic()*100);return {'cpu':dict(total=t*10,busy=t*2,user=t,nice=0,system=t,idle=t*8,iowait=0,irq=0,sirq=0),'lavg':'0.18 0.15 0.12','uptime':{'days':1,'hours':4,'minutes':32},'ram':{'total':448972,'free':326112,'used':122860,'cached':20000,'buffers':10000},'swap':{'total':0,'used':0},'wifi2':{'state':1,'guest':0},'wifi5':{'state':1,'guest':0},'logmt':1}
def hook(name,args,query):
 a=re.findall(r'"((?:[^"\\]|\\.)*)"',args)
 def nv(key):return defaults.get(key,'0' if key.endswith(('_num_x','_num','_num_t')) else '')
 if name in ('nvram_get_x','nvram_char_to_ascii'):return quote(nv(a[1]),safe='') if name=='nvram_char_to_ascii' else nv(a[1])
 if name=='nvram_get':return nv(a[0])
 if name=='nvram_match_x':return a[3] if nv(a[1])==a[2] else ''
 if name=='nvram_double_match_x':return a[-1] if nv(a[1])==a[2] and nv(a[4])==a[5] else ''
 if name=='get_parameter':return query.get(a[0],[''])[0]
 if name=='json_system_status':return json.dumps(system())
 if name=='ui_operation_baseline':return 'var uiBootBefore='+json.dumps(boot)+';'
 if name=='firmware_caps_hook':
  names=set(re.findall(r'function ((?:support_|found_|board_)[a-zA-Z0-9_]+)\(',source));overrides={'support_usb':0,'support_usb3':0,'support_num_usb':0,'support_storage':0,'support_btn_mode':0,'support_5g_11ax':0,'support_2g_11ax':0,'support_2g_inic_mii':0,'support_switch_type':10,'support_num_ephy':5,'support_max_conn':32768,'support_min_vlan':2,'support_5g_wid':4,'support_2g_wid':2,'support_5g_stream_tx':4,'support_5g_stream_rx':4,'support_2g_stream_tx':2,'support_2g_stream_rx':2,'board_boot_time':35}
  policies={x:{'rd':'CE' if x in ('JP','FR','EU') else 'FCC','channels':[[c,15 if c<65 or 100<=c<=128 else 7 if c!=165 else 1,12 if c<52 else 15 if c<=144 else 0] for c in list(range(36,65,4))+list(range(100,145,4))+[149,153,157,161,165]]} for x in ['US','AU','NO','FR','EU','TW','CN','KR','JP','DB']}
  return ''.join(function(n,overrides.get(n,1)) for n in names)+function('wifi5_policy',policies)
 if name=='login_state_hook':return function('login_ip_str','192.168.2.179')+function('login_mac_str','02:00:00:00:00:10')+function('login_safe',1)+function('login_ip','192.168.2.179')
 if name=='get_static_client':return '["192.168.2.101","02:00:00:00:00:11","Lab-phone","6","0","0"],["192.168.2.102","02:00:00:00:00:12","Lab-phone","6","0","0"]'
 if name=='wl_auth_list':return '"02:00:00:00:00:11":-52'
 if name in ('get_nvram_list','get_vpns_client','get_usb_share_list','get_all_accounts'):return ''
 if name=='get_permissions_of_account':return function('get_account_permissions',[])
 if name=='get_static_ccount':return '2'
 if name in ('disk_pool_mapping_info','available_disk_names_and_sizes'):
  names=re.findall(r'function (\w+)\(', (R/'fixtures/initial_web_hook.c').read_text());return ''.join(function(n,[]) for n in names)
 if name=='get_usb_ports_info':return function('get_usb_ports_num',0)+function('printer_manufacturers',[])+function('printer_models',[])+function('printer_serialn',[])+function('modem_devnum',[])+function('modem_manufacturers',[])+function('modem_models',[])+function('modem_serialn',[])+function('usb_device_type',[])
 if name=='get_ext_ports_info':return function('get_ata_support',0)+function('get_mmc_support',0)
 if name in ('wanlink','lanlink'):
  ns=re.findall(r'function ('+name+r'_\w+)\(',source);values={'status':0,'etherlink':'1000 Mbps, Full Duplex','apclilink':'','uptime':3600,'dltime':0,'type':'PPPoE','ip4_wan':'10.153.102.90','gw4_wan':'10.153.0.1','ip4_man':'0.0.0.0','gw4_man':'0.0.0.0','ip6_wan':'2001:db8:1::2/64','ip6_lan':'2001:db8:2::1/64','dns':'223.5.5.5<br/>119.29.29.29','mac':'02:00:00:00:00:01','bytes_rx':240000000,'bytes_tx':34000000,'issue':0}
  return ''.join(function(n,values.get(n[len(name)+1:],'0')) for n in ns)+function('wanlink_issue',0)
 if name=='uptime':return 'Sat Oct 31 2026 08:00:00'
 if name=='hardware_pins':return ''.join(function(n,1) for n in re.findall(r'function (support_(?:but|led)\w+)\(',source))
 if name=='openssl_util_hook':return function('openssl_util_found',1)
 if name=='nf_values':return function('nf_conntrack_count',42)
 if name=='scutclient_version':return function(name,'test-fixture')
 if name=='rules_count':return function('chnroute_count',0)+function('gfwlist_count',0)+function('adblock_count',0)
 if name in ('wl_bssid_2g','wl_bssid_5g'):return '02:00:00:00:00:01'
 if name=='abs_index_page':return '/index.asp'
 if name=='shown_language_option':return '<option value="CN" selected>简体中文</option><option value="EN">English</option>'
 if name=='bandwidth':
  if a and a[0]=='history':return 'var netdev="WAN",netdevs=["WAN"],daily_history=[],monthly_history=[],poll_next=60;'
  return 'var netdev="LAN",speed_history={LAN:{rx:[1000,2000,3000],tx:[200,300,400],avg_rx:2000,avg_tx:300,max_rx:3000,max_tx:400,total_rx:6000,total_tx:900}},data_period=60,poll_next=60;'
 if name=='netdev':return 'var netdevs={LAN:{rx:'+str(int(time.time()*100000))+',tx:'+str(int(time.time()*20000))+'}};'
 if name=='optional_service_support':return function('optional_service_support',{'available':True})
 if name=='get_AiDisk_status':return function('get_cifs_status',0)+function('get_ftp_status',0)+function('get_share_management_status',0)
 if name.endswith('_status'):return function(name,0)
 if name.startswith('openvpn_'):return function('openvpn_'+('cli' if 'cli' in name else 'srv')+'_cert_found',1)
 if name=='shadowsocks_status':return function(name,0)
 if name in ('wl_scan_5g','wl_scan_2g'):return '[]'
 if name=='get_flash_time':return 'var flash_time=60;'
 if name in ('nvram_dump','nvram_get_table_x','detect_internet','update_variables','asus_nvram_commit','notify_services','dump_syslog','rules_count','nvram_get_ddns','dump_eth_mib','ui_operation_prepare','adbyby_action','mentohust_action','scutclient_action','shadowsocks_action','update_action'):return ''
 unknown.add(name);return ''
def render(path,query=None):
 t=path.read_text(encoding='utf-8');query=query or {}
 t=re.sub(r'<%\s*(\w+)\((.*?)\);?\s*%>',lambda m:hook(m[1],m[2],query),t,flags=re.S)
 t=re.sub(r'<#([^#]+)#>',lambda m:translations.get(m[1],m[1]),t)
 if '<head' in t.lower():
  # 错误收集仅在本地模拟服务注入，不进入生产固件。
  probe='<script>window.__errors=[];addEventListener("error",function(e){if(e.message)__errors.push(e.message+" @ "+e.filename+":"+e.lineno);});addEventListener("unhandledrejection",function(e){__errors.push(String(e.reason));});</script>'
  t=re.sub(r'(<head[^>]*>)',r'\1'+probe,t,count=1,flags=re.I)
 return t
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def respond(self,body,kind='text/html',status=200):
  data=body.encode('utf-8') if isinstance(body,str) else body;self.send_response(status);self.send_header('Content-Type',kind+'; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(data)));self.end_headers()
  try:self.wfile.write(data)
  except (BrokenPipeError,ConnectionResetError):pass
 def do_GET(self):
  u=urlparse(self.path);path=u.path
  if path=='/':path='/index.asp'
  if path=='/lab/results':return self.respond(json.dumps({'unknown_hooks':sorted(unknown),'posts':posts},ensure_ascii=False),'application/json')
  if path=='/lab/baseline':
   base=(R/'baseline/trunk/user/www/n56u_ribbon_fixed').resolve();p=(base/parse_qs(u.query).get('path',['index.asp'])[0]).resolve()
   if base not in p.parents or not p.is_file():return self.respond('Not found','text/plain',404)
   return self.respond(render(p))
  if path=='/lab/pages-all':return self.respond(json.dumps([str(p.relative_to(W)).replace('\\','/') for p in W.rglob('*') if p.suffix in ('.asp','.htm','.html') and '<body' in p.read_text(encoding='utf-8').lower()]),'application/json')
  if path=='/lab/harness':return self.respond((R/'test-harness.html').read_text(encoding='utf-8'))
  if path=='/lab/pages':return self.respond(json.dumps([str(p.relative_to(W)).replace('\\','/') for p in W.rglob('*.asp') if '<body' in p.read_text(encoding='utf-8').lower() and ('name="form"' in p.read_text(encoding='utf-8') or p.name in ['index.asp','Advanced_System_Info.asp'])]),'application/json')
  if path=='/system_status.json':return self.respond(json.dumps(system()),'application/json')
  if path=='/internet_status.json':return self.respond('{"internet":"1","vpn":"0"}','application/json')
  if path=='/operation_status.json':return self.respond(json.dumps({'version':1,'boot':boot,'operation':operation,'mode':int(defaults['sw_mode']),'uptime':10000,'pending':0,'wifi5':{'known':True,'state':4,'channel':60,'width':160,'total':65,'elapsed':65},'wifi2':{'known':False,'state':0}}),'application/json')
  if path=='/adguardhome_backup.asp':return self.respond('{"state":"absent","bytes":0,"busy":false}','application/json')
  if path=='/dbconf':return self.respond('var db_ss={};','text/javascript')
  if path=='/update.cgi':
   q=parse_qs(u.query);output=q.get('output',[''])[0]
   if output=='netdev':return self.respond(hook('netdev','',{}),'text/javascript')
   if output=='bandwidth':return self.respond(hook('bandwidth',json.dumps(q.get('arg0',['speed'])[0]),{}),'text/javascript')
   return self.respond('{}','application/json')
  p=(W/path.lstrip('/')).resolve()
  if W.resolve() not in p.parents or not p.is_file():return self.respond('Not found: '+path,'text/plain',404)
  if p.suffix in ('.asp','.htm','.html','.js','.json'):
   return self.respond(render(p,parse_qs(u.query)),'text/javascript' if p.suffix=='.js' else 'application/json' if p.suffix=='.json' else 'text/html')
  self.respond(p.read_bytes(),mimetypes.guess_type(str(p))[0] or 'application/octet-stream')
 def do_POST(self):
  n=int(self.headers.get('Content-Length','0'));assert n<1000000;body=self.rfile.read(n).decode();posts.append({'path':self.path,'form':parse_qs(body,keep_blank_values=True),'at':time.time()});(R/'mock-posts.json').write_text(json.dumps(posts,ensure_ascii=False,indent=2),encoding='utf-8')
  if self.path=='/lab/report':(R/'browser-page-results.json').write_text(body,encoding='utf-8');return self.respond('{"ok":true}','application/json')
  if self.path=='/apply.cgi':return self.respond('{"sys_result":0}','application/json')
  self.respond('<!doctype html><script>if(parent.PadavanUI)parent.PadavanUI.dirty(false);if(parent.hideLoading)parent.hideLoading();</script><p>模拟提交已记录，未操作设备。</p>')
if __name__=='__main__':
 ThreadingHTTPServer.request_queue_size=128
 print('Local UI fixture http://127.0.0.1:8767',flush=True);ThreadingHTTPServer(('127.0.0.1',8767),Handler).serve_forever()
