/* test.js — pin the browser payload builder to the shape the x402 SDK produced
 * and PayAI settled on Base. Run: node /opt/data/projects/payclient/test.js
 * Writes /tmp/payclient-fixtures.json for the Python cross-check. */
'use strict';
const P = require('./payclient.js');
const fs = require('fs');
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Exactly the offer paidgate.offer("example.test") emitted, and the payload the
// x402 Python SDK built on 2026-11-20 (throwaway signer, not my wallet).
const offer = {
  x402Version: 2,
  resource: {
    url: 'https://example.test/paid/swapcheck',
    description: 'Fresh signed swap-sanity report: live Uniswap V3 quotes on Base, every route ranked after gas, EIP-191 signed by Tallow\'s wallet. Read-only; no trade executed. Autonomous AI agent service.',
    mimeType: 'application/json', serviceName: 'Tallow swapcheck'
  },
  accepts: [{
    scheme: 'exact', network: 'eip155:8453',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    amount: '1000000', payTo: '0x663952620CEeF96C9Ebe9B5002Cc5910A7CD8FFd',
    maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' }
  }]
};
const from = '0x446256E5eCf6a59437Bc1a0813Ade4C2D2D64407';
const nonce = '0x172eb64bd6215cb99c7a63b0bac71f36d7affae0d5019c30a662e89e40814e62';
const validBefore = '1795147605';
const signature = '0x41c54f6047c0915016dcc4da5db18cd4a820ec298eb7035ea16346a3191dcbfa2272d1e0603505d5c63b69bb4f89391410c2448d39f2826411e914f15f399f901b';
const expectedAuthorization = {
  from, to: '0x663952620CEeF96C9Ebe9B5002Cc5910A7CD8FFd',
  value: '1000000', validAfter: '0', validBefore, nonce
};

check('offer accepted as-is', P.validateOffer(offer).ok, P.validateOffer(offer).why);
for (const [field, value] of [
  ['x402Version', 1], ['scheme', 'permit2'], ['network', 'base'],
  ['asset', '0x' + '1'.repeat(40)], ['payTo', '0x' + '0'.repeat(40)],
  ['amount', '1'], ['maxTimeoutSeconds', 3600]
]) {
  const bad = JSON.parse(JSON.stringify(offer));
  if (field === 'x402Version') bad[field] = value; else bad.accepts[0][field] = value;
  check('tampered ' + field + ' refused', P.validateOffer(bad).ok === false);
}
const noExtra = JSON.parse(JSON.stringify(offer)); delete noExtra.accepts[0].extra;
check('missing EIP-712 domain extra refused', P.validateOffer(noExtra).ok === false);

const typed = P.buildTypedData(offer.accepts[0], from, nonce, '0', validBefore);
check('domain name/version from offer', typed.domain.name === 'USD Coin' && typed.domain.version === '2');
check('domain chainId is Base 8453', typed.domain.chainId === 8453);
check('domain verifyingContract == USDC asset',
  typed.domain.verifyingContract === offer.accepts[0].asset);
check('primaryType is TransferWithAuthorization',
  typed.primaryType === 'TransferWithAuthorization');
check('EIP712Domain fields match SDK', eq(typed.types.EIP712Domain, [
  { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }
]));
check('TransferWithAuthorization fields match SDK', eq(typed.types.TransferWithAuthorization, [
  { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }
]));
check('message == SDK authorization', eq(typed.message, expectedAuthorization));

const payload = P.buildPayload(offer, expectedAuthorization, signature);
check('payload matches SDK model_dump_json shape', eq(payload, {
  x402Version: 2,
  payload: { authorization: expectedAuthorization, signature },
  accepted: offer.accepts[0],
  resource: offer.resource
}));
const wire = P.encodePayload(payload);
check('wire header is base64 of exact payload', P.decodePayload(wire).x402Version === 2 &&
  eq(P.decodePayload(wire), payload));
check('offerFromHeader decodes a 402 header', eq(P.offerFromHeader(P.b64(JSON.stringify(offer))), offer));
let threw = false;
try { P.buildTypedData(offer.accepts[0], from, '0xdead', '0', validBefore); } catch (e) { threw = true; }
check('malformed nonce rejected before signing', threw);
const n1 = P.randomNonce(), n2 = P.randomNonce();
check('nonce is 32-byte hex and unique', /^0x[0-9a-f]{64}$/.test(n1) && n1 !== n2);

fs.writeFileSync('/tmp/payclient-fixtures.json', JSON.stringify({
  typed, payload, offer, from
}, null, 2));
console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
