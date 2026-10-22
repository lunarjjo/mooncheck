/* ============================================================
 * mooncheck — pages/leaves.js
 * Izin/cuti: anggota mengajukan + memantau; admin menyetujui.
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};
  var UI = MC.ui, DB = MC.db, A = MC.attendance;

  function formRequest(user) {
    var typeSel = UI.el('select', { class: 'input' }, [
      UI.el('option', { value: 'sakit', text: 'Sakit' }),
      UI.el('option', { value: 'izin', text: 'Izin' }),
      UI.el('option', { value: 'cuti', text: 'Cuti' })
    ]);
    var today = DB.todayStr();
    var fStart = UI.input({ class: 'input', type: 'date', value: today });
    var fEnd = UI.input({ class: 'input', type: 'date', value: today });
    var fReason = UI.el('textarea', { class: 'input', placeholder: 'alasan (min 3 karakter)' });

    UI.modal({
      title: 'Ajukan Izin',
      body: UI.el('div', {}, [
        UI.field('Jenis', typeSel),
        UI.field('Mulai', fStart),
        UI.field('Selesai', fEnd),
        UI.field('Alasan', fReason)
      ]),
      actions: [
        { label: 'Batal' },
        {
          label: 'Kirim', cls: 'primary',
          onClick: function (close) {
            try {
              DB.requestLeave(user.id, typeSel.value, fStart.value, fEnd.value, fReason.value);
              UI.toast('Pengajuan terkirim.', 'ok');
              close();
              MC.app.navigate();
            } catch (e) { UI.showErr(e); }
          }
        }
      ]
    });
  }

  function leaveRow(lv, isAdmin) {
    var u = DB.getUser(lv.userId) || { name: '?', username: '?' };
    var right = UI.el('div', { class: 'row' }, [UI.statusChip(lv.type)]);
    if (isAdmin && lv.status === 'pending') {
      var btnOk = UI.el('button', { class: 'btn ok sm', 'aria-label': 'Setujui' }, [UI.icon('check', 16)]);
      var btnNo = UI.el('button', { class: 'btn danger sm', 'aria-label': 'Tolak' }, [UI.icon('x', 16)]);
      btnOk.addEventListener('click', function () {
        try {
          DB.decideLeave(lv.id, true);
          UI.toast('Izin disetujui.', 'ok');
          MC.app.navigate();
        } catch (e) { UI.showErr(e); }
      });
      btnNo.addEventListener('click', function () {
        UI.confirmSheet('Tolak izin?', 'Pengajuan ' + u.name + ' akan ditolak.', 'Tolak', function () {
          try {
            DB.decideLeave(lv.id, false);
            UI.toast('Izin ditolak.', 'warn');
            MC.app.navigate();
          } catch (e) { UI.showErr(e); }
        });
      });
      right.appendChild(btnOk);
      right.appendChild(btnNo);
    } else {
      right.appendChild(UI.statusChip(lv.status));
    }
    return UI.listItem({
      icon: 'file',
      title: (isAdmin ? u.name + ' · ' : '') + lv.type,
      sub: lv.start + (lv.end !== lv.start ? ' s/d ' + lv.end : '') + ' — ' + lv.reason,
      right: right
    });
  }

  MC.app.route('leaves', function (page, user) {
    var isAdmin = user.role === 'admin';
    var isAdminView = isAdmin;

    var segWrap = UI.el('div', { class: 'mb16' });
    var body = UI.el('div', {});

    function render() {
      UI.clear(body);
      UI.clear(segWrap);

      var filters = isAdminView ? {} : { userId: user.id };
      var pending = DB.listLeaves(Object.assign({}, filters, { status: 'pending' }));
      var decided = DB.listLeaves(filters).filter(function (l) { return l.status !== 'pending'; });

      if (isAdmin) {
        segWrap.appendChild(UI.segmented(
          ['Sebagai Admin', 'Izin Saya'],
          isAdminView ? 0 : 1,
          function (i) { isAdminView = i === 0; render(); }
        ));
      }

      var pCard = UI.el('div', { class: 'card' }, [
        UI.el('div', { class: 'card-title', text: isAdminView ? 'Menunggu Persetujuan (' + pending.length + ')' : 'Pengajuan Berjalan (' + pending.length + ')' })
      ]);
      if (!pending.length) {
        pCard.appendChild(UI.emptyState('file', 'Tidak ada pengajuan menunggu.'));
      } else {
        pending.forEach(function (lv) {
          var row = leaveRow(lv, isAdminView);
          if (!isAdminView) {
            var btnCancel = UI.el('button', { class: 'btn ghost sm', text: 'Batalkan' });
            btnCancel.addEventListener('click', function () {
              UI.confirmSheet('Batalkan pengajuan?', 'Pengajuan izin ini akan dihapus.', 'Batalkan', function () {
                try {
                  DB.cancelLeave(lv.id);
                  UI.toast('Pengajuan dibatalkan.', 'ok');
                  MC.app.navigate();
                } catch (e) { UI.showErr(e); }
              });
            });
            row.appendChild(btnCancel);
          }
          pCard.appendChild(row);
        });
      }
      body.appendChild(pCard);

      var dCard = UI.el('div', { class: 'card' }, [
        UI.el('div', { class: 'card-title', text: 'Riwayat Keputusan' })
      ]);
      if (!decided.length) {
        dCard.appendChild(UI.emptyState('calendar', 'Belum ada riwayat.'));
      } else {
        decided.forEach(function (lv) { dCard.appendChild(leaveRow(lv, isAdminView)); });
      }
      body.appendChild(dCard);
    }

    render();

    page.appendChild(UI.el('div', { class: 'row between mb8' }, [
      UI.el('div', { style: { fontWeight: 800, fontSize: '17px' }, text: 'Izin & Cuti' }),
      UI.el('button', { class: 'btn primary sm', onclick: function () { formRequest(user); } },
        [UI.icon('file', 18), 'Ajukan'])
    ]));
    page.appendChild(segWrap);
    page.appendChild(body);
  });
})(typeof window !== 'undefined' ? window : globalThis);
