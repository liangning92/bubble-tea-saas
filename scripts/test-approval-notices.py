#!/usr/bin/env python3
"""Disposable synthetic PostgreSQL only; invoke through with-docker-test.py."""
import os, pathlib, shutil, socket, subprocess, tempfile

root = pathlib.Path(__file__).resolve().parents[1]
batch = os.environ.get('BT_TEST_RUN', '')
assert batch.startswith('bt-test-'), 'Use scripts/with-docker-test.py'
base = pathlib.Path(tempfile.mkdtemp(prefix=batch + '-approval-'))
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
def run(args, **kwargs):
    return subprocess.run(args, cwd=root, check=True, **kwargs)
started = False
try:
    run(['initdb', '-D', str(base / 'pg'), '--username=approval_test', '--auth=trust', '--no-locale', '-E', 'UTF8'], stdout=subprocess.DEVNULL)
    run(['pg_ctl', '-D', str(base / 'pg'), '-l', str(base / 'pg.log'), '-o', f'-h 127.0.0.1 -p {port} -k {base}', '-w', 'start'], stdout=subprocess.DEVNULL)
    started = True
    run(['createdb', '-h', '127.0.0.1', '-p', str(port), '-U', 'approval_test', 'approval_notices_test'])
    env = dict(os.environ, NODE_ENV='production', DATABASE_URL=f'postgresql://approval_test@127.0.0.1:{port}/approval_notices_test', JWT_SECRET='synthetic-approval-notices-test-only-32', CORS_ORIGIN='http://localhost', UPLOADS_PATH=str(base / 'uploads'), APPROVAL_TEST_BUILD=str(base / 'dist'), NODE_PATH=str(root / 'server/node_modules'))
    run([str(root / 'server/node_modules/.bin/prisma'), 'db', 'push', '--skip-generate', '--schema', str(root / 'server/prisma/schema.prisma')], env=env, stdout=subprocess.DEVNULL)
    run([str(root / 'server/node_modules/.bin/tsc'), '-p', str(root / 'server/tsconfig.json'), '--outDir', str(base / 'dist')], env=env)
    run(['node', 'tests/stoploss/approval-notices-pg-check.cjs'], env=env)
finally:
    if started:
        run(['pg_ctl', '-D', str(base / 'pg'), '-m', 'immediate', '-w', 'stop'], stdout=subprocess.DEVNULL)
    shutil.rmtree(base)
    print('Owned synthetic approval PostgreSQL cleaned', flush=True)
