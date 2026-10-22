/* ============================================================
 * mooncheck — attendance.js
 * Logika absensi MURNI (tanpa storage) — mudah diuji:
 *  - konversi jam "HH:MM" ↔ menit-hari
 *  - status masuk (tepat/telat) & pulang (cepat/normal/lembur)
 *  - menit kerja
 *  - status hari ini per pengguna (untuk layar utama)
 *  - statistik bulanan (hadir/telat/tidak hadir/izin)
 *
 * SEMUA jam absensi berformat lokal naive "YYYY-MM-DDTHH:MM:SS".
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};

  /* ---------- konversi ---------- */

  function minutesOfHHMM(hhmm) {
    var m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || ''));
    if (!m) return null;
    return (+m[1]) * 60 + (+m[2]);
  }

  /* Ambil "HH:MM" dari string naive apa pun */
  function hhmmOf(atStr) {
    return String(atStr || '').slice(11, 16);
  }

  function minutesOfAt(atStr) {
    return minutesOfHHMM(hhmmOf(atStr));
  }

  /* hari dalam minggu (0=Minggu) dari "YYYY-MM-DD" */
  function dayOfWeek(dateStr) {
    var p = String(dateStr).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]).getDay();
  }

  function isWorkday(dateStr, settings) {
    return settings.workDays.indexOf(dayOfWeek(dateStr)) >= 0;
  }

  /* ---------- status ---------- */

  /* masuk: 'tepat' bila ≤ workStart+tolerance, selain itu 'telat' */
  function computeInStatus(dateStr, inAt, settings) {
    var inMin = minutesOfAt(inAt);
    var start = minutesOfHHMM(settings.workStart);
    if (inMin == null || start == null) return 'tepat';
    return (inMin <= start + (settings.toleranceMin || 0)) ? 'tepat' : 'telat';
  }

  /* pulang: 'cepat' < workEnd; 'normal' ≤ workEnd+toleransi; 'lembur' lebih dari itu */
  function computeOutStatus(inAt, outAt, settings) {
    var outMin = minutesOfAt(outAt);
    var end = minutesOfHHMM(settings.workEnd);
    if (outMin == null || end == null) return 'normal';
    if (outMin < end) return 'cepat';
    if (outMin <= end + (settings.toleranceMin || 0)) return 'normal';
    return 'lembur';
  }

  function workedMinutes(inAt, outAt) {
    var a = minutesOfAt(inAt), b = minutesOfAt(outAt);
    if (a == null || b == null) return null;
    return Math.max(0, b - a);
  }

  /* ---------- status hari ini (layar utama) ---------- */
  /* Butuh db via fungsi pembaca agar modul ini tetap murni. */
  function dayState(userId, dateStr, findRecFn, leaveCoveringFn, settings) {
    var leave = leaveCoveringFn(userId, dateStr);
    var rec = findRecFn(userId, dateStr);
    var workday = isWorkday(dateStr, settings);
    if (rec && rec.in && rec.out) {
      return { state: 'done', rec: rec, leave: leave, workday: workday };
    }
    if (rec && rec.in) {
      return { state: 'in', rec: rec, leave: leave, workday: workday };
    }
    if (leave) {
      return { state: 'izin', rec: null, leave: leave, workday: workday };
    }
    return { state: 'none', rec: null, leave: null, workday: workday };
  }

  /* ---------- rentang tanggal ---------- */

  function dateRange(fromStr, toStr) {
    var out = [];
    var fp = String(fromStr).split('-'), tp = String(toStr).split('-');
    var d = new Date(+fp[0], +fp[1] - 1, +fp[2]);
    var end = new Date(+tp[0], +tp[1] - 1, +tp[2]);
    var guard = 0;
    while (d <= end && guard < 500) {
      out.push(MC.db.dateStrOf(d));
      d.setDate(d.getDate() + 1);
      guard++;
    }
    return out;
  }

  function daysInMonth(monthStr) {
    var p = String(monthStr).split('-');
    return new Date(+p[0], +p[1], 0).getDate();
  }

  /* ---------- statistik bulanan ---------- */
  /* records: daftar absensi user tsb; leaves: daftar izin user tsb */
  function monthStats(monthStr, records, leaves, settings, todayDateStr) {
    var ym = String(monthStr);
    var n = daysInMonth(ym);
    var today = String(todayDateStr || MC.db.todayStr());
    var todayNum = (today.slice(0, 7) === ym) ? parseInt(today.slice(8, 10), 10) : n;

    var byDate = {};
    records.forEach(function (r) {
      if (r.date.slice(0, 7) === ym && r.in) byDate[r.date] = r;
    });
    var approved = {};
    leaves.forEach(function (l) {
      if (l.status !== 'approved') return;
      var range = dateRange(l.start, l.end);
      range.forEach(function (d) { if (d.slice(0, 7) === ym) approved[d] = l; });
    });

    var stats = {
      month: ym, totalDays: todayNum, workdays: 0, present: 0, late: 0,
      absent: 0, leave: 0, workedMin: 0, avgIn: null, avgOut: null
    };
    var inMins = [], outMins = [];
    for (var day = 1; day <= todayNum; day++) {
      var ds = ym + '-' + (day < 10 ? '0' : '') + day;
      if (!isWorkday(ds, settings)) continue;
      stats.workdays++;
      if (approved[ds]) { stats.leave++; continue; }
      var rec = byDate[ds];
      if (rec) {
        stats.present++;
        if (rec.in.status === 'telat') stats.late++;
        if (rec.workedMin != null) stats.workedMin += rec.workedMin;
        var im = minutesOfAt(rec.in.at);
        if (im != null) inMins.push(im);
        if (rec.out) {
          var om = minutesOfAt(rec.out.at);
          if (om != null) outMins.push(om);
        }
      } else {
        stats.absent++;
      }
    }
    if (inMins.length) {
      stats.avgIn = Math.round(inMins.reduce(function (a, b) { return a + b; }, 0) / inMins.length);
    }
    if (outMins.length) {
      stats.avgOut = Math.round(outMins.reduce(function (a, b) { return a + b; }, 0) / outMins.length);
    }
    return stats;
  }

  function minutesToHHMM(mins) {
    if (mins == null) return '—';
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function formatDuration(mins) {
    if (mins == null) return '—';
    var h = Math.floor(mins / 60), m = mins % 60;
    if (h <= 0) return m + ' mnt';
    return m > 0 ? (h + ' jam ' + m + ' mnt') : (h + ' jam');
  }

  var DAY_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  var MONTH_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function formatTanggal(dateStr) {
    var p = String(dateStr || '').split('-');
    if (p.length !== 3) return String(dateStr || '');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return DAY_ID[d.getDay()] + ', ' + (+p[2]) + ' ' + MONTH_ID[+p[1] - 1] + ' ' + p[0];
  }

  MC.attendance = {
    minutesOfHHMM: minutesOfHHMM,
    hhmmOf: hhmmOf,
    minutesOfAt: minutesOfAt,
    dayOfWeek: dayOfWeek,
    isWorkday: isWorkday,
    computeInStatus: computeInStatus,
    computeOutStatus: computeOutStatus,
    workedMinutes: workedMinutes,
    dayState: dayState,
    dateRange: dateRange,
    daysInMonth: daysInMonth,
    monthStats: monthStats,
    minutesToHHMM: minutesToHHMM,
    formatDuration: formatDuration,
    formatTanggal: formatTanggal,
    DAY_ID: DAY_ID,
    MONTH_ID: MONTH_ID
  };
})(typeof window !== 'undefined' ? window : globalThis);
