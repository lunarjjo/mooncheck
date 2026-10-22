/* ============================================================
 * mooncheck — pages/auth.js
 * Layar setup pertama (buat admin) dan login (dengan mode
 * "terkunci otomatis").
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};
  var UI = MC.ui, DB = MC.db;
  MC.pages = MC.pages || {};

  /* ---------- setup pertama ---------- */
  MC.pages.setupAuth = function (card) {
    var root = UI.el('div', {});
    root.appendChild(UI.el('div', { class: 'auth-title', text: 'Selamat datang!' }));
    root.appendChild(UI.el('div', {
      class: 'auth-sub',
      text: 'Buat akun admin pertama untuk mulai mengatur absensi organisasi Anda.'
    }));

    var fNama = UI.input({ class: 'input', placeholder: 'cth: PT Maju Bersama', value: 'Organisasi Saya' });
    var fUser = UI.input({ class: 'input', placeholder: 'cth: admin (huruf kecil)' });
    var fName = UI.input({ class: 'input', placeholder: 'cth: Budi Santoso' });
    var fPass = UI.input({ class: 'input', type: 'password', placeholder: 'minimal 6 karakter' });
    var fPass2 = UI.input({ class: 'input', type: 'password', placeholder: 'ulangi password' });
    var btn = UI.el('button', { class: 'btn primary block', text: 'Buat Akun Admin' });

    [fUser, fName, fPass, fPass2].forEach(function (i) {
      i.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') btn.click();
      });
    });

    root.appendChild(UI.field('Nama organisasi', fNama));
    root.appendChild(UI.field('Username admin', fUser));
    root.appendChild(UI.field('Nama lengkap', fName));
    root.appendChild(UI.field('Password', fPass));
    root.appendChild(UI.field('Ulangi password', fPass2));
    root.appendChild(btn);

    var busy = false;
    btn.addEventListener('click', function () {
      if (busy) return;
      var org = fNama.value.trim();
      var username = fUser.value.trim().toLowerCase();
      var name = fName.value.trim();
      var pw = fPass.value, pw2 = fPass2.value;

      if (pw !== pw2) { UI.toast('Password tidak sama.', 'bad'); return; }
      busy = true;
      btn.disabled = true;
      btn.textContent = 'Menyiapkan…';

      DB.createUser({ username: username, name: name, password: pw, role: 'admin' })
        .then(function (user) {
          MC.session.create(user);
          DB.updateSettings({ orgName: org || 'Organisasi Saya' });
          DB.log('setup.done', { org: org });
          DB.persist();
          UI.toast('Akun admin dibuat. Selamat bekerja!', 'ok');
          MC.app.enterShell();
        })
        .catch(function (e) {
          UI.showErr(e);
          busy = false;
          btn.disabled = false;
          btn.textContent = 'Buat Akun Admin';
        });
    });

    return root;
  };

  /* ---------- login ---------- */
  MC.pages.loginAuth = function (card, mode) {
    var root = UI.el('div', {});

    if (mode === 'locked') {
      root.appendChild(UI.el('div', { class: 'row mb8' }, [
        UI.icon('shield', 22),
        UI.el('div', { class: 'auth-title', text: 'Sesi Terkunci' })
      ]));
      root.appendChild(UI.el('div', { class: 'auth-sub', text: 'Masuk kembali untuk melanjutkan.' }));
    } else {
      var org = DB.getSettings().orgName || 'mooncheck';
      root.appendChild(UI.el('div', { class: 'auth-title', text: org }));
      root.appendChild(UI.el('div', { class: 'auth-sub', text: 'Masuk untuk melanjutkan absensi.' }));
    }

    var fUser = UI.input({ class: 'input', placeholder: 'username', autocomplete: 'username' });
    var fPass = UI.input({ class: 'input', type: 'password', placeholder: 'password', autocomplete: 'current-password' });
    var btn = UI.el('button', { class: 'btn primary block', text: 'Masuk' });
    var errLine = UI.el('div', { class: 'tiny', style: { color: 'var(--bad)', marginTop: '8px', minHeight: '16px' } });

    [fUser, fPass].forEach(function (i) {
      i.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') btn.click();
      });
    });

    root.appendChild(UI.field('Username', fUser));
    root.appendChild(UI.field('Password', fPass));
    root.appendChild(errLine);
    root.appendChild(btn);

    var busy = false;
    btn.addEventListener('click', function () {
      if (busy) return;
      busy = true;
      btn.disabled = true;
      btn.textContent = 'Memeriksa…';
      errLine.textContent = '';

      DB.login(fUser.value.trim(), fPass.value)
        .then(function () {
          UI.toast('Selamat datang kembali!', 'ok');
          MC.app.enterShell();
        })
        .catch(function (e) {
          errLine.textContent = e.message || 'Gagal masuk.';
          fPass.value = '';
          busy = false;
          btn.disabled = false;
          btn.textContent = 'Masuk';
        });
    });

    setTimeout(function () { try { fUser.focus(); } catch (e) {} }, 60);
    return root;
  };
})(typeof window !== 'undefined' ? window : globalThis);
