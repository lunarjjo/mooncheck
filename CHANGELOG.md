# Changelog

Semua perubahan berarti proyek mooncheck dicatat di sini.

## [0.1.0] — 2026-10-22

Rilis pertama: aplikasi absensi Android lengkap, admin & anggota dalam satu APK.

### Ditambahkan
- **Absensi**: check-in/out + status otomatis (tepat/telat/cepat/lembur), menit kerja, catatan.
- **Lokasi**: GPS per absen, jarak ke kantor, geofence radius + konfirmasi di luar area.
- **QR**: kartu anggota ber-HMAC; pemindai admin kamera langsung + mode pilih gambar; mode otomatis/masuk/pulang.
- **Keamanan**: PBKDF2-SHA256 (100rb iterasi, salt unik), lockout brute-force progresif, sesi bergulir + kunci otomatis, log audit 500 entri, timing-safe compare.
- **Izin/cuti**: pengajuan → persetujuan → statistik.
- **Admin**: kelola anggota penuh, koreksi absensi berjejak, rekap + filter, matriks bulanan H/T/A/I, ekspor CSV (BOM + escaping).
- **Backup**: ekspor/impor JSON tervalidasi menyeluruh.
- **Tema**: device/light/dark + bilah status Android mengikuti.
- **Android**: minSdk 21, tanpa AndroidX/Play Services, server loopback beralamat-token, bridge lokasi/tema/unduhan native, ikon adaptif.
- 228 unit test + E2E browser 17 alur × 2 jalur kripto.

### Diperbaiki selama pengembangan (12 bug nyata — inti sesi "debug lama")
1. `var sessionApi` terhapus saat refactor db.js → ReferenceError saat muat.
2. Guard aktor memakai `MC.session.userId` (properti tak pernah ada) → semua pemeriksaan peran diam-diam gagal; diganti helper `sessUserId()`.
3. `formatDuration` meninggalkan spasi buntut ("9 jam ").
4. `decodeFromImageData` hanya menerima objek ImageData, bukan array RGBA mentah.
5. CSS `display` author mengalahkan atribut `[hidden]` → shell tampil menumpuk layar login.
6. Alur setup admin tidak membuat sesi → `updateSettings` menolak orgName ("Harus masuk dulu").
7. Urutan muat skrip: halaman memanggil `MC.app.route` sebelum app.js mendefinisikannya → semua halaman gagal registrasi.
8. Modal aksi tidak menutup diri (scrim tercecer menutup layar) → auto-close + flag `keep` untuk aksi asinkron.
9. `el()` telanjang (bukan `UI.el`) di badan modal check-in → modal tidak pernah muncul.
10. `qrCheck` tidak melaporkan aksi mana yang dicatat → API diubah balik `{rec, action}`.
11. Koreksi "kosongkan jam masuk untuk hapus" tidak berfungsi (`''` dianggap undefined); ditambah guard dua-jam-kosong.
12. Build-tools 34.0.0 menyertakan d8 8.2.2-dev yang NPE pada kelas anonim → beralih ke build-tools 35.0.0.

### Keputusan desain penting
- Jam absensi disimpan string lokal naive `YYYY-MM-DDTHH:MM:SS` (bukan ISO UTC) — konsisten dengan koreksi admin & sortable. Bug desain awal mencampur keduanya sehingga validasi "pulang sebelum masuk" salah di zona bukan UTC.
- Statistik "Hadir" = total kehadiran (termasuk telat), "Telat" = bagiannya — mengikuti konvensi rekap Indonesia.
- `updateSettings`: tema & kunci-otomatis boleh diubah pengguna biasa (preferensi pribadi); sisanya admin saja.
