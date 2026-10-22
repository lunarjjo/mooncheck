/* mooncheck — test db.js: siklus hidup penuh lapisan data.
   Iterasi PBKDF2 diturunkan agar test cepat (produksi: 100rb via WebCrypto). */
'use strict';
const { makeSandbox, loadCore } = require('./harness');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) pass++; else { fail++; console.error('  FAIL:', name); }
}
async function throws(fn, code, name) {
  try { await fn(); ok(false, name + ' (tidak melempar)'); }
  catch (e) {
    ok(code ? e.code === code : true, name + ` (${e.code || e.name}: ${e.message})`);
  }
}

const sb = makeSandbox();
loadCore(sb);
const DB = sb.window.MC.db;
const SESS = sb.window.MC.session;
const CR = sb.window.MC.crypto;
CR.ITER_DEFAULT = 300; // test only

function raw() { return DB.raw(); }

(async () => {
  console.log('== init & setup ==');
  DB.init();
  ok(DB.needsSetup() === true, 'db kosong butuh setup');
  ok(raw().meta.appSecret.length > 20, 'appSecret dibuat');

  // validasi input setup
  await throws(() => DB.createUser({ username: 'ab', name: 'Admin', password: 'rahasia1' }), 'VALIDATION', 'username terlalu pendek');
  await throws(() => DB.createUser({ username: 'admin', name: 'A', password: 'rahasia1' }), 'VALIDATION', 'nama terlalu pendek');
  await throws(() => DB.createUser({ username: 'admin', name: 'Admin', password: '123' }), 'VALIDATION', 'password pendek');
  await throws(() => DB.createUser({ username: 'AD MIN', name: 'Admin', password: 'rahasia1' }), 'VALIDATION', 'username spasi');

  const admin = await DB.createUser({
    username: 'Admin', name: 'Admin Utama', password: 'rahasia-admin', role: 'admin'
  });
  ok(admin.username === 'admin', 'username dinormalkan kecil');
  ok(admin.role === 'admin', 'role admin');
  ok(DB.needsSetup() === false, 'setup selesai');

  console.log('== login & lockout ==');
  await throws(() => DB.login('admin', 'salah'), 'AUTH', 'password salah');
  await throws(() => DB.login('hantu', 'apa', ), 'AUTH', 'user tak dikenal');
  const u = await DB.login('admin', 'rahasia-admin');
  ok(u.id === admin.id, 'login sukses');
  ok(SESS.current() && SESS.current().userId === admin.id, 'sesi dibuat');
  ok(SESS.valid() && SESS.valid().userId === admin.id, 'sesi valid');

  // brute force lockout
  const sb2 = makeSandbox();
  loadCore(sb2);
  const DB2 = sb2.window.MC.db;
  sb2.window.MC.crypto.ITER_DEFAULT = 300;
  DB2.init();
  const adm2 = await DB2.createUser({ username: 'admin', name: 'Admin', password: 'pw-benar', role: 'admin' });
  sb2.window.MC.session.destroy();
  let locked = false;
  for (let i = 0; i < DB2.MAX_FAIL; i++) {
    try { await DB2.login('admin', 'pw-salah-' + i); } catch (e) {
      if (e.code === 'LOCKED') { locked = true; break; }
    }
  }
  ok(locked === true, 'terkunci setelah 5 gagal');
  await throws(() => DB2.login('admin', 'pw-benar'), 'LOCKED', 'login benar pun tertahan saat terkunci');
  // buka manual (meniru lewat masa kunci)
  const u2 = DB2.findByUsername('admin');
  u2.lockedUntil = 0; u2.failedAttempts = 0;
  const relogin = await DB2.login('admin', 'pw-benar');
  ok(relogin.id === adm2.id, 'login sukses setelah kunci berakhir');

  console.log('== sesi: kedaluwarsa & siklus ==');
  {
    SESS.current().expiresAt = Date.now() - 1000;
    ok(SESS.valid() === null, 'kedaluwarsa → null');
    SESS.current().expiresAt = Date.now() + 60000;
    SESS.touch();
    ok(SESS.valid() !== null, 'touch memperbarui');
    const sid = SESS.current().userId;
    SESS.destroy();
    ok(SESS.current() === null && SESS.valid() === null, 'destroy');
    // login ulang untuk lanjut test
    await DB.login('admin', 'rahasia-admin');
  }

  console.log('== pengelolaan pengguna ==');
  const budi = await DB.createUser({
    username: 'budi', name: 'Budi Santoso', password: 'pw-budi', role: 'member',
    phone: '0812', position: 'Staff'
  });
  ok(budi.role === 'member', 'member dibuat');
  await throws(() => DB.createUser({ username: 'budi', name: 'Budi Dua', password: 'x-pass1' }), 'DUPLICATE', 'username duplikat');

  // pembuatan user oleh non-admin ditolak
  const sb3 = makeSandbox();
  loadCore(sb3);
  const DB3 = sb3.window.MC.db;
  sb3.window.MC.crypto.ITER_DEFAULT = 300;
  DB3.init();
  await DB3.createUser({ username: 'root', name: 'Root', password: 'pw-root', role: 'admin' });
  await DB3.login('root', 'pw-root');
  await DB3.createUser({ username: 'member1', name: 'Member Satu', password: 'pw-mem', role: 'member' });
  sb3.window.MC.session.destroy();
  await DB3.login('member1', 'pw-mem');
  await throws(() => DB3.createUser({ username: 'member2', name: 'M2', password: 'pw-mem' }), 'AUTH', 'member tak bisa buat user');
  await throws(() => DB3.createUser({ username: 'admin2', name: 'A2', password: 'pw-adm', role: 'admin' }), 'AUTH', 'member tak bisa buat admin');

  // update guard
  sb3.window.MC.session.destroy();
  await DB3.login('member1', 'pw-mem');
  const m1 = DB3.findByUsername('member1');
  await throws(() => DB3.updateUser(m1.id, { active: false }), 'AUTH', 'member tak bisa nonaktifkan (termasuk dirinya)');
  DB.updateUser(budi.id, { phone: '081234567890', position: 'Supir' });
  ok(DB.getUser(budi.id).phone === '081234567890', 'update profil');
  await throws(() => DB.updateUser('u-nonexistent-guard', { name: 'X' }), 'NOT_FOUND', 'user tak dikenal → NOT_FOUND');

  console.log('== ganti & reset password ==');
  await throws(() => DB.changePassword(budi.id, 'salah', 'baru123'), 'AUTH', 'password lama salah');
  await DB.changePassword(budi.id, 'pw-budi', 'pw-baru123');
  sb3.window.MC.session.destroy();
  const budi2 = await DB3.login('member1', 'pw-mem'); // tidak berubah di DB3
  ok(budi2.username === 'member1', 'DB3 independen dari DB');
  await throws(() => DB.adminResetPassword(budi.id, 'x', admin.id), 'VALIDATION', 'reset password lemah');
  await DB.adminResetPassword(budi.id, 'pw-reset1', admin.id);
  const budi3 = await DB.login('budi', 'pw-reset1');
  ok(budi3.id === budi.id, 'login dengan password hasil reset');
  // kembali ke sesi admin untuk operasi berikutnya
  await DB.login('admin', 'rahasia-admin');

  console.log('== absensi: check-in/out ==');
  await throws(() => DB.checkIn('u-tidakada', null, 'self'), 'NOT_FOUND', 'user tak dikenal');
  const rec1 = DB.checkIn(budi.id, { lat: -6.1755, lng: 106.8273, acc: 12 }, 'self', 'hadir rapat pagi');
  ok(rec1.date === DB.todayStr(), 'tanggal hari ini');
  ok(rec1.in && rec1.in.method === 'self', 'metode self');
  ok(rec1.in.dist == null, 'jarak null saat geofence belum diatur');

  await throws(() => DB.checkIn(budi.id, null, 'self'), 'VALIDATION', 'double check-in ditolak');
  // admin koreksi jam masuk → deterministik
  const fixed = DB.updateAttendance(rec1.id, { inAt: '07:55' }, admin.id);
  ok(fixed.in.at === DB.todayStr() + 'T07:55:00', 'jam masuk dikoreksi');
  ok(fixed.in.status === 'tepat', '07:55 → tepat');
  ok(fixed.edited === true && fixed.editedBy === admin.id, 'jejak edit');

  const out1 = DB.checkOut(budi.id, { lat: -6.1756, lng: 106.8274, acc: 10 }, 'self');
  ok(out1.out && out1.workedMin != null, 'checkout tercatat');
  await throws(() => DB.checkOut(budi.id, null, 'self'), 'VALIDATION', 'double checkout ditolak');

  // koreksi: pulang sebelum masuk ditolak
  await throws(() => DB.updateAttendance(rec1.id, { outAt: '06:00' }, admin.id), 'VALIDATION', 'pulang < masuk');
  // koreksi valid
  const rec1b = DB.updateAttendance(rec1.id, { outAt: '17:10' }, admin.id);
  ok(rec1b.out.status === 'normal', '17:10 → normal');
  ok(rec1b.workedMin === 555, 'menit kerja 555');

  console.log('== absensi QR (qrCheck) ==');
  var qRec = DB.qrCheck(admin.id, 'auto', { lat: -6.175, lng: 106.827, acc: 9 });
  ok(qRec.action === 'in' && qRec.rec.in.method === 'qr', 'scan pertama = check-in qr');
  const qRec2 = DB.qrCheck(admin.id, 'auto', null);
  ok(qRec2.action === 'out' && qRec2.rec.out.method === 'qr', 'scan kedua = check-out');
  await throws(() => DB.qrCheck(admin.id, 'auto', null), 'VALIDATION', 'scan ketiga ditolak');
  await throws(() => DB.qrCheck('u-hantu', 'auto', null), 'NOT_FOUND', 'QR user tak dikenal');

  console.log('== izin ==');
  await throws(() => DB.requestLeave(budi.id, 'jalan-jalan', '2026-11-02', '2026-11-03', 'liburan'), 'VALIDATION', 'jenis izin invalid');
  await throws(() => DB.requestLeave(budi.id, 'sakit', '2026-11-03', '2026-11-02', 'sakit apa ya'), 'VALIDATION', 'selesai < mulai');
  await throws(() => DB.requestLeave(budi.id, 'sakit', '2026-11-02', '2026-11-03', 'ab'), 'VALIDATION', 'alasan pendek');
  const lv1 = DB.requestLeave(budi.id, 'sakit', '2026-11-02', '2026-11-03', 'demam tinggi');
  ok(lv1.status === 'pending', 'izin pending');
  await throws(() => DB.requestLeave(budi.id, 'cuti', '2026-11-03', '2026-11-05', 'tumpang tindih'), 'VALIDATION', 'tumpang tindih ditolak');
  await throws(() => DB.decideLeave(lv1.id, true, budi.id), 'AUTH', 'member tak bisa menyetujui');
  DB.decideLeave(lv1.id, true, admin.id);
  ok(DB.listLeaves({ status: 'approved' }).length === 1, 'disetujui');
  ok(DB.leaveCovering(budi.id, '2026-11-02') != null, 'menutup 2 Nov');
  ok(DB.leaveCovering(budi.id, '2026-11-04') == null, 'tidak menutup 4 Nov');
  const lv2 = DB.requestLeave(budi.id, 'cuti', '2026-11-05', '2026-11-05', 'acara keluarga');
  DB.decideLeave(lv2.id, false, admin.id);
  await throws(() => DB.decideLeave(lv2.id, true, admin.id), 'VALIDATION', 'keputusan ganda ditolak');

  console.log('== pengaturan ==');
  await throws(() => DB.updateSettings({ workStart: '25:00' }), 'VALIDATION', 'jam invalid');
  await throws(() => DB.updateSettings({ workEnd: '07:00' }), 'VALIDATION', 'pulang ≤ masuk');
  await throws(() => DB.updateSettings({ geo: { lat: 999, lng: 0, radiusM: 100 } }), 'VALIDATION', 'lat di luar jangkauan');
  await throws(() => DB.updateSettings({ geo: { lat: -6.1, lng: null, radiusM: 100 } }), 'VALIDATION', 'lat tanpa lng');
  DB.updateSettings({ orgName: 'PT Contoh', workStart: '08:00', workEnd: '17:00', toleranceMin: 15,
    geo: { lat: -6.1754, lng: 106.8272, radiusM: 300, name: 'Kantor Pusat' } });
  const st = DB.getSettings();
  ok(st.orgName === 'PT Contoh', 'orgName');
  ok(st.geo.lat === -6.1754 && st.geo.radiusM === 300, 'geofence terpasang');

  console.log('== CSV ==');
  {
    const csv = DB.exportAttendanceCsv({});
    ok(csv.charCodeAt(0) === 0xFEFF, 'BOM UTF-8');
    ok(csv.includes('tanggal,username,nama'), 'header');
    ok(csv.includes('budi,Budi Santoso'), 'baris budi');
    ok(csv.includes('\r\n'), 'CRLF');
    // catatan dengan koma & kutip
    const noteRec = DB.listAttendance({ userId: budi.id })[0];
    noteRec.note = 'rapat "urgent", pagi';
    const csv2 = DB.exportAttendanceCsv({});
    ok(csv2.includes('"rapat ""urgent"", pagi"'), 'escaping CSV');
  }

  console.log('== backup: ekspor/impor ==');
  const dump = DB.exportJson();
  const parsed = JSON.parse(dump);
  ok(parsed.users.length >= 2, 'user ikut terekspor');
  ok(typeof parsed.meta.appSecret === 'string', 'secret ikut (didokumentasikan)');
  // impor ditolak bila rusak
  await throws(() => DB.importJson('{bukan json'), 'VALIDATION', 'json rusak');
  await throws(() => DB.importJson('{"hello":1}'), 'VALIDATION', 'struktur salah');
  await throws(() => DB.importJson(JSON.stringify({ ...parsed, users: [] })), 'VALIDATION', 'tanpa admin');
  // siklus: wipe → impor penuh
  DB.wipeAll(admin.id);
  ok(raw().users.length === 0, 'wipe mengosongkan');
  ok(SESS.current() === null, 'sesi dimatikan saat wipe');
  DB.importJson(dump, admin.id);
  ok(raw().users.length === parsed.users.length, 'impor memulihkan user');
  ok(DB.findByUsername('budi') != null, 'budi kembali');
  await DB.login('budi', 'pw-reset1');
  ok(SESS.valid() && SESS.valid().userId === budi.id, 'password tetap valid pasca-impor');

  console.log('== audit ==');
  {
    // periksa keberadaan peristiwa SEBELUM banjir filler (batas 500 akan memangkas yang lama)
    const evts = raw().audit.map(a => a.event);
    ok(evts.includes('login.success'), 'audit login sukses');
    ok(evts.includes('user.create'), 'audit buat user');
    ok(evts.includes('attendance.edit'), 'audit koreksi');
    ok(evts.includes('backup.import'), 'audit impor');

    const oldest = raw().audit[0].event;
    for (let i = 0; i < 550; i++) DB.log('test.filler', { i }, admin.id);
    ok(raw().audit.length <= 500, 'batas 500 terjaga (' + raw().audit.length + ')');
    ok(raw().audit.length === 500, 'tepat 500 setelah pemangkasan');
    const latest = DB.listAudit(3);
    ok(latest.length === 3 && latest[0].event === 'test.filler', 'urutan terbaru dulu');
    ok(raw().audit.filter(a => a.event === 'test.filler').length === 500, 'isi kini dominan filler (peristiwa lama terpangkas)');
  }

  console.log('== hapus pengguna (guard admin terakhir) ==');
  await throws(() => DB.deleteUser(admin.id, admin.id), 'VALIDATION', 'tak bisa hapus diri sendiri');
  await throws(() => DB.deleteUser(budi.id, budi.id), 'AUTH', 'member tak bisa hapus');
  const adminCount = raw().users.filter(x => x.role === 'admin' && x.active !== false).length;
  DB.deleteUser(budi.id, admin.id);
  ok(DB.getUser(budi.id) == null, 'budi terhapus');
  ok(raw().attendance.every(a => a.userId !== budi.id), 'absensi budi ikut terhapus');

  console.log(`\nhasil: ${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
