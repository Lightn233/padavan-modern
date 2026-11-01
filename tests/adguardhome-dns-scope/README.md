Run `python3 tests/adguardhome-dns-scope/test-scope.py` on Linux with BusyBox. The test extracts the production IPv6 scope compatibility function and substitutes the address inventory and rule installer. It checks global/ULA addresses, missing addresses, tentative/deprecated/failed DAD states, and rule-install failure. Actual UDP/TCP DNS checks are recorded separately in the firmware acceptance notes.
The address-state selector regression also runs the expression extracted from the production watcher:

```sh
python3 tests/adguardhome-dns-scope/test-address-state.py
```

