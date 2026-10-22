# mooncheck

**Aplikasi absensi Android lengkap — admin & anggota dalam satu APK.**
Offline-first, QR bertanda tangan HMAC, geofence lokasi, tema mengikuti perangkat.

![platform](docs/badges/flat__platform__android-50plus.svg)
![tests](docs/badges/lunar__tests__228-lulus.svg)
![versi](docs/badges/flat__versi__v010.svg)
![deps](docs/badges/flatsq__deps__0-npm-pip.svg)
![ukuran](docs/badges/lunar__ukuran__160-kb-apk.svg)
![lisensi](docs/badges/flat__lisensi__mit.svg)

> Proyek ketiga agen [lunarjjo](https://github.com/lunarjjo) — dibangun dengan mandat
> "tugas berat dengan debugging panjang": 2.300+ baris kode, 228 unit test,
> E2E browser dua jalur kripto, dan siklus debug 12 bug nyata (lihat [CHANGELOG](CHANGELOG.md)).

## Apa yang ada di dalamnya

| Area | Fitur |
|---|---|
| **Peran** | Admin & anggota dalam satu aplikasi; UI menyesuaikan peran yang masuk |
| **Absensi** | Check-in/out dengan jam, status otomatis (tepat / telat / cepat / lembur), menit kerja, catatan |
| **Lokasi** | Koordinat GPS tiap absen, jarak ke kantor, **geofence radius** dengan konfirmasi bila di luar area |
| **QR** | Kartu QR anggota bertanda tangan **HMAC-SHA256** (QR palsu ditolak); pemindai admin: kamera langsung **atau** pilih gambar |
| **Login & keamanan** | Password **PBKDF2-SHA256 100.000 iterasi** (salt unik per akun), kunci brute-force, sesi + **kunci otomatis**, **log audit** 500 peristiwa |
| **Izin** | Pengajuan sakit/izin/cuti → persetujuan admin → terhitung dalam statistik |
| **Admin** | Kelola anggota (tambah/ubah/reset pw/nonaktif/hapus), koreksi absensi berjejak, rekap harian, **matriks bulanan H/T/A/I**, ekspor CSV |
| **Backup** | Ekspor/impor JSON tervalidasi penuh, ekspor CSV (BOM + escaping Excel) |
| **Tema** | **Ikuti perangkat** (dark/light otomatis) atau paksa terang/gelap — termasuk bilah status Android |
| **Kompatibilitas** | **Android 5.0 (API 21) sampai terbaru**, tanpa Play Services, tanpa AndroidX, tanpa server eksternal |

## Tangkapan layar

| Beranda Admin | Pengaturan (gelap) | Check-in Member | Kartu QR |
|---|---|---|---|
| ![admin](docs/screenshots/01-admin-home.png) | ![settings](docs/screenshots/02-settings-dark.png) | ![checkin](docs/screenshots/05-member-checkin.png) | ![qr](docs/screenshots/07-qr-card.png) |

| Riwayat + Kalender | Pemindai QR | Laporan Matriks | Mode Gelap Member |
|---|---|---|---|
| ![history](docs/screenshots/08-history.png) | ![scan](docs/screenshots/09-scan.png) | ![rekap](docs/screenshots/03-rekap.png) | ![dark](docs/screenshots/10-member-dark.png) |

## Instalasi

Unduh `mooncheck-v0.1.0.apk` dari [halaman rilis](https://github.com/lunarjjo/mooncheck/releases),
buka di Android, izinkan "instal dari sumber tidak dikenal", selesai. Buka aplikasi →
buat akun admin pertama → mulai menambah anggota.

Tidak ada akun cloud, tidak ada iklan, tidak ada pelacakan — seluruh data disimpan
**lokal di perangkat** (localStorage WebView).

## Struktur proyek

```
app/                    aplikasi web inti (HTML/CSS/JS vanilla, tanpa build step)
  js/crypto.js          SHA-256 + HMAC + PBKDF2 murni JS (fallback non-secure-context)
  js/db.js              lapisan data: user, absensi, izin, audit, pengaturan, backup
  js/geo.js             haversine, evaluasi geofence, sumber lokasi (bridge/web)
  js/qrlib.js           payload QR HMAC + render SVG + decode jsQR
  js/attendance.js      logika murni: status, statistik bulanan, format Indonesia
  js/ui.js, js/app.js   komponen UI + router hash + manajer tema
  js/pages/*.js         11 halaman (auth, beranda, riwayat, qr, scan, anggota,
                        rekap, izin, laporan, pengaturan, profil)
  js/vendor/            qrcode-generator + jsQR (MIT, vendored — lihat LICENSES)
android/                pembungkus native (3 file Java, tanpa Gradle)
  MainActivity.java     WebView + permission runtime + file chooser
  LocalServer.java      server loopback beralamat-token (secure context)
  Bridge.java           jembatan JS: lokasi native, tema, unduhan, getar
  build_apk.sh          aapt2 → javac → d8 → zipalign → apksigner
tests/                  228 test Node (crypto NIST/RFC, db, geo, QR roundtrip, logika)
tools/                  generator vektor uji, ikon, QR PNG untuk E2E
```

## Pengembangan

```bash
# uji (Node saja, tanpa dependensi)
node tests/run_all.js

# buka aplikasi di browser (mode file:// = jalur kripto murni)
python3 -m http.server 8791 -d app   # atau buka app/index.html langsung

# build APK (butuh Android SDK platform-34 + build-tools 35)
bash android/build_apk.sh
```

Detail lengkap: [docs/BUILD.md](docs/BUILD.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
[docs/SECURITY.md](docs/SECURITY.md) · [docs/USER_GUIDE.md](docs/USER_GUIDE.md)

## Anggota

Aplikasi ini dipakai oleh satu perangkat pada satu waktu (pola "pos absensi"):
admin memegang perangkat untuk memindai QR anggota, atau anggota memakai perangkat
bersama untuk absen mandiri. Semua data bisa dipindah antar perangkat lewat
backup JSON. Sinkronisasi multi-perangkat adalah kandidat roadmap v0.2.

## Lisensi

MIT — lihat [LICENSE](LICENSE). Pustaka vendored: [LICENSES](app/js/vendor/LICENSES.md).
