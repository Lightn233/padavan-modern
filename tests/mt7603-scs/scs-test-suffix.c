static RTMP_ADAPTER adapter(UINT32 rx,UINT32 tx){
 RTMP_ADAPTER a;memset(&a,0,sizeof(a));a.RalinkCounters.OneSecReceivedByteCount=rx;
 a.RalinkCounters.OneSecTransmittedByteCount=tx;a.MacTab.Size=1;a.SCSCtrl.SCSMinRssi=-66;
 a.SCSCtrl.SCSMinRssiTolerance=10;a.SCSCtrl.FixedRssiBond=-72;
 a.SCSCtrl.FalseCcaUpBond=600;a.SCSCtrl.FalseCcaLowBond=60;a.SCSCtrl.SCSTrafficThreshold=62500;
 a.SCSCtrl.CurrSensitivity=-102;a.SCSCtrl.AdjustSensitivity=-102;
 return a;
}
int main(void){
 RTMP_ADAPTER a;unsigned i;
 const struct {UINT32 rx,tx;UINT64 percentage;} cases[]={
  {0,100,0},{100,0,100},{1,99,1},{89,11,89},{90,10,90},{4763,174,96},
  {40000000u,10000000u,80},{UINT32_MAX,0,100},{0,UINT32_MAX,0},
  {UINT32_MAX,UINT32_MAX,50},{UINT32_MAX,1,99},{1,UINT32_MAX,0}
 };
 a=adapter(0,0);a.SCSCtrl.SCSStatus=SCS_STATUS_MIDDLE;
 a.SCSCtrl.CurrSensitivity=a.SCSCtrl.AdjustSensitivity=-92;ratio_result=999;
 assert(MTSmartCarrierSense(&a));assert(ratio_result==999);
 assert(a.SCSCtrl.SCSStatus==SCS_STATUS_DEFAULT && a.SCSCtrl.CurrSensitivity==-102 && a.writes==4);
 for(i=0;i<sizeof(cases)/sizeof(cases[0]);i++){
  a=adapter(cases[i].rx,cases[i].tx);ratio_result=999;
  assert(MTSmartCarrierSense(&a));assert(ratio_result==cases[i].percentage);
  assert(a.SCSCtrl.SCSStatus==SCS_STATUS_DEFAULT);
 }
 a=adapter(1000,9000);a.rts_register=(10u<<16)|100u;a.SCSCtrl.FalseCCA=1000;
 MTSmartCarrierSense(&a);assert(a.SCSCtrl.CurrSensitivity==-92 && a.SCSCtrl.SCSStatus==SCS_STATUS_MIDDLE);
 a=adapter(9000,1000);a.rts_register=(10u<<16)|100u;a.SCSCtrl.FalseCCA=1000;
 a.SCSCtrl.SCSStatus=SCS_STATUS_MIDDLE;a.SCSCtrl.CurrSensitivity=a.SCSCtrl.AdjustSensitivity=-92;
 MTSmartCarrierSense(&a);assert(a.SCSCtrl.CurrSensitivity==-102 && a.SCSCtrl.SCSStatus==SCS_STATUS_DEFAULT);
 puts("15 SCS cases passed: idle reset, normal ratios, counter bounds, unchanged sensitivity decision paths");
 return 0;
}
