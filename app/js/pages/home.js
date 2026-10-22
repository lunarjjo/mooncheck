/* ============================================================
 * mooncheck — pages/home.js
 * Beranda: member (jam, status hari ini, tombol check-in/out
 * dengan pemeriksaan geofence) dan admin (ringkasan + aktivitas).
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};
  var UI = MC.ui, DB = MC.db, G = MC.geo, A = MC.attendance;

  /* ---------- jam berjalan ---------- */
  function liveClock(node) {
    function tick() { node.textContent = A.formatTanggal(DB.todayStr()); }
    node.textContent = '';
    var iv = setInterval(tick, 30000);
    tick();
    return function stop() { clearInterval(iv); };
  }

  /* ---------- alur absen member ---------- */
  function doAttend(user, wantOut) {
    var s = DB.getSettings();
    var sheet;

    var status = UI.el('div', { class: 'muted', text: 'Mengambil lokasi…' });
    var locBox = UI.el('div', { class: 'stack', style: { marginTop: '10px' } }, [
      UI.el('div', { class: 'row' }, [UI.icon('pin', 18), status])
    ]);
    var note = UI.input({ class: 'input', placeholder: 'catatan (opsional)', maxlength: 200 });
    var result = { fix: null };

    function renderFixLine() {
      UI.clear(locBox);
      locBox.appendChild(UI.el('div', { class: 'row' }, [UI.icon('pin', 18), status]));
      if (result.fix) {
        var ev = G.evaluate(s.geo, result.fix.lat, result.fix.lng, result.fix.acc);
        var line = UI.el('div', {
          class: 'tiny',
          style: { marginTop: '4px' },
          text: G.formatCoord(result.fix.lat, result.fix.lng) +
            (result.fix.acc != null ? ' · akurasi ±' + Math.round(result.fix.acc) + ' m' : '')
        });
        var noteLine = UI.el('div', {
          class: 'tiny',
          style: { marginTop: '2px', color: ev.inside ? 'var(--ok)' : 'var(--bad)' },
          text: ev.note
        });
        locBox.appendChild(line);
        locBox.appendChild(noteLine);
        return ev;
      }
      return null;
    }

    sheet = UI.modal({
      title: wantOut ? 'Check-out sekarang?' : 'Check-in sekarang?',
      body: UI.el('div', {}, [
        locBox,
        UI.el('div', { class: 'field mt8' }, [note]),
        UI.el('div', { class: 'tiny', text: 'Waktu perangkat: ' + UI.clockNow().slice(0, 5) + ' · ' + A.formatTanggal(DB.todayStr()) })
      ]),
      actions: [
        { label: 'Batal' },
        {
          label: wantOut ? 'Ya, Check-out' : 'Ya, Check-in',
          cls: 'primary',
          onClick: function (close) {
            var ev = result.fix
              ? G.evaluate(s.geo, result.fix.lat, result.fix.lng, result.fix.acc)
              : { configured: false, inside: true };

            if (ev.configured && !ev.inside) {
              UI.confirmSheet(
                'Di luar area kerja',
                'Lokasi Anda di luar radius geofence (' + (s.geo.name || 'kantor') + '). Tetap catat absensi dengan catatan?',
                'Tetap Absen',
                function () { perform(close); }
              );
              return;
            }
            perform(close);
          }
        }
      ],
      onclose: null
    });

    function perform(close) {
      try {
        var loc = result.fix
          ? { lat: result.fix.lat, lng: result.fix.lng, acc: result.fix.acc }
          : null;
        var rec;
        if (wantOut) rec = DB.checkOut(user.id, loc, 'self');
        else rec = DB.checkIn(user.id, loc, 'self', note.value.trim() || undefined);

        var stat = rec.in ? rec.in.status : rec.out.status;
        var jam = (rec.in || rec.out).at.slice(11, 16);
        UI.toast('Check-' + (wantOut ? 'out' : 'in') + ' pukul ' + jam + ' — ' + stat, 'ok', 3400);
        close();
        MC.app.navigate();
      } catch (e) {
        UI.showErr(e);
        close();
      }
    }

    /* ambil lokasi secara asinkron sambil menampilkan lembar */
    G.getFix().then(function (fix) {
      result.fix = fix;
      if (fix) {
        status.textContent = 'Lokasi diperoleh (' + (fix.source === 'native' ? 'GPS perangkat' : 'perangkat') + ')';
      } else {
        status.textContent = 'Lokasi tidak tersedia — absen dicatat tanpa koordinat.';
        status.style.color = 'var(--warn)';
      }
      renderFixLine();
    });
  }

  /* ---------- beranda member ---------- */
  function memberHome(page, user) {
    var s = DB.getSettings();

    var clock = UI.el('div', { class: 'hero-clock mono', text: '--:--' });
    var dateLine = UI.el('div', { class: 'hero-date' });
    var hero = UI.el('div', { class: 'hero' }, [clock, dateLine]);

    function tick() {
      var d = new Date();
      function p(n) { return (n < 10 ? '0' : '') + n; }
      clock.textContent = p(d.getHours()) + ':' + p(d.getMinutes());
    }
    var iv = setInterval(tick, 5000);
    tick();
    dateLine.textContent = A.formatTanggal(DB.todayStr()) + ' · ' + s.orgName;

    /* status hari ini */
    var today = DB.todayStr();
    var st = A.dayState(user.id, today,
      function (uid, d) { return DB.findAttendance(uid, d); },
      function (uid, d) { return DB.leaveCovering(uid, d); },
      s);

    var statusCard = UI.el('div', { class: 'card' });
    var actionWrap = UI.el('div', {});

    function renderStatus() {
      UI.clear(statusCard);
      UI.clear(actionWrap);

      var head = UI.el('div', { class: 'row between mb8' }, [
        UI.el('div', { class: 'card-title', style: { margin: 0 }, text: 'Hari Ini' }),
        A.isWorkday(today, s) ? UI.statusChip('hadir', 'Hari Kerja') : UI.statusChip('izin', 'Hari Libur')
      ]);
      statusCard.appendChild(head);

      var body = UI.el('div', { class: 'stack' });
      if (st.state === 'done') {
        var r = st.rec;
        body.appendChild(UI.el('div', { class: 'row between' }, [
          UI.el('div', {}, [
            UI.el('div', { class: 'muted tiny', text: 'Masuk ' + r.in.at.slice(11, 16) }),
            UI.el('div', { class: 'muted tiny', text: 'Pulang ' + r.out.at.slice(11, 16) })
          ]),
          UI.el('div', { class: 'row' }, [
            UI.statusChip(r.in.status),
            UI.statusChip(r.out.status),
            UI.statusChip('normal', UI.dur(r.workedMin))
          ])
        ]));
      } else if (st.state === 'in') {
        body.appendChild(UI.el('div', { class: 'row between' }, [
          UI.el('div', {}, [
            UI.el('div', { class: 'muted tiny', text: 'Masuk ' + st.rec.in.at.slice(11, 16) }),
            UI.el('div', { class: 'tiny', text: 'Belum check-out' })
          ]),
          UI.statusChip(st.rec.in.status)
        ]));
      } else if (st.state === 'izin') {
        body.appendChild(UI.el('div', { class: 'row' }, [
          UI.statusChip(st.leave.type),
          UI.el('div', { class: 'tiny', text: st.leave.reason })
        ]));
      } else {
        body.appendChild(UI.el('div', { class: 'muted', text: 'Belum ada absensi hari ini.' }));
      }
      statusCard.appendChild(body);

      /* tombol aksi */
      if (st.state === 'none' || st.state === 'izin') {
        actionWrap.appendChild(UI.el('button', {
          class: 'btn primary action-big',
          onclick: function () { doAttend(user, false); }
        }, [UI.icon('check', 22), 'Check In']));
      } else if (st.state === 'in') {
        actionWrap.appendChild(UI.el('button', {
          class: 'btn ok action-big',
          onclick: function () { doAttend(user, true); }
        }, [UI.icon('logout', 22), 'Check Out']));
      }
      if (st.state === 'in' || st.state === 'done') {
        actionWrap.appendChild(UI.el('div', {
          class: 'action-sub',
          text: st.state === 'done'
            ? 'Absensi hari ini lengkap.'
            : 'Kerja sejauh ini: ' + UI.dur(A.workedMinutes(st.rec.in.at, DB.todayStr() + 'T' + UI.clockNow().slice(0, 5) + ':00'))
        }));
      }
    }
    renderStatus();

    /* statistik bulan berjalan */
    var month = DB.todayStr().slice(0, 7);
    var stats = A.monthStats(month,
      DB.listAttendance({ userId: user.id, from: month + '-01', to: month + '-31' }),
      DB.listLeaves({ userId: user.id }),
      s, DB.todayStr());

    var statsCard = UI.el('div', { class: 'card' }, [
      UI.el('div', { class: 'row between' }, [
        UI.el('div', { class: 'card-title', style: { margin: 0 }, text: A.MONTH_ID[+month.slice(5, 7) - 1] + ' ' + month.slice(0, 4) }),
        UI.el('button', {
          class: 'linkish', text: 'Riwayat →',
          onclick: function () { location.hash = '#/history'; }
        })
      ]),
      UI.el('div', { class: 'grid cols-4 mt8' }, [
        statTile(stats.present, 'Hadir'),
        statTile(stats.late, 'Telat'),
        statTile(stats.absent, 'Tanpa Ket.'),
        statTile(stats.leave, 'Izin')
      ]),
      UI.el('div', { class: 'tiny center mt8', text: 'Total kerja bulan ini: ' + UI.dur(stats.workedMin) + ' · rata-rata masuk ' + A.minutesToHHMM(stats.avgIn) })
    ]);

    page.appendChild(hero);
    page.appendChild(statusCard);
    page.appendChild(actionWrap);
    page.appendChild(statsCard);
  }

  function statTile(num, label) {
    return UI.el('div', { class: 'stat-tile' }, [
      UI.el('div', { class: 'st-num', text: String(num) }),
      UI.el('div', { class: 'st-label', text: label })
    ]);
  }

  /* ---------- dashboard admin ---------- */
  function adminHome(page, user) {
    var s = DB.getSettings();
    var today = DB.todayStr();

    /* hitung ringkasan hari ini */
    var users = DB.listUsers(true).filter(function (u) { return u.active !== false; });
    var recs = DB.listAttendance({ date: today });
    var byUser = {};
    recs.forEach(function (r) { byUser[r.userId] = r; });

    var hadir = 0, telat = 0, izin = 0;
    users.forEach(function (u) {
      var lv = DB.leaveCovering(u.id, today);
      var r = byUser[u.id];
      if (lv) izin++;
      else if (r && r.in) {
        if (r.in.status === 'telat') telat++; else hadir++;
      }
    });
    var belumAbsen = users.filter(function (u) {
      return !byUser[u.id] && !DB.leaveCovering(u.id, today) && A.isWorkday(today, s);
    }).length;

    var isWorkdayToday = A.isWorkday(today, s);

    page.appendChild(UI.el('div', { class: 'hero' }, [
      UI.el('div', { class: 'hero-date', text: A.formatTanggal(today) + (isWorkdayToday ? ' · hari kerja' : ' · hari libur') })
    ]));

    page.appendChild(UI.el('div', { class: 'card' }, [
      UI.el('div', { class: 'card-title', text: 'Ringkasan Hari Ini (' + users.length + ' orang aktif)' }),
      UI.el('div', { class: 'grid cols-4' }, [
        statTile(hadir, 'Tepat'),
        statTile(telat, 'Telat'),
        statTile(izin, 'Izin'),
        statTile(belumAbsen, 'Belum Absen')
      ])
    ]));

    /* aksi cepat */
    page.appendChild(UI.el('div', { class: 'card' }, [
      UI.el('div', { class: 'card-title', text: 'Aksi Cepat' }),
      UI.el('div', { class: 'grid cols-2' }, [
        UI.el('button', {
          class: 'btn tonal', onclick: function () { location.hash = '#/scan'; }
        }, [UI.icon('scan', 20), 'Pindai QR']),
        UI.el('button', {
          class: 'btn tonal', onclick: function () { location.hash = '#/members'; }
        }, [UI.icon('users', 20), 'Tambah Anggota'])
      ])
    ]));

    /* izin menunggu */
    var pending = DB.listLeaves({ status: 'pending' });
    if (pending.length) {
      var card = UI.el('div', { class: 'card' }, [
        UI.el('div', { class: 'row between' }, [
          UI.el('div', { class: 'card-title', style: { margin: 0 }, text: 'Izin Menunggu Persetujuan' }),
          UI.el('span', { class: 'chip warn', text: String(pending.length) })
        ])
      ]);
      pending.slice(0, 4).forEach(function (lv) {
        var u = DB.getUser(lv.userId) || { name: '?' };
        card.appendChild(UI.listItem({
          icon: 'file',
          title: u.name + ' · ' + lv.type,
          sub: lv.start + (lv.end !== lv.start ? ' s/d ' + lv.end : '') + ' — ' + lv.reason.slice(0, 40),
          right: UI.statusChip('pending')
        }));
      });
      card.appendChild(UI.el('button', {
        class: 'linkish center w100 mt8', text: 'Lihat semua →',
        onclick: function () { location.hash = '#/leaves'; }
      }));
      page.appendChild(card);
    }

    /* aktivitas terbaru (audit) */
    var audit = DB.listAudit(8);
    var act = UI.el('div', { class: 'card' }, [UI.el('div', { class: 'card-title', text: 'Aktivitas Terbaru' })]);
    if (!audit.length) {
      act.appendChild(UI.emptyState('info', 'Belum ada aktivitas.'));
    } else {
      audit.forEach(function (ev) {
        var u = ev.actor ? DB.getUser(ev.actor) : null;
        var label = eventLabel(ev.event);
        act.appendChild(UI.listItem({
          icon: eventIcon(ev.event),
          title: label,
          sub: (u ? u.name : 'sistem') + ' · ' + ev.at.slice(11, 16) + ' · ' + ev.at.slice(0, 10)
        }));
      });
    }
    page.appendChild(act);
  }

  var EVENT_MAP = {
    'setup.done': ['moon', 'Instalasi selesai'],
    'user.create': ['users', 'Anggota baru dibuat'],
    'user.update': ['edit', 'Profil diperbarui'],
    'user.password.change': ['shield', 'Password diubah sendiri'],
    'user.password.reset': ['shield', 'Password direset admin'],
    'user.delete': ['trash', 'Anggota dihapus'],
    'login.success': ['check', 'Berhasil masuk'],
    'login.fail': ['x', 'Gagal masuk'],
    'login.locked': ['shield', 'Akun terkunci sementara'],
    'logout': ['logout', 'Keluar'],
    'session.expired': ['clock', 'Sesi berakhir otomatis'],
    'checkin': ['check', 'Check-in'],
    'checkout': ['logout', 'Check-out'],
    'attendance.edit': ['edit', 'Absensi dikoreksi'],
    'attendance.delete': ['trash', 'Absensi dihapus'],
    'qr.scan': ['scan', 'QR dipindai'],
    'leave.request': ['file', 'Pengajuan izin'],
    'leave.approve': ['check', 'Izin disetujui'],
    'leave.reject': ['x', 'Izin ditolak'],
    'leave.cancel': ['x', 'Izin dibatalkan'],
    'settings.update': ['gear', 'Pengaturan diubah'],
    'backup.export': ['download', 'Backup diekspor'],
    'backup.export.csv': ['download', 'CSV diekspor'],
    'backup.import': ['upload', 'Backup diimpor'],
    'data.wipe': ['trash', 'Data dihapus total']
  };
  function eventLabel(ev) { return (EVENT_MAP[ev] || ['info', ev])[1]; }
  function eventIcon(ev) { return (EVENT_MAP[ev] || ['info', 'info'])[0]; }

  MC.app.route('home', function (page, user) {
    if (user.role === 'admin') adminHome(page, user);
    else memberHome(page, user);
  });
})(typeof window !== 'undefined' ? window : globalThis);
