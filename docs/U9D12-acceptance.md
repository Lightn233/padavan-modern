# RM2100 U9D12: receive reorder and IPv6 DNS repairs

U9D12 was installed through the normal firmware upgrade interface on 2026-11-02, without a factory reset. The installed flash contents and wireless modules match the built image. This acceptance covers the concrete repairs below, not a claim that all wireless latency spikes or all bugs have been eliminated.

Image: `RM2100-U9D12_4.4.198.9-100.trx`, 19,602,700 bytes, SHA256 `acca149e5a28f669fa2fa58978e9afa5b947a5eb91524dfdb85868c9283cd53c`.

## Repairs installed

1. **MT7603 receive reorder waits.** The old timeout handler advanced one missing sequence number and restarted its timer. Consecutive gaps could therefore multiply the waiting time of a packet already buffered. Executing the old production function reproduced an 808 ms wait for eight gaps. Each buffered MPDU now has its own arrival timestamp. After the existing retry grace period expires, the handler skips directly to the expired frame and releases following contiguous frames. It also updates the timeout monitor to inspect buffered-frame age. The normal and multiple-client retry intervals remain unchanged. The corrected isolated test releases this example at the first eligible 101 ms call; that figure is a unit-test result, not a prediction of live Wi-Fi ping latency.
2. **LAN IPv6 UDP DNS scope.** In existing DNS interception modes 2 and 3, global-source requests sent to a router link-local address on UDP port 5335 are directed internally to the router's usable LAN global/ULA address. This avoids the observed reply-scope problem while retaining the official AdGuard Home executable. The rule is limited to packets entering the LAN bridge and exact local destination addresses. Client source addresses are preserved. With no usable global/ULA address, the extra rule is omitted. It is a firmware integration repair in these modes, not an upstream dnsproxy binary fix.
3. **IPv6 address-state refresh.** The existing watcher now includes tentative/deprecated/DAD-failure flags in its address-state key, so DNS rules are rebuilt when an unchanged address becomes usable or unusable. Address lifetime countdown lines are excluded to avoid rebuilding rules every second.

The live configuration was also repaired by removing two ISP IPv6 bootstrap DNS endpoints that had independently timed out from both WAN and LAN source addresses. Other bootstrap servers, filtering rules, history, credentials and user network data were retained. This local repair does not alter factory DNS defaults or publish the device's DNS configuration.

The 2.4 GHz driver is MT7603 4.1.2.1-mao-patch1 with the existing NAT deregistration and SCS arithmetic/state repairs plus this receive-reorder repair. Its installed SHA256 is `6e627477538bbf61c60db319f46865d48b71ce8388ee716444ae736f3a7fe598`. The 5 GHz MT7615 5.1.0.0 module remains unchanged from the prior accepted build; it does not contain a newly verified channel-64 discovery fix.

## Validation

- The old wait multiplication and corrected boundary behavior were executed natively with ASan/UBSan and with the target MIPS build, both with and without the reorder monitor. Tests cover fresh frames, gaps, in-order release, sequence wrap, 32-bit clock wrap and configured retry intervals.
- The MT7603 module built successfully; 127 required kernel symbols matched. Its packaged code section matched the separately tested module. The full image passed header/data CRC, source-manifest, package and asset consistency checks.
- Eight production DNS-rule helper cases passed under BusyBox ash: usable global address, ULA, missing global address, tentative, deprecated, failed DAD, missing link-local address and rule-installation failure. Six production address-state selector cases passed.
- After installation, all 16 combinations of IPv6 source/destination scope, ports 53/5335, and UDP/TCP passed. Rules targeted the current LAN address after the reboot and prefix change. IPv4/IPv6 DNS and HTTPS, PPPoE, management endpoints, official AdGuard Home health and protected configuration checks passed.
- The official AdGuard Home v0.107.79 executable was preserved exactly. Existing rollback images were retained. The chart/traffic interface and other unchanged components retain their previous acceptance; unrelated tests were not rerun.

Public regression commands, from the repository root on Linux:

```sh
python3 tests/mt7603-reorder/test-reorder.py
python3 tests/adguardhome-dns-scope/test-scope.py
python3 tests/adguardhome-dns-scope/test-address-state.py
```

