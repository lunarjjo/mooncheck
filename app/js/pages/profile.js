/* ============================================================
 * mooncheck — pages/profile.js
 * Profil pengguna: identitas, ganti password, tema, keluar.
 * Tersedia untuk admin dan anggota.
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};
  var UI = MC.ui, DB = MC.db, A = MC.attendance;

  MC.app.route('profile', function (page, user) {
    var s = DB.getSettings();

    /* kartu identitas */
    page.appendChild(UI.el('div', { class: 'card' }, [
      UI.el('div', { class: 'row' }, [
        UI.avatarEl(user),
        UI.el('div', { style: { marginLeft: '4px' } }, [
          UI.el('div', { style: { fontWeight: 800, fontSize: '17px' }, text: user.name }),
          UI.el('div', { class: 'tiny muted', text: '@' + user.username + (user.position ? ' · ' + user.position : '') })
        ]),
        UI.el('div', { class: 'spacer' }),
        UI.statusChip(user.role)
      ]),
      UI.el('div', { class: 'tiny muted mt8', text: 'Anggota sejak ' + (user.createdAt || '').slice(0, 10) + ' · ' + s.orgName })
    ]));

    /* ganti password */
    var fOld = UI.input({ class: 'input', type: 'password', placeholder: 'password lama' });
    var fNew = UI.input({ class: 'input', type: 'password', placeholder: 'password baru (min 6)' });
    var fNew2 = UI.input({ class: 'input', type: 'password', placeholder: 'ulangi password baru' });
    var btnPw = UI.el('button', { class: 'btn primary block', text: 'Ganti Password' });
    btnPw.addEventListener('click', function () {
      if (fNew.value !== fNew2.value) { UI.toast('Password baru tidak sama.', 'bad'); return; }
      DB.changePassword(user.id, fOld.value, fNew.value).then(function () {
        UI.toast('Password berhasil diganti.', 'ok');
        fOld.value = fNew.value = fNew2.value = '';
      }).catch(function (e) { UI.showErr(e); });
    });

    page.appendChild(UI.el('div', { class: 'card' }, [
      UI.el('div', { class: 'card-title', text: 'Ganti Password' }),
      UI.field('Password lama', fOld),
      UI.field('Password baru', fNew),
      UI.field('Ulangi password baru', fNew2),
      btnPw
    ]));

    /* tema */
    var themeSel = UI.el('select', { class: 'input' }, [
      UI.el('option', { value: 'device', text: 'Ikuti perangkat (otomatis)' }),
      UI.el('option', { value: 'light', text: 'Selalu terang' }),
      UI.el('option', { value: 'dark', text: 'Selalu gelap' })
    ]);
    themeSel.value = s.theme || 'device';
    themeSel.addEventListener('change', function () {
      try {
        DB.updateSettings({ theme: themeSel.value });
        MC.app.applyTheme();
        UI.toast('Tema diperbarui.', 'ok');
      } catch (e) { UI.showErr(e); }
    });

    page.appendChild(UI.el('div', { class: 'card' }, [
      UI.el('div', { class: 'card-title', text: 'Tampilan' }),
      UI.field('Tema', themeSel),
      UI.el('div', { class: 'tiny muted', text: 'Mode "ikuti perangkat" mengikuti pengaturan gelap/terang Android Anda secara otomatis.' })
    ]));

    /* info keamanan singkat */
    page.appendChild(UI.el('div', { class: 'card' }, [
      UI.el('div', { class: 'row' }, [
        UI.icon('shield', 20),
        UI.el('div', { class: 'tiny muted', style: { lineHeight: '1.6' }, text:
          'Password disimpan sebagai PBKDF2-SHA256 (100.000 iterasi, salt unik per akun). ' +
          'Sesi terkunci otomatis setelah ' + (s.autoLockMin || 5) + ' menit tidak aktif. ' +
          'Lima kali gagal masuk mengunci akun sementara.' })
      ])
    ]));

    /* keluar */
    var btnLogout = UI.el('button', { class: 'btn danger block' }, [UI.icon('logout', 19), 'Keluar']);
    btnLogout.addEventListener('click', function () {
      UI.confirmSheet('Keluar?', 'Anda harus masuk kembali untuk memakai aplikasi.', 'Keluar', function () {
        try { DB.log('logout', {}); DB.persist(); } catch (e) {}
        MC.session.destroy();
        MC.app.enterAuth('login');
      }, true);
    });
    page.appendChild(UI.el('div', { class: 'mt16' }, [btnLogout]));
  });
})(typeof window !== 'undefined' ? window : globalThis);
