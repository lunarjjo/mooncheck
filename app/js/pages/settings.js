/* ============================================================
 * mooncheck — pages/settings.js (admin)
 * Pengaturan lengkap: organisasi, hari & jam kerja, toleransi,
 * geofence (koordinat + radius + pakai lokasi kini), tema,
 * kunci otomatis, backup/impor, hapus data, dan audit log.
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};
  var UI = MC.ui, DB = MC.db, G = MC.geo, A = MC.attendance;

  function sectionCard(title, nodes) {
    return UI.el('div', { class: 'card' }, [UI.el('div', { class: 'card-title', text: title })].concat(nodes));
  }

  MC.app.route('settings', function (page, user) {
    var s = DB.getSettings();

    /* ---------- organisasi & jam kerja ---------- */
    var fOrg = UI.input({ class: 'input', value: s.orgName });
    var dayBoxes = [];
    var daysRow = UI.el('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(7,1fr)', gap: '6px' } });
    A.DAY_ID.forEach(function (dname, i) {
      var cb = UI.input({ type: 'checkbox' });
      cb.checked = s.workDays.indexOf(i) >= 0;
      dayBoxes.push([i, cb]);
      daysRow.appendChild(UI.el('label', { class: 'check-row', style: { padding: '0' } }, [
        cb,
        UI.el('span', { class: 'day-chip', text: dname })
      ]));
    });
    var fStart = UI.input({ class: 'input mono', type: 'time', value: s.workStart });
    var fEnd = UI.input({ class: 'input mono', type: 'time', value: s.workEnd });
    var fTol = UI.input({ class: 'input mono', type: 'number', min: 0, max: 120, value: s.toleranceMin });

    /* ---------- geofence ---------- */
    var fLat = UI.input({ class: 'input mono', type: 'number', step: 'any', placeholder: '-6.1754', value: s.geo.lat != null ? s.geo.lat : '' });
    var fLng = UI.input({ class: 'input mono', type: 'number', step: 'any', placeholder: '106.8272', value: s.geo.lng != null ? s.geo.lng : '' });
    var fRad = UI.input({ class: 'input mono', type: 'number', min: 10, max: 10000, step: 10, value: s.geo.radiusM });
    var fName = UI.input({ class: 'input', value: s.geo.name || 'Kantor' });
    var geoHint = UI.el('div', { class: 'tiny muted mt8', text: 'Koordinat kosong = absensi diizinkan dari mana saja (tanpa geofence).' });
    var btnHere = UI.el('button', { class: 'btn tonal sm' }, [UI.icon('pin', 18), 'Pakai Lokasi Saat Ini']);

    /* ---------- preferensi ---------- */
    var themeSel = UI.el('select', { class: 'input' }, [
      UI.el('option', { value: 'device', text: 'Ikuti perangkat' }),
      UI.el('option', { value: 'light', text: 'Selalu terang' }),
      UI.el('option', { value: 'dark', text: 'Selalu gelap' })
    ]);
    themeSel.value = s.theme || 'device';
    themeSel.addEventListener('change', function () {
      try {
        DB.updateSettings({ theme: themeSel.value });
        MC.app.applyTheme();
      } catch (e) { UI.showErr(e); }
    });

    var fLock = UI.input({ class: 'input mono', type: 'number', min: 1, max: 60, value: s.autoLockMin });

    /* ---------- simpan ---------- */
    var btnSave = UI.el('button', { class: 'btn primary block', text: 'Simpan Pengaturan' });
    btnSave.addEventListener('click', function () {
      try {
        var workDays = dayBoxes.filter(function (p) { return p[1].checked; }).map(function (p) { return p[0]; });
        var lat = fLat.value === '' ? null : parseFloat(fLat.value);
        var lng = fLng.value === '' ? null : parseFloat(fLng.value);
        DB.updateSettings({
          orgName: fOrg.value,
          workDays: workDays,
          workStart: fStart.value,
          workEnd: fEnd.value,
          toleranceMin: fTol.value,
          geo: { lat: lat, lng: lng, radiusM: fRad.value, name: fName.value }
        });
        UI.toast('Pengaturan tersimpan.', 'ok');
        MC.app.navigate();
      } catch (e) { UI.showErr(e); }
    });

    btnHere.addEventListener('click', function () {
      geoHint.textContent = 'Mengambil lokasi…';
      G.getFix().then(function (fix) {
        if (!fix) {
          geoHint.textContent = 'Lokasi tidak tersedia — isi koordinat manual.';
          return;
        }
        fLat.value = String(fix.lat);
        fLng.value = String(fix.lng);
        geoHint.textContent = 'Lokasi terpasang: ' + G.formatCoord(fix.lat, fix.lng) +
          (fix.acc != null ? ' (akurasi ±' + Math.round(fix.acc) + ' m)' : '');
      });
    });

    /* ---------- backup ---------- */
    var btnExport = UI.el('button', { class: 'btn tonal block' }, [UI.icon('download', 19), 'Ekspor Backup JSON']);
    btnExport.addEventListener('click', function () {
      try {
        var dump = DB.exportJson();
        var fname = 'mooncheck-backup-' + DB.todayStr() + '.json';
        if (DB.download(fname, dump, 'application/json')) {
          UI.toast('Backup disiapkan: ' + fname, 'ok', 3200);
        } else {
          UI.toast('Unduhan tidak tersedia di lingkungan ini.', 'warn');
        }
      } catch (e) { UI.showErr(e); }
    });

    var fileImport = UI.q('#file-import');
    var btnImport = UI.el('button', { class: 'btn tonal block' }, [UI.icon('upload', 19), 'Impor Backup JSON']);
    btnImport.addEventListener('click', function () { fileImport.click(); });
    fileImport.onchange = function () {
      var f = fileImport.files && fileImport.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        UI.confirmSheet(
          'Impor backup?',
          'Seluruh data saat ini akan DIGANTI dengan isi berkas. Semua sesi akan keluar. Lanjutkan?',
          'Impor & Ganti',
          function () {
            try {
              DB.importJson(String(reader.result), user.id);
              UI.toast('Backup berhasil diimpor.', 'ok', 3200);
              MC.app.applyTheme();
              MC.app.enterAuth('login');
            } catch (e) { UI.showErr(e); }
          }
        );
      };
      reader.onerror = function () { UI.toast('Berkas tidak terbaca.', 'bad'); };
      reader.readAsText(f);
      fileImport.value = '';
    };

    var btnWipe = UI.el('button', { class: 'btn danger block' }, [UI.icon('trash', 19), 'Hapus Semua Data']);
    btnWipe.addEventListener('click', function () {
      UI.confirmSheet(
        'Hapus SEMUA data?',
        'Semua anggota, absensi, izin, dan pengaturan dihapus permanen dari perangkat ini. Pastikan sudah mengekspor backup!',
        'Hapus Permanen',
        function () {
          try {
            DB.wipeAll(user.id);
            UI.toast('Data dikosongkan.', 'ok');
            MC.app.enterAuth('setup');
          } catch (e) { UI.showErr(e); }
        }
      );
    });

    /* ---------- audit ---------- */
    var auditBody = UI.el('div', {});
    function renderAudit(limit) {
      UI.clear(auditBody);
      var list = DB.listAudit(limit);
      if (!list.length) {
        auditBody.appendChild(UI.emptyState('shield', 'Belum ada catatan audit.'));
        return;
      }
      list.forEach(function (ev) {
        var u = ev.actor ? DB.getUser(ev.actor) : null;
        auditBody.appendChild(UI.listItem({
          icon: 'info',
          title: ev.event,
          sub: (u ? u.name : 'sistem') + ' · ' + ev.at.replace('T', ' ').slice(0, 16) +
            (ev.detail && Object.keys(ev.detail).length
              ? ' · ' + JSON.stringify(ev.detail).slice(0, 60) : '')
        }));
      });
    }
    var btnMoreAudit = UI.el('button', { class: 'linkish center w100', text: 'Muat 50 terakhir' });
    btnMoreAudit.addEventListener('click', function () {
      renderAudit(50);
      btnMoreAudit.textContent = 'Muat 200 terakhir';
      btnMoreAudit.onclick = function () { renderAudit(200); };
    });

    /* ---------- susun halaman ---------- */
    page.appendChild(UI.el('div', { class: 'row between mb16' }, [
      UI.el('div', { style: { fontWeight: 800, fontSize: '17px' }, text: 'Pengaturan' })
    ]));

    page.appendChild(sectionCard('Organisasi & Jam Kerja', [
      UI.field('Nama organisasi', fOrg),
      UI.field('Hari kerja', daysRow),
      UI.el('div', { class: 'grid cols-2' }, [
        UI.field('Jam masuk', fStart),
        UI.field('Jam pulang', fEnd)
      ]),
      UI.field('Toleransi keterlambatan (menit)', fTol)
    ]));

    page.appendChild(sectionCard('Area Kerja (Geofence)', [
      UI.field('Nama lokasi', fName),
      UI.el('div', { class: 'grid cols-2' }, [
        UI.field('Latitude', fLat),
        UI.field('Longitude', fLng)
      ]),
      UI.field('Radius (meter)', fRad),
      UI.el('div', { class: 'row mt8' }, [btnHere, UI.el('div', { class: 'spacer' })]),
      geoHint
    ]));

    page.appendChild(sectionCard('Preferensi', [
      UI.field('Tema tampilan', themeSel),
      UI.field('Kunci otomatis setelah tidak aktif (menit)', fLock)
    ]));

    page.appendChild(btnSave);

    page.appendChild(sectionCard('Backup & Data', [
      UI.el('div', { class: 'stack' }, [btnExport, btnImport, btnWipe]),
      UI.el('div', { class: 'tiny muted mt8', text: 'Backup memuat seluruh data (termasuk hash password dan kunci tanda tangan QR). Simpan di tempat aman — lihat docs/SECURITY.md.' })
    ]));

    page.appendChild(sectionCard('Log Audit (Keamanan)', [
      auditBody, btnMoreAudit
    ]));
    renderAudit(15);

    /* kunci otomatis disimpan terpisah agar langsung aktif */
    fLock.addEventListener('change', function () {
      try {
        DB.updateSettings({ autoLockMin: fLock.value });
        UI.toast('Kunci otomatis diperbarui.', 'ok');
      } catch (e) { UI.showErr(e); }
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
