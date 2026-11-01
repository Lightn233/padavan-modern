#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
typedef uint32_t ULONG;
typedef uint16_t USHORT;
#define IN
#define OS_HZ 1000
#define REORDERING_PACKET_TIMEOUT 100U
#define MAX_REORDERING_PACKET_TIMEOUT 3000U
#define MAXSEQ 4095
#define RESET_RCV_SEQ 65535
#define RT_DEBUG_TRACE 0
#define DBGPRINT(a,b) do {} while (0)
#define RTMP_TIME_AFTER(a,b) ((int32_t)((uint32_t)(b)-(uint32_t)(a))<0)
#define SEQ_STEPONE(a,b,m) ((a)==(((b)+1)&(m)))
#define SEQ_SMALLER(a,b,m) ((((a)-(b))&((m)+1)/2)!=0)
struct reordering_mpdu {struct reordering_mpdu *next;int Sequence;ULONG rx_time;int freed;};
struct reordering_list {struct reordering_mpdu *next;int qlen;};
typedef struct {int RxReRingLock;struct reordering_list list;USHORT LastIndSeq;ULONG LastIndSeqAtTimer;} BA_REC_ENTRY,*PBA_REC_ENTRY;
typedef struct {struct {ULONG ba_reordering_packet_timeout;} BATable;int released,freed;int seq[128];} RTMP_ADAPTER,*PRTMP_ADAPTER;
static void NdisAcquireSpinLock(int *p){assert(*p==0);*p=1;}
static void NdisReleaseSpinLock(int *p){assert(*p==1);*p=0;}
static struct reordering_mpdu *ba_reordering_mpdu_probe(struct reordering_list *p){return p->next;}
static struct reordering_mpdu *ba_reordering_mpdu_dequeue(struct reordering_list *p){struct reordering_mpdu *h=p->next;if(h){p->next=h->next;p->qlen--;}return h;}
#define ANNOUNCE_REORDERING_PACKET(a,p) do {assert(!(p)->freed);assert((a)->released<128);(a)->seq[(a)->released++]=(p)->Sequence;} while(0)
static void ba_mpdu_blk_free(RTMP_ADAPTER *a,struct reordering_mpdu *p){assert(!p->freed);p->freed=1;a->freed++;}
static USHORT ba_indicate_reordering_mpdus_in_order(RTMP_ADAPTER *a,BA_REC_ENTRY *e,USHORT seq){struct reordering_mpdu *p;USHORT last=RESET_RCV_SEQ;while((p=e->list.next)&&SEQ_STEPONE(p->Sequence,seq,MAXSEQ)){p=ba_reordering_mpdu_dequeue(&e->list);ANNOUNCE_REORDERING_PACKET(a,p);last=seq=p->Sequence;ba_mpdu_blk_free(a,p);}return last;}
static void ba_indicate_reordering_mpdus_le_seq(RTMP_ADAPTER *a,BA_REC_ENTRY *e,USHORT seq){struct reordering_mpdu *p;while((p=e->list.next)&&(p->Sequence==seq||SEQ_SMALLER(p->Sequence,seq,MAXSEQ))){p=ba_reordering_mpdu_dequeue(&e->list);ANNOUNCE_REORDERING_PACKET(a,p);ba_mpdu_blk_free(a,p);}}
static void ba_refresh_reordering_mpdus(RTMP_ADAPTER *a,BA_REC_ENTRY *e){struct reordering_mpdu *p;while((p=ba_reordering_mpdu_dequeue(&e->list))){ANNOUNCE_REORDERING_PACKET(a,p);ba_mpdu_blk_free(a,p);}e->LastIndSeq=RESET_RCV_SEQ;}
static RTMP_ADAPTER a;static BA_REC_ENTRY e;static struct reordering_mpdu nodes[128];static int used;
static void reset(int last,ULONG timer){memset(&a,0,sizeof(a));memset(&e,0,sizeof(e));memset(nodes,0,sizeof(nodes));used=0;a.BATable.ba_reordering_packet_timeout=100;e.LastIndSeq=last;e.LastIndSeqAtTimer=timer;}
static void add(int seq,ULONG arrival){struct reordering_mpdu **tail=&e.list.next;while(*tail)tail=&(*tail)->next;assert(used<128);nodes[used].Sequence=seq;nodes[used].rx_time=arrival;*tail=&nodes[used++];e.list.qlen++;}
static void check(int n,int remaining,int last){assert(a.released==n&&a.freed==n&&e.list.qlen==remaining&&e.LastIndSeq==last&&e.RxReRingLock==0);}
