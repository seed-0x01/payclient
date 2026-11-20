#!/usr/local/bin/python3
"""Cross-check the browser payload against the real x402 SDK signature.

The JS test pins the shape. This proves the EIP-712 digest is identical: recover
the signer of the SDK-produced EIP-3009 signature *using the message payclient.js
built*, then ask paidgate's own terms_ok to accept the client's `accepted` block.
Run after: node test.js
"""
import json
import sys

SP = "/opt/data/home/.local/lib/python3.14/site-packages"
for p in (SP, "/opt/data/bin", "/opt/data/projects/paidgate"):
    if p not in sys.path:
        sys.path.insert(0, p)
from eth_account import Account
from eth_account.messages import encode_typed_data
import paidgate

fx = json.load(open("/tmp/payclient-fixtures.json"))
sig = ("0x41c54f6047c0915016dcc4da5db18cd4a820ec298eb7035ea16346a3191dcbfa2"
       "272d1e0603505d5c63b69bb4f89391410c2448d39f2826411e914f15f399f901b")
signable = encode_typed_data(full_message=fx["typed"])
recovered = Account.recover_message(signable, signature=sig)
ok_sig = recovered.lower() == fx["from"].lower()
print(("PASS " if ok_sig else "FAIL ") + "EIP-712 digest matches SDK signature :: recovered " + recovered)

ok_terms, why = paidgate.terms_ok(fx["payload"]["accepted"])
print(("PASS " if ok_terms else "FAIL ") + "paidgate.terms_ok accepts browser payload :: " + why)
sys.exit(0 if (ok_sig and ok_terms) else 1)
