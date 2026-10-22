/* mooncheck — test crypto.js (SHA-256, HMAC, PBKDF2, UTF-8, base64/hex) */
'use strict';
const { makeSandbox, loadScript, APP } = require('./harness');
const VEC = require('./vectors');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error('  FAIL:', name); }
}

const sb = makeSandbox();
loadScript(sb, path_join(APP, 'crypto.js'));
const C = sb.window.MC.crypto;
const V = VEC.crypto;

function bytesFromHex(hex) { return C.hexDecode(hex); }
function bytesFromStr(s) { return C.strToUtf8(s); }

/* ---------- SHA-256 ---------- */
console.log('== SHA-256 ==');
for (const t of V.sha256) {
  const got = C.hexEncode(C.sha256(bytesFromStr(t.in)));
  ok(got === t.out, `sha256("${t.in.slice(0, 24)}${t.in.length > 24 ? '…' : ''}")`);
}
// vektor panjang lintas-blok (61..70 byte) — padding multi-blok
{
  const a = 'x'.repeat(55), b = 'x'.repeat(56), c = 'x'.repeat(64), d = 'x'.repeat(65);
  const expect = (s) => require('crypto').createHash('sha256').update(s).digest('hex');
  ok(C.hexEncode(C.sha256(bytesFromStr(a))) === expect(a), 'sha256 panjang 55 (batas blok)');
  ok(C.hexEncode(C.sha256(bytesFromStr(b))) === expect(b), 'sha256 panjang 56');
  ok(C.hexEncode(C.sha256(bytesFromStr(c))) === expect(c), 'sha256 panjang 64');
  ok(C.hexEncode(C.sha256(bytesFromStr(d))) === expect(d), 'sha256 panjang 65');
  const big = 'y'.repeat(100003);
  ok(C.hexEncode(C.sha256(bytesFromStr(big))) === expect(big), 'sha256 100003 byte');
}

/* ---------- HMAC ---------- */
console.log('== HMAC-SHA256 ==');
for (const t of V.hmac) {
  const key = t.key_hex ? bytesFromHex(t.key_hex) : bytesFromStr(t.key);
  const got = C.hexEncode(C.hmacSha256(key, bytesFromStr(t.msg)));
  ok(got === t.out, `hmac key=${t.key || t.key_hex.slice(0, 12) + '…'} msg="${t.msg.slice(0, 20)}…"`);
}

/* ---------- PBKDF2 ---------- */
console.log('== PBKDF2-HMAC-SHA256 ==');
for (const t of V.pbkdf2) {
  const salt = t.salt_hex ? bytesFromHex(t.salt_hex) : bytesFromStr(t.salt);
  const got = C.hexEncode(C.pbkdf2Sync(bytesFromStr(t.pw), salt, t.c, t.dk));
  ok(got === t.out, `pbkdf2 pw="${t.pw}" c=${t.c} dk=${t.dk}`);
}

/* ---------- UTF-8 ---------- */
console.log('== UTF-8 ==');
for (const t of VEC.utf8) {
  const enc = C.strToUtf8(t.s);
  ok(C.hexEncode(enc) === t.hex, `utf8 encode "${t.s}"`);
  ok(C.utf8ToStr(enc) === t.s, `utf8 decode roundtrip "${t.s}"`);
}
// surrogate pair eksplisit
{
  const s = String.fromCharCode(0xd83d, 0xde0a); // emoji :) sebagai surrogate
  ok(C.hexEncode(C.strToUtf8(s)) === 'f09f988a', 'utf8 surrogate pair');
}

/* ---------- base64 / hex ---------- */
console.log('== Base64 / Hex ==');
{
  ok(C.b64Encode(bytesFromStr('')) === '', 'b64 kosong');
  ok(C.b64Encode(bytesFromStr('f')) === 'Zg==', 'b64 1 byte');
  ok(C.b64Encode(bytesFromStr('fo')) === 'Zm8=', 'b64 2 byte');
  ok(C.b64Encode(bytesFromStr('foo')) === 'Zm9v', 'b64 3 byte');
  ok(C.b64Encode(bytesFromStr('foob')) === 'Zm9vYg==', 'b64 4 byte');
  ok(C.b64Encode(bytesFromStr('fooba')) === 'Zm9vYmE=', 'b64 5 byte');
  ok(C.b64Encode(bytesFromStr('foobar')) === 'Zm9vYmFy', 'b64 6 byte');
  const bin = C.randomBytes(37);
  ok(C.utf8ToStr(C.b64Decode(C.b64Encode(bin))).length > 0 || true, 'b64 biner tak crash');
  ok(Array.from(C.b64Decode(C.b64Encode(bin))).join() === Array.from(bin).join(), 'b64 roundtrip 37 byte acak');
  ok(Array.from(C.b64Decode(C.b64Encode(bytesFromStr('kunci-aman-1')))).join() ===
     Array.from(bytesFromStr('kunci-aman-1')).join(), 'b64 roundtrip teks');
}

/* ---------- timingSafeEqual ---------- */
console.log('== timingSafeEqual ==');
{
  const a = bytesFromHex('00112233445566778899aabbccddeeff');
  const b = bytesFromHex('00112233445566778899aabbccddeeff');
  const c = bytesFromHex('00112233445566778899aabbccddeefe');
  const d = bytesFromHex('00112233');
  ok(C.timingSafeEqual(a, b) === true, 'equal → true');
  ok(C.timingSafeEqual(a, c) === false, 'beda 1 byte → false');
  ok(C.timingSafeEqual(a, d) === false, 'panjang beda → false');
}

/* ---------- random ---------- */
console.log('== randomBytes ==');
{
  const r1 = C.randomBytes(16), r2 = C.randomBytes(16);
  ok(r1.length === 16 && r2.length === 16, 'panjang benar');
  ok(Array.from(r1).join() !== Array.from(r2).join(), 'tidak identik (probabilitas)');
}

/* ---------- deriveBits (async, jalur murni karena tanpa subtle) ---------- */
console.log('== deriveBits ==');
(async () => {
  const t = V.pbkdf2[2]; // c=4096
  const got = await C.deriveBits(C.strToUtf8(t.pw), C.strToUtf8(t.salt), t.c, t.dk);
  ok(C.hexEncode(got) === t.out, 'deriveBits jalur murni = pbkdf2Sync');
  ok(C.subtleAvailable() === false, 'subtle tidak tersedia di sandbox node');
  console.log(`\nhasil: ${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
})();

function path_join(a, b) { return require('path').join(a, b); }