## Bounded 2.4 GHz measurements

The same phone and wired LAN endpoint were used. The phone remained awake throughout each transfer. Each direction streamed for 12 seconds with 48 concurrent gateway pings at 250 ms intervals. A capped upload deliberately ends before its declared content length; its curl timeout is expected and is not counted as a failed network transfer. Bluetooth state is shown explicitly. All rows below had zero observed ping loss. These short measurements are not a controlled long-term performance guarantee.

| Image / condition | Down / up Mbps | Down ping mean / P95 / max ms | Up ping mean / P95 / max ms |
|---|---:|---:|---:|
| U9D11, Bluetooth on, first | 65.03 / 119.33 | 19.71 / 78.7 / 118 | 19.63 / 40.2 / 104 |
| U9D11, Bluetooth on, recheck | 64.04 / 120.57 | 13.8 / 25.4 / 142 | 27.1 / 121 / 239 |
| U9D12, Bluetooth on, first | 127.93 / 117.59 | 10.63 / 25.8 / 117 | 11.38 / 24.7 / 39.1 |
| U9D12, Bluetooth on, recheck | 100.56 / 118.67 | 19.53 / 120 / 157 | 30.43 / 56.5 / 122 |
| U9D12, temporary Bluetooth off | 140.67 / 144.39 | 7.75 / 18 / 19.6 | 35.54 / 66.7 / 67.7 |
| U9D12, temporary U-APSD on, Bluetooth on | 69.94 / 75.75 | 18.64 / 71.5 / 115 | 23.13 / 44.8 / 46.6 |

The first new-driver result was encouraging, but the recheck still showed spikes. The source-level wait multiplication is fixed; the measurements do not establish that every spike came from that bug. Bluetooth-off comparisons on both old and new builds support coexistence as a contributor to this phone's downlink behavior, while idle and upload delays show additional factors remain. Bluetooth was restored. U-APSD was restored because it reduced throughput without eliminating the downlink spike. The final 2.4 GHz configuration remains channel 11 with its original 20/40 mode and other original radio settings.

## Remaining limits and cleanup

The Xiaomi 12 still misses the unconnected 5 GHz BSSID when associated on primary channel 64 at 160 MHz. A new 50-TU beacon interval experiment was verified with two fresh PC broadcasts, then failed three consecutive phone scans over 45 seconds. That change was reverted to 100 TU and the temporary isolated guest network was removed. This does not invalidate the earlier successful tests of other supported primaries, and does not justify silently replacing the user's preferred 64/160 setting.

No region-code, transmit-power or DFS bypass changes were made. Temporary radio settings, restore guards, phone test profile, keep-awake setting and local test services were restored or removed. Both guest networks are off in the final configuration. Long-duration, different-location and multiple-client stability remain unproven by these bounded checks.

## Follow-up: locating the remaining idle jitter

A bounded ICMP diagnostic paired 79 phone echo requests/replies with kernel receive/transmit timestamps on the router's 2.4 GHz interface. It observed only the authorized phone/router ICMP pair, used no promiscuous mode, stopped after 35 seconds, and was removed afterward. Router radio configuration was unchanged and phone settings/association were restored.

The phone's RTT reached 179 ms. The interval between the router's kernel receive and transmit timestamps averaged 0.223 ms, with P95 0.343 ms and maximum 1.724 ms. Within-run variation after the kernel transmit timestamp was about 176 ms, compared with about 33 ms before the kernel receive timestamp. Absolute one-way values contain an unknown phone/router clock offset, so only the variation is used here. This localizes most of this run's jitter to the wireless reply path, which still includes AP driver/hardware queues, the air link and phone receive/power-save behavior. It does not prove which of those is responsible.

The station-state snapshot showed that the phone can enter Wi-Fi power save while its screen is awake. Its negotiated spatial-MIMO power-save mode was disabled, so the separately reported mac80211 dynamic-SMPS association issue is not established as applicable to this session. No speculative SMPS patch or permanent phone power policy was applied. This diagnostic narrows the remaining investigation; it is not an additional latency fix or a new firmware image.
