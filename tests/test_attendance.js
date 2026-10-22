/* mooncheck — test attendance.js (logika murni) */
'use strict';
const { makeSandbox, loadCore } = require('./harness');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) pass++; else { fail++; console.error('  FAIL:', name); }
}

const sb = makeSandbox();
loadCore(sb);
const A = sb.window.MC.attendance;
const DB = sb.window.MC.db;

const SET = {
  workDays: [1, 2, 3, 4, 5],
  workStart: '08:00', workEnd: '17:00', toleranceMin: 15
};

console.log('== konversi ==');
ok(A.minutesOfHHMM('08:00') === 480, '08:00 = 480');
ok(A.minutesOfHHMM('00:00') === 0, '00:00 = 0');
ok(A.minutesOfHHMM('23:59') === 1439, '23:59 = 1439');
ok(A.minutesOfHHMM('8:00') === null, 'format longgar ditolak');
ok(A.minutesOfHHMM('24:00') === null, '24:00 ditolak');
ok(A.minutesOfHHMM('') === null, 'kosong → null');
ok(A.hhmmOf('2026-10-23T07:55:00') === '07:55', 'hhmmOf naive');
ok(A.minutesOfAt('2026-10-23T07:55:00') === 475, 'minutesOfAt');

console.log('== hari kerja ==');
// 2026-10-23 adalah Jumat (5)
ok(A.dayOfWeek('2026-10-23') === 5, '23 Okt 2026 = Jumat');
ok(A.isWorkday('2026-10-23', SET) === true, 'Jumat kerja');
ok(A.isWorkday('2026-10-25', SET) === false, 'Minggu libur');   // 25 Okt 2026 = Minggu
ok(A.isWorkday('2026-10-24', SET) === false, 'Sabtu libur');

console.log('== status masuk ==');
ok(A.computeInStatus('2026-10-23', '2026-10-23T07:59:00', SET) === 'tepat', '07:59 tepat');
ok(A.computeInStatus('2026-10-23', '2026-10-23T08:15:00', SET) === 'tepat', '08:15 batas → tepat');
ok(A.computeInStatus('2026-10-23', '2026-10-23T08:16:00', SET) === 'telat', '08:16 telat');
ok(A.computeInStatus('2026-10-23', '2026-10-23T12:00:00', SET) === 'telat', '12:00 telat');
ok(A.computeInStatus('2026-10-23', '2026-10-23T07:00:00', SET) === 'tepat', 'sangat pagi tetap tepat');
ok(A.computeInStatus('2026-10-23', 'garbage', SET) === 'tepat', 'string rusak → default tepat');

console.log('== status pulang ==');
ok(A.computeOutStatus('x', '2026-10-23T16:59:00', SET) === 'cepat', '16:59 cepat');
ok(A.computeOutStatus('x', '2026-10-23T17:00:00', SET) === 'normal', '17:00 normal');
ok(A.computeOutStatus('x', '2026-10-23T17:15:00', SET) === 'normal', '17:15 batas → normal');
ok(A.computeOutStatus('x', '2026-10-23T17:16:00', SET) === 'lembur', '17:16 lembur');
ok(A.computeOutStatus('x', '2026-10-23T20:00:00', SET) === 'lembur', '20:00 lembur');

console.log('== menit kerja ==');
ok(A.workedMinutes('2026-10-23T08:00:00', '2026-10-23T17:00:00') === 540, '8 jam = 540 mnt');
ok(A.workedMinutes('2026-10-23T08:00:00', '2026-10-23T07:00:00') === 0, 'negatif dijepit 0');
ok(A.workedMinutes('a', 'b') === null, 'rusak → null');

console.log('== rentang & bulan ==');
{
  const r = A.dateRange('2026-10-30', '2026-11-02');
  ok(r.length === 4 && r[0] === '2026-10-30' && r[3] === '2026-11-02', 'rentang lintas bulan');
  ok(A.daysInMonth('2026-02') === 28, 'Feb 2026 = 28');
  ok(A.daysInMonth('2024-02') === 29, 'Feb 2024 kabisat = 29');
  ok(A.daysInMonth('2026-10') === 31, 'Okt = 31');
  const r2 = A.dateRange('2026-10-01', '2026-10-01');
  ok(r2.length === 1, 'satu hari');
}

