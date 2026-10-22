/* ============================================================
 * mooncheck — test harness (Node)
 * Memuat skrip aplikasi persis seperti browser: berurutan ke dalam
 * satu sandbox dengan mock window/localStorage/navigator minimal.
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'app', 'js');

function makeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: (k) => { store.delete(String(k)); },
    clear: () => { store.clear(); },
    key: (i) => Array.from(store.keys())[i] || null,
    get length() { return store.size; }
  };
}

function makeSandbox(overrides) {
  const window = {};
  const sandbox = {
    window,
    // modul node boleh dipanggil (console, dsb.)
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Promise, Uint8Array, Array, Object, String, Number, Boolean,
    Error, parseInt, parseFloat, isNaN,
    localStorage: makeStorage(),
    navigator: { userAgent: 'node-test' },
    performance: { now: () => Date.now() },
    __RESET__: null
  };
  window.localStorage = sandbox.localStorage;
  window.navigator = sandbox.navigator;
  window.MC = undefined; // diisi crypto.js dkk.
  Object.assign(sandbox, overrides || {});
  vm.createContext(sandbox);
  return sandbox;
}

function loadScript(sandbox, file) {
  const src = fs.readFileSync(file, 'utf8');
  vm.runInContext(src, sandbox, { filename: file });
}

/* Memuat seluruh modul inti (non-UI) dalam urutan benar */
function loadCore(sandbox) {
  loadScript(sandbox, path.join(APP, 'vendor', 'qrcode.js'));
  loadScript(sandbox, path.join(APP, 'vendor', 'jsQR.js'));
  // vendor menempel di global skrip (sandbox), qrlib membacanya dari window — jembatani
  if (sandbox.qrcode && !sandbox.window.qrcode) sandbox.window.qrcode = sandbox.qrcode;
  if (sandbox.jsQR && !sandbox.window.jsQR) sandbox.window.jsQR = sandbox.jsQR;
  loadScript(sandbox, path.join(APP, 'crypto.js'));
  loadScript(sandbox, path.join(APP, 'db.js'));
  loadScript(sandbox, path.join(APP, 'geo.js'));
  loadScript(sandbox, path.join(APP, 'qrlib.js'));
  loadScript(sandbox, path.join(APP, 'attendance.js'));
}

module.exports = { makeSandbox, loadScript, loadCore, ROOT, APP };
