/* ============================================================
 * mooncheck — crypto.js
 * SHA-256 + HMAC-SHA256 + PBKDF2 murni JavaScript (tanpa dependency).
 *
 * Alasan ada modul ini: crypto.subtle hanya tersedia pada secure
 * context. Di WebView file:// ia tidak ada, sehingga hashing
 * password harus tetap jalan lewat implementasi murni.
 * PBKDF2 adalah spesifikasi deterministik: hasil WebCrypto dan
 * hasil implementasi murni ini IDENTIK untuk parameter yang sama,
 * sehingga keduanya saling menggantikan dengan aman.
 *
 * Ruang nama: window.MC.crypto
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};

  /* ---------- Konstanta SHA-256 ---------- */
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  var H0 = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }
  function sigma0(x) { return (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0; }
  function sigma1(x) { return (rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10)) >>> 0; }
  function bigSigma0(x) { return (rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22)) >>> 0; }
  function bigSigma1(x) { return (rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25)) >>> 0; }
  function ch(x, y, z) { return ((x & y) ^ ((~x) & z)) >>> 0; }
  function maj(x, y, z) { return ((x & y) ^ (x & z) ^ (y & z)) >>> 0; }

  var W = new Array(64);

  /* ---------- SHA-256 inti ---------- */
  function sha256(bytes) {
    var len = bytes.length;
    var bitLenHi = Math.floor(len / 536870912);       // len*8 / 2^32
    var bitLenLo = ((len << 3) >>> 0);

    // panjang total setelah padding: len + 1 (0x80) + padding nol + 8 byte panjang
    var paddedLen = (((len + 9 + 63) / 64) | 0) * 64;
    var m = new Uint8Array(paddedLen);
    m.set(bytes);
    m[len] = 0x80;
    m[paddedLen - 8] = (bitLenHi >>> 24) & 0xff;
    m[paddedLen - 7] = (bitLenHi >>> 16) & 0xff;
    m[paddedLen - 6] = (bitLenHi >>> 8) & 0xff;
    m[paddedLen - 5] = bitLenHi & 0xff;
    m[paddedLen - 4] = (bitLenLo >>> 24) & 0xff;
    m[paddedLen - 3] = (bitLenLo >>> 16) & 0xff;
    m[paddedLen - 2] = (bitLenLo >>> 8) & 0xff;
    m[paddedLen - 1] = bitLenLo & 0xff;

    var h = H0.slice();
    var a, b, c, d, e, f, g, hh, t1, t2, i, j;

    for (i = 0; i < paddedLen; i += 64) {
      for (j = 0; j < 16; j++) {
        W[j] = ((m[i + j * 4] << 24) | (m[i + j * 4 + 1] << 16) |
                (m[i + j * 4 + 2] << 8) | m[i + j * 4 + 3]) >>> 0;
      }
      for (j = 16; j < 64; j++) {
        W[j] = (sigma1(W[j - 2]) + W[j - 7] + sigma0(W[j - 15]) + W[j - 16]) >>> 0;
      }
      a = h[0]; b = h[1]; c = h[2]; d = h[3];
      e = h[4]; f = h[5]; g = h[6]; hh = h[7];
      for (j = 0; j < 64; j++) {
        t1 = (hh + bigSigma1(e) + ch(e, f, g) + K[j] + W[j]) >>> 0;
        t2 = (bigSigma0(a) + maj(a, b, c)) >>> 0;
        hh = g; g = f; f = e;
        e = (d + t1) >>> 0;
        d = c; c = b; b = a;
        a = (t1 + t2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0;
      h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0;
      h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }

    var out = new Uint8Array(32);
    for (i = 0; i < 8; i++) {
      out[i * 4]     = (h[i] >>> 24) & 0xff;
      out[i * 4 + 1] = (h[i] >>> 16) & 0xff;
      out[i * 4 + 2] = (h[i] >>> 8) & 0xff;
      out[i * 4 + 3] = h[i] & 0xff;
    }
    return out;
  }

  /* ---------- HMAC-SHA256 ---------- */
  function hmacSha256(keyBytes, msgBytes) {
    var key = keyBytes;
    if (key.length > 64) key = sha256(key);
    var kPad = new Uint8Array(64);
    kPad.set(key);
    var ipad = new Uint8Array(64 + msgBytes.length);
    var opad = new Uint8Array(64 + 32);
    var i;
    for (i = 0; i < 64; i++) {
      ipad[i] = kPad[i] ^ 0x36;
      opad[i] = kPad[i] ^ 0x5c;
    }
    ipad.set(msgBytes, 64);
    var inner = sha256(ipad);
    opad.set(inner, 64);
    return sha256(opad);
  }

  /* ---------- PBKDF2-HMAC-SHA256 (implementasi murni) ---------- */
  function pbkdf2Sync(passwordBytes, saltBytes, iterations, dkLen) {
    var blocks = Math.ceil(dkLen / 32);
    var dk = new Uint8Array(blocks * 32);
    var INT = new Uint8Array(4);
    var i, j, r, u, t;

    for (i = 1; i <= blocks; i++) {
      INT[0] = (i >>> 24) & 0xff; INT[1] = (i >>> 16) & 0xff;
      INT[2] = (i >>> 8) & 0xff;  INT[3] = i & 0xff;
      var saltInt = new Uint8Array(saltBytes.length + 4);
      saltInt.set(saltBytes);
      saltInt.set(INT, saltBytes.length);

      u = hmacSha256(passwordBytes, saltInt);
      t = u.slice(0);
      for (j = 2; j <= iterations; j++) {
        u = hmacSha256(passwordBytes, u);
        for (r = 0; r < 32; r++) t[r] ^= u[r];
      }
      dk.set(t, (i - 1) * 32);
    }
    return dk.slice(0, dkLen);
  }

  /* ---------- UTF-8 manual (aman untuk WebView lama) ---------- */
  function strToUtf8(str) {
    var out = [];
    var i, cp;
    for (i = 0; i < str.length; i++) {
      cp = str.charCodeAt(i);
      if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < str.length) {
        var lo = str.charCodeAt(i + 1);
        if (lo >= 0xdc00 && lo <= 0xdfff) {
          cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
          i++;
        }
      }
      if (cp < 0x80) {
        out.push(cp);
      } else if (cp < 0x800) {
        out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
      } else if (cp < 0x10000) {
        out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      } else {
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f),
                 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      }
    }
    return new Uint8Array(out);
  }

  function utf8ToStr(bytes) {
    var s = '', i = 0, b, cp;
    while (i < bytes.length) {
      b = bytes[i];
      if (b < 0x80) { cp = b; i += 1; }
      else if (b < 0xe0) { cp = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f); i += 2; }
      else if (b < 0xf0) {
        cp = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f); i += 3;
      } else {
        cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) |
             ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f); i += 4;
      }
      if (cp > 0xffff) {
        cp -= 0x10000;
        s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      } else {
        s += String.fromCharCode(cp);
      }
    }
    return s;
  }

  /* ---------- Hex & Base64 ---------- */
  var HEX = '0123456789abcdef';
  function hexEncode(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      s += HEX[bytes[i] >> 4] + HEX[bytes[i] & 15];
    }
    return s;
  }
  function hexDecode(hex) {
    var out = new Uint8Array(hex.length >> 1);
    for (var i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
  }

  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64Encode(bytes) {
    var s = '', i;
    for (i = 0; i + 2 < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    var rem = bytes.length - i;
    if (rem === 1) {
      var n1 = bytes[i] << 16;
      s += B64[(n1 >> 18) & 63] + B64[(n1 >> 12) & 63] + '==';
    } else if (rem === 2) {
      var n2 = (bytes[i] << 16) | (bytes[i + 1] << 8);
      s += B64[(n2 >> 18) & 63] + B64[(n2 >> 12) & 63] + B64[(n2 >> 6) & 63] + '=';
    }
    return s;
  }
  function b64Decode(str) {
    str = String(str).replace(/=+$/, '');
    var out = [];
    var i, n = 0, bits = 0;
    for (i = 0; i < str.length; i++) {
      var v = B64.indexOf(str[i]);
      if (v < 0) continue;
      n = (n << 6) | v; bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push((n >> bits) & 0xff);
      }
    }
    return new Uint8Array(out);
  }

  /* ---------- Random ---------- */
  function randomBytes(n) {
    var out = new Uint8Array(n);
    var c = (typeof global.crypto !== 'undefined' && global.crypto.getRandomValues);
    if (c) {
      global.crypto.getRandomValues(out);
      return out;
    }
    // fallback (sangat jarang terpakai): Math.random + waktu
    var seed = Date.now();
    for (var i = 0; i < n; i++) {
      seed = (seed * 1103515245 + 12345 + Math.floor(Math.random() * 65536)) & 0x7fffffff;
      out[i] = (seed >> 8) & 0xff;
    }
    return out;
  }

  /* ---------- Bandingkan waktu-konstan (anti timing attack) ---------- */
  function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  /* ---------- Fungsi tingkat aplikasi (async; WebCrypto bila tersedia) ---------- */
  var ITER_DEFAULT = 100000;

  function subtleAvailable() {
    return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.importKey);
  }

  function deriveBitsWebCrypto(pwBytes, saltBytes, iterations, dkLen) {
    return global.crypto.subtle.importKey('raw', pwBytes, 'PBKDF2', false, ['deriveBits'])
      .then(function (key) {
        return global.crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: saltBytes, iterations: iterations, hash: 'SHA-256' },
          key, dkLen * 8);
      })
      .then(function (buf) { return new Uint8Array(buf); });
  }

  /* derivasi sinkron murni (dipakai juga sebagai fallback async) */
  function deriveBitsSync(pwBytes, saltBytes, iterations, dkLen) {
    return pbkdf2Sync(pwBytes, saltBytes, iterations, dkLen);
  }

  function deriveBits(pwBytes, saltBytes, iterations, dkLen) {
    if (subtleAvailable()) {
      return deriveBitsWebCrypto(pwBytes, saltBytes, iterations, dkLen)
        .catch(function () { return deriveBitsSync(pwBytes, saltBytes, iterations, dkLen); });
    }
    return Promise.resolve(deriveBitsSync(pwBytes, saltBytes, iterations, dkLen));
  }

  function sha256HexStr(str) { return hexEncode(sha256(strToUtf8(str))); }
  function hmacHex(keyStr, msgStr) {
    return hexEncode(hmacSha256(strToUtf8(keyStr), strToUtf8(msgStr)));
  }

  MC.crypto = {
    sha256: sha256,
    hmacSha256: hmacSha256,
    pbkdf2Sync: pbkdf2Sync,
    strToUtf8: strToUtf8,
    utf8ToStr: utf8ToStr,
    hexEncode: hexEncode,
    hexDecode: hexDecode,
    b64Encode: b64Encode,
    b64Decode: b64Decode,
    randomBytes: randomBytes,
    timingSafeEqual: timingSafeEqual,
    subtleAvailable: subtleAvailable,
    deriveBits: deriveBits,
    deriveBitsSync: deriveBitsSync,
    sha256HexStr: sha256HexStr,
    hmacHex: hmacHex,
    ITER_DEFAULT: ITER_DEFAULT
  };
})(typeof window !== 'undefined' ? window : globalThis);
