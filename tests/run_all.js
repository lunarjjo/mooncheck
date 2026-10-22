#!/usr/bin/env node
/* mooncheck — runner seluruh test unit Node */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const suites = ['test_crypto.js', 'test_geo.js', 'test_qr.js', 'test_attendance.js', 'test_db.js'];
let totalFail = 0;

for (const s of suites) {
  const r = spawnSync('node', [path.join(__dirname, s)], { encoding: 'utf8', timeout: 240000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = /hasil: (\d+) lulus, (\d+) gagal/.exec(out);
  const pass = m ? +m[1] : 0, fail = m ? +m[2] : 1;
  totalFail += fail;
  console.log(`${fail === 0 ? 'OK ' : 'GAGAL'} ${s}: ${pass} lulus, ${fail} gagal${m ? '' : ' (tanpa ringkasan — lihat output)'}`);
  if (fail > 0 || !m) console.log(out.split('\n').slice(-12).join('\n'));
}

console.log(totalFail === 0 ? '\nSEMUA SUITE HIJAU' : `\n${totalFail} kegagalan`);
process.exit(totalFail === 0 ? 0 : 1);
