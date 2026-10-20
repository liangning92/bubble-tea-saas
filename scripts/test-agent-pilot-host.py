#!/usr/bin/env python3
"""Owned loopback PostgreSQL + synthetic-auth HTTP; no production/Hermes/model."""
import os
import pathlib
import shutil
import socket
import subprocess
import tempfile
import signal
import json

root = pathlib.Path(__file__).resolve().parents[1]
run = os.environ.get('BT_TEST_RUN', '')
assert run.startswith('bt-test-'), 'Run through scripts/with-docker-test.py'
base = pathlib.Path(tempfile.mkdtemp(prefix=run + '-agent-pilot-host-', dir='/tmp'))
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]

def tool(name):
    value = shutil.which(name)
    if not value:
        raise RuntimeError('Missing temporary test database tool: ' + name)
    return value

def command(args, **kwargs):
    return subprocess.run(args, cwd=root, check=True, **kwargs)

started = False
def interrupted(signum, frame):
    raise KeyboardInterrupt('Owned host test interrupted')
for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
    signal.signal(signum, interrupted)
try:
    command([tool('postgres'), '--version'])
    command([tool('initdb'), '-D', str(base / 'pg'), '--username=agent_test', '--auth=trust', '--no-locale', '-E', 'UTF8'], stdout=subprocess.DEVNULL)
    command([tool('pg_ctl'), '-D', str(base / 'pg'), '-l', str(base / 'pg.log'), '-o', f'-h 127.0.0.1 -p {port} -k {base}', '-w', 'start'], stdout=subprocess.DEVNULL)
    started = True
    command([tool('createdb'), '-h', '127.0.0.1', '-p', str(port), '-U', 'agent_test', 'agent_pilot_host_test'])
    env = dict(os.environ, NODE_ENV='production', DATABASE_URL=f'postgresql://agent_test@127.0.0.1:{port}/agent_pilot_host_test',
               JWT_SECRET='synthetic-agent-tests-only-key-32-bytes', CORS_ORIGIN='http://localhost', UPLOADS_PATH=str(base / 'uploads'))
    command([str(root / 'server/node_modules/.bin/prisma'), 'db', 'push', '--skip-generate', '--schema', str(root / 'server/prisma/schema.prisma')], env=env)
    env['AGENT_PILOT_TEST_DIR'] = str(base / 'host-files')
    (base / 'host-files').mkdir(mode=0o700)
    command(['node', 'tests/stoploss/agent-pilot-host-http-check.cjs'], env=env, timeout=180)
finally:
    for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(signum, signal.SIG_IGN)
    log = base / 'pg.log'
    if log.exists():
        output = root / 'output' / 'agent-pilot-host-http'
        output.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(log, output / (run + '-postgres.log'))
    cleanup_ok = False
    try:
        if started:
            command([tool('pg_ctl'), '-D', str(base / 'pg'), '-m', 'immediate', '-w', 'stop'], stdout=subprocess.DEVNULL)
        cleanup_ok = True
    finally:
        output = root / 'output' / 'agent-pilot-host-http'
        output.mkdir(parents=True, exist_ok=True)
        if cleanup_ok:
            shutil.rmtree(base)
            print('Owned temporary agent-pilot-host PostgreSQL instance/files cleaned', flush=True)
        else:
            print('Owned PostgreSQL cleanup PENDING: ' + str(base), flush=True)
        (output / 'cleanup.json').write_text(json.dumps({'batch': run, 'postgresStopped': cleanup_ok,
            'temporaryFilesRemoved': not base.exists()}, indent=2))
