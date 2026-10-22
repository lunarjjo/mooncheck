/* mooncheck — test geo.js */
'use strict';
const { makeSandbox, loadCore } = require('./harness');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) pass++; else { fail++; console.error('  FAIL:', name); }
}
function near(a, b, tol, name) {
  ok(Math.abs(a - b) <= tol, name + ` (dapat ${a.toFixed(1)}, harap ${b})`);
}

const sb = makeSandbox();
loadCore(sb);
const G = sb.window.MC.geo;

console.log('== haversine (bola R=6371008.8) ==');
near(G.haversine(0, 0, 0, 0), 0, 0.01, 'titik sama = 0');
// 1 derajat di khatulistiwa / meridian = 2πR/360
near(G.haversine(0, 0, 0, 1), 111194.93, 1, '1° bujur di ekuator');
near(G.haversine(0, 0, 1, 0), 111194.93, 1, '1° lintang');
// setengah keliling = πR
near(G.haversine(0, 0, 0, 180), Math.PI * 6371008.8, 1, '180° = πR');
// simetri
near(G.haversine(-6.2, 106.8, -6.9, 107.6), G.haversine(-6.9, 107.6, -6.2, 106.8), 0.001, 'simetri');
// jarak yang diketahui: Monas → Bundaran HI (Jakarta) ≈ 3.2 km
const dMonasHI = G.haversine(-6.1754, 106.8272, -6.1949, 106.8230);
near(dMonasHI, 2190, 300, 'Monas → Bundaran HI ± ~2.2 km');

console.log('== format ==');
ok(G.formatDistance(null) === '—', 'null → —');
ok(G.formatDistance(999) === '999 m', '999 m');
ok(G.formatDistance(1500) === '1.50 km', '1500 → 1.50 km');
ok(G.formatCoord(-6.1754, 106.8272) === '-6.17540, 106.82720', 'formatCoord');
ok(G.formatCoord(null, null) === '—', 'formatCoord null');

console.log('== evaluate (geofence) ==');
{
  const geo = { lat: -6.1754, lng: 106.8272, radiusM: 200, name: 'Kantor' };
  const inR = G.evaluate(geo, -6.1755, 106.8273, 15);
  ok(inR.configured === true && inR.inside === true, 'di dalam radius');
  ok(inR.dist < 200, 'dist < 200');
  const outR = G.evaluate(geo, -6.20, 106.90, 15);
  ok(outR.inside === false, 'jauh → di luar');
  // tepat di batas: 0.001° lintang ≈ 111 m > radius 100
  const near1 = G.evaluate({ ...geo, radiusM: 100 }, -6.1764, 106.8272, 10);
  ok(near1.inside === false, '~111 m > radius 100 → di luar');
  const near2 = G.evaluate({ ...geo, radiusM: 150 }, -6.1764, 106.8272, 10);
  ok(near2.inside === true, '~111 m ≤ radius 150 → di dalam');
  const un = G.evaluate({ lat: null, lng: null, radiusM: 200 }, -6.2, 106.8, null);
  ok(un.configured === false && un.inside === true, 'belum dikonfigurasi → diizinkan');
  ok(/Akurasi GPS rendah/.test(G.evaluate(geo, -6.1755, 106.8273, 250).note), 'catatan akurasi rendah');
}

console.log('== getFix ==');
(async () => {
  // jalur web
  const sbWeb = makeSandbox({
    navigator: {
      geolocation: {
        getCurrentPosition(succ) {
          succ({ coords: { latitude: 1.5, longitude: 2.5, accuracy: 42 } });
        }
      }
    }
  });
  loadCore(sbWeb);
  sbWeb.window.navigator = sbWeb.navigator;
  const fix1 = await sbWeb.window.MC.geo.getFix();
  ok(fix1 && fix1.lat === 1.5 && fix1.lng === 2.5 && fix1.source === 'web', 'fix dari navigator');

  // jalur native bridge
  const sbNative = makeSandbox({
    AndroidBridge: {
      getLocation() { return JSON.stringify({ lat: -6.1, lng: 106.9, acc: 8 }); }
    }
  });
  loadCore(sbNative);
  sbNative.window.AndroidBridge = sbNative.AndroidBridge;
  const fix2 = await sbNative.window.MC.geo.getFix();
  ok(fix2 && fix2.lat === -6.1 && fix2.source === 'native', 'fix dari bridge native');
  ok(sbNative.window.MC.geo.isNative() === true, 'isNative terdeteksi');

  // tanpa sumber
  const sbNone = makeSandbox({ navigator: {} });
  loadCore(sbNone);
  sbNone.window.navigator = sbNone.navigator;
  const fix3 = await sbNone.window.MC.geo.getFix();
  ok(fix3 === null, 'tanpa sumber → null');

  console.log(`\nhasil: ${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
})();
