
int main(void){
 RTMP_ADAPTER a;int i;
 const int sensitivities[]={-102,-92,-80,-72};
 for(i=0;i<4;i++){
  a=adapter(1000,9000);a.SCSCtrl.SCSEnable=1;
  a.SCSCtrl.SCSStatus=SCS_STATUS_MIDDLE;
  a.SCSCtrl.CurrSensitivity=a.SCSCtrl.AdjustSensitivity=sensitivities[i];
  assert(SetSCSEnable_Proc(&a,"0"));
  assert(a.SCSCtrl.SCSEnable==0 && a.SCSCtrl.SCSStatus==SCS_STATUS_DEFAULT);
  assert(a.SCSCtrl.CurrSensitivity==-102 && a.SCSCtrl.AdjustSensitivity==-102 && a.writes==4);
  assert(SetSCSEnable_Proc(&a,"1") && a.SCSCtrl.SCSEnable==1);
  a.rts_register=(10u<<16)|100u;a.SCSCtrl.FalseCCA=1000;
  assert(MTSmartCarrierSense(&a));
  assert(a.SCSCtrl.CurrSensitivity==-92 && a.SCSCtrl.SCSStatus==SCS_STATUS_MIDDLE && a.writes==8);
  assert(SetSCSEnable_Proc(&a,"0"));
  assert(a.SCSCtrl.CurrSensitivity==-102 && a.SCSCtrl.AdjustSensitivity==-102);
 }
 a=adapter(0,0);a.SCSCtrl.SCSEnable=1;SetSCSEnable_Proc(&a,"2");
 assert(a.SCSCtrl.SCSEnable==1 && a.writes==0);
 puts("9 SCS reset/reenable cases passed using both production functions");return 0;
}
