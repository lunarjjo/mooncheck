/* ============================================================
 * mooncheck — pages/qr.js
 * Kartu QR anggota: QR bertanda-tangan HMAC + identitas.
 * Kartu ini dipindai admin untuk absensi cepat.
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};
  var UI = MC.ui, DB = MC.db, Q = MC.qrlib;

  MC.app.route('qr', function (page, user) {
    var s = DB.getSettings();
    var secret = DB.raw().meta.appSecret;
    var payload = Q.memberPayload(user.id, secret);

    var out = Q.renderSvg(payload, { dark: 'currentColor', light: 'var(--surface)' });
    var qrHolder = UI.el('div', {});
    qrHolder.innerHTML = out.svg;
    var svgEl = qrHolder.firstChild;
    svgEl.removeAttribute('width');
    svgEl.setAttribute('class', 'qr-svg');
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    var stage = UI.el('div', { class: 'qr-stage' }, [
      UI.el('div', { class: 'qr-idcard-head' }, [
        UI.el('div', { class: 'qr-org', text: s.orgName }),
        UI.statusChip('member')
      ]),
      svgEl,
      UI.el('div', { class: 'mt16', style: { fontWeight: 800, fontSize: '18px' }, text: user.name }),
      UI.el('div', { class: 'tiny', text: '@' + user.username + (user.position ? ' · ' + user.position : '') })
    ]);

    var hint = UI.el('div', { class: 'card' }, [
      UI.el('div', { class: 'row' }, [
        UI.icon('info', 20),
        UI.el('div', { class: 'tiny', style: { lineHeight: '1.6' }, text:
          'Tunjukkan kartu ini kepada admin/petugas untuk check-in dan check-out. ' +
          'QR ini ditandatangani HMAC-SHA256 dengan kunci perangkat — QR tiruan akan ditolak. ' +
          'Kartu berlaku selama akun Anda aktif.' })
      ])
    ]);

    page.appendChild(stage);
    page.appendChild(hint);
  });
})(typeof window !== 'undefined' ? window : globalThis);
