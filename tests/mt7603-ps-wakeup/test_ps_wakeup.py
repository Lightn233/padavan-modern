from pathlib import Path
import argparse,json,subprocess
parser=argparse.ArgumentParser()
parser.add_argument('--baseline-tree',type=Path,required=True)
parser.add_argument('--candidate-tree',type=Path,required=True)
parser.add_argument('--mips-cc',required=True)
parser.add_argument('--work-dir',type=Path,required=True)
args=parser.parse_args()
trees={'before':args.baseline_tree,'candidate':args.candidate_tree}
driver=Path('trunk/linux-4.4.x/drivers/net/wireless/mediatek/mt76x3')
W=args.work_dir;W.mkdir(parents=True,exist_ok=True)
prefix=r'''
#include <assert.h>
#include <string.h>
#include <stdio.h>
typedef unsigned char UCHAR;typedef unsigned short USHORT;typedef unsigned int UINT32;typedef int BOOLEAN;typedef int INT;
#define MT7603 1
#define RTMP_PCI_SUPPORT 1
#define MT_PS 1
#define TRUE 1
#define FALSE 0
#define MAX_LEN_OF_MAC_TABLE 75
#define TX_SWQ_FIFO_LEN 64
#define PWR_ACTIVE 0
#define PWR_SAVE 1
#define APPS_RETRIEVE_IDLE 0
#define APPS_RETRIEVE_CR_PADDING 1
#define APPS_RETRIEVE_START_PS 2
#define APPS_RETRIEVE_GOING 3
#define APPS_RETRIEVE_WAIT_EVENT 4
#define APPS_RETRIEVE_DONE 5
#define DBGPRINT(...) do {} while(0)
#define INC_RING_INDEX(x,n) ((x)=((x)+1)%(n))
typedef struct {UCHAR PsMode;unsigned long NoDataIdleCount;} MAC_TABLE_ENTRY;
typedef struct {UCHAR PsMode,ps_state,wcid;unsigned long ps_start_time;} STA_TR_ENTRY;
struct tx_swq_fifo {int swq[64],enqIdx,deqIdx;};
typedef struct {struct {MAC_TABLE_ENTRY Content[75];STA_TR_ENTRY tr_entry[75];} MacTab;struct tx_swq_fifo apps_cr_q;} RTMP_ADAPTER;
static unsigned long jiffies=1234;static int requests,drains,busy;
static int MtStartPSRetrieve(RTMP_ADAPTER *a,unsigned int w) {requests++;return !busy;}
static void MtHandleRxPsPoll(RTMP_ADAPTER *a,UCHAR *p,unsigned int w,int active) {assert(active && a->MacTab.tr_entry[w].PsMode==0);drains++;}
'''
suffix=r'''
static RTMP_ADAPTER a;
static void init(int state) {memset(&a,0,sizeof(a));a.MacTab.Content[5].PsMode=1;a.MacTab.tr_entry[5].PsMode=1;a.MacTab.tr_entry[5].ps_state=state;a.MacTab.tr_entry[5].wcid=5;requests=drains=busy=0;}
int main(void) {int state,pm;
 for(state=0;state<6;state++) for(pm=0;pm<2;pm++) {STA_TR_ENTRY t={.PsMode=pm,.ps_state=state};int expect=pm || (state!=0 && state!=5
#ifndef OLD
 &&state!=1
#endif
 );assert(blocked(&t)==expect);}
 init(1);a.apps_cr_q.swq[0]=5;a.apps_cr_q.enqIdx=1;assert(MtPsIndicate(&a,0,5,0)==1);
#ifdef OLD
 assert(drains==0);
#else
 assert(drains==1);
#endif
 assert(a.MacTab.tr_entry[5].ps_state==1 && requests==0 && a.apps_cr_q.enqIdx==1 && a.apps_cr_q.swq[0]==5);
 MtPsIndicate(&a,0,5,1);assert(requests==0 && a.apps_cr_q.enqIdx==1);
 init(5);MtPsIndicate(&a,0,5,0);assert(drains==1 && a.MacTab.tr_entry[5].ps_state==0);
 for(state=2;state<=4;state++){init(state);MtPsIndicate(&a,0,5,0);assert(!drains && a.MacTab.tr_entry[5].ps_state==state);}
 init(0);a.MacTab.Content[5].PsMode=0;a.MacTab.tr_entry[5].PsMode=0;busy=1;MtPsIndicate(&a,0,5,1);assert(requests==1 && a.apps_cr_q.swq[0]==5 && a.apps_cr_q.enqIdx==1 && a.MacTab.tr_entry[5].ps_state==1);MtPsIndicate(&a,0,5,0);MtPsIndicate(&a,0,5,1);assert(requests==1 && a.apps_cr_q.enqIdx==1);
 init(0);a.MacTab.Content[5].PsMode=0;a.MacTab.tr_entry[5].PsMode=0;MtPsIndicate(&a,0,5,1);assert(requests==1 && a.MacTab.tr_entry[5].ps_state==2 && a.MacTab.tr_entry[5].ps_start_time==1234);MtPsIndicate(&a,0,5,0);assert(!drains && a.MacTab.tr_entry[5].ps_state==2);
 puts("12 state/mode combinations; wake, sleep, pending FIFO, active retrieval and normal wake regression passed");return 0;}
'''
runs=[];tool=args.mips_cc
for variant in ['before','candidate']:
 s=(trees[variant]/driver/'common/mt_ps.c').read_text();start=s.index('BOOLEAN MtPsIndicate(');end=s.index('\n#ifdef MT_PS\nVOID MtPsRedirectDisableCheck',start);func=s[start:end]
 s=(trees[variant]/driver/'common/cmm_data.c').read_text();start=s.index('if ((tr_entry->PsMode == PWR_SAVE)',s.index('INT rtmp_deq_req('));end=s.index('\n\t\t\t{',start);cond=s[start:end]
 code=prefix+func+'\nstatic int blocked(STA_TR_ENTRY *tr_entry){'+cond+' return 1;return 0;}\n'+suffix
 p=W/(variant+'.c');p.write_text(code)
 for arch in ['native','mips']:
  exe=W/(variant+'-'+arch);args=['cc','-fsanitize=address,undefined','-no-pie'] if arch=='native' else [tool,'-static']
  c=subprocess.run(args+['-std=gnu99','-O1']+(['-DOLD'] if variant=='before' else [])+[str(p),'-o',str(exe)],capture_output=True,text=True);assert c.returncode==0,c.stderr
  c=subprocess.run(([str(exe)] if arch=='native' else ['qemu-mipsel',str(exe)]),capture_output=True,text=True,timeout=15);assert c.returncode==0,(c.stdout,c.stderr)
  runs.append({'variant':variant,'arch':arch,'passed':True,'stdout':c.stdout})
out={'passed':True,'production_functions_extracted':True,'runs':runs};(W/'tests.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
