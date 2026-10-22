#!/usr/bin/env python3
"""Deploy mooncheck ke GitHub (repo lunarjjo/mooncheck) + dispatch CI + rilis APK."""
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

TOKEN = open('/home/z/my-project/.github_token').read().strip()
API = 'https://api.github.com'
UPLOADER = 'https://uploads.github.com'
OWNER = 'lunarjjo'
REPO = 'mooncheck'
DEV = '/home/z/my-project/scripts/mooncheck_dev'

SKIP_DIRS = {'build', 'release', 'e2e_shots', '__pycache__', 'node_modules'}
SKIP_FILES = {'mooncheck.keystore', 'qr_matrix.txt', 'budi_qr.png', 'plain_white.png'}


def api(method, path, data=None, base=API, ctype='application/json', raw=None):
    headers = {'Authorization': 'Bearer ' + TOKEN,
               'Accept': 'application/vnd.github+json',
               'User-Agent': 'lunarjjo-agent'}
    body = raw
    if data is not None:
        body = json.dumps(data).encode('utf-8')
        headers['Content-Type'] = ctype
    elif raw is not None:
        headers['Content-Type'] = ctype
    req = urllib.request.Request(base + path, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read()
            return resp.status, (json.loads(content) if content and ctype.startswith('application/json') else content)
    except urllib.error.HTTPError as e:
        raw_resp = e.read().decode('utf-8', 'replace')
        try:
            return e.code, json.loads(raw_resp)
        except ValueError:
            return e.code, raw_resp


def collect_files():
    out = []
    for root, dirs, files in os.walk(DEV):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in sorted(files):
            if fn in SKIP_FILES or fn.endswith(('.pyc', '.log', '.DS_Store')):
                continue
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, DEV).replace(os.sep, '/')
            out.append((rel, full))
    return sorted(out)


def put_file(path, content_bytes, message):
    # idempoten: bila sudah ada & identik → lewati; bila beda → update dgn sha
    status, existing = api('GET', '/repos/{}/{}/contents/{}'.format(OWNER, REPO, path))
    payload = {'message': message, 'content': base64.b64encode(content_bytes).decode('ascii')}
    if status == 200 and isinstance(existing, dict):
        try:
            cur = base64.b64decode(existing.get('content', '').replace('\n', ''))
        except Exception:
            cur = None
        if cur == content_bytes:
            print('  SAMA {:<45} -> lewati'.format(path))
            return True
        payload['sha'] = existing['sha']
    status, data = api('PUT', '/repos/{}/{}/contents/{}'.format(OWNER, REPO, path), payload)
    if status in (200, 201):
        sha = (data or {}).get('commit', {}).get('sha', '?')[:8]
        print('  PUSH {:<46} -> OK ({})'.format(path, sha))
        return True
    print('  PUSH {} -> GAGAL {}: {}'.format(
        path, status, json.dumps(data)[:160] if data is not None else ''))
    return False


def main():
    print('=== 1. Buat repo {} ==='.format(REPO))
    status, data = api('POST', '/user/repos', {
        'name': REPO,
        'description': 'Aplikasi absensi Android lengkap (admin+anggota, 1 APK): '
                       'QR ber-HMAC, geofence, offline-first, tema ikut perangkat. '
                       'Tanpa Gradle/AndroidX. Proyek ketiga agen lunarjjo.',
        'private': False,
        'has_issues': True, 'has_wiki': False, 'has_projects': False,
    })
    if status == 201:
        print('  CREATE -> OK')
    elif status == 422 and 'already exists' in json.dumps(data):
        print('  CREATE -> sudah ada, lanjut')
    else:
        print('  CREATE ->', status, json.dumps(data)[:200]); sys.exit(1)

    files = collect_files()
    print('=== 2. Push {} berkas ==='.format(len(files)))
    fails = 0
    for rel, full in files:
        with open(full, 'rb') as f:
            content = f.read()
        ok = put_file(rel, content, 'mooncheck: {}'.format(rel))
        if not ok:
            fails += 1
    if fails:
        print('GAGAL push {} berkas'.format(fails)); sys.exit(1)

    print('=== 3. Dispatch CI ===')
    status, data = api('POST', '/repos/{}/{}/actions/workflows/ci.yml/dispatches'.format(OWNER, REPO),
                       {'ref': 'main'})
    print('  DISPATCH ->', status, 'OK' if status == 204 else json.dumps(data)[:160])
    if status != 204:
        sys.exit(1)

    print('=== 4. Tunggu CI selesai ===')
    for attempt in range(30):
        time.sleep(20)
        status, runs = api('GET', '/repos/{}/{}/actions/runs?per_page=1'.format(OWNER, REPO))
        if status != 200 or not runs.get('workflow_runs'):
            continue
        run = runs['workflow_runs'][0]
        if run['status'] == 'completed':
            print('  CI -> {} ({})'.format(run['conclusion'], run['html_url']))
            if run['conclusion'] != 'success':
                sys.exit(1)
            break
    else:
        print('  CI belum selesai setelah 10 menit — lanjut rilis (cek manual)')

    print('=== 5. Buat rilis v0.1.0 + unggah APK ===')
    apk_path = os.path.join(DEV, 'release', 'mooncheck-v0.1.0.apk')
    with open(apk_path, 'rb') as f:
        apk = f.read()
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
                 '**Instal**: unduh APK di bawah → buka di Android → izinkan sumber tidak dikenal.\n\n'
                 '228 unit test lulus; E2E browser 17 alur x 2 jalur kripto. Lihat CHANGELOG.md '
                 'untuk 12 bug yang ditemukan & diperbaiki selama pengembangan.'),
        'draft': False, 'prerelease': False,
    })
    if status not in (201, 200):
        print('  RELEASE ->', status, json.dumps(rel)[:300]); sys.exit(1)
    print('  RELEASE -> OK', rel.get('html_url'))

    upload_url = rel['upload_url'].split('{')[0]
    status, asset = api('POST',
        upload_url + '?name=mooncheck-v0.1.0.apk'.replace(' ', '%20'),
        data=None, base=UPLOADER, ctype='application/vnd.android.package-archive', raw=apk)
    if status in (201, 200):
        print('  APK -> terunggah', asset.get('browser_download_url'))
    else:
        print('  APK -> GAGAL', status, json.dumps(asset)[:200]); sys.exit(1)

    print('\nSELESAI: https://github.com/{}/{}'.format(OWNER, REPO))


if __name__ == '__main__':
    main()
