/* ============================================================
 * mooncheck — pages/reports.js (admin)
 * Laporan bulanan: matriks tanggal × anggota dengan kode status
 * (H hadir, T telat, I izin, A tanpa ket., L libur) + ekspor CSV.
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};
  var UI = MC.ui, DB = MC.db, A = MC.attendance;

  MC.app.route('reports', function (page, user) {
    var s = DB.getSettings();
    var current = DB.todayStr().slice(0, 7);
    var body = UI.el('div', {});

    function render() {
      UI.clear(body);
      var users = DB.listUsers().filter(function (u) { return u.active !== false; });
      var days = A.daysInMonth(current);
      var todayStr = DB.todayStr();
      var todayNum = (todayStr.slice(0, 7) === current) ? +todayStr.slice(8, 10) : days;

      /* indeks data */
      var recBy = {};   // userId -> {date -> rec}
      users.forEach(function (u) { recBy[u.id] = {}; });
      DB.listAttendance({ from: current + '-01', to: current + '-31' }).forEach(function (r) {
        if (recBy[r.userId]) recBy[r.userId][r.date] = r;
      });
      var leaveBy = {};
      DB.listLeaves({ status: 'approved' }).forEach(function (l) {
        A.dateRange(l.start, l.end).forEach(function (d) {
          if (d.slice(0, 7) === current) {
            leaveBy[l.userId] = leaveBy[l.userId] || {};
            leaveBy[l.userId][d] = l;
          }
        });
      });

      /* header bulan + ringkasan */
      var totH = 0, totT = 0, totA = 0, totI = 0;
      var cells = {}; // userId -> array kode per hari

      users.forEach(function (u) {
        cells[u.id] = [];
        for (var day = 1; day <= days; day++) {
          var ds = current + '-' + (day < 10 ? '0' : '') + day;
          var code;
          if (!A.isWorkday(ds, s)) code = 'L';
          else if (day > todayNum) code = '·';
          else if (leaveBy[u.id] && leaveBy[u.id][ds]) { code = 'I'; totI++; }
          else if (recBy[u.id][ds] && recBy[u.id][ds].in) {
            var st = recBy[u.id][ds].in.status;
            code = st === 'telat' ? 'T' : 'H';
            if (code === 'T') totT++; else totH++;
          }
          else { code = 'A'; totA++; }
          cells[u.id].push(code);
        }
      });

      /* tanggal pemilih bulan */
      var prev = UI.el('button', { class: 'icon-btn', text: '‹', style: { fontSize: '22px', width: '36px' }, 'aria-label': 'Bulan sebelumnya' });
      var next = UI.el('button', { class: 'icon-btn', text: '›', style: { fontSize: '22px', width: '36px' }, 'aria-label': 'Bulan berikutnya' });
      var label = UI.el('span', { class: 'muted', style: { fontWeight: 700 }, text: A.MONTH_ID[+current.slice(5, 7) - 1] + ' ' + current.slice(0, 4) });
      function shift(d) {
        var dt = new Date(+current.slice(0, 4), +current.slice(5, 7) - 1 + d, 1);
        current = dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2);
        render();
      }
      prev.addEventListener('click', function () { shift(-1); });
      next.addEventListener('click', function () { shift(1); });

      body.appendChild(UI.el('div', { class: 'row between mb16' }, [prev, label, next]));

      body.appendChild(UI.el('div', { class: 'card' }, [
        UI.el('div', { class: 'card-title', text: 'Ringkasan ' + label.textContent }),
        UI.el('div', { class: 'grid cols-4' }, [
          tile(totH, 'Hadir tepat'),
          tile(totT, 'Telat'),
          tile(totA, 'Tanpa Ket.'),
          tile(totI, 'Izin')
        ])
      ]));

      /* matriks */
      var table = UI.el('table', { class: 'mc' });
      var thead = UI.el('tr', {}, [UI.el('th', { text: 'Anggota' })]);
      for (var d = 1; d <= days; d++) {
        thead.appendChild(UI.el('th', { class: 'mtx', text: String(d) }));
      }
      thead.appendChild(UI.el('th', { class: 'mtx', text: 'H/T/A/I' }));
      var headRow = UI.el('thead', {}, [thead]);
      table.appendChild(headRow);

      var tbody = UI.el('tbody');
      users.forEach(function (u) {
        var tr = UI.el('tr', {}, [
          UI.el('td', { style: { whiteSpace: 'nowrap', fontWeight: 600 }, text: u.name.split(' ')[0] })
        ]);
        var cH = 0, cT = 0, cA = 0, cI = 0;
        cells[u.id].forEach(function (code) {
          if (code === 'H') cH++; else if (code === 'T') cT++; else if (code === 'A') cA++; else if (code === 'I') cI++;
          tr.appendChild(UI.el('td', { class: 'mtx mtx-' + code, text: code }));
        });
        tr.appendChild(UI.el('td', {
          class: 'mtx tiny',
          text: cH + '/' + cT + '/' + cA + '/' + cI,
          title: 'hadir/telat/tanpa ket./izin'
        }));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      body.appendChild(UI.el('div', { class: 'card' }, [
        UI.el('div', { class: 'card-title', text: 'Matriks Harian' }),
        UI.el('div', { class: 'table-wrap' }, [table]),
        UI.el('div', { class: 'tiny muted mt8', text: 'H hadir · T telat · I izin · A tanpa keterangan · L hari libur · · masa depan' })
      ]));

      /* ekspor CSV matriks */
      body.appendChild(UI.el('button', {
        class: 'btn tonal block',
        onclick: function () {
          var lines = [['anggota'].concat(
            Array.from({ length: days }, function (_, i) { return String(i + 1); }),
            ['hadir', 'telat', 'tanpa_ket', 'izin']).map(DB.csvEscape).join(',')];
          users.forEach(function (u) {
            var row = [u.name].concat(cells[u.id]);
            var cH = 0, cT = 0, cA = 0, cI = 0;
            cells[u.id].forEach(function (code) {
              if (code === 'H') cH++; else if (code === 'T') cT++; else if (code === 'A') cA++; else if (code === 'I') cI++;
            });
            row.push(cH, cT, cA, cI);
            lines.push(row.map(DB.csvEscape).join(','));
          });
          var csv = '\uFEFF' + lines.join('\r\n');
          var fname = 'mooncheck-laporan-' + current + '.csv';
          if (DB.download(fname, csv, 'text/csv')) {
            UI.toast('Laporan disiapkan: ' + fname, 'ok', 3200);
          }
        }
      }, [UI.icon('download', 19), 'Ekspor Matriks CSV']));
    }

    function tile(num, label) {
      return UI.el('div', { class: 'stat-tile' }, [
        UI.el('div', { class: 'st-num', text: String(num) }),
        UI.el('div', { class: 'st-label', text: label })
      ]);
    }

    render();
    page.appendChild(body);
  });
})(typeof window !== 'undefined' ? window : globalThis);
