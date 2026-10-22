# mooncheck — Arsitektur

## Lapisan keseluruhan

```
┌────────────────────────────────────────────────────────┐
│  Android (min API 21, tanpa AndroidX, tanpa PlaySvc)  │
│                                                        │
│  MainActivity ── WebView ── http://127.0.0.1:PORT/TOKEN/ │
│       │                       │                        │
│       │                       ▼                        │
│       │              LocalServer (loopback)            │
│       │                aset app/ dari APK              │
│       ▼                                                │
│  Bridge (addJavascriptInterface)                       │
│    getLocation() isDarkMode() applyNativeTheme()       │
│    download() vibrate() appInfo()                      │
└────────────────────────────────────────────────────────┘
                     │
                     ▼  (semua logika di sini)
┌────────────────────────────────────────────────────────┐
│  app/ — aplikasi web vanilla (tanpa build step)       │
│                                                        │
│  crypto.js → db.js → geo.js → qrlib.js → attendance.js │
│  ui.js → app.js (router/tema/sesi) → pages/*.js        │
│  vendor: qrcode-generator + jsQR (MIT)                 │
└────────────────────────────────────────────────────────┘
```

## Kenapa server loopback, bukan file://?

WebView dengan `loadUrl("file://...")` kehilangan dua hal penting:

1. **`crypto.subtle`** hanya hidup di *secure context*. `file://` bukan secure
   context, sehingga PBKDF2 harus jatuh ke implementasi murni (lambat, ~detik).
2. **`getUserMedia`** (kamera pemindai) juga butuh secure context.

`http://127.0.0.1` **adalah** secure context menurut spesifikasi. LocalServer
menyajikan aset dari APK lewat ServerSocket yang hanya mendengarkan 127.0.0.1,
dengan **token 16-byte acak di awal jalur** (`/TOKEN/index.html`) agar aplikasi
lain di perangkat yang sama tidak bisa membaca isi.

Konsekuensi yang disengaja & didokumentasikan: origin localStorage adalah
`http://127.0.0.1:<port>` — bila port berubah (8471–8475 dicoba berurutan),
data localStorage terikat port. Praktiknya port pertama hampir selalu bebas.

## Keputusan kunci lainnya

### Jam disimpan sebagai string lokal naive
Semua jam absensi `.at` berformat `YYYY-MM-DDTHH:MM:SS` **waktu dinding lokal**.
Alasan: (1) sebanding leksikografis dengan hasil koreksi manual admin yang
membangun string serupa, (2) tampil benar tanpa konversi zona, (3) absensi
adalah fakta lokal kantor. Metadata (createdAt, audit) tetap ISO UTC dan tidak
pernah dibandingkan dengan jam absensi. — Keputusan ini lahir dari bug desain
awal yang menumpuk ISO UTC dengan string lokal (lihat CHANGELOG #desain).

### Logika murni vs lapisan data
`attendance.js` tidak menyentuh storage — semua fungsi (status, statistik,
format) murni dan mudah diuji di Node. `db.js` memanggilnya saat menulis.
Load order: modul inti → `app.js` (definisi router) → halaman (registrasi) →
`DOMContentLoaded` → `boot()`.

### Dual-implementasi kripto
`crypto.js` mengekspor `deriveBits()` yang memakai WebCrypto bila tersedia dan
jatuh ke PBKDF2 murni bila tidak — hasil identik karena PBKDF2 deterministik.
E2E menguji KEDUA jalur: `file://` (murni) dan `http://127.0.0.1` (subtle).

### QR: encode vendored, decode vendored, payload milik sendiri
Matriks QR dari `qrcode-generator` (MIT, teruji puluhan tahun) dirender jadi SVG
sendiri (run-merge modul horizontal agar ringkas). Decode lewat jsQR (MIT) atas
`ImageData` kanvas. Payload `MC1|userId|sig` dengan sig HMAC — verifikasi
terjadi di `qrlib.parsePayload`, diuji roundtrip nyata encode→raster→decode.

### Build tanpa Gradle
`android/build_apk.sh`: aapt2 compile+link (manifest, resource, aset, R.java) →
javac -source 8 → d8 --min-api 21 → zip classes.dex → zipalign -p 4 →
apksigner (keystore dev PKCS12). Dua jebakan yang terdokumentasi:
- d8 build-tools **34.0.0** menyertakan snapshot 8.2.2-dev yang NPE pada kelas
  anonim → gunakan build-tools 35.0.0 (skrip memilih otomatis).
- `javac` sistem mungkin hanya JRE; Debian JRE ternyata memuat modul
  `jdk.compiler` sehingga javac hasil ekstrak .deb jalan dengan `LD_LIBRARY_PATH`.

### Tema mengikuti perangkat
Alur kebenaran tema: `settings.theme` ('device'|'light'|'dark') → bila 'device':
Bridge.isDarkMode() (konfigurasi Android) → fallback `matchMedia` → atribut
`data-theme` di `<html>` → CSS variables. Perubahan gelap sistem memicu
`onConfigurationChanged` (manifest `configChanges` mencakup `uiMode`) →
`evaluateJavascript("MC._onNativeThemeChange()")` → re-apply. Bilah status
disamakan lewat `applyNativeTheme()`.

## Angka

- 23 berkas aset web + 3 kelas Java + 6 resource XML/PNG set
- 228 unit test (Node), E2E 17 alur × 2 jalur kripto
- APK 160 KB; minSdk 21 (Android 5.0, ~99% perangkat aktif)
