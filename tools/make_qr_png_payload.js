/* Ekspor matrix QR budi sebagai teks (baris 'X'/'.') untuk digambar PIL */
'use strict';
const { makeSandbox, loadCore } = require('../tests/harness');

const sb = makeSandbox();
loadCore(sb);
const Q = sb.window.MC.qrlib;

// pulihkan db dari dump E2E browser? Lebih sederhana: pakai db tes sendiri
// dengan secret yang SAMA dengan browser tidak dimungkinkan (random per db).
// → jalankan di browser via agent-browser eval dan kembalikan payloadnya.
// Skrip ini dipakai untuk memvalidasi payload yang diberikan (argumen 1).
const payload = process.argv[2];
if (!payload) {
  console.error('pemakaian: node make_qr_png_payload.js "<payload>"');
  process.exit(2);
}
const m = Q.makeMatrix(payload);
const n = m.getModuleCount();
const lines = [];
for (let y = 0; y < n; y++) {
  let s = '';
  for (let x = 0; x < n; x++) s += m.isDark(y, x) ? 'X' : '.';
  lines.push(s);
}
require('fs').writeFileSync('/home/z/my-project/scripts/mooncheck_dev/tools/qr_matrix.txt', lines.join('\n'));
console.log('matrix', n + 'x' + n, 'ditulis; payload:', payload);
