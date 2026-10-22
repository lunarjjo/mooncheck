/* mooncheck — test qrlib.js (payload HMAC + roundtrip encode→decode nyata) */
'use strict';
const { makeSandbox, loadCore } = require('./harness');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) pass++; else { fail++; console.error('  FAIL:', name); }
}

const sb = makeSandbox();
loadCore(sb);
const Q = sb.window.MC.qrlib;
const CR = sb.window.MC.crypto;

const SECRET = CR.b64Encode(CR.randomBytes(32));
const SECRET2 = CR.b64Encode(CR.randomBytes(32));

/* ---------- payload ---------- */
console.log('== payload & HMAC ==');
{
  const uid = 'u-ab12cd34ef';
  const p = Q.memberPayload(uid, SECRET);
  ok(p.startsWith('MC1|' + uid + '|'), 'format MC1|userId|sig');
  ok(p.split('|')[2].length === 16, 'sig 16 karakter');
  ok(Q.memberPayload(uid, SECRET) === p, 'deterministik');
  ok(Q.memberPayload(uid, SECRET2) !== p, 'secret beda → sig beda');

  const v = Q.parsePayload(p, SECRET);
  ok(v.ok === true && v.userId === uid, 'parse valid');

  ok(Q.parsePayload('MC1|u-x|abcd', SECRET).ok === false, 'sig pendek → tolak');
  ok(Q.parsePayload('HALO-DUNIA', SECRET).ok === false, 'bukan protokol → tolak');
  ok(Q.parsePayload('MC1|u-ab12cd34ef|XXXXXXXXXXXXXXXX', SECRET).ok === false, 'sig palsu → tolak');
  // tamper userId (sig milik uid lain)
  ok(Q.parsePayload(p.replace(uid, 'u-hack99999'), SECRET).ok === false, 'userId ditukar → tolak');
  // secret berbeda
  ok(Q.parsePayload(p, SECRET2).ok === false, 'secret berbeda → tolak');
  ok(Q.parsePayload(null, SECRET).ok === false, 'null → tolak');
  ok(Q.parsePayload('MC1|u-a|sig|ekstra', SECRET).ok === false, '4 segmen → tolak');
}

/* ---------- rasterisasi matriks → RGBA → jsQR ---------- */
function rasterizeMatrix(qr, scale, quiet) {
  const count = qr.getModuleCount();
  const size = (count + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4);
  data.fill(255); // putih semua kanal
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      if (!qr.isDark(y, x)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const py = (y + quiet) * scale + dy;
          const px = (x + quiet) * scale + dx;
          const i = (py * size + px) * 4;
          data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
        }
      }
    }
  }
  return { data, size };
}

console.log('== roundtrip encode → decode ==');
{
  const texts = [
    Q.memberPayload('u-ab12cd34ef', SECRET),
    Q.memberPayload('u-0011223344', SECRET),
    Q.memberPayload('u-ffeeddcc00', SECRET2),
    'MC1|u-panjangbanget-0123456789abcdef|0123456789abcdef' // ~50 char
  ];
  let allOk = true;
  for (const t of texts) {
    const m = Q.makeMatrix(t);
    const r = rasterizeMatrix(m, 6, 4);
    const dec = Q.decodeFromImageData(r.data, r.size, r.size);
    if (!dec.ok || dec.text !== t) {
      allOk = false;
      console.error('   gagal roundtrip:', JSON.stringify(t), '→', dec.ok ? dec.text : dec.reason);
    }
  }
  ok(allOk, 'semua payload terdecode identik');
}

console.log('== renderSvg ==');
{
  const t = Q.memberPayload('u-ab12cd34ef', SECRET);
  const out = Q.renderSvg(t, { dark: '#101418' });
  ok(out.svg.startsWith('<svg'), 'mulai <svg');
  ok(out.svg.includes('aria-label="QR absensi"'), 'aria-label ada');
  ok(out.svg.includes('#101418'), 'warna tinta dipakai');
  const count = out.count;
  const rectCount = (out.svg.match(/<rect/g) || []).length;
  ok(rectCount >= 3 * 3 + 1, 'pola deteksi ada (finder pattern ~7 modul)');
  ok(rectCount < count * count / 2, 'run-merge memadatkan rect');
  ok(out.size > 100, 'ukuran masuk akal');
  // versi transparan (untuk kartu)
  const out2 = Q.renderSvg(t, { dark: 'currentColor', light: 'transparent' });
  ok(out2.svg.includes('fill="transparent"'), 'latar transparan');
}

console.log('== decode negatif ==');
{
  const size = 200;
  const white = new Uint8ClampedArray(size * size * 4).fill(255);
  const dec = Q.decodeFromImageData(white, size, size);
  ok(dec.ok === false, 'citra putih polos → tidak ada QR');
}

console.log(`\nhasil: ${pass} lulus, ${fail} gagal`);
process.exit(fail === 0 ? 0 : 1);
