/* ============================================================
 * mooncheck — pages/history.js
 * Riwayat absensi anggota: pilih bulan, kalender status,
 * statistik, dan daftar catatan.
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};
  var UI = MC.ui, DB = MC.db, A = MC.attendance;

  function monthPicker(current, onChange) {
    var label = UI.el('span', { class: 'muted', style: { fontWeight: 700 } });
    function fmt(ym) {
      var m = +ym.slice(5, 7) - 1;
      return A.MONTH_ID[m] + ' ' + ym.slice(0, 4);
    }
    function shift(delta) {
      var y = +current.slice(0, 4), m = +current.slice(5, 7) - 1 + delta;
      var d = new Date(y, m, 1);
      current = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
      label.textContent = fmt(current);
      onChange(current);
    }
    var prev = UI.el('button', { class: 'icon-btn', 'aria-label': 'Bulan sebelumnya', text: '‹', style: { fontSize: '22px', width: '36px' } });
    var next = UI.el('button', { class: 'icon-btn', 'aria-label': 'Bulan berikutnya', text: '›', style: { fontSize: '22px', width: '36px' } });
    prev.addEventListener('click', function () { shift(-1); });
    next.addEventListener('click', function () { shift(1); });
    label.textContent = fmt(current);
    var wrap = UI.el('div', { class: 'row between mb16' }, [prev, label, next]);
    return { node: wrap };
  }

  function calendarGrid(month, recs, leaves, settings, todayStr) {
    var byDate = {};
    recs.forEach(function (r) { if (r.in) byDate[r.date] = r; });
    var approved = {};
    leaves.forEach(function (l) {
      if (l.status !== 'approved') return;
      A.dateRange(l.start, l.end).forEach(function (d) { if (d.slice(0, 7) === month) approved[d] = l; });
    });

    var days = A.daysInMonth(month);
    var first = month + '-01';
    var lead = A.dayOfWeek(first);              // sel kosong sebelum tanggal 1
    var todayNum = (todayStr.slice(0, 7) === month) ? +todayStr.slice(8, 10) : 0;

    var grid = UI.el('div', { class: 'cal-grid' });
    A.DAY_ID.forEach(function (d) {
      grid.appendChild(UI.el('div', { class: 'cal-head', text: d }));
    });
    for (var i = 0; i < lead; i++) grid.appendChild(UI.el('div', { class: 'cal-cell off', text: '' }));

    for (var day = 1; day <= days; day++) {
      var ds = month + '-' + (day < 10 ? '0' : '') + day;
      var workday = A.isWorkday(ds, settings);
      var st = 'libur', title = ds + ' — hari libur';
      if (!workday) {
        st = 'libur';
      } else if (approved[ds]) {
        st = 'izin'; title = ds + ' — izin ' + approved[ds].type;
      } else if (byDate[ds]) {
        st = byDate[ds].in.status === 'telat' ? 'telat' : 'hadir';
        title = ds + ' — masuk ' + byDate[ds].in.at.slice(11, 16) +
          (byDate[ds].out ? ', pulang ' + byDate[ds].out.at.slice(11, 16) : '');
      } else if (day <= todayNum || todayNum === 0) {
        st = 'alfa'; title = ds + ' — tanpa keterangan';
      }
      var cell = UI.el('div', {
        class: 'cal-cell' + (day === todayNum ? ' today' : ''),
        title: title,
        dataset: { st: st },
        text: String(day)
      });
      cell.appendChild(UI.el('span', { class: 'cal-dot' }));
      grid.appendChild(cell);
    }
    return grid;
  }

  MC.app.route('history', function (page, user) {
    var s = DB.getSettings();
    var current = DB.todayStr().slice(0, 7);
    var body = UI.el('div', {});

    function render() {
      UI.clear(body);
      var recs = DB.listAttendance({ userId: user.id, from: current + '-01', to: current + '-31' });
      var leaves = DB.listLeaves({ userId: user.id });
      var stats = A.monthStats(current, recs, leaves, s, DB.todayStr());

      body.appendChild(monthPickerNode);
      body.appendChild(UI.el('div', { class: 'card' }, [
        calendarGrid(current, recs, leaves, s, DB.todayStr())
      ]));

      body.appendChild(UI.el('div', { class: 'card' }, [
        UI.el('div', { class: 'card-title', text: 'Statistik Bulan' }),
        UI.el('div', { class: 'grid cols-4' }, [
          tile(stats.present, 'Hadir'),
          tile(stats.late, 'Telat'),
          tile(stats.absent, 'Tanpa Ket.'),
          tile(stats.leave, 'Izin')
        ]),
        UI.el('div', { class: 'tiny center mt8', text:
          'Hari kerja terlewati: ' + stats.workdays + ' · total ' + UI.dur(stats.workedMin) +
          ' · rata-rata masuk ' + A.minutesToHHMM(stats.avgIn) + ', pulang ' + A.minutesToHHMM(stats.avgOut) })
      ]));

      /* daftar catatan */
      var list = UI.el('div', { class: 'card' }, [UI.el('div', { class: 'card-title', text: 'Catatan Absensi' })]);
      if (!recs.length) {
        list.appendChild(UI.emptyState('calendar', 'Belum ada absensi pada bulan ini.'));
      } else {
        recs.forEach(function (r) {
          var right = UI.el('div', { class: 'row' }, [UI.statusChip(r.in ? r.in.status : 'alfa')]);
          if (r.out) right.appendChild(UI.statusChip(r.out.status));
          if (r.edited) right.appendChild(UI.statusChip('pending', 'Dikoreksi'));
          list.appendChild(UI.listItem({
            icon: 'clock',
            title: A.formatTanggal(r.date),
            sub: (r.in ? 'Masuk ' + r.in.at.slice(11, 16) : 'tanpa masuk') +
              (r.out ? ' · Pulang ' + r.out.at.slice(11, 16) : '') +
              (r.workedMin != null ? ' · ' + UI.dur(r.workedMin) : '') +
              (r.note ? ' · ' + r.note : ''),
            right: right
          }));
        });
      }
      body.appendChild(list);
    }

    function tile(num, label) {
      return UI.el('div', { class: 'stat-tile' }, [
        UI.el('div', { class: 'st-num', text: String(num) }),
        UI.el('div', { class: 'st-label', text: label })
      ]);
    }

    var picker = monthPicker(current, function (ym) { current = ym; render(); });
    var monthPickerNode = picker.node;
    render();
    page.appendChild(body);
  });
})(typeof window !== 'undefined' ? window : globalThis);
