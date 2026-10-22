/* ============================================================
 * mooncheck — db.js
 * Lapisan data: penyimpanan localStorage terversi + seluruh operasi
 * domain (pengguna, absensi, izin, audit, pengaturan, backup).
 *
 * Konvensi:
 *  - Semua error domain → throw MC.DbError(code, pesanIndonesia)
 *  - Tanggal disimpan "YYYY-MM-DD" zona lokal; waktu ISO lengkap
 *  - ID unik: "u-", "a-", "l-", "s-" + 10 hex random
 *  - Audit dibatasi 500 entri terbaru (anti bengkak storage)
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};
  var C = null; // diikat saat load: MC.crypto

  var DB_KEY = 'mooncheck.db.v1';
  var SESS_KEY = 'mooncheck.session.v1';
  var DB_VERSION = 1;
  var AUDIT_CAP = 500;

  function DbError(code, msg) {
    var e = new Error(msg);
    e.name = 'DbError';
    e.code = code;
    return e;
  }

  var db = null;          // objek database aktif
  var listeners = [];     // pelacak perubahan (untuk refresh UI)

  /* ================= util dasar ================= */

  function nowIso() { return new Date().toISOString(); }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function dateStrOf(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function todayStr() { return dateStrOf(new Date()); }

  function timeStrOf(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }

  function nowStrLocal() {
    return dateStrOf(new Date()) + 'T' + timeStrOf(new Date()) + ':00';
  }
  /* CATATAN DESAIN PENTING:
     Jam absensi (.at pada in/out) SELALU string lokal naive "YYYY-MM-DDTHH:MM:SS"
     agar konsisten dengan koreksi manual admin dan terurut leksikografis.
     Metadata (createdAt, audit.at) tetap ISO UTC — tidak pernah dibandingkan
     dengan jam absensi. */

  function uid(prefix) {
    var bytes = C.randomBytes(5);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += C.hexEncode(bytes).slice(i * 2, i * 2 + 2);
    return prefix + '-' + s;
  }

  var USERNAME_RE = /^[a-z0-9_.-]{3,24}$/;
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  var DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

  function validDateStr(s) {
    if (!DATE_RE.test(s)) return false;
    var p = s.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return dateStrOf(d) === s;
  }

  /* ================= pemuatan & simpan ================= */

  function defaultSettings() {
    return {
      orgName: 'Organisasi Saya',
      workDays: [1, 2, 3, 4, 5],          // 0=Minggu … 6=Sabtu
      workStart: '08:00',
      workEnd: '17:00',
      toleranceMin: 15,
      geo: { lat: null, lng: null, radiusM: 200, name: 'Kantor Pusat' },
      theme: 'device',                     // 'device' | 'light' | 'dark'
      autoLockMin: 5,
      allowSelfReg: false
    };
  }

  function newDbObject() {
    return {
      version: DB_VERSION,
      meta: {
        createdAt: nowIso(),
        dbId: 'mc-' + C.hexEncode(C.randomBytes(4)),
        appSecret: C.b64Encode(C.randomBytes(32))
      },
      users: [],
      attendance: [],
      leaves: [],
      audit: [],
      settings: defaultSettings()
    };
  }

  function persist() {
    try {
      global.localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      throw DbError('STORAGE', 'Penyimpanan penuh atau tidak dapat ditulis: ' + (e && e.message));
    }
    notify();
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (e) { /* UI error tidak boleh memutus data */ }
    }
  }

  function onChange(fn) {
    if (listeners.indexOf(fn) < 0) listeners.push(fn);
    return function off() {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function init() {
    C = MC.crypto;
    if (C == null) throw DbError('DEPS', 'crypto.js harus dimuat sebelum db.js');
    var raw = null;
    try { raw = global.localStorage.getItem(DB_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        db = JSON.parse(raw);
      } catch (e) {
        // String korup: simpan salinan untuk forensik, mulai baru
        try { global.localStorage.setItem(DB_KEY + '.corrupt', raw); } catch (e2) {}
        db = newDbObject();
        persist();
      }
    } else {
      db = newDbObject();
      // tidak persist di sini; persist terjadi saat setup admin selesai
    }
    return api;
  }

  function raw() { return db; }

  /* ================= audit ================= */

  function log(event, detail, actorId) {
    db.audit.push({
      at: nowIso(),
      actor: actorId || sessUserId(),
      event: event,
      detail: detail || {}
    });
    if (db.audit.length > AUDIT_CAP) {
      db.audit = db.audit.slice(db.audit.length - AUDIT_CAP);
    }
  }

  function listAudit(limit) {
    var out = db.audit.slice().reverse();
    if (limit) out = out.slice(0, limit);
    return out;
  }

  /* ================= pengguna ================= */

  function requireUserFields(u) {
    if (!u || typeof u !== 'object') return 'data pengguna bukan objek';
    if (typeof u.username !== 'string' || !USERNAME_RE.test(u.username)) return 'username tidak valid';
    if (typeof u.name !== 'string' || u.name.length < 2 || u.name.length > 60) return 'nama 2-60 karakter';
    if (u.role !== 'admin' && u.role !== 'member') return 'role harus admin/member';
    if (typeof u.salt !== 'string' || u.salt.length < 8) return 'salt hilang';
    if (typeof u.hash !== 'string' || u.hash.length < 20) return 'hash hilang';
    return null;
  }

  function needsSetup() { return db.users.length === 0; }

  function findByUsername(username) {
    var want = String(username || '').toLowerCase();
    for (var i = 0; i < db.users.length; i++) {
      if (db.users[i].username === want) return db.users[i];
    }
    return null;
  }

  function getUser(id) {
    for (var i = 0; i < db.users.length; i++) if (db.users[i].id === id) return db.users[i];
    return null;
  }

  function listUsers(includeInactive) {
    var out = db.users.slice();
    if (!includeInactive) out = out.filter(function (u) { return u.active !== false; });
    out.sort(function (a, b) {
      return a.role === b.role
        ? a.name.localeCompare(b.name)
        : (a.role === 'admin' ? -1 : 1);
    });
    return out;
  }

  var MAX_FAIL = 5;
  function lockDelayMs(fails) {
    if (fails >= 10) return 15 * 60 * 1000;
    if (fails >= 5) return 60 * 1000;
    return 0;
  }

  function createUser(opts, actorId) {
    var username = String(opts.username || '').trim().toLowerCase();
    var name = String(opts.name || '').trim();
    var password = String(opts.password || '');
    var role = opts.role === 'admin' ? 'admin' : 'member';

    if (!USERNAME_RE.test(username)) {
      throw DbError('VALIDATION',
        'Username 3-24 karakter, hanya huruf kecil/angka/titik/garis bawah/tanda hubung.');
    }
    if (name.length < 2 || name.length > 60) throw DbError('VALIDATION', 'Nama 2-60 karakter.');
    if (password.length < 6) throw DbError('VALIDATION', 'Password minimal 6 karakter.');
    if (findByUsername(username)) throw DbError('DUPLICATE', 'Username sudah dipakai.');

    if (role === 'admin' && db.users.length > 0) {
      var actor = getUser(actorId || sessUserId());
      if (!actor || actor.role !== 'admin') {
        throw DbError('AUTH', 'Hanya admin yang dapat membuat akun admin lain.');
      }
    }
    // Pembuatan user setelah setup harus oleh admin
    if (db.users.length > 0) {
      var a2 = getUser(actorId || sessUserId());
      if (!a2 || a2.role !== 'admin') {
        throw DbError('AUTH', 'Hanya admin yang dapat menambah pengguna.');
      }
    }

    var salt = C.randomBytes(16);
    var user = {
      id: uid('u'),
      username: username,
      name: name,
      role: role,
      phone: String(opts.phone || '').trim().slice(0, 20),
      position: String(opts.position || '').trim().slice(0, 40),
      salt: C.b64Encode(salt),
      iters: C.ITER_DEFAULT,
      hash: null,
      active: true,
      createdAt: nowIso(),
      failedAttempts: 0,
      lockedUntil: 0
    };

    var done = MC.db_ready = (function () {
      var pending = user;
      return C.deriveBits(C.strToUtf8(password), salt, user.iters, 32).then(function (dk) {
        pending.hash = C.b64Encode(dk);
        db.users.push(pending);
        log('user.create', { username: username, role: role, name: name }, actorId);
        persist();
        return pending;
      });
    })();
    return done;
  }

  /* Verifikasi password terhadap user (pakai timingSafeEqual) */
  function verifyPassword(user, password) {
    var salt = C.b64Decode(user.salt);
    return C.deriveBits(C.strToUtf8(String(password)), salt, user.iters, 32).then(function (dk) {
      return C.timingSafeEqual(dk, C.b64Decode(user.hash));
    });
  }

  /* Login dengan penguncian brute-force */
  function login(username, password) {
    var user = findByUsername(username);
    var genericFail = DbError('AUTH', 'Username atau password salah.');
    if (!user) {
      log('login.fail', { username: String(username || '').slice(0, 24), reason: 'unknown' }, null);
      persistIfTiny();
      return Promise.reject(genericFail);
    }
    var now = Date.now();
    if (user.lockedUntil && user.lockedUntil > now) {
      var secs = Math.ceil((user.lockedUntil - now) / 1000);
      log('login.locked', { username: user.username }, null);
      persistIfTiny();
      return Promise.reject(DbError('LOCKED',
        'Akun terkunci. Coba lagi dalam ' + secs + ' detik.'));
    }
    if (user.active === false) {
      log('login.fail', { username: user.username, reason: 'inactive' }, null);
      persistIfTiny();
      return Promise.reject(DbError('AUTH', 'Akun tidak aktif. Hubungi admin.'));
    }
    return verifyPassword(user, password).then(function (good) {
      if (!good) {
        user.failedAttempts = (user.failedAttempts || 0) + 1;
        var delay = lockDelayMs(user.failedAttempts);
        if (delay > 0) {
          user.lockedUntil = Date.now() + delay;
          log('login.locked', { username: user.username, fails: user.failedAttempts }, null);
        } else {
          log('login.fail', { username: user.username, fails: user.failedAttempts }, null);
        }
        persist();
        if (delay > 0) {
          return Promise.reject(DbError('LOCKED',
            'Terlalu banyak percobaan gagal. Terkunci ' + Math.round(delay / 1000) + ' detik.'));
        }
        return Promise.reject(genericFail);
      }
      user.failedAttempts = 0;
      user.lockedUntil = 0;
      log('login.success', { username: user.username }, user.id);
      MC.session.create(user);
      persist();
      return user;
    });
  }

  /* persistIfTiny: audit login gagal tanpa memicu render penuh */
  function persistIfTiny() {
    try { global.localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {}
  }

  function updateUser(userId, patch, actorId) {
    var user = getUser(userId);
    if (!user) throw DbError('NOT_FOUND', 'Pengguna tidak ditemukan.');
    var actor = getUser(actorId || sessUserId());
    if (!actor || (actor.role !== 'admin' && actor.id !== userId)) {
      throw DbError('AUTH', 'Hanya admin atau pemilik akun yang dapat mengubah.');
    }
    var dirty = false;
    if (typeof patch.name === 'string') {
      var nm = patch.name.trim();
      if (nm.length < 2 || nm.length > 60) throw DbError('VALIDATION', 'Nama 2-60 karakter.');
      user.name = nm; dirty = true;
    }
    if (typeof patch.phone === 'string') { user.phone = patch.phone.trim().slice(0, 20); dirty = true; }
    if (typeof patch.position === 'string') { user.position = patch.position.trim().slice(0, 40); dirty = true; }
    if (typeof patch.active === 'boolean') {
      if (actor.role !== 'admin') throw DbError('AUTH', 'Hanya admin yang dapat mengaktifkan/menonaktifkan akun.');
      if (user.id === actor.id && patch.active === false) {
        throw DbError('VALIDATION', 'Tidak dapat menonaktifkan akun sendiri.');
      }
      user.active = patch.active; dirty = true;
    }
    if (patch.role === 'admin' || patch.role === 'member') {
      if (actor.role !== 'admin') throw DbError('AUTH', 'Hanya admin yang dapat mengubah peran.');
      if (user.id === actor.id && patch.role === 'member') {
        throw DbError('VALIDATION', 'Admin tidak dapat menurunkan perannya sendiri.');
      }
      user.role = patch.role; dirty = true;
    }
    if (dirty) {
      log('user.update', { userId: userId, fields: Object.keys(patch) }, actorId);
      persist();
    }
    return user;
  }

  function changePassword(userId, oldPassword, newPassword) {
    var user = getUser(userId);
    if (!user) throw DbError('NOT_FOUND', 'Pengguna tidak ditemukan.');
    if (String(newPassword).length < 6) throw DbError('VALIDATION', 'Password baru minimal 6 karakter.');
    return verifyPassword(user, oldPassword).then(function (good) {
      if (!good) throw DbError('AUTH', 'Password lama salah.');
      return _setPassword(user, newPassword, null, false);
    });
  }

  function adminResetPassword(userId, newPassword, actorId) {
    var user = getUser(userId);
    if (!user) throw DbError('NOT_FOUND', 'Pengguna tidak ditemukan.');
    var actor = actorId ? getUser(actorId) : null;
    if (!actor || actor.role !== 'admin') throw DbError('AUTH', 'Hanya admin.');
    if (String(newPassword).length < 6) throw DbError('VALIDATION', 'Password baru minimal 6 karakter.');
    return _setPassword(user, newPassword, actorId, true);
  }

  function _setPassword(user, newPassword, actorId, isAdminReset) {
    var salt = C.randomBytes(16);
    return C.deriveBits(C.strToUtf8(String(newPassword)), salt, user.iters, 32).then(function (dk) {
      user.salt = C.b64Encode(salt);
      user.hash = C.b64Encode(dk);
      user.failedAttempts = 0;
      user.lockedUntil = 0;
      log(isAdminReset ? 'user.password.reset' : 'user.password.change',
        { userId: user.id }, actorId || user.id);
      persist();
      return true;
    });
  }

  function deleteUser(userId, actorId) {
    var user = getUser(userId);
    if (!user) throw DbError('NOT_FOUND', 'Pengguna tidak ditemukan.');
    var actor = getUser(actorId || sessUserId());
    if (!actor || actor.role !== 'admin') throw DbError('AUTH', 'Hanya admin.');
    if (user.id === actor.id) throw DbError('VALIDATION', 'Tidak dapat menghapus akun sendiri.');
    var adminCount = db.users.filter(function (u) { return u.role === 'admin' && u.active !== false; }).length;
    if (user.role === 'admin' && adminCount <= 1) {
      throw DbError('VALIDATION', 'Minimal harus ada satu admin aktif.');
    }
    db.users = db.users.filter(function (u) { return u.id !== userId; });
    db.attendance = db.attendance.filter(function (a) { return a.userId !== userId; });
    db.leaves = db.leaves.filter(function (l) { return l.userId !== userId; });
    log('user.delete', { userId: userId, username: user.username }, actorId);
    persist();
    return true;
  }

  /* ================= sesi ================= */

  var sessionApi;
  sessionApi = (function () {
    var current = null;

    function load() {
      try {
        var raw = global.localStorage.getItem(SESS_KEY);
        current = raw ? JSON.parse(raw) : null;
      } catch (e) { current = null; }
      return current;
    }

    function save() {
      try {
        if (current) global.localStorage.setItem(SESS_KEY, JSON.stringify(current));
        else global.localStorage.removeItem(SESS_KEY);
      } catch (e) { /* sesi bersifat sementara; abaikan */ }
    }

    function create(user) {
      current = {
        userId: user.id,
        role: user.role,
        token: C.b64Encode(C.randomBytes(24)),
        startedAt: Date.now(),
        expiresAt: Date.now() + autoLockMs()
      };
      save();
      return current;
    }

    function autoLockMs() {
      var m = db.settings.autoLockMin;
      if (!m || m < 1) m = 5;
      return m * 60 * 1000;
    }

    function touch() {
      if (current) { current.expiresAt = Date.now() + autoLockMs(); save(); }
    }

    /* valid + belum kedaluwarsa */
    function valid() {
      if (!current) { current = load(); }
      if (!current) return null;
      var u = getUser(current.userId);
      if (!u || u.active === false) { destroy(); return null; }
      if (Date.now() > (current.expiresAt || 0)) { return null; }
      return current;
    }

    function destroy() {
      current = null;
      save();
    }

    return { create: create, valid: valid, touch: touch, destroy: destroy, load: load,
             current: function () { return current; } };
  })();
  MC.session = sessionApi;

  /* ID aktor dari sesi aktif (aman dipanggil kapan pun) */
  function sessUserId() {
    try {
      var c = sessionApi.current();
      return c ? c.userId : null;
    } catch (e) { return null; }
  }

  /* ================= absensi ================= */

  function attendanceKey(userId, dateStr) { return userId + '@' + dateStr; }

  function findAttendance(userId, dateStr) {
    for (var i = 0; i < db.attendance.length; i++) {
      if (db.attendance[i].userId === userId && db.attendance[i].date === dateStr) {
        return db.attendance[i];
      }
    }
    return null;
  }

  function getAttendance(id) {
    for (var i = 0; i < db.attendance.length; i++) if (db.attendance[i].id === id) return db.attendance[i];
    return null;
  }

  function listAttendance(filters) {
    var out = db.attendance.slice();
    var f = filters || {};
    if (f.userId) out = out.filter(function (a) { return a.userId === f.userId; });
    if (f.from) out = out.filter(function (a) { return a.date >= f.from; });
    if (f.to) out = out.filter(function (a) { return a.date <= f.to; });
    if (f.status) out = out.filter(function (a) { return (a.in && a.in.status) === f.status; });
    if (f.date) out = out.filter(function (a) { return a.date === f.date; });
    out.sort(function (a, b) {
      return a.date === b.date
        ? String(a.in && a.in.at).localeCompare(String(b.in && b.in.at))
        : (a.date < b.date ? 1 : -1);
    });
    return out;
  }

  function _newLocEntry(loc, method) {
    if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      var g = db.settings.geo;
      var dist = (typeof loc.lat === 'number' && typeof g.lat === 'number')
        ? MC.geo.haversine(loc.lat, loc.lng, g.lat, g.lng) : null;
      return {
        at: nowStrLocal(),
        lat: +loc.lat.toFixed(6), lng: +loc.lng.toFixed(6),
        acc: typeof loc.acc === 'number' ? Math.round(loc.acc) : null,
        dist: dist != null ? Math.round(dist) : null,
        method: method || 'self'
      };
    }
    return { at: nowStrLocal(), lat: null, lng: null, acc: null, dist: null, method: method || 'manual' };
  }

  function checkIn(userId, loc, method, note) {
    var user = getUser(userId);
    if (!user) throw DbError('NOT_FOUND', 'Pengguna tidak ditemukan.');
    if (user.active === false) throw DbError('AUTH', 'Akun tidak aktif.');
    var dateStr = todayStr();
    var exist = findAttendance(userId, dateStr);
    if (exist) {
      if (exist.in) throw DbError('VALIDATION', 'Sudah check-in hari ini pukul ' + exist.in.at.slice(11, 16) + '.');
      exist.in = _newLocEntry(loc, method);
      exist.in.status = MC.attendance.computeInStatus(dateStr, exist.in.at, db.settings);
      if (note) exist.note = String(note).slice(0, 200);
      exist.updatedAt = nowIso();
      log('checkin', { userId: userId, date: dateStr, method: method || 'self' }, userId);
      persist();
      return exist;
    }
    var rec = {
      id: uid('a'),
      userId: userId,
      date: dateStr,
      in: _newLocEntry(loc, method),
      out: null,
      note: note ? String(note).slice(0, 200) : '',
      edited: false,
      editedBy: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    rec.in.status = MC.attendance.computeInStatus(dateStr, rec.in.at, db.settings);
    db.attendance.push(rec);
    log('checkin', { userId: userId, date: dateStr, method: method || 'self' }, userId);
    persist();
    return rec;
  }

  function checkOut(userId, loc, method) {
    var user = getUser(userId);
    if (!user) throw DbError('NOT_FOUND', 'Pengguna tidak ditemukan.');
    var dateStr = todayStr();
    var rec = findAttendance(userId, dateStr);
    if (!rec || !rec.in) throw DbError('VALIDATION', 'Belum check-in hari ini.');
    if (rec.out) throw DbError('VALIDATION', 'Sudah check-out hari ini.');
    rec.out = _newLocEntry(loc, method);
    rec.out.status = MC.attendance.computeOutStatus(rec.in.at, rec.out.at, db.settings);
    rec.workedMin = MC.attendance.workedMinutes(rec.in.at, rec.out.at);
    rec.updatedAt = nowIso();
    log('checkout', { userId: userId, date: dateStr, workedMin: rec.workedMin }, userId);
    persist();
    return rec;
  }

  /* Koreksi manual oleh admin: jam boleh diedit, lokasi ditandai */
  function updateAttendance(id, patch, actorId) {
    var rec = getAttendance(id);
    if (!rec) throw DbError('NOT_FOUND', 'Catatan absensi tidak ditemukan.');
    var actor = getUser(actorId || sessUserId());
    if (!actor || actor.role !== 'admin') throw DbError('AUTH', 'Hanya admin yang dapat mengoreksi absensi.');
    var s = db.settings;
    var newInAt = rec.in ? rec.in.at : null;
    var newOutAt = rec.out ? rec.out.at : null;

    if (patch.inAt !== undefined) {
      if (patch.inAt === null || patch.inAt === '') {
        newInAt = null;               // hapus jam masuk (hanya jika tak ada jam pulang)
      } else {
        if (!TIME_RE.test(patch.inAt)) throw DbError('VALIDATION', 'Format jam HH:MM.');
        newInAt = rec.date + 'T' + patch.inAt + ':00';
      }
    }
    if (patch.outAt !== undefined) {
      if (patch.outAt === null || patch.outAt === '') {
        newOutAt = null;
      } else {
        if (!TIME_RE.test(patch.outAt)) throw DbError('VALIDATION', 'Format jam HH:MM.');
        newOutAt = rec.date + 'T' + patch.outAt + ':00';
      }
    }
    if (newOutAt && newInAt && newOutAt < newInAt) {
      throw DbError('VALIDATION', 'Jam pulang tidak boleh sebelum jam masuk.');
    }

    if (!newInAt && newOutAt) throw DbError('VALIDATION', 'Tidak ada jam masuk; hapus dulu jam pulangnya.');
    if (!newInAt && !newOutAt) {
      throw DbError('VALIDATION', 'Kedua jam kosong — gunakan "Hapus catatan" bila maksudnya menghapus.');
    }

    if (newInAt) {
      if (!rec.in) rec.in = { at: newInAt, lat: null, lng: null, acc: null, dist: null, method: 'manual' };
      else rec.in.at = newInAt;
      rec.in.status = MC.attendance.computeInStatus(rec.date, newInAt, s);
      rec.in.method = rec.in.method === 'manual' ? 'manual' : (patch.inAt ? 'manual' : rec.in.method);
    } else {
      rec.in = null;
    }
    if (newOutAt) {
      if (!rec.out) rec.out = { at: newOutAt, lat: null, lng: null, acc: null, dist: null, method: 'manual' };
      else rec.out.at = newOutAt;
      rec.out.status = MC.attendance.computeOutStatus(rec.in.at, newOutAt, s);
      rec.out.method = patch.outAt ? 'manual' : rec.out.method;
      rec.workedMin = MC.attendance.workedMinutes(rec.in.at, newOutAt);
    } else {
      rec.out = null;
      rec.workedMin = null;
    }
    if (typeof patch.note === 'string') rec.note = patch.note.slice(0, 200);
    rec.edited = true;
    rec.editedBy = actorId || sessUserId();
    rec.updatedAt = nowIso();
    log('attendance.edit', { id: id, date: rec.date, userId: rec.userId,
      inAt: newInAt, outAt: newOutAt }, rec.editedBy);
    persist();
    return rec;
  }

  function deleteAttendance(id, actorId) {
    var rec = getAttendance(id);
    if (!rec) throw DbError('NOT_FOUND', 'Catatan absensi tidak ditemukan.');
    var actor = getUser(actorId || sessUserId());
    if (!actor || actor.role !== 'admin') throw DbError('AUTH', 'Hanya admin.');
    db.attendance = db.attendance.filter(function (a) { return a.id !== id; });
    log('attendance.delete', { id: id, date: rec.date, userId: rec.userId }, actorId);
    persist();
    return true;
  }

  /* Absen berdasarkan QR yang discan admin: target = pemilik QR.
     Mengembalikan { rec, action: 'in' | 'out' }. */
  function qrCheck(targetUserId, mode, loc) {
    var user = getUser(targetUserId);
    if (!user) throw DbError('NOT_FOUND', 'Anggota QR tidak ditemukan.');
    if (user.active === false) throw DbError('AUTH', 'Akun anggota tidak aktif.');
    var method = 'qr';
    var dateStr = todayStr();
    var rec = findAttendance(targetUserId, dateStr);
    if (mode === 'out') {
      if (!rec || !rec.in) throw DbError('VALIDATION', user.name + ' belum check-in hari ini.');
      if (rec.out) throw DbError('VALIDATION', user.name + ' sudah check-out hari ini.');
      return { rec: checkOut(targetUserId, loc, method), action: 'out' };
    }
    // mode auto: kalau sudah ada in dan belum out → checkout
    if (rec && rec.in && !rec.out) return { rec: checkOut(targetUserId, loc, method), action: 'out' };
    if (rec && rec.in && rec.out) throw DbError('VALIDATION', user.name + ' sudah lengkap absen hari ini.');
    return { rec: checkIn(targetUserId, loc, method), action: 'in' };
  }

  /* ================= izin / cuti ================= */

  var LEAVE_TYPES = ['sakit', 'izin', 'cuti'];

  function requestLeave(userId, type, start, end, reason) {
    var user = getUser(userId);
    if (!user) throw DbError('NOT_FOUND', 'Pengguna tidak ditemukan.');
    if (LEAVE_TYPES.indexOf(type) < 0) throw DbError('VALIDATION', 'Jenis izin: sakit/izin/cuti.');
    if (!validDateStr(start) || !validDateStr(end)) throw DbError('VALIDATION', 'Tanggal mulai/selesai tidak valid.');
    if (end < start) throw DbError('VALIDATION', 'Tanggal selesai tidak boleh sebelum mulai.');
    var reasonS = String(reason || '').trim().slice(0, 300);
    if (reasonS.length < 3) throw DbError('VALIDATION', 'Alasan minimal 3 karakter.');
    // tolak tumpang tindih dengan izin pending/approved yang sama
    for (var i = 0; i < db.leaves.length; i++) {
      var l = db.leaves[i];
      if (l.userId === userId && l.status !== 'rejected' && !(end < l.start || start > l.end)) {
        throw DbError('VALIDATION', 'Sudah ada izin ' + l.status + ' pada rentang tanggal itu.');
      }
    }
    var lv = {
      id: uid('l'), userId: userId, type: type, start: start, end: end,
      reason: reasonS, status: 'pending', decidedBy: null, decidedAt: null,
      createdAt: nowIso()
    };
    db.leaves.push(lv);
    log('leave.request', { id: lv.id, userId: userId, type: type, start: start, end: end }, userId);
    persist();
    return lv;
  }

  function decideLeave(id, approve, actorId) {
    var lv = null;
    for (var i = 0; i < db.leaves.length; i++) if (db.leaves[i].id === id) lv = db.leaves[i];
    if (!lv) throw DbError('NOT_FOUND', 'Pengajuan izin tidak ditemukan.');
    var actor = getUser(actorId || sessUserId());
    if (!actor || actor.role !== 'admin') throw DbError('AUTH', 'Hanya admin yang dapat memutus izin.');
    if (lv.status !== 'pending') throw DbError('VALIDATION', 'Pengajuan sudah diputuskan.');
    lv.status = approve ? 'approved' : 'rejected';
    lv.decidedBy = actorId || sessUserId();
    lv.decidedAt = nowIso();
    log(approve ? 'leave.approve' : 'leave.reject', { id: id, userId: lv.userId }, lv.decidedBy);
    persist();
    return lv;
  }

  function listLeaves(filters) {
    var out = db.leaves.slice();
    var f = filters || {};
    if (f.userId) out = out.filter(function (l) { return l.userId === f.userId; });
    if (f.status) out = out.filter(function (l) { return l.status === f.status; });
    out.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    return out;
  }

  function cancelLeave(id) {
    var lv = null;
    for (var i = 0; i < db.leaves.length; i++) if (db.leaves[i].id === id) lv = db.leaves[i];
    if (!lv) throw DbError('NOT_FOUND', 'Pengajuan izin tidak ditemukan.');
    if (lv.status !== 'pending') throw DbError('VALIDATION', 'Hanya pengajuan pending yang bisa dibatalkan.');
    db.leaves = db.leaves.filter(function (l) { return l.id !== id; });
    log('leave.cancel', { id: id, userId: lv.userId }, lv.userId);
    persist();
    return true;
  }

  function leaveCovering(userId, dateStr) {
    for (var i = 0; i < db.leaves.length; i++) {
      var l = db.leaves[i];
      if (l.userId === userId && l.status === 'approved' &&
          dateStr >= l.start && dateStr <= l.end) return l;
    }
    return null;
  }

  /* ================= pengaturan ================= */

  function getSettings() { return db.settings; }

  function updateSettings(patch, actorId) {
    var actor = getUser(actorId || sessUserId());
    if (!actor) throw DbError('AUTH', 'Harus masuk dulu.');
    /* tema & kunci otomatis = preferensi pribadi — boleh oleh siapa pun yang masuk */
    var PERSONAL = { theme: 1, autoLockMin: 1 };
    var wantsProtected = Object.keys(patch).some(function (k) { return !PERSONAL[k]; });
    if (wantsProtected && actor.role !== 'admin') {
      throw DbError('AUTH', 'Hanya admin yang dapat mengubah pengaturan organisasi.');
    }
    var s = db.settings;
    var changed = [];

    if (typeof patch.orgName === 'string') {
      var o = patch.orgName.trim().slice(0, 60);
      if (o.length < 2) throw DbError('VALIDATION', 'Nama organisasi minimal 2 karakter.');
      s.orgName = o; changed.push('orgName');
    }
    if (patch.workDays !== undefined) {
      if (!Array.isArray(patch.workDays) || patch.workDays.length === 0 ||
          patch.workDays.some(function (d) { return typeof d !== 'number' || d < 0 || d > 6 || d !== (d | 0); })) {
        throw DbError('VALIDATION', 'Hari kerja tidak valid.');
      }
      s.workDays = patch.workDays.slice().sort(); changed.push('workDays');
    }
    if (patch.workStart !== undefined) {
      if (!TIME_RE.test(patch.workStart)) throw DbError('VALIDATION', 'Format jam masuk HH:MM.');
      s.workStart = patch.workStart; changed.push('workStart');
    }
    if (patch.workEnd !== undefined) {
      if (!TIME_RE.test(patch.workEnd)) throw DbError('VALIDATION', 'Format jam pulang HH:MM.');
      if (patch.workEnd <= s.workStart) throw DbError('VALIDATION', 'Jam pulang harus setelah jam masuk.');
      s.workEnd = patch.workEnd; changed.push('workEnd');
    }
    if (patch.toleranceMin !== undefined) {
      var tol = parseInt(patch.toleranceMin, 10);
      if (isNaN(tol) || tol < 0 || tol > 120) throw DbError('VALIDATION', 'Toleransi 0-120 menit.');
      s.toleranceMin = tol; changed.push('toleranceMin');
    }
    if (patch.geo !== undefined) {
      var g = patch.geo || {};
      var ng = {
        lat: g.lat === null || g.lat === undefined ? null : +g.lat,
        lng: g.lng === null || g.lng === undefined ? null : +g.lng,
        radiusM: g.radiusM === undefined ? s.geo.radiusM : Math.round(+g.radiusM),
        name: typeof g.name === 'string' && g.name.trim() ? g.name.trim().slice(0, 40) : 'Kantor'
      };
      if (ng.lat !== null && (isNaN(ng.lat) || ng.lat < -90 || ng.lat > 90)) {
        throw DbError('VALIDATION', 'Latitude harus -90..90.');
      }
      if (ng.lng !== null && (isNaN(ng.lng) || ng.lng < -180 || ng.lng > 180)) {
        throw DbError('VALIDATION', 'Longitude harus -180..180.');
      }
      if (ng.lat !== null && ng.lng === null) throw DbError('VALIDATION', 'Longitude belum diisi.');
      if (ng.lng !== null && ng.lat === null) throw DbError('VALIDATION', 'Latitude belum diisi.');
      if (isNaN(ng.radiusM) || ng.radiusM < 10 || ng.radiusM > 10000) {
        throw DbError('VALIDATION', 'Radius 10-10000 meter.');
      }
      s.geo = ng; changed.push('geo');
    }
    if (patch.theme !== undefined) {
      if (['device', 'light', 'dark'].indexOf(patch.theme) < 0) {
        throw DbError('VALIDATION', 'Tema: device/light/dark.');
      }
      s.theme = patch.theme; changed.push('theme');
    }
    if (patch.autoLockMin !== undefined) {
      var al = parseInt(patch.autoLockMin, 10);
      if (isNaN(al) || al < 1 || al > 60) throw DbError('VALIDATION', 'Kunci otomatis 1-60 menit.');
      s.autoLockMin = al; changed.push('autoLockMin');
    }
    if (patch.allowSelfReg !== undefined) {
      s.allowSelfReg = !!patch.allowSelfReg; changed.push('allowSelfReg');
    }
    if (changed.length) {
      log('settings.update', { fields: changed }, actorId);
      persist();
    }
    return s;
  }

  /* ================= backup / ekspor ================= */

  function exportJson() {
    log('backup.export', { bytes: JSON.stringify(db).length });
    persistIfTiny();
    return JSON.stringify(db, null, 2);
  }

  function download(filename, text, mime) {
    // Di WebView Android, unduhan dipicu lewat bridge; di browser biasa lewat blob.
    if (MC.bridge && MC.bridge.download) {
      MC.bridge.download(filename, text);
      return true;
    }
    if (typeof document !== 'undefined' && document.createElement) {
      var blob = new Blob([text], { type: mime || 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
      return true;
    }
    return false;
  }

  function csvEscape(v) {
    if (v == null) return '';
    var s = String(v);
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportAttendanceCsv(filters) {
    var rows = listAttendance(filters);
    var head = ['tanggal', 'username', 'nama', 'jam_masuk', 'status_masuk',
      'jam_pulang', 'status_pulang', 'menit_kerja', 'jarak_masuk_m', 'metode_masuk', 'catatan'];
    var lines = [head.map(csvEscape).join(',')];
    rows.forEach(function (r) {
      var u = getUser(r.userId) || { username: '?', name: '?' };
      lines.push([
        r.date, u.username, u.name,
        r.in ? r.in.at.slice(11, 16) : '',
        r.in ? r.in.status : '',
        r.out ? r.out.at.slice(11, 16) : '',
        r.out ? r.out.status : '',
        r.workedMin != null ? r.workedMin : '',
        r.in && r.in.dist != null ? r.in.dist : '',
        r.in ? r.in.method : '',
        r.note || ''
      ].map(csvEscape).join(','));
    });
    log('backup.export.csv', { rows: rows.length });
    persistIfTiny();
    return '\uFEFF' + lines.join('\r\n');   // BOM agar Excel baca UTF-8
  }

  function validateDbObject(obj) {
    var errs = [];
    if (!obj || typeof obj !== 'object') return ['bukan objek'];
    if (obj.version !== DB_VERSION) errs.push('versi db tidak dikenal: ' + obj.version);
    if (!obj.meta || typeof obj.meta.appSecret !== 'string' || obj.meta.appSecret.length < 20) {
      errs.push('meta.appSecret hilang');
    }
    if (!Array.isArray(obj.users)) errs.push('users bukan array');
    else obj.users.forEach(function (u, i) {
      var e = requireUserFields(u);
      if (e) errs.push('users[' + i + ']: ' + e);
    });
    if (!Array.isArray(obj.attendance)) errs.push('attendance bukan array');
    else obj.attendance.forEach(function (a, i) {
      if (!a || typeof a !== 'object' || !a.id || !a.userId || !validDateStr(a.date)) {
        errs.push('attendance[' + i + '] korup');
      }
    });
    if (!Array.isArray(obj.leaves)) errs.push('leaves bukan array');
    if (!Array.isArray(obj.audit)) errs.push('audit bukan array');
    if (!obj.settings || typeof obj.settings !== 'object') errs.push('settings hilang');
    else {
      if (!TIME_RE.test(obj.settings.workStart || '')) errs.push('settings.workStart');
      if (!TIME_RE.test(obj.settings.workEnd || '')) errs.push('settings.workEnd');
      if (!Array.isArray(obj.settings.workDays) || !obj.settings.workDays.length) errs.push('settings.workDays');
      if (obj.settings.workEnd <= obj.settings.workStart) errs.push('workEnd <= workStart');
    }
    if (obj.users && obj.users.filter(function (u) { return u.role === 'admin'; }).length === 0) {
      errs.push('tidak ada akun admin');
    }
    return errs;
  }

  function importJson(text, actorId) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) {
      throw DbError('VALIDATION', 'Berkas bukan JSON yang valid.');
    }
    var errs = validateDbObject(obj);
    if (errs.length) throw DbError('VALIDATION', 'Impor ditolak: ' + errs.slice(0, 3).join('; '));
    var oldId = db.meta ? db.meta.dbId : null;
    db = obj;
    log('backup.import', { oldDbId: oldId, newDbId: db.meta.dbId, users: db.users.length }, actorId);
    persist();
    MC.session.destroy();
    return true;
  }

  function wipeAll(actorId) {
    var actor = getUser(actorId || sessUserId());
    if (!actor || actor.role !== 'admin') throw DbError('AUTH', 'Hanya admin.');
    log('data.wipe', {}, actorId);
    var secret = db.meta.appSecret;
    db = newDbObject();
    db.meta.appSecret = secret; // pertahankan identitas db
    persist();
    MC.session.destroy();
    return true;
  }

  /* ================= API inti ================= */

  var api = {
    init: init, raw: raw, persist: persist, onChange: onChange,
    needsSetup: needsSetup, nowIso: nowIso, dateStrOf: dateStrOf, todayStr: todayStr,
    timeStrOf: timeStrOf, uid: uid, DbError: DbError, USERNAME_RE: USERNAME_RE,
    TIME_RE: TIME_RE, DATE_RE: DATE_RE, validDateStr: validDateStr,
    log: log, listAudit: listAudit, defaultSettings: defaultSettings,
    createUser: createUser, login: login, findByUsername: findByUsername, getUser: getUser,
    listUsers: listUsers, updateUser: updateUser, changePassword: changePassword,
    adminResetPassword: adminResetPassword, deleteUser: deleteUser, verifyPassword: verifyPassword,
    MAX_FAIL: MAX_FAIL,
    _intern: { newDbObject: newDbObject, loadInto: function (obj) { db = obj; } }
  };
  MC.db = api;

  /* lengkapi api bagian 2 */
  api.findAttendance = findAttendance;
  api.getAttendance = getAttendance;
  api.listAttendance = listAttendance;
  api.checkIn = checkIn;
  api.checkOut = checkOut;
  api.updateAttendance = updateAttendance;
  api.deleteAttendance = deleteAttendance;
  api.qrCheck = qrCheck;
  api.requestLeave = requestLeave;
  api.decideLeave = decideLeave;
  api.listLeaves = listLeaves;
  api.cancelLeave = cancelLeave;
  api.leaveCovering = leaveCovering;
  api.getSettings = getSettings;
  api.updateSettings = updateSettings;
  api.exportJson = exportJson;
  api.importJson = importJson;
  api.wipeAll = wipeAll;
  api.exportAttendanceCsv = exportAttendanceCsv;
  api.download = download;
  api.csvEscape = csvEscape;
  api.validateDbObject = validateDbObject;
  api.LEAVE_TYPES = LEAVE_TYPES;
})(typeof window !== 'undefined' ? window : globalThis);
