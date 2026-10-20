#!/usr/bin/env python3
"""Owned, temporary PostgreSQL for training notice integration; no production services."""
import os, pathlib, shutil, socket, subprocess, tempfile
root = pathlib.Path(__file__).resolve().parents[1]
run = os.environ.get('BT_TEST_RUN', '')
assert run.startswith('bt-test-'), 'Run through scripts/with-docker-test.py'
base = pathlib.Path(tempfile.mkdtemp(prefix=run + '-training-'))
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
def command(args, **kwargs):
    return subprocess.run(args, cwd=root, check=True, **kwargs)
def tool(name):
    value = shutil.which(name)
    if not value: raise RuntimeError('Missing temporary database tool: ' + name)
    return value
started = False
try:
    command([tool('initdb'), '-D', str(base / 'pg'), '--username=training_test', '--auth=trust', '--no-locale', '-E', 'UTF8'], stdout=subprocess.DEVNULL)
    command([tool('pg_ctl'), '-D', str(base / 'pg'), '-l', str(base / 'pg.log'), '-o', '-h 127.0.0.1 -p ' + str(port) + ' -k ' + str(base), '-w', 'start'], stdout=subprocess.DEVNULL)
    started = True
    command([tool('createdb'), '-h', '127.0.0.1', '-p', str(port), '-U', 'training_test', 'training_notices_test'])
    env = dict(os.environ, NODE_ENV='production', DATABASE_URL='postgresql://training_test@127.0.0.1:' + str(port) + '/training_notices_test', UPLOADS_PATH=str(base / 'uploads'))
    command([str(root / 'server/node_modules/.bin/prisma'), 'db', 'push', '--skip-generate', '--schema', str(root / 'server/prisma/schema.prisma')], env=env)
    command(['node', 'tests/stoploss/training-update-notices-check.cjs'], env=env)
finally:
    if started: command([tool('pg_ctl'), '-D', str(base / 'pg'), '-m', 'immediate', '-w', 'stop'], stdout=subprocess.DEVNULL)
    shutil.rmtree(base)
    print('Owned training-notices PostgreSQL instance cleaned', flush=True)
