/* ============================================================
 * mooncheck — app.js
 * Bootstrap: inisialisasi db, tema, router hash, sesi + kunci
 * otomatis, navigasi bawah per-peran.
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};
  var UI = MC.ui, DB = MC.db, SESS = MC.session, A = MC.attendance;
  var THEME_BG = { light: '#f4f5fa', dark: '#0e1017' };

  /* ================= tema ================= */

  function systemPrefersDark() {
    // Prioritas: bridge native (WebView) → matchMedia (browser)
    if (MC.bridge && typeof MC.bridge.isDarkMode === 'function') {
      try { return MC.bridge.isDarkMode() === true; } catch (e) { /* lanjut */ }
    }
    if (global.matchMedia) {
      try { return global.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) {}
    }
    return false;
  }

  function applyTheme() {
    var pref = 'device';
    try { pref = DB.getSettings().theme || 'device'; } catch (e) {}
    var dark = pref === 'dark' || (pref === 'device' && systemPrefersDark());
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var meta = document.getElementById('meta-theme-color');
    if (meta) meta.setAttribute('content', dark ? THEME_BG.dark : THEME_BG.light);
    if (MC.bridge && MC.bridge.applyNativeTheme) {
      try { MC.bridge.applyNativeTheme(dark); } catch (e) {}
    }
    MC._dark = dark;
  }

  function watchDeviceTheme() {
    if (global.matchMedia) {
      try {
        var mq = global.matchMedia('(prefers-color-scheme: dark)');
        var fn = function () {
          try { if (DB.getSettings().theme === 'device') applyTheme(); } catch (e) {}
        };
        if (mq.addEventListener) mq.addEventListener('change', fn);
        else if (mq.addListener) mq.addListener(fn);
      } catch (e) {}
    }
    // dipanggil dari Bridge.java saat mode gelap sistem berubah
    MC._onNativeThemeChange = function () { applyTheme(); };
  }

  /* ================= sesi ================= */

  function currentUser() {
    var s = SESS.valid();
    if (!s) return null;
    return DB.getUser(s.userId);
  }

  var lockTimer = null;
  function startLockWatch() {
    if (lockTimer) clearInterval(lockTimer);
    lockTimer = setInterval(function () {
      var s = SESS.current();
      if (!s) return;
      if (Date.now() > s.expiresAt) {
        SESS.destroy();
        DB.log('session.expired', {});
        DB.persist();
        enterAuth('locked');
        toastKunci();
      }
    }, 20000);
  }
  function touchSession() {
    if (SESS.current()) SESS.touch();
  }
  function toastKunci() {
    UI.toast('Sesi terkunci otomatis setelah tidak aktif.', 'warn', 3200);
  }

  function lockNow() {
    SESS.destroy();
    enterAuth('locked');
    toastKunci();
  }

  /* ================= navigasi ================= */

  function navItems(role) {
    if (role === 'admin') {
      return [
        { hash: 'home', icon: 'home', label: 'Beranda' },
        { hash: 'scan', icon: 'scan', label: 'Pindai' },
        { hash: 'members', icon: 'users', label: 'Anggota' },
        { hash: 'rekap', icon: 'calendar', label: 'Rekap' },
        { hash: 'settings', icon: 'gear', label: 'Atur' }
      ];
    }
    return [
      { hash: 'home', icon: 'home', label: 'Beranda' },
      { hash: 'history', icon: 'clock', label: 'Riwayat' },
      { hash: 'qr', icon: 'qr', label: 'Kartu QR' },
      { hash: 'leaves', icon: 'file', label: 'Izin' },
      { hash: 'profile', icon: 'user', label: 'Profil' }
    ];
  }

  function renderNav(activeHash) {
    var user = currentUser();
    var nav = UI.q('#bottomnav');
    UI.clear(nav);
    navItems(user ? user.role : 'member').forEach(function (it) {
      var b = UI.el('button', {
        class: 'nav-item' + (it.hash === activeHash ? ' active' : ''),
        'aria-label': it.label,
        onclick: function () { location.hash = '#/' + it.hash; }
      }, [UI.icon(it.icon), it.label]);
      if (it.hash === 'leaves') {
        var pend = DB.listLeaves({ userId: user.id, status: 'pending' }).length;
        if (pend > 0) b.appendChild(UI.el('span', { class: 'nav-dot', text: String(pend) }));
      }
      nav.appendChild(b);
    });
  }

  /* ================= router ================= */

  var routes = {};
  function route(name, fn) { routes[name] = fn; }

  /* pembersihan halaman sebelum berganti (mis. kamera pemindai) */
  function runPageCleanup() {
    if (typeof MC.pageCleanup === 'function') {
      try { MC.pageCleanup(); } catch (e) {}
    }
    MC.pageCleanup = null;
  }

  function navigate() {
    runPageCleanup();
    var user = currentUser();
    if (!user) { enterAuth('login'); return; }
    touchSession();

    var name = (location.hash || '#/home').replace(/^#\//, '').split('?')[0];
    if (!routes[name]) name = 'home';

    // guard peran
    var adminOnly = { members: 1, rekap: 1, reports: 1, settings: 1, scan: 1 };
    if (adminOnly[name] && user.role !== 'admin') name = 'home';

    var view = UI.q('#view');
    UI.clear(view);
    view.scrollTop = 0;

    var org = DB.getSettings().orgName || 'mooncheck';
    UI.q('#top-title').textContent = org;
    UI.q('#top-sub').textContent = user.name + ' · ' + (user.role === 'admin' ? 'Admin' : 'Anggota');
    var av = UI.q('#avatar');
    var parts = user.name.trim().split(/\s+/);
    av.textContent = (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();

    var page = UI.el('div', { class: 'page-enter' });
    view.appendChild(page);
    renderNav(name);

    try {
      routes[name](page, user);
    } catch (e) {
      UI.showErr(e);
      page.appendChild(UI.emptyState('info', 'Halaman gagal dimuat: ' + (e && e.message)));
    }
  }

  /* ================= layar auth ================= */

  function enterAuth(mode) {
    UI.q('#shell').hidden = true;
    var scr = UI.q('#screen-auth');
    scr.hidden = false;
    var card = UI.q('#auth-card');
    UI.clear(card);

    if (DB.needsSetup()) {
      card.appendChild(MC.pages.setupAuth(card));
    } else {
      card.appendChild(MC.pages.loginAuth(card, mode));
    }
  }

  function enterShell() {
    UI.q('#screen-auth').hidden = true;
    UI.q('#shell').hidden = false;
    startLockWatch();
    applyTheme();
    navigate();
  }

  /* aktivitas pengguna → perpanjang sesi */
  ['pointerdown', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      if (!UI.q('#shell').hidden) touchSession();
    }, { passive: true });
  });

  /* ================= boot ================= */

  function boot() {
    DB.init();
    applyTheme();
    watchDeviceTheme();

    UI.q('#btn-lock').addEventListener('click', lockNow);
    UI.q('#btn-profile').addEventListener('click', function () {
      var u = currentUser();
      if (!u) return;
      location.hash = u.role === 'admin' ? '#/profile' : '#/profile';
    });

    global.addEventListener('hashchange', function () {
      if (!UI.q('#shell').hidden) navigate();
    });

    // pemulihan sesi tersimpan
    var s = SESS.valid();
    if (s) enterShell();
    else enterAuth(DB.needsSetup() ? 'setup' : 'login');
  }

  /* API halaman mendaftarkan diri ke sini */
  MC.app = {
    boot: boot,
    route: route,
    navigate: navigate,
    enterShell: enterShell,
    enterAuth: enterAuth,
    lockNow: lockNow,
    currentUser: currentUser,
    applyTheme: applyTheme,
    refreshNav: renderNav
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
