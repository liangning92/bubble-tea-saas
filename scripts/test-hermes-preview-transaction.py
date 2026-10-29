#!/usr/bin/env python3
"""Hermes legacy preview transaction disposable PostgreSQL only; run through scripts/with-docker-test.py."""
import os
import pathlib
import shutil
import socket
import subprocess
import sys
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
run = os.environ.get('BT_TEST_RUN', '')
assert run.startswith('bt-test-') and os.environ.get('BT_TEST_LABEL') == 'com.bubbletea.test-run=' + run
base = pathlib.Path(tempfile.mkdtemp(prefix=run + '-', dir='/tmp'))
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
def command(args, **kwargs):
    return subprocess.run(args, cwd=root, check=True, **kwargs)
started = False
try:
    command(['initdb', '-D', str(base / 'pg'), '--username=team_test', '--auth=trust', '--no-locale', '-E', 'UTF8'], stdout=subprocess.DEVNULL)
    command(['pg_ctl', '-D', str(base / 'pg'), '-l', str(base / 'pg.log'), '-o', '-h 127.0.0.1 -p ' + str(port) + ' -k ' + str(base), '-w', 'start'], stdout=subprocess.DEVNULL)
    started = True
    command(['createdb', '-h', '127.0.0.1', '-p', str(port), '-U', 'team_test', 'team_test'])
    env = dict(os.environ, NODE_ENV='production', DATABASE_URL=f'postgresql://team_test@127.0.0.1:{port}/team_test',
               JWT_SECRET='synthetic-team-work-item-fixture-only', CORS_ORIGIN='http://localhost', UPLOADS_PATH=str(base / 'uploads'))
    command([str(root / 'server/node_modules/.bin/prisma'), 'db', 'push', '--skip-generate', '--schema', str(root / 'server/prisma/schema.prisma')], env=env)
    command(['node', 'tests/stoploss/hermes-preview-transaction-check.cjs'], env=env)
finally:
    try:
        if started:
            command(['pg_ctl', '-D', str(base / 'pg'), '-m', 'immediate', '-w', 'stop'], stdout=subprocess.DEVNULL)
    finally:
        shutil.rmtree(base)
    print('Owned work-item PostgreSQL cleaned', flush=True)
