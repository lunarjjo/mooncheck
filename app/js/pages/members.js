/* ============================================================
 * mooncheck — pages/members.js (admin)
 * Manajemen anggota: daftar + cari, tambah, edit profil,
 * reset password, aktif/nonaktif, hapus.
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};
  var UI = MC.ui, DB = MC.db, A = MC.attendance;

  function formAddMember() {
    var fUser = UI.input({ class: 'input', placeholder: 'huruf kecil, 3-24 karakter' });
    var fName = UI.input({ class: 'input', placeholder: 'cth: Siti Rahma' });
    var fPos = UI.input({ class: 'input', placeholder: 'cth: Staff Keuangan' });
    var fPhone = UI.input({ class: 'input', placeholder: 'opsional' });
    var fPass = UI.input({ class: 'input', type: 'password', placeholder: 'password awal (min 6)' });
    var roleSel = UI.el('select', { class: 'input' }, [
      UI.el('option', { value: 'member', text: 'Anggota' }),
      UI.el('option', { value: 'admin', text: 'Admin' })
    ]);

    var body = UI.el('div', {}, [
      UI.field('Username', fUser),
      UI.field('Nama lengkap', fName),
      UI.field('Jabatan (opsional)', fPos),
      UI.field('Telepon (opsional)', fPhone),
      UI.field('Peran', roleSel),
      UI.field('Password awal', fPass)
    ]);

    UI.modal({
      title: 'Tambah Anggota',
      body: body,
      actions: [
        { label: 'Batal' },
        {
          label: 'Simpan', cls: 'primary', keep: true,
          onClick: function (close) {
            DB.createUser({
              username: fUser.value, name: fName.value, password: fPass.value,
              role: roleSel.value, position: fPos.value, phone: fPhone.value
            }).then(function () {
              UI.toast('Anggota ditambahkan.', 'ok');
              close();
              MC.app.navigate();
            }).catch(function (e) {
              UI.showErr(e);
            });
          }
        }
      ]
    });
  }

  function formEditMember(user) {
    var fName = UI.input({ class: 'input', value: user.name });
    var fPos = UI.input({ class: 'input', value: user.position || '' });
    var fPhone = UI.input({ class: 'input', value: user.phone || '' });
    var roleSel = UI.el('select', { class: 'input' }, [
      UI.el('option', { value: 'member', text: 'Anggota' }),
      UI.el('option', { value: 'admin', text: 'Admin' })
    ]);
    roleSel.value = user.role;

    UI.modal({
      title: 'Ubah: ' + user.name,
      body: UI.el('div', {}, [
        UI.field('Nama lengkap', fName),
        UI.field('Jabatan', fPos),
        UI.field('Telepon', fPhone),
        UI.field('Peran', roleSel)
      ]),
      actions: [
        { label: 'Batal' },
        {
          label: 'Simpan', cls: 'primary',
          onClick: function (close) {
            try {
              DB.updateUser(user.id, {
                name: fName.value, position: fPos.value, phone: fPhone.value, role: roleSel.value
              });
              UI.toast('Perubahan disimpan.', 'ok');
              close();
              MC.app.navigate();
            } catch (e) { UI.showErr(e); }
          }
        }
      ]
    });
  }

  function actionResetPw(user) {
    var fPass = UI.input({ class: 'input', type: 'password', placeholder: 'password baru (min 6)' });
    UI.modal({
      title: 'Reset Password: ' + user.name,
      body: UI.el('div', {}, [
        UI.el('div', { class: 'tiny muted mb8', text: 'Password lama tidak dibutuhkan. Beri password sementara dan minta anggota menggantinya sendiri.' }),
        UI.field('Password baru', fPass)
      ]),
      actions: [
        { label: 'Batal' },
        {
          label: 'Reset', cls: 'primary', keep: true,
          onClick: function (close) {
            DB.adminResetPassword(user.id, fPass.value).then(function () {
              UI.toast('Password direset.', 'ok');
              close();
            }).catch(function (e) { UI.showErr(e); });
          }
        }
      ]
    });
  }

  function actionToggleActive(user) {
    var active = user.active !== false;
    UI.confirmSheet(
      active ? 'Nonaktifkan akun?' : 'Aktifkan kembali akun?',
      active
        ? user.name + ' tidak dapat masuk sampai diaktifkan kembali. Riwayat absensi tetap tersimpan.'
        : user.name + ' dapat masuk kembali seperti biasa.',
      active ? 'Nonaktifkan' : 'Aktifkan',
      function () {
        try {
          DB.updateUser(user.id, { active: !active });
          UI.toast(active ? 'Akun dinonaktifkan.' : 'Akun diaktifkan.', 'ok');
          MC.app.navigate();
        } catch (e) { UI.showErr(e); }
      },
      active
    );
  }

  function actionDelete(user) {
    UI.confirmSheet(
      'Hapus permanen?',
      'Semua data absensi dan izin milik ' + user.name + ' ikut terhapus. Tindakan ini tidak dapat dibatalkan.',
      'Hapus Permanen',
      function () {
        try {
          DB.deleteUser(user.id);
          UI.toast('Anggota dihapus.', 'ok');
          MC.app.navigate();
        } catch (e) { UI.showErr(e); }
      }
    );
  }

  function actionDetail(user) {
    var month = DB.todayStr().slice(0, 7);
    var recs = DB.listAttendance({ userId: user.id, from: month + '-01', to: month + '-31' });
    var stats = A.monthStats(month, recs, DB.listLeaves({ userId: user.id }), DB.getSettings(), DB.todayStr());
    var list = UI.el('div', { class: 'stack' });
    list.appendChild(UI.el('div', { class: 'tiny muted', text: '@' + user.username + (user.position ? ' · ' + user.position : '') + (user.phone ? ' · ' + user.phone : '') }));
    list.appendChild(UI.el('div', { class: 'row' }, [
      UI.statusChip('hadir', 'Hadir ' + (stats.present + stats.late)),
      UI.statusChip('warn', 'Telat ' + stats.late),
      UI.statusChip('alfa', 'Tanpa Ket. ' + stats.absent),
      UI.statusChip('izin', 'Izin ' + stats.leave)
    ]));
    list.appendChild(UI.el('div', { class: 'tiny', text: 'Bulan ini: ' + UI.dur(stats.workedMin) + ' · bergabung ' + (user.createdAt || '').slice(0, 10) }));
    list.appendChild(UI.el('button', {
      class: 'linkish', text: 'Lihat rekap lengkap →',
      onclick: function () { location.hash = '#/rekap?user=' + user.id; }
    }));
    UI.modal({ title: user.name, body: list, actions: [{ label: 'Tutup' }] });
  }

  MC.app.route('members', function (page, user) {
    var search = UI.input({ class: 'input', placeholder: 'Cari nama / username…' });
    var listWrap = UI.el('div', { class: 'card' });

    function render() {
      UI.clear(listWrap);
      var qy = search.value.trim().toLowerCase();
      var users = DB.listUsers(true).filter(function (u) {
        return !qy || u.name.toLowerCase().indexOf(qy) >= 0 || u.username.indexOf(qy) >= 0;
      });
      if (!users.length) {
        listWrap.appendChild(UI.emptyState('users', 'Tidak ada anggota yang cocok.'));
        return;
      }
      users.forEach(function (u) {
        var menu = UI.el('button', { class: 'icon-btn', 'aria-label': 'Menu anggota' }, [UI.icon('gear', 20)]);
        menu.addEventListener('click', function (e) {
          e.stopPropagation();
          var actions = UI.el('div', { class: 'stack' });
          [['edit', 'Ubah profil', function () { formEditMember(u); }],
           ['shield', 'Reset password', function () { actionResetPw(u); }],
           [u.active !== false ? 'x' : 'check', u.active !== false ? 'Nonaktifkan' : 'Aktifkan', function () { actionToggleActive(u); }],
           ['trash', 'Hapus permanen', function () { actionDelete(u); }]
          ].forEach(function (a) {
            actions.appendChild(UI.el('button', {
              class: 'btn ' + (a[0] === 'trash' ? 'danger' : 'tonal') + ' block',
              onclick: a[2]
            }, [UI.icon(a[0], 19), a[1]]));
          });
          UI.modal({ title: u.name, body: actions, actions: [{ label: 'Tutup' }] });
        });
        listWrap.appendChild(UI.listItem({
          icon: 'user',
          title: u.name + (u.active === false ? ' (nonaktif)' : ''),
          sub: '@' + u.username + (u.position ? ' · ' + u.position : ''),
          right: UI.el('div', { class: 'row' }, [
            UI.statusChip(u.role),
            menu
          ])
        }));
        // baris bisa diklik → detail
        var item = listWrap.lastChild;
        item.style.cursor = 'pointer';
        item.addEventListener('click', function () { actionDetail(u); });
      });
    }

    search.addEventListener('input', render);
    render();

    page.appendChild(UI.el('div', { class: 'row between mb16' }, [
      UI.el('div', { style: { fontWeight: 800, fontSize: '17px' }, text: 'Anggota' }),
      UI.el('button', { class: 'btn primary sm', onclick: formAddMember }, [UI.icon('users', 18), 'Tambah'])
    ]));
    page.appendChild(UI.el('div', { class: 'mb16' }, [search]));
    page.appendChild(listWrap);
  });
})(typeof window !== 'undefined' ? window : globalThis);
