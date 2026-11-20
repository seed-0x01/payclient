/* payclient.js — build an x402 v2 `exact` EIP-3009 payment payload in the payer's
 * browser. No secrets, no facilitator calls, no signing by this server.
 *
 * The typed-data shape is the one the x402 Python SDK (ExactEvmScheme) produced
 * for Tallow's paidgate offer, verified against a real Base settlement. test.js
 * pins every field and cross-checks the EIP-712 digest with eth_account.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PayClient = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CHAIN_ID = 8453;                 // Base mainnet
  const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const PAY_TO = '0x663952620CEeF96C9Ebe9B5002Cc5910A7CD8FFd';
  const AMOUNT = '1000000';              // 1.00 USDC, 6 decimals
  const MAX_TIMEOUT = 300;

  const EIP712_DOMAIN = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' }
  ];
  const TRANSFER_FIELDS = [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' }
  ];

  function lower(x) { return String(x == null ? '' : x).toLowerCase(); }

  /* Refuse a tampered or stale offer before asking a wallet to sign anything.
   * Mirrors paidgate.terms_ok on the client side: the wallet must never be
   * tricked into authorising an amount/payee the user did not read. */
  function validateOffer(pr) {
    if (!pr || pr.x402Version !== 2) return { ok: false, why: 'x402 v2 required' };
    const a = pr.accepts && pr.accepts[0];
    if (!a) return { ok: false, why: 'no accepted requirement' };
    const want = {
      scheme: 'exact', network: 'eip155:8453', asset: lower(USDC),
      payTo: lower(PAY_TO), amount: AMOUNT
    };
    const bad = [];
    if (a.scheme !== want.scheme) bad.push('scheme');
    if (a.network !== want.network) bad.push('network');
    if (lower(a.asset) !== want.asset) bad.push('asset');
    if (lower(a.payTo) !== want.payTo) bad.push('payTo');
    if (String(a.amount) !== want.amount) bad.push('amount');
    const t = Number(a.maxTimeoutSeconds);
    if (!Number.isFinite(t) || t <= 0 || t > MAX_TIMEOUT) bad.push('maxTimeoutSeconds');
    if (!a.extra || !a.extra.name || !a.extra.version) bad.push('extra.name/version');
    return bad.length ? { ok: false, why: 'terms mismatch: ' + bad.join(', ') }
                      : { ok: true, why: 'ok' };
  }

  /* The exact EIP-712 message eth_signTypedData_v4 must receive. `to` is the
   * payTo in the offer (my wallet), value/validAfter/validBefore/nonce are
   * strings as the x402 SDK emits them. */
  function buildTypedData(accept, from, nonce, validAfter, validBefore) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(nonce)) throw new Error('nonce must be bytes32');
    return {
      domain: {
        name: accept.extra.name,
        version: accept.extra.version,
        chainId: CHAIN_ID,
        verifyingContract: accept.asset
      },
      primaryType: 'TransferWithAuthorization',
      types: {
        EIP712Domain: EIP712_DOMAIN.slice(),
        TransferWithAuthorization: TRANSFER_FIELDS.slice()
      },
      message: {
        from: from,
        to: accept.payTo,
        value: String(accept.amount),
        validAfter: String(validAfter),
        validBefore: String(validBefore),
        nonce: nonce
      }
    };
  }

  /* Field-for-field the object the Python SDK's model_dump_json(by_alias=True)
   * produced and PayAI settled on Base. `resource` is carried for spec
   * completeness; paidgate enforces `accepted` locally and ignores it. */
  function buildPayload(pr, authorization, signature) {
    return {
      x402Version: 2,
      payload: { authorization: authorization, signature: signature },
      accepted: pr.accepts[0],
      resource: pr.resource
    };
  }

  function randomNonce() {
    let b;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      b = new Uint8Array(32); crypto.getRandomValues(b);
      return '0x' + Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    }
    const nodeCrypto = (typeof require !== 'undefined') ? require('crypto') : null;
    if (!nodeCrypto) throw new Error('no CSPRNG available');
    return '0x' + nodeCrypto.randomBytes(32).toString('hex');
  }

  function b64(s) {
    if (typeof btoa === 'function') {
      // JSON here is ASCII, but keep a Unicode-safe path for descriptions.
      const bytes = new TextEncoder().encode(s);
      let bin = ''; for (const byte of bytes) bin += String.fromCharCode(byte);
      return btoa(bin);
    }
    return Buffer.from(s, 'utf8').toString('base64');
  }
  function unb64(s) {
    if (typeof atob === 'function') {
      const bin = atob(s); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    return Buffer.from(s, 'base64').toString('utf8');
  }
  const encodePayload = p => b64(JSON.stringify(p));
  const decodePayload = s => JSON.parse(unb64(s));
  const offerFromHeader = s => decodePayload(s);

  return {
    CHAIN_ID, USDC, PAY_TO, AMOUNT, MAX_TIMEOUT,
    EIP712_DOMAIN, TRANSFER_FIELDS,
    lower, validateOffer, buildTypedData, buildPayload,
    randomNonce, b64, unb64, encodePayload, decodePayload, offerFromHeader
  };
});
