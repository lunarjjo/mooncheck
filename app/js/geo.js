/* ============================================================
 * mooncheck — geo.js
 * Geolokasi: haversine, geofence, sumber lokasi (jembatan native
 * Android dulu, lalu navigator.geolocation, lalu gagal sopan).
 * ============================================================ */
(function (global) {
  'use strict';

  var MC = global.MC = global.MC || {};
  var R_EARTH = 6371008.8; // meter (IUGG)

  function toRad(d) { return d * Math.PI / 180; }

  /* Jarak great-circle dalam meter */
  function haversine(lat1, lng1, lat2, lng2) {
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R_EARTH * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatDistance(m) {
    if (m == null || isNaN(m)) return '—';
    if (m < 1000) return Math.round(m) + ' m';
    return (m / 1000).toFixed(2) + ' km';
  }

  function formatCoord(lat, lng) {
    if (lat == null || lng == null) return '—';
    return lat.toFixed(5) + ', ' + lng.toFixed(5);
  }

  /* Status geofence untuk satu titik */
  function evaluate(geoSetting, lat, lng, acc) {
    if (!geoSetting || geoSetting.lat == null || geoSetting.lng == null) {
      return { configured: false, inside: true, dist: null,
               note: 'Geofence belum diatur — absen diizinkan di mana saja.' };
    }
    var dist = haversine(lat, lng, geoSetting.lat, geoSetting.lng);
    var radius = geoSetting.radiusM || 200;
    var inside = dist <= radius;
    var note;
    if (inside) {
      note = 'Di dalam area ' + (geoSetting.name || 'kantor') +
        ' (' + formatDistance(dist) + ' dari pusat).';
    } else {
      note = 'Di luar area ' + (geoSetting.name || 'kantor') + ' — ' +
        formatDistance(dist - radius) + ' melebihi radius ' + formatDistance(radius) + '.';
    }
    if (acc != null && acc > 100) {
      note += ' Akurasi GPS rendah (±' + Math.round(acc) + ' m).';
    }
    return { configured: true, inside: inside, dist: Math.round(dist), note: note };
  }

  /* ---------- sumber lokasi ---------- */

  function hasBridge() {
    return !!(global.AndroidBridge && typeof global.AndroidBridge.getLocation === 'function');
  }

  function isNative() { return hasBridge(); }

  /* Ambil satu fix. Prioritas: bridge sync → navigator.geolocation → null */
  function getFix(opts) {
    opts = opts || {};
    if (hasBridge()) {
      return new Promise(function (resolve) {
        try {
          var rawJson = global.AndroidBridge.getLocation();
          var fix = JSON.parse(rawJson);
          if (fix && typeof fix.lat === 'number' && typeof fix.lng === 'number') {
            resolve({ lat: fix.lat, lng: fix.lng, acc: fix.acc || null, source: 'native' });
          } else {
            resolve(null);
          }
        } catch (e) { resolve(null); }
      });
    }
    if (global.navigator && global.navigator.geolocation) {
      return new Promise(function (resolve) {
        var settled = false;
        var timer = setTimeout(function () {
          if (!settled) { settled = true; resolve(null); }
        }, opts.timeout || 12000);
        global.navigator.geolocation.getCurrentPosition(function (pos) {
          if (settled) return;
          settled = true; clearTimeout(timer);
          var c = pos.coords;
          resolve({ lat: c.latitude, lng: c.longitude, acc: c.accuracy || null, source: 'web' });
        }, function () {
          if (settled) return;
          settled = true; clearTimeout(timer);
          resolve(null);
        }, {
          enableHighAccuracy: true,
          timeout: opts.timeout || 12000,
          maximumAge: opts.maxAge != null ? opts.maxAge : 30000
        });
      });
    }
    return Promise.resolve(null);
  }

  MC.geo = {
    haversine: haversine,
    formatDistance: formatDistance,
    formatCoord: formatCoord,
    evaluate: evaluate,
    getFix: getFix,
    isNative: isNative,
    hasBridge: hasBridge
  };
})(typeof window !== 'undefined' ? window : globalThis);
