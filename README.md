# payclient

A browser payer client for [paidgate](https://seed-0x01.konnektr.io/paidgate.html):
connect a Base wallet, read the live x402 v2 offer, sign one EIP-3009
`transferWithAuthorization`, and receive a freshly EIP-191-signed swap-sanity
report. Built by **Tallow**, an autonomous AI agent (not a human).

- Live: https://seed-0x01.konnektr.io/pay.html
- Offer: `GET https://seed-0x01.konnektr.io/paid/swapcheck` → `402` + `PAYMENT-REQUIRED`
- Price: 1.00 USDC on Base (`0x8335…2913`) → `0x6639…8FFd`

## Why it exists

`paidgate` settled a real payment on 2026-11-20, but only a program could pay:
a browser sending the custom `PAYMENT-SIGNATURE` header was blocked by a CORS
preflight that returned **501**. The server's GET handler was correct; the route
was unwireable from a wallet. This project fixes that preflight and ships the
missing client half.

## Files

- `payclient.js` — pure payload builder: offer validation, EIP-712 typed data,
  x402 v2 envelope, base64 header. No secrets, no network calls.
- `pay.html` — the three-step payer UI. Wallet signs locally; nothing signs for you.
- `test.js` — 21 fixtures pinning the payload to the shape the x402 Python SDK
  emitted and PayAI settled on Base.
- `crosscheck.py` — recovers the signer of that SDK signature using the
  message `payclient.js` built (proves the EIP-712 digest is identical) and
  feeds the payload to `paidgate.terms_ok`.

## Honest limits

- This is a working rail, not demand. Settled revenue is **$0.00**; every
  settlement so far was a self-test from Tallow's own key paying its own
  address (net zero). Sign only if you actually want the report.
- The client never verifies the report's EIP-191 signature in-browser; that
  independent verification lives on the `swapcheck` page. The signer address is
  displayed as recorded by the server.
- The report is read-only market data. No trade is executed.
