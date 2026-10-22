#!/usr/bin/env python3
"""Rilis mooncheck v0.1.0 + unggah APK sebagai aset rilis."""
import json
import sys
import urllib.error
import urllib.request

TOKEN = open('/home/z/my-project/.github_token').read().strip()
API = 'https://api.github.com'
UPLOADER = 'https://uploads.github.com'
OWNER, REPO = 'lunarjjo', 'mooncheck'
APK = '/home/z/my-project/scripts/mooncheck_dev/release/mooncheck-v0.1.0.apk'


def api(method, path, data=None, base=API, ctype='application/json', raw=None):
    headers = {'Authorization': 'Bearer ' + TOKEN,
               'Accept': 'application/vnd.github+json',
               'User-Agent': 'lunarjjo-agent'}
    body = raw
    if data is not None:
        body = json.dumps(data).encode('utf-8')
    if body is not None:
        headers['Content-Type'] = ctype
    req = urllib.request.Request(base + path, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read()
            if not content:
                return resp.status, None
            return resp.status, (json.loads(content) if ctype.startswith('application/json') else content)
    except urllib.error.HTTPError as e:
        raw_resp = e.read().decode('utf-8', 'replace')
        try:
            return e.code, json.loads(raw_resp)
        except ValueError:
            return e.code, raw_resp


def main():
    # lewati bila tag sudah ada
    status, existing = api('GET', '/repos/{}/{}/releases/tags/v0.1.0'.format(OWNER, REPO))
    if status == 200:
        print('rilis v0.1.0 sudah ada:', existing.get('html_url'))
        rel = existing
    else:
        with open(APK, 'rb') as f:
            pass  # hanya memastikan berkas ada
        status, rel = api('POST', '/repos/{}/{}/releases'.format(OWNER, REPO), {
            'tag_name': 'v0.1.0',
            'target_commitish': 'main',
            'name': 'mooncheck v0.1.0 — rilis pertama',
            'body': ('Aplikasi absensi Android lengkap: admin & anggota dalam satu APK.\n\n'
                     '- Check-in/out + status otomatis (tepat/telat/cepat/lembur)\n'
                     '- QR ber-HMAC (kamera langsung / pilih gambar)\n'
                     '- Geofence lokasi + jarak ke kantor\n'
                     '- PBKDF2-SHA256 100k iterasi, lockout, kunci otomatis, audit log\n'
                     '- Izin/cuti + persetujuan, rekap, matriks bulanan, ekspor CSV\n'
                     '- Backup/impor JSON, tema ikuti perangkat\n'
                     '- Android 5.0+ (API 21), tanpa Play Services, 160 KB\n\n'
                     '**Instal**: unduh APK di bawah, buka di Android, izinkan sumber tidak dikenal, '
                     'buat akun admin pertama, selesai.\n\n'
                     '228 unit test lulus (lokal + CI GitHub); E2E browser 17 alur x 2 jalur kripto. '
                     'Lihat CHANGELOG.md untuk 12 bug yang ditemukan & diperbaiki selama pengembangan.'),
            'draft': False, 'prerelease': False,
        })
        if status not in (200, 201):
            print('RELEASE GAGAL', status, json.dumps(rel)[:300]); sys.exit(1)
    print('rilis OK:', rel['html_url'])

    # unggah ulang hanya bila aset belum ada
    assets = rel.get('assets', [])
    if any(a['name'] == 'mooncheck-v0.1.0.apk' for a in assets):
        print('aset APK sudah ada:', [a['browser_download_url'] for a in assets if a['name'] == 'mooncheck-v0.1.0.apk'][0])
        return

    with open(APK, 'rb') as f:
        apk = f.read()
    upload_url = rel['upload_url'].split('{')[0]
    status, asset = api('POST', upload_url + '?name=mooncheck-v0.1.0.apk',
                        data=None, base=UPLOADER,
                        ctype='application/vnd.android.package-archive', raw=apk)
    if status in (200, 201):
        print('APK terunggah:', asset.get('browser_download_url'))
    else:
        print('APK GAGAL', status, json.dumps(asset)[:300]); sys.exit(1)


if __name__ == '__main__':
    main()
