# MT7603 SCS counter arithmetic

SCS uses the receive share of one-second traffic to select a sensitivity path. Snapshot both byte counters once, use wide arithmetic for the share, and let an idle interval reach the existing sensitivity-reset path. Retain all channel, bandwidth, power, sensitivity thresholds and rate adaptation policies.

Validation: the extracted production function passes 15 idle, normal-traffic, counter-bound and sensitivity-path checks on native ASan/UBSan and MIPS. The MT7603 module builds against the RM2100 kernel and all 127 required symbol versions match. The public test runner compiles the current production function; it does not exercise the previous implementation or send traffic to a device.

This commit is source-validated only. It is not present in the installed U9D8 image. No new firmware was flashed and no user settings were changed for this work. This arithmetic correction is not evidence that an RF throughput or latency complaint is resolved. Channel/width comparisons, real client throughput and loaded-latency measurements are still required for a performance claim.
