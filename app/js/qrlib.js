/* ============================================================
 * mooncheck — qrlib.js
 * QR kartu anggota: payload bertanda-tangan HMAC + render SVG
 * (matriks dari qrcode-generator) + decode (jsQR).
 *
 * Format payload: MC1|<userId>|<sigB16>
 *   sigB16 = 16 karakter base64 pertama dari HMAC-SHA256(appSecret, userId)
 *   → QR palsu (userId asal-asalan tanpa secret) tertolak.
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};

  var PROTO = 'MC1';

  /* ---------- pembuatan & verifikasi payload ---------- */

  function memberPayload(userId, appSecret) {
    var sig = MC.crypto.b64Encode(
      MC.crypto.hmacSha256(MC.crypto.b64Decode(appSecret), MC.crypto.strToUtf8(userId)));
    return PROTO + '|' + userId + '|' + sig.slice(0, 16);
  }

  /* Verifikasi string hasil scan → {ok, userId} | {ok:false, reason} */
  function parsePayload(text, appSecret) {
    if (typeof text !== 'string') return { ok: false, reason: 'Format bukan teks.' };
    var parts = text.split('|');
    if (parts.length !== 3 || parts[0] !== PROTO) {
      return { ok: false, reason: 'Bukan QR mooncheck.' };
    }
    var userId = parts[1];
    var want = memberPayload(userId, appSecret);
    if (want !== text) {
      return { ok: false, reason: 'Tanda tangan QR tidak cocok (QR palsu / data lama).' };
    }
    return { ok: true, userId: userId };
  }

  /* ---------- render SVG dari matriks qrcode-generator ---------- */

  /* typeNumber 0 = otomatis; errorLevel 'M' */
  function makeMatrix(text) {
    var qr = global.qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    return qr;
  }

  /* SVG bertema: modul gelap pakai warna tinta tema, sudut membulat halus */
  function renderSvg(text, opts) {
    opts = opts || {};
    var qr = makeMatrix(text);
    var count = qr.getModuleCount();
    var quiet = opts.quiet != null ? opts.quiet : 3; // zona senyap modul
    var unit = 8;                                    // px per modul (sebelum viewBox)
    var size = (count + quiet * 2) * unit;
    var dark = opts.dark || 'currentColor';
    var light = opts.light || 'transparent';
    var bg = opts.bg || null;

    var rects = [];
    // gabungkan modul bersebelahan horizontal agar SVG ringkas
    for (var y = 0; y < count; y++) {
      var x = 0;
      while (x < count) {
        if (qr.isDark(y, x)) {
          var run = 1;
          while (x + run < count && qr.isDark(y, x + run)) run++;
          rects.push('<rect x="' + ((x + quiet) * unit) + '" y="' + ((y + quiet) * unit) +
            '" width="' + (run * unit) + '" height="' + unit + '" rx="' + (unit / 5) + '"/>');
          x += run;
        } else { x++; }
      }
    }

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" role="img"' +
      ' aria-label="QR absensi"><rect width="' + size + '" height="' + size + '" fill="' + light + '"/>' +
      (bg ? '<rect width="' + size + '" height="' + size + '" rx="' + (unit * 2) + '" fill="' + bg + '"/>' : '') +
      '<g fill="' + dark + '">' + rects.join('') + '</g></svg>';
    return { svg: svg, size: size, count: count };
  }

  /* ---------- decode dari kanvas/citra ----------
     Menerima objek ImageData ATAU array RGBA mentah. */
  function decodeFromImageData(imageDataOrData, width, height) {
    var fn = global.jsQR;
    if (!fn) return { ok: false, reason: 'Pustaka decode tidak tersedia.' };
    var data = (imageDataOrData && imageDataOrData.data) ? imageDataOrData.data : imageDataOrData;
    if (!data || !data.length || data.length !== width * height * 4) {
      return { ok: false, reason: 'Dimensi citra tidak konsisten.' };
    }
    var res = fn(data, width, height, { inversionAttempts: 'attemptBoth' });
    if (res && res.data) return { ok: true, text: res.data };
    return { ok: false, reason: 'Tidak ada QR terdeteksi.' };
  }

  MC.qrlib = {
    PROTO: PROTO,
    memberPayload: memberPayload,
    parsePayload: parsePayload,
    makeMatrix: makeMatrix,
    renderSvg: renderSvg,
    decodeFromImageData: decodeFromImageData
  };
})(typeof window !== 'undefined' ? window : globalThis);
