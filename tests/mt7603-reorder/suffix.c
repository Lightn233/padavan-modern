int main(void){
#ifdef OLD_TEST
 int t;reset(1,0);add(10,0);
 for(t=101;t<=707;t+=101)ba_flush_reordering_timeout_mpdus(&a,&e,t);
 check(0,1,8);ba_flush_reordering_timeout_mpdus(&a,&e,808);check(1,0,10);
 puts("Old production code confirmed: eight missing frames hold the queued frame for 808 ms");
#else
 reset(1,0);ba_flush_reordering_timeout_mpdus(&a,NULL,0);check(0,0,1);
 ba_flush_reordering_timeout_mpdus(&a,&e,500);check(0,0,1);
 reset(1,0);add(4,0);ba_flush_reordering_timeout_mpdus(&a,&e,99);check(0,1,1);
 ba_flush_reordering_timeout_mpdus(&a,&e,100);check(0,1,1);
 ba_flush_reordering_timeout_mpdus(&a,&e,101);check(1,0,4);
 reset(1,0);add(10,0);ba_flush_reordering_timeout_mpdus(&a,&e,101);check(1,0,10);
 reset(1,0);add(4,0);add(10,0);add(11,99);ba_flush_reordering_timeout_mpdus(&a,&e,101);check(3,0,11);
 assert(a.seq[0]==4&&a.seq[1]==10&&a.seq[2]==11);
 reset(1,0);add(4,90);ba_flush_reordering_timeout_mpdus(&a,&e,101);check(0,1,1);
 reset(1,0);add(4,0);add(7,100);ba_flush_reordering_timeout_mpdus(&a,&e,101);check(1,1,4);
 ba_flush_reordering_timeout_mpdus(&a,&e,201);check(2,0,7);
 reset(4094,0);add(2,0);add(3,99);ba_flush_reordering_timeout_mpdus(&a,&e,101);check(2,0,3);
 reset(1,UINT32_MAX-63);add(5,UINT32_MAX-63);ba_flush_reordering_timeout_mpdus(&a,&e,35);check(0,1,1);
 ba_flush_reordering_timeout_mpdus(&a,&e,37);check(1,0,5);
 reset(100,0);add(101,200);add(102,200);ba_flush_reordering_timeout_mpdus(&a,&e,200);check(2,0,102);
 reset(1,0);add(4,0);ba_flush_reordering_timeout_mpdus(&a,&e,600);check(1,0,4);
#ifdef CONFIG_BA_REORDER_MONITOR
 reset(1,0);a.BATable.ba_reordering_packet_timeout=500;add(4,0);
 ba_flush_reordering_timeout_mpdus(&a,&e,101);check(0,1,1);
 ba_flush_reordering_timeout_mpdus(&a,&e,501);check(1,0,4);
#endif
 puts("15 reorder boundary checks passed (plus two configured-timeout checks when enabled)");
#endif
 return 0;
}
