/* ============================================================
 * mooncheck — pages/scan.js (admin)
 * Pemindai QR absensi: kamera langsung (getUserMedia + jsQR per
 * frame) dengan fallback pilih gambar (input file + decode).
 * Mode: otomatis (masuk→pulang), khusus masuk, khusus pulang.
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};
  var UI = MC.ui, DB = MC.db, Q = MC.qrlib, G = MC.geo;

  MC.app.route('scan', function (page, user) {
    var s = DB.getSettings();
    var mode = 0; // 0 auto, 1 in, 2 out
    var stream = null, rafId = 0, scanning = false;
    var lastScanOk = 0;

    var video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    var canvas = document.createElement('canvas');

    var modeSeg = UI.segmented(['Otomatis', 'Masuk', 'Pulang'], 0, function (i) { mode = i; });

    var stage = UI.el('div', { class: 'scan-stage' }, [
      video,
      UI.el('div', { class: 'scan-overlay' }, [
        UI.el('div', { class: 'scan-frame' }, [UI.el('div', { class: 'scan-beam' })])
      ])
    ]);
    var hintText = UI.el('div', { class: 'scan-hint', text: 'Mengaktifkan kamera…' });

    var resultCard = UI.el('div', {});
    var pickInput = UI.input({ type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
    page.appendChild(pickInput);

    /* ---------- hasil scan → aksi ---------- */
    function handleText(text) {
      var now = Date.now();
      if (now - lastScanOk < 1500) return;   // jeda anti-dobel
      var parsed = Q.parsePayload(text, DB.raw().meta.appSecret);
      if (!parsed.ok) {
        lastScanOk = now;
        UI.toast(parsed.reason, 'bad');
        DB.log('qr.scan', { result: 'invalid' });
        DB.persist();
        return;
      }
      var target = DB.getUser(parsed.userId);
      if (!target) {
        lastScanOk = now;
        UI.toast('Anggota tidak ditemukan.', 'bad');
        return;
      }
      lastScanOk = now;
      stopCamera();
      var modeName = ['otomatis', 'masuk', 'pulang'][mode];
      var loc = null;

      var info = UI.el('div', { class: 'stack' }, [
        UI.el('div', { class: 'row' }, [UI.avatarEl(target), UI.el('div', {}, [
          UI.el('div', { style: { fontWeight: 700 }, text: target.name }),
          UI.el('div', { class: 'tiny', text: '@' + target.username })
        ])]),
        UI.el('div', { class: 'tiny', text: 'Mode: ' + modeName + ' · ' + A_LABEL[mode] })
      ]);
      var locLine = UI.el('div', { class: 'tiny muted', text: 'Mengambil lokasi perangkat…' });
      info.appendChild(locLine);

      G.getFix().then(function (fix) {
        loc = fix ? { lat: fix.lat, lng: fix.lng, acc: fix.acc } : null;
        locLine.textContent = fix
          ? 'Lokasi: ' + G.formatCoord(fix.lat, fix.lng) + ' (±' + Math.round(fix.acc || 0) + ' m)'
          : 'Lokasi tidak tersedia — dicatat tanpa koordinat.';
      });

      UI.modal({
        title: 'Konfirmasi Absensi',
        dismissable: true,
        body: info,
        actions: [
          { label: 'Batal' },
          {
            label: 'Catat Absensi', cls: 'primary',
            onClick: function (close) {
              try {
                var m = mode === 1 ? 'in' : (mode === 2 ? 'out' : 'auto');
                var out = DB.qrCheck(target.id, m, loc);
                var rec = out.rec;
                var jam = (out.action === 'out' ? rec.out : rec.in).at.slice(11, 16);
                UI.toast(target.name + ' — check-' + out.action + ' ' + jam, 'ok', 3400);
                close();
                MC.app.navigate();
              } catch (e) {
                UI.showErr(e);
                close();
              }
            }
          }
        ],
        onclose: function () { startCamera(); }
      });
    }
    var A_LABEL = ['masuk jika belum, pulang jika sudah masuk', 'hanya check-in', 'hanya check-out'];

    /* ---------- kamera ---------- */
    function startCamera() {
      if (scanning) return;
      scanning = true;
      hintText.textContent = 'Mengaktifkan kamera…';
      if (!(global.navigator && global.navigator.mediaDevices && global.navigator.mediaDevices.getUserMedia)) {
        hintText.textContent = 'Kamera langsung tidak tersedia — gunakan pilih gambar di bawah.';
        scanning = false;
        return;
      }
      global.navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      }).then(function (str) {
        stream = str;
        video.srcObject = str;
        video.play();
        hintText.textContent = 'Arahkan QR anggota ke dalam bingkai.';
        scanLoop();
      }).catch(function (err) {
        scanning = false;
        var m = String(err && err.name || err);
        if (m === 'NotAllowedError') {
          hintText.textContent = 'Izin kamera ditolak. Izinkan kamera dari pengaturan, atau gunakan pilih gambar.';
        } else if (m === 'NotFoundError') {
          hintText.textContent = 'Kamera tidak ditemukan di perangkat ini — gunakan pilih gambar.';
        } else {
          hintText.textContent = 'Kamera gagal dimulai (' + m + ') — gunakan pilih gambar.';
        }
      });
    }

    function scanLoop() {
      if (!scanning) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        var w = video.videoWidth, h = video.videoHeight;
        if (w && h) {
          // fokus area tengah (kotak ~60%) agar cepat
          var side = Math.min(w, h) * 0.72;
          var sx = (w - side) / 2, sy = (h - side) / 2;
          canvas.width = side; canvas.height = side;
          var ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(video, sx, sy, side, side, 0, 0, side, side);
          var img = ctx.getImageData(0, 0, side, side);
          var res = Q.decodeFromImageData(img, side, side);
          if (res.ok) handleText(res.text);
        }
      }
      rafId = requestAnimationFrame(scanLoop);
    }

    function stopCamera() {
      scanning = false;
      cancelAnimationFrame(rafId);
      if (stream) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        stream = null;
      }
      video.srcObject = null;
    }

    /* ---------- pilih gambar ---------- */
    pickInput.addEventListener('change', function () {
      var file = pickInput.files && pickInput.files[0];
      if (!file) return;
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1400;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        var data = ctx.getImageData(0, 0, w, h);
        var res = Q.decodeFromImageData(data, w, h);
        URL.revokeObjectURL(url);
        pickInput.value = '';
        if (res.ok) handleText(res.text);
        else UI.toast('Tidak ada QR mooncheck pada gambar itu.', 'bad', 3200);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        UI.toast('Gambar tidak dapat dibaca.', 'bad');
      };
      img.src = url;
    });

    /* ---------- rangkaian halaman ---------- */
    page.appendChild(UI.el('div', { class: 'mb16' }, [modeSeg]));
    page.appendChild(stage);
    page.appendChild(hintText);
    page.appendChild(UI.el('div', { class: 'card' }, [
      UI.el('div', { class: 'card-title', text: 'Tanpa Kamera Langsung?' }),
      UI.el('div', { class: 'tiny muted mb8', text: 'Pilih foto yang memuat QR anggota — foto layar pun bisa selama tajam.' }),
      UI.el('button', { class: 'btn tonal block', onclick: function () { pickInput.click(); } },
        [UI.icon('image', 20), 'Pilih Gambar QR'])
    ]));
    page.appendChild(resultCard);

    startCamera();

    /* matikan kamera saat berpindah halaman */
    MC.pageCleanup = stopCamera;
  });
})(typeof window !== 'undefined' ? window : globalThis);