console.log('== format ==');
ok(A.formatTanggal('2026-10-23') === 'Jum, 23 Oktober 2026', 'formatTanggal ID');
ok(A.minutesToHHMM(475) === '07:55', 'menitToHHMM');
ok(A.minutesToHHMM(null) === '—', 'menitToHHMM null');
ok(A.formatDuration(540) === '9 jam', 'formatDuration 9 jam');
ok(A.formatDuration(95) === '1 jam 35 mnt', 'formatDuration 1j35m');
ok(A.formatDuration(40) === '40 mnt', 'formatDuration 40 mnt');
ok(A.formatDuration(null) === '—', 'formatDuration null');

console.log('== dayState ==');
{
  const find = (uid, d) => (uid === 'u1' && d === '2026-10-23')
    ? { in: { at: '2026-10-23T08:05:00' }, out: null } : null;
  const leaveCover = () => null;
  const st = A.dayState('u1', '2026-10-23', find, leaveCover, SET);
  ok(st.state === 'in' && st.workday === true, 'sudah masuk');
  const st2 = A.dayState('u2', '2026-10-23', find, leaveCover, SET);
  ok(st2.state === 'none', 'belum apa pun');
  const st3 = A.dayState('u1', '2026-10-25', find, leaveCover, SET);
  ok(st3.state === 'none' && st3.workday === false, 'minggu → bukan hari kerja');
  const findDone = () => ({ in: { at: 'x' }, out: { at: 'y' } });
  ok(A.dayState('u1', '2026-10-23', findDone, leaveCover, SET).state === 'done', 'selesai');
  const lv = { type: 'sakit', start: '2026-10-23', end: '2026-10-23' };
  ok(A.dayState('u1', '2026-10-23', () => null, () => lv, SET).state === 'izin', 'izin menutup hari');
}

console.log('== monthStats ==');
{
  // Okt 2026: 1(kamis..?) — cek: 1 Okt 2026 = Kamis
  ok(A.dayOfWeek('2026-10-01') === 4, '1 Okt 2026 = Kamis');
  // kerja Sen-Jum → Okt 2026 punya 22 hari kerja
  const records = [
    { date: '2026-10-01', in: { at: '2026-10-01T08:10:00', status: 'tepat' }, out: { at: '2026-10-01T17:05:00' }, workedMin: 535 },
    { date: '2026-10-02', in: { at: '2026-10-02T09:30:00', status: 'telat' }, out: { at: '2026-10-02T17:30:00' }, workedMin: 480 },
    { date: '2026-10-05', in: { at: '2026-10-05T08:00:00', status: 'tepat' }, out: null, workedMin: null }
  ];
  const leaves = [
    { status: 'approved', start: '2026-10-08', end: '2026-10-09' }, // Kamis+Jumat
    { status: 'pending', start: '2026-10-12', end: '2026-10-12' },  // pending tak dihitung
    { status: 'rejected', start: '2026-10-15', end: '2026-10-15' }
  ];
  const st = A.monthStats('2026-10', records, leaves, SET, '2026-10-31');
  ok(st.workdays === 22, `hari kerja Okt = 22 (dapat ${st.workdays})`);
  ok(st.present === 3, 'hadir 3');
  ok(st.late === 1, 'telat 1');
  ok(st.leave === 2, 'izin 2');
  ok(st.absent === 22 - 3 - 2, 'tanpa keterangan = 17');
  ok(st.workedMin === 535 + 480, 'total menit');
  ok(st.avgIn === Math.round((490 + 570 + 480) / 3), 'rata-rata jam masuk');

  // bulan berjalan: hanya sampai hari ini
  const st2 = A.monthStats('2026-10', records, leaves, SET, '2026-10-02');
  ok(st2.totalDays === 2 && st2.workdays === 2, 'potong di hari berjalan');
  // bulan selain berjalan: penuh
  const st3 = A.monthStats('2026-09', [], [], SET, '2026-10-31');
  ok(st3.totalDays === 30, 'bulan lampau penuh');
}

console.log(`\nhasil: ${pass} lulus, ${fail} gagal`);
process.exit(fail === 0 ? 0 : 1);
