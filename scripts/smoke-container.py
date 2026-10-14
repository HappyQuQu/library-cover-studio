#!/usr/bin/env python3
"""Exercise a built image using disposable storage; never contact a media server."""
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import tarfile
import tempfile
import time
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--image', required=True)
parser.add_argument('--expected-version', help='Require the final image to serve the checked source version')
args = parser.parse_args()
name = 'lcs-smoke-' + secrets.token_hex(4)
key = secrets.token_hex(32)
jwt = secrets.token_hex(32)

def docker(*arguments):
    return subprocess.check_output(['docker', *arguments], text=True).strip()

with tempfile.TemporaryDirectory(prefix='lcs-smoke-', dir=Path.cwd().parent) as temporary:
    root = Path(temporary)
    original = root / 'original'
    original.mkdir()
    base = ''

    def start(data):
        global base
        # Keep disposable bind-mount files readable by the Linux CI runner.
        docker('run', '-d', '--name', name, '--user', f'{os.getuid()}:{os.getgid()}',
               '-p', '127.0.0.1::8080', '-v', f'{data}:/app/data',
               '-e', f'JWT_SECRET={jwt}', '-e', f'ENCRYPTION_KEY={key}', args.image)
        port = docker('port', name, '8080/tcp').split(':')[-1]
        base = 'http://127.0.0.1:' + port
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            try:
                health = json.loads(request('/api/health')[1])
                if health['status'] == 'ok':
                    if args.expected_version and health.get('version') != args.expected_version:
                        raise RuntimeError('Container version does not match the verified source')
                    return
            except (OSError, ValueError):
                time.sleep(0.5)
        raise RuntimeError('Container did not become ready')

    def request(route, body=None, token=None, origin=None):
        headers = {'Origin': origin or base}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        if body is not None:
            headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(base + route,
            data=None if body is None else json.dumps(body).encode(), headers=headers)
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.headers, response.read()

    try:
        start(original)
        headers, html = request('/')
        assert b'<div id="root">' in html
        assert 'upgrade-insecure-requests' not in headers['Content-Security-Policy']
        assert 'blob:' in headers['Content-Security-Policy']
        for route in ['/editor/fixture', '/tasks', '/settings']:
            assert request(route)[1] == html
        asset = re.search(rb'src="(/assets/[^"]+\.js)"', html).group(1).decode()
        assert 'immutable' in request(asset)[0]['Cache-Control']
        for route in ['/api/unknown', '/assets/missing.js', '/.env']:
            try:
                request(route)
                raise AssertionError('Unexpected success: ' + route)
            except urllib.error.HTTPError as error:
                assert error.code == 404
        user = {'username': 'smoke-admin', 'password': 'DisposableSmoke2026!'}
        account = json.loads(request('/api/auth/register', user)[1])
        assert account['user']['role'] == 'admin'
        token = account['token']
        templates = json.loads(request('/api/templates', token=token)[1])
        assert len(templates) >= 6
        thumbnail = request('/api/templates/' + templates[0]['id'] + '/thumbnail', token=token)
        assert thumbnail[0]['Content-Type'].startswith('image/') and len(thumbnail[1]) > 1000
        font = original / 'uploads/fonts/smoke-font.woff'
        font.write_bytes(b'disposable-font-routing-fixture')
        fonts = json.loads(request('/api/fonts', token=token)[1])['fonts']
        assert request(next(f['url'] for f in fonts if f['filename'] == font.name))[1] == font.read_bytes()
        ticket = json.loads(request('/api/auth/stream-ticket', {}, token)[1])['ticket']
        with urllib.request.urlopen(base + '/api/logs/stream?ticket=' + ticket, timeout=10) as stream:
            assert stream.headers['Content-Type'].startswith('text/event-stream')
            assert stream.readline().startswith(b'data: ')
        try:
            request('/api/auth/login', user, origin='http://foreign.example')
            raise AssertionError('Foreign Origin accepted')
        except urllib.error.HTTPError as error:
            assert error.code >= 400
        docker('exec', name, 'node', '--input-type=module', '-e',
               "import {encrypt} from './dist/utils/crypto.js'; import fs from 'node:fs'; fs.writeFileSync('/app/data/smoke-encrypted',encrypt('temporary-backup-check'));")
        docker('stop', name)
        before = {str(p.relative_to(original)): p.read_bytes() for p in original.rglob('*') if p.is_file()}
        assert '.encryption-salt' in before and 'db/data.sqlite' in before
        archive = root / 'backup.tar.gz'
        with tarfile.open(archive, 'w:gz') as output:
            output.add(original, arcname='data')
        docker('rm', name)
        restored = root / 'restored'
        restored.mkdir()
        # Restore to a fresh directory, as described by the deployment guide.
        subprocess.run(['tar', 'xzf', str(archive), '-C', str(restored)], check=True)
        after = {str(p.relative_to(restored / 'data')): p.read_bytes() for p in (restored / 'data').rglob('*') if p.is_file()}
        assert before == after
        start(restored / 'data')
        assert json.loads(request('/api/auth/login', user)[1])['user']['role'] == 'admin'
        docker('exec', name, 'node', '--input-type=module', '-e',
               "import {decrypt} from './dist/utils/crypto.js'; import fs from 'node:fs'; if(decrypt(fs.readFileSync('/app/data/smoke-encrypted','utf8'))!=='temporary-backup-check') process.exit(1);")
        print('PASS: SPA/assets, API isolation, same-origin auth, templates/rendering, fonts, SSE, foreign-Origin rejection, backup/restore and decryption')
    except Exception:
        subprocess.run(['docker', 'logs', '--tail=30', name], check=False)
        raise
    finally:
        subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
