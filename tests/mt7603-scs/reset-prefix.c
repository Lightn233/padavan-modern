#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
typedef int INT; typedef int32_t INT32; typedef uint32_t UINT32;
typedef uint16_t UINT16; typedef uint64_t UINT64; typedef unsigned char UCHAR;
typedef signed char CHAR;
enum { Keep_Range, Decrease_Range, Increase_Range };
enum { SCS_STATUS_DEFAULT, SCS_STATUS_MIDDLE, SCS_STATUS_LOW, SCS_STATUS_ULTRA_LOW };
enum { MIB_MB0SDR0=100, CR_AGC_0=1, CR_AGC_0_RX1, CR_AGC_3, CR_AGC_3_RX1 };
#define TRUE 1
#define RT_DEBUG_TRACE 0
#define DBGPRINT(level,args) ((void)0)
#define min(a,b) ((a)<(b)?(a):(b))
typedef struct {
 struct {UINT32 OneSecReceivedByteCount,OneSecTransmittedByteCount;} RalinkCounters;
 struct {int Size;} MacTab;
 struct {UINT32 RtsCount,RtsRtyCount,FalseCCA,FalseCcaUpBond,FalseCcaLowBond,SCSTrafficThreshold;
 int SCSEnable,ForceMode,SCSMinRssi,SCSMinRssiTolerance,FixedRssiBond,RSSIBoundary,SCSStatus;
 int CurrSensitivity,AdjustSensitivity;UINT32 CR_AGC_0_default,CR_AGC_3_default;} SCSCtrl;
 UINT32 rts_register;int writes;
} RTMP_ADAPTER;
static UINT64 ratio_result;
static UINT64 div64_u64(UINT64 n,UINT64 d){assert(d);ratio_result=n/d;return ratio_result;}
#define RTMP_IO_READ32(a,reg,p) (*(p)=(a)->rts_register)
#define RTMP_IO_WRITE32(a,reg,val) ((void)(val),(a)->writes++)

#include <stdlib.h>
typedef char RTMP_STRING;
#define SCS_ENABLE 1
#define SCS_DISABLE 0
#define RT_DEBUG_OFF 0
#define simple_strtol(s,e,b) strtol(s,e,b)
static RTMP_ADAPTER adapter(UINT32 rx,UINT32 tx){
 RTMP_ADAPTER a;memset(&a,0,sizeof(a));a.RalinkCounters.OneSecReceivedByteCount=rx;
 a.RalinkCounters.OneSecTransmittedByteCount=tx;a.MacTab.Size=1;a.SCSCtrl.SCSMinRssi=-66;
 a.SCSCtrl.SCSMinRssiTolerance=10;a.SCSCtrl.FixedRssiBond=-72;
 a.SCSCtrl.FalseCcaUpBond=600;a.SCSCtrl.FalseCcaLowBond=60;a.SCSCtrl.SCSTrafficThreshold=62500;
 a.SCSCtrl.CurrSensitivity=-102;a.SCSCtrl.AdjustSensitivity=-102;
 return a;
}
