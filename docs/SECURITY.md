# mooncheck — Model Keamanan

Dokumen ini menjelaskan apa yang dilindungi, bagaimana, dan apa batasnya.

## Ringkasan keputusan desain

| Kebutuhan | Mekanisme |
|---|---|
| Password tidak tersimpan polos | PBKDF2-HMAC-SHA256, 100.000 iterasi, salt 16-byte acak per akun |
| Tahan timing attack | `timingSafeEqual` (XOR penuh) untuk pembandingan hash |
| Tahan brute-force | Penguncian progresif: 5× gagal → 60 dtk, 10× → 15 mnt |
| Sesi tidak abadi | Token acak 24-byte + kedaluwarsa bergulir (default 5 menit idle) |
| QR tidak bisa dipalsukan | Payload `MC1\|userId\|sig16` — sig = HMAC-SHA256(appSecret, userId) |
| Aksi sensitif terlacak | Log audit append-only, dibatasi 500 entri terbaru |
| Data tidak bocor ke jaringan | Semua lokal; WebView hanya bicara dengan server loopback sendiri |

## Detail PBKDF2

- Iterasi dan salt disimpan **per pengguna** (`user.iters`, `user.salt`) sehingga
  parameter bisa naik di masa depan tanpa memutus akun lama.
- Implementasi ganda dan saling menggantikan (deterministik, hasil identik):
  - **WebCrypto `crypto.subtle`** (berlari di http://127.0.0.1 yang merupakan
    secure context) — cepat, native.
  - **Implementasi murni** di `app/js/crypto.js` — fallback bila secure context
    tidak tersedia (mis. mode pengembangan `file://`).
- Diverifikasi terhadap vektor NIST & RFC 7914 (lihat `tests/test_crypto.js`).

## Ancaman yang DIPERTIMBANGKAN

1. **Perangkat curian terkunci** — sesi kedaluwarsa mandiri; penyerang tetap perlu
   password. Catatan: `localStorage` tidak dienkripsi at-rest; bila lawan bisa
   membaca filesystem (root/debug), mereka bisa membaca data. Mitigasi praktis:
   enkripsi perangkat Android (standar di Android 10+).
2. **QR rekayasa** — ID anggota acak 10-hex + HMAC berbasis `appSecret` acak
   per-instalasi. QR dari instalasi lain/tulisan tangan tertolak.
3. **Aplikasi lain di perangkat yang sama** — server loopback mengikat 127.0.0.1
   **dengan token acak 16-byte per sesi di jalur URL**; aplikasi lain yang memindai
   port lokal tidak bisa membaca aset tanpa token.
4. **Edisi backup jahat** — impor memvalidasi struktur menyeluruh (versi, skema
   pengguna, pengaturan, keberadaan admin). Berkas rusak ditolak dengan alasan.
5. **Penghapusan tidak sengaja** — semua penghapusan besar lewat konfirmasi ganda;
   kejadian tercatat di audit.

## Batas (jujur)

- **Tidak ada enkripsi at-rest** atas localStorage (lihat poin 1 di atas).
- **Backup JSON tidak berpassword** — memuat hash password dan `appSecret`.
  Simpan seperti dokumen rahasia. Backup berpassword = roadmap.
- **Model satu perangkat** — tidak ada otentikasi dua arah ke server mana pun
  (memang tidak ada server). Kunci kepercayaan = kepemilikan perangkat + password.
- **Izin runtime Android** — bila pengguna menolak kamera/lokasi, aplikasi
  berfungsi dengan degradasi yang dijelaskan, bukan diam-diam mati.

## Checklist audit ulang sendiri

Buktikan klaim di atas tanpa mempercayai dokumen ini:

```bash
node tests/test_crypto.js      # 41 test NIST/RFC untuk SHA-256/HMAC/PBKDF2
node tests/test_db.js          # 91 test: lockout, guard peran, validasi impor
node tests/test_qr.js          # 21 test: HMAC payload + roundtrip decode
```

Semua sumber ada di `app/js/` — tanpa obfuscation, tanpa kode tertutup.
