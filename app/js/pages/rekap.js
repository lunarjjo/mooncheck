/* ============================================================
 * mooncheck — pages/rekap.js (admin)
 * Rekap seluruh absensi: filter tanggal/anggota/status, koreksi
 * jam (dengan jejak edit), hapus, dan ekspor CSV.
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};
  var UI = MC.ui, DB = MC.db, A = MC.attendance;

  function parseQuery() {
    var out = {};
    var qs = (location.hash.split('?')[1] || '');
    qs.split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p[0]) out[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    return out;
  }

  function formCorrect(rec) {
    var user = DB.getUser(rec.userId) || { name: '?' };
    var fIn = UI.input({ class: 'input mono', type: 'time', value: rec.in ? rec.in.at.slice(11, 16) : '' });
    var fOut = UI.input({ class: 'input mono', type: 'time', value: rec.out ? rec.out.at.slice(11, 16) : '' });
    var fNote = UI.input({ class: 'input', value: rec.note || '', maxlength: 200, placeholder: 'catatan koreksi' });

    var body = UI.el('div', {}, [
      UI.el('div', { class: 'tiny muted mb8', text: user.name + ' · ' + A.formatTanggal(rec.date) + (rec.edited ? ' · sudah pernah dikoreksi' : '') }),
      UI.field('Jam masuk (kosongkan untuk hapus)', fIn),
      UI.field('Jam pulang (kosongkan untuk hapus)', fOut),
      UI.field('Catatan', fNote)
    ]);

    UI.modal({
      title: 'Koreksi Absensi',
      body: body,
      actions: [
        { label: 'Batal' },
        {
          label: 'Simpan Koreksi', cls: 'primary',
          onClick: function (close) {
            try {
              DB.updateAttendance(rec.id, {
                inAt: fIn.value,
                outAt: fOut.value,
                note: fNote.value
              });
              UI.toast('Koreksi tersimpan.', 'ok');
              close();
              MC.app.navigate();
            } catch (e) { UI.showErr(e); }
          }
        }
      ]
    });
  }

  MC.app.route('rekap', function (page, user) {
    var q = parseQuery();
    var s = DB.getSettings();

    var fDate = UI.input({ class: 'input', type: 'date', value: q.date || DB.todayStr() });
    var userSel = UI.el('select', { class: 'input' }, [
      UI.el('option', { value: '', text: 'Semua anggota' })
    ]);
    DB.listUsers(true).forEach(function (u) {
      var o = UI.el('option', { value: u.id, text: u.name + (u.active === false ? ' (nonaktif)' : '') });
      if (q.user === u.id) o.selected = true;
      userSel.appendChild(o);
    });
    var statusSel = UI.el('select', { class: 'input' }, [
      UI.el('option', { value: '', text: 'Semua status' }),
      UI.el('option', { value: 'tepat', text: 'Tepat waktu' }),
      UI.el('option', { value: 'telat', text: 'Telat' })
    ]);

    var listWrap = UI.el('div', { class: 'card' });
    var dateLabel = UI.el('div', { class: 'tiny muted', style: { textAlign: 'center', marginTop: '6px' } });

    function render() {
      UI.clear(listWrap);
      var date = fDate.value || DB.todayStr();
      dateLabel.textContent = A.formatTanggal(date) + (A.isWorkday(date, s) ? '' : ' · hari libur');

      var filters = { date: date };
      if (userSel.value) filters.userId = userSel.value;
      if (statusSel.value) filters.status = statusSel.value;
      var recs = DB.listAttendance(filters);

      /* ringkas siapa yang TIDAK hadir hari itu */
      if (!userSel.value) {
        var active = DB.listUsers().filter(function (u) { return u.id !== user.id || true; });
        var byId = {};
        recs.forEach(function (r) { byId[r.userId] = r; });
        var missing = active.filter(function (u) {
          if (byId[u.id]) return false;
          if (DB.leaveCovering(u.id, date)) return false;
          return true;
        });
        if (missing.length) {
          var missCard = UI.el('div', { class: 'card', style: { border: '1.5px dashed var(--line)' } }, [
            UI.el('div', { class: 'card-title', text: 'Belum Absen / Tanpa Keterangan (' + missing.length + ')' })
          ]);
          missing.forEach(function (u) {
            missCard.appendChild(UI.listItem({
              icon: 'user',
              title: u.name,
              sub: '@' + u.username,
              right: DB.leaveCovering(u.id, date)
                ? UI.statusChip(DB.leaveCovering(u.id, date).type)
                : (A.isWorkday(date, s) ? UI.statusChip('alfa') : UI.statusChip('izin', 'Libur'))
            }));
          });
          listWrap.appendChild(missCard);
        }
      }

      var card = UI.el('div', { class: 'card' }, [
        UI.el('div', { class: 'card-title', text: 'Catatan Absensi (' + recs.length + ')' })
      ]);
      if (!recs.length) {
        card.appendChild(UI.emptyState('calendar', 'Tidak ada catatan untuk filter ini.'));
      } else {
        recs.forEach(function (r) {
          var u = DB.getUser(r.userId) || { name: '?', username: '?' };
          var right = UI.el('div', { class: 'row' }, [
            r.in ? UI.statusChip(r.in.status) : UI.statusChip('alfa'),
            r.out ? UI.statusChip(r.out.status) : null,
            r.edited ? UI.statusChip('pending', 'Dikoreksi') : null
          ]);
          var menu = UI.el('button', { class: 'icon-btn', 'aria-label': 'Aksi catatan' }, [UI.icon('gear', 19)]);
          menu.addEventListener('click', function (e) {
            e.stopPropagation();
            var acts = UI.el('div', { class: 'stack' });
            acts.appendChild(UI.el('button', { class: 'btn tonal block', onclick: function () { formCorrect(r); } }, [UI.icon('edit', 19), 'Koreksi jam']));
            acts.appendChild(UI.el('button', { class: 'btn danger block', onclick: function () {
              UI.confirmSheet('Hapus catatan?', 'Catatan ' + u.name + ' tanggal ' + r.date + ' akan dihapus permanen.', 'Hapus', function () {
                try {
                  DB.deleteAttendance(r.id);
                  UI.toast('Catatan dihapus.', 'ok');
                  MC.app.navigate();
                } catch (err) { UI.showErr(err); }
              });
            } }, [UI.icon('trash', 19), 'Hapus catatan']));
            UI.modal({ title: u.name, body: acts, actions: [{ label: 'Tutup' }] });
          });
          right.appendChild(menu);
          card.appendChild(UI.listItem({
            icon: 'clock',
            title: u.name,
            sub: (r.in ? 'Masuk ' + r.in.at.slice(11, 16) + (r.in.dist != null ? ' · ' + r.in.dist + ' m' : '') : 'tanpa masuk') +
              (r.out ? ' · Pulang ' + r.out.at.slice(11, 16) : '') +
              (r.workedMin != null ? ' · ' + UI.dur(r.workedMin) : '') +
              (r.in ? ' · via ' + r.in.method : '') +
              (r.note ? ' · ' + r.note : ''),
            right: right
          }));
        });
      }
      listWrap.appendChild(card);
    }

    [fDate, userSel, statusSel].forEach(function (inp) {
      inp.addEventListener('change', render);
    });
    render();

    page.appendChild(UI.el('div', { class: 'row between mb8' }, [
      UI.el('div', { style: { fontWeight: 800, fontSize: '17px' }, text: 'Rekap Absensi' }),
      UI.el('button', {
        class: 'btn tonal sm',
        onclick: function () {
          var csv = DB.exportAttendanceCsv({
            date: fDate.value, userId: userSel.value || undefined
          });
          var fname = 'mooncheck-absensi-' + (fDate.value || DB.todayStr()) + '.csv';
          if (DB.download(fname, csv, 'text/csv')) {
            UI.toast('CSV disiapkan: ' + fname, 'ok', 3200);
          } else {
            UI.toast('Unduhan tidak tersedia di lingkungan ini.', 'warn');
          }
        }
      }, [UI.icon('download', 18), 'CSV'])
    ]));
    page.appendChild(UI.el('div', { class: 'grid cols-3 mb16' }, [fDate, userSel, statusSel]));
    page.appendChild(dateLabel);
    page.appendChild(UI.el('div', { class: 'mt8' }, [listWrap]));
  });
})(typeof window !== 'undefined' ? window : globalThis);
