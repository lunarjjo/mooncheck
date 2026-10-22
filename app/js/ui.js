/* ============================================================
 * mooncheck — ui.js
 * Perkakas antarmuka: pembuat elemen, ikon, toast, modal, chip,
 * segmen kontrol, dan helper kecil lain (tanpa framework).
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};
  var A = MC.attendance;

  /* ---------- elemen ---------- */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v == null) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;   // hanya untuk string yang kita bangun sendiri
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'dataset') {
          for (var d in v) node.dataset[d] = v[d];
        } else {
          node.setAttribute(k, v);
        }
      }
    }
    var kids = Array.isArray(children) ? children :
      (children == null ? [] : [children]);
    kids.forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' || typeof c === 'number'
        ? document.createTextNode(String(c)) : c);
    });
    return node;
  }
  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* ---------- ikon (SVG jalur, stroke 2, viewBox 24) ---------- */
  var ICON_PATHS = {
    home: '<path d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    clock: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="3" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="14" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 14h3v3h-3zM20 14h1M14 20h1M18 18h3v3h-3z" fill="currentColor"/>',
    scan: '<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 12h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    users: '<circle cx="9" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5M16 5a3.5 3.5 0 0 1 0 6.6M17.5 15.2c2 .7 3.5 2.3 4 4.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    chart: '<path d="M4 20V4M4 20h16M8 17V11M13 17V7M18 17v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    gear: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.09a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    user: '<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 21c1-3.8 4-6 7.5-6s6.5 2.2 7.5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 3v4M16 3v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    pin: '<path d="M12 21s-7-6.1-7-11a7 7 0 1 1 14 0c0 4.9-7 11-7 11z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/>',
    moon: '<path d="M20.6 14.6A8.6 8.6 0 1 1 9.4 3.4a7 7 0 1 0 11.2 11.2z" fill="currentColor"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    check: '<path d="M4 12.5 9.5 18 20 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    x: '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    download: '<path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 21h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    upload: '<path d="M12 15V3m0 0 4.5 4.5M12 3 7.5 7.5M4 21h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="m5 18 5-5 3 3 3-3 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    file: '<path d="M6 3h8l4 4v14H6zM14 3v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8.8 12.2 11.5 15l4.4-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    sun: '<circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3 7 7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'
  };
  function icon(name, size) {
    var s = size || 24;
    var wrap = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wrap.setAttribute('viewBox', '0 0 24 24');
    wrap.setAttribute('width', s); wrap.setAttribute('height', s);
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = ICON_PATHS[name] || ICON_PATHS.info;
    return wrap;
  }

  /* ---------- toast ---------- */
  function toast(msg, type, ms) {
    var box = q('#toasts');
    var t = el('div', { class: 'toast' + (type ? ' ' + type : ''), role: 'status', text: msg });
    box.appendChild(t);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { t.remove(); }, 300);
    }, ms || 2600);
    return t;
  }

  /* ---------- modal (bottom sheet) ---------- */
  function modal(opts) {
    var root = q('#modal-root');
    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      scrim.remove();
      if (opts.onclose) opts.onclose();
    }
    var body = el('div', { class: 'modal-body' });
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);

    var sheet = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [
      el('div', { class: 'modal-grip' }),
      opts.title ? el('div', { class: 'modal-title', text: opts.title }) : null,
      body,
      opts.actions && opts.actions.length ? el('div', { class: 'modal-actions' },
        opts.actions.map(function (a) {
          return el('button', {
            class: 'btn ' + (a.cls || ''),
            text: a.label,
            onclick: function () {
              if (a.onClick) {
                var r = a.onClick(close);
                if (r === false || a.keep === true) return;  // aksi menahan modal terbuka
              }
              close();   // default: tutup setelah aksi (anti scrim tercecer)
            }
          });
        })) : null
    ]);
    var scrim = el('div', { class: 'modal-scrim', onclick: function (e) { if (e.target === scrim && opts.dismissable !== false) close(); } }, [sheet]);
    root.appendChild(scrim);
    return { close: close, sheet: sheet };
  }

  function confirmSheet(title, msg, okLabel, onOk, danger) {
    modal({
      title: title,
      body: el('div', { class: 'muted', text: msg }),
      actions: [
        { label: 'Batal' },
        { label: okLabel || 'Ya, lanjut', cls: danger === false ? 'primary' : 'danger', onClick: onOk }
      ]
    });
  }

  /* ---------- chip status ---------- */
  function statusChip(kind, label) {
    var map = {
      tepat: ['ok', 'Tepat'], telat: ['warn', 'Telat'],
      cepat: ['warn', 'Cepat'], normal: ['ok', 'Normal'], lembur: ['violet', 'Lembur'],
      hadir: ['ok', 'Hadir'], izin: ['info', 'Izin'], sakit: ['info', 'Sakit'],
      cuti: ['violet', 'Cuti'], alfa: ['bad', 'Tanpa Ket.'],
      pending: ['warn', 'Menunggu'], approved: ['ok', 'Disetujui'], rejected: ['bad', 'Ditolak'],
      admin: ['primary', 'Admin'], member: ['', 'Anggota'],
      aktif: ['ok', 'Aktif'], nonaktif: ['bad', 'Nonaktif']
    };
    var m = map[kind] || ['', kind];
    return el('span', { class: 'chip ' + m[0], text: label || m[1] });
  }

  /* ---------- segmen kontrol ---------- */
  function segmented(items, activeIdx, onPick) {
    var wrap = el('div', { class: 'seg', role: 'tablist' });
    var btns = [];
    items.forEach(function (it, i) {
      var b = el('button', {
        role: 'tab', text: it,
        class: i === activeIdx ? 'active' : '',
        onclick: function () {
          btns.forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
          onPick(i);
        }
      });
      btns.push(b);
      wrap.appendChild(b);
    });
    return wrap;
  }

  /* ---------- list item ---------- */
  function listItem(opts) {
    return el('div', { class: 'list-item' }, [
      el('div', { class: 'li-icon' }, [icon(opts.icon || 'user', 21)]),
      el('div', { class: 'li-body' }, [
        el('div', { class: 'li-title', text: opts.title }),
        opts.sub ? el('div', { class: 'li-sub', text: opts.sub }) : null
      ]),
      opts.right || null
    ]);
  }

  function emptyState(iconName, text) {
    return el('div', { class: 'empty' }, [
      el('div', {}, [icon(iconName, 44)]),
      el('div', { text: text })
    ]);
  }

  /* ---------- form ---------- */
  function field(labelText, inputNode) {
    return el('div', { class: 'field' }, [
      el('label', { text: labelText }),
      inputNode
    ]);
  }
  function input(attrs) { return el('input', attrs); }

  /* ---------- avatar inisial ---------- */
  function avatarEl(user, small) {
    var name = (user && user.name) || '?';
    var parts = name.trim().split(/\s+/);
    var initials = (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    return el('span', { class: 'avatar' + (small ? ' sm' : ''), text: initials });
  }

  /* ---------- format waktu ---------- */
  function hhmm(at) { return A.hhmmOf(at); }
  function dur(mins) { return A.formatDuration(mins); }

  function clockNow() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /* ---------- error → toast ---------- */
  function showErr(e) {
    var msg = (e && e.message) ? e.message : 'Terjadi kesalahan tak terduga.';
    toast(msg, 'bad', 3400);
    if (global.console && e && e.stack) console.warn('[mooncheck]', e.message);
  }

  MC.ui = {
    el: el, q: q, qa: qa, clear: clear, icon: icon, toast: toast,
    modal: modal, confirmSheet: confirmSheet, statusChip: statusChip,
    segmented: segmented, listItem: listItem, emptyState: emptyState,
    field: field, input: input, avatarEl: avatarEl,
    hhmm: hhmm, dur: dur, clockNow: clockNow, showErr: showErr
  };
})(typeof window !== 'undefined' ? window : globalThis);
