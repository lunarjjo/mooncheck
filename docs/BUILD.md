# mooncheck — Build & Pengembangan

## Prasyarat

| Kebutuhan | Versi | Catatan |
|---|---|---|
| Node.js | ≥ 18 | menjalankan test suite |
| Android SDK | platform **android-34** + build-tools **35.0.0** | d8 34.0.0 berbug — jangan pakai |
| JDK | 17/21 (javac) | boleh hasil ekstrak .deb (lihat catatan bawah) |
| Python + PIL | opsional | regenerasi ikon & vektor uji |

Tanpa Android SDK, seluruh aplikasi tetap bisa dijalankan di browser biasa —
lihat "Mode browser" di bawah.

## Test

```bash
node tests/run_all.js
# crypto 41 + geo 22 + qr 21 + attendance 53 + db 91 = 228 test
```

Test memakai sandbox `vm` Node yang memuat berkas persis seperti browser
(urutan di `tests/harness.js`), dengan mock `localStorage`/`navigator`.

## Mode browser (dua jalur kripto)

```bash
# jalur WebCrypto (secure context) — sama seperti di dalam APK:
python3 -m http.server 8791 --bind 127.0.0.1 -d app
# buka http://127.0.0.1:8791/index.html

# jalur kripto murni (fallback):
# buka app/index.html langsung (file://)
```

## Build APK

```bash
bash android/build_apk.sh
# keluaran: release/mooncheck-v0.1.0.apk (zipalign + apksigner verified)
```

Skrip mendeteksi SDK dari `ANDROID_HOME`, `/home/z/my-project/android-sdk`,
atau `/usr/local/lib/android/sdk` (runner GitHub). Tanpa `javac` di PATH, ia
memakai JDK portabel hasil ekstrak `.deb` + `LD_LIBRARY_PATH` otomatis.

### Keystore
Build pertama membuat `android/mooncheck.keystore` (PKCS12, alias `mooncheck`,
password default `mooncheck-dev-key` — bisa dioverride env `MOONCHECK_KS_PASS`).
**Keystore dev tidak untuk rilis produksi** — buat keystore sendiri:

```bash
keytool -genkeypair -keystore rilis.keystore -alias mooncheck \
  -keyalg RSA -keysize 4096 -validity 10000
MOONCHECK_KS_PASS=passAnda KEYSTORE=path/rilis.keystore bash android/build_apk.sh
```
(Sesuaikan variabel KEYSTORE bila memakai skrip dimodifikasi.)

### Catatan jebakan yang sudah terdokumentasi
1. **d8 build-tools 34.0.0 = snapshot 8.2.2-dev berbug** — NPE
   `String.length()` pada kelas anonim. Solusi: build-tools 35.0.0 (skrip
   memilih otomatis dengan urutan 35 → 34 → 33.0.2).
2. **Debian `openjdk-*-jre-headless` memuat modul `jdk.compiler`** — javac bisa
   diambil dari `.deb` `openjdk-21-jdk-headless` via `dpkg -x` tanpa sudo,
   lalu dijalankan dengan `LD_LIBRARY_PATH` menunjuk lib JRE sistem.
3. **Atribut `[hidden]` kalah dari CSS `display` author** — selalu sediakan
   override `[hidden]{display:none!important}` bila komponen punya aturan display.

## Regenerasi aset

```bash
python3 tools/gen_vectors.py   # vektor uji SHA/HMAC/PBKDF2 dari hashlib Python
python3 tools/gen_icons.py      # ikon launcher semua density (PIL)
node tools/make_qr_png_payload.js "MC1|u-xxxx|yyyy"   # matriks QR → teks
# (lanjut gambar PNG dengan PIL — lihat riwayat E2E)
```

## CI

`.github/workflows/android.yml` menjalankan: test Node → build APK →
verifikasi apksigner → unggah APK sebagai artefak build.
