# mooncheck — Panduan Pengguna

Panduan lengkap memakai aplikasi absensi mooncheck dalam Bahasa Indonesia.

## 1. Memulai

1. **Instal** `mooncheck-v0.1.0.apk` (izinkan instalasi dari sumber tidak dikenal).
2. Saat pertama dibuka, aplikasi meminta dua izin:
   - **Kamera** — untuk pemindai QR. Bila ditolak, pemindai memakai mode *pilih gambar*.
   - **Lokasi** — untuk koordinat absensi & geofence. Bila ditolak, absen tetap bisa dicatat tanpa koordinat.
3. **Buat akun admin pertama**: isi nama organisasi, username, nama lengkap, dan password (minimal 6 karakter).

Setiap orang berikutnya ditambahkan oleh admin dari halaman **Anggota**.

## 2. Sebagai Anggota

### Beranda
- Jam besar + tanggal, kartu **Hari Ini** (status masuk/pulang), tombol besar **Check In / Check Out**.
- Statistik bulan berjalan: hadir, telat, tanpa keterangan, izin.

### Check-in / Check-out
1. Tekan tombol besar. Aplikasi mengambil lokasi GPS lalu menampilkan ringkasan:
   koordinat, akurasi, dan **jarak ke kantor**.
2. Bila berada **di luar radius kantor**, aplikasi memberi peringatan dan meminta konfirmasi
   (dicatat dengan catatan Anda).
3. Tekan **Ya, Check-in**. Status otomatis dihitung:
   - masuk ≤ jam mulai + toleransi → **Tepat**; lebih dari itu → **Telat**
   - pulang < jam pulang → **Cepat**; dalam rentang normal → **Normal**; jauh melewati → **Lembur**

### Kartu QR
Tunjukkan halaman **Kartu QR** kepada admin/petugas. QR memuat ID Anda yang
ditandatangani digital — QR buatan sendiri akan ditolak.

### Izin & Cuti
Halaman **Izin** → **Ajukan**: pilih jenis (sakit/izin/cuti), rentang tanggal, alasan.
Pengajuan bisa dibatalkan selama masih menunggu. Setelah disetujui, hari tersebut
terhitung *izin* pada statistik (bukan tanpa keterangan).

### Riwayat
Kalender bulanan berwarna (hadir/telat/izin/tanpa keterangan/libur), statistik,
dan daftar seluruh catatan. Geser bulan dengan tombol `‹ ›`.

### Profil
Ganti nama/jabatan/telepon dilakukan admin, tapi **ganti password** dan **tema tampilan**
(*ikuti perangkat / selalu terang / selalu gelap*) bisa dari sini.

## 3. Sebagai Admin

### Beranda
Ringkasan hari ini (tepat, telat, izin, belum absen), aksi cepat, antrean izin
menunggu persetujuan, dan 8 aktivitas terakhir dari log audit.

### Pindai QR
- Mode **Otomatis**: scan pertama = check-in, scan kedua = check-out.
- Mode **Masuk** / **Pulang**: paksa satu arah.
- Kamera langsung jika tersedia; kalau tidak (atau izin ditolak), gunakan
  **Pilih Gambar QR** — foto layar pun terbaca selama tajam.
- Setelah decode: muncul konfirmasi identitas anggota + lokasi perangkat → **Catat Absensi**.

### Anggota
Tambah, ubah profil, reset password, nonaktifkan sementara (riwayat tetap aman),
atau hapus permanen (ikut menghapus data absensinya — ada konfirmasi ganda).

### Rekap
Filter per tanggal / anggota / status. Melihat **siapa yang belum absen** hari itu,
mengoreksi jam (jejak "Dikoreksi" permanen tercatat), menghapus catatan, dan
**ekspor CSV** (berformat Excel).

### Laporan (dari Rekap → pilih bulan)
Matriks harian seluruh anggota selama sebulan: `H` hadir, `T` telat, `I` izin,
`A` tanpa keterangan, `L` libur. Bisa diekspor CSV.

### Pengaturan
- **Organisasi & jam kerja**: nama, hari kerja (pilih bebas Sen–Min), jam masuk/pulang, toleransi keterlambatan.
- **Geofence**: nama lokasi, latitude/longitude, radius (10–10.000 m), tombol
  *Pakai Lokasi Saat Ini*. Kosongkan koordinat untuk menonaktifkan geofence.
- **Preferensi**: tema, kunci otomatis (menit).
- **Backup & Data**: ekspor/impor JSON, hapus semua data (hati-hati!).
- **Log Audit**: 500 peristiwa keamanan terakhir.

## 4. Keamanan yang perlu Anda tahu

- Password tidak pernah disimpan sebagai teks — hanya hash PBKDF2-SHA256
  (100.000 iterasi, salt unik per akun).
- 5× gagal masuk → akun terkunci 1 menit; 10× → 15 menit.
- Sesi terkunci otomatis setelah tidak dipakai (default 5 menit) — tombol gembok
  di kanan atas untuk mengunci manual.
- Setiap tindakan sensitif (login gagal, koreksi, ekspor, hapus) masuk log audit.
- Backup JSON memuat hash password & kunci tanda tangan QR — simpan di tempat aman.

## 5. Backup & Pindah Perangkat

1. **Pengaturan → Ekspor Backup JSON** → berkas masuk folder *Downloads*.
2. Di perangkat baru: setup admin → **Impor Backup JSON** → seluruh data
   (anggota, absensi, izin, pengaturan) dipulihkan, termasuk password semua orang.
3. Verifikasi impor ketat: berkas yang tidak lengkap ditolak dengan alasan.
