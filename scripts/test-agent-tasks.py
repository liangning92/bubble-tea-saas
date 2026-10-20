#!/usr/bin/env python3
"""Owned loopback PostgreSQL + synthetic-auth HTTP; no production/Hermes/model."""
import os
import pathlib
import shutil
import socket
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
run = os.environ.get('BT_TEST_RUN', '')
assert run.startswith('bt-test-'), 'Run through scripts/with-docker-test.py'
base = pathlib.Path(tempfile.mkdtemp(prefix=run + '-agent-tasks-', dir='/tmp'))
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
try:
    command([tool('postgres'), '--version'])
    command([tool('initdb'), '-D', str(base / 'pg'), '--username=agent_test', '--auth=trust', '--no-locale', '-E', 'UTF8'], stdout=subprocess.DEVNULL)
    command([tool('pg_ctl'), '-D', str(base / 'pg'), '-l', str(base / 'pg.log'), '-o', f'-h 127.0.0.1 -p {port} -k {base}', '-w', 'start'], stdout=subprocess.DEVNULL)
    started = True
    command([tool('createdb'), '-h', '127.0.0.1', '-p', str(port), '-U', 'agent_test', 'agent_task_test'])
    env = dict(os.environ, NODE_ENV='production', DATABASE_URL=f'postgresql://agent_test@127.0.0.1:{port}/agent_task_test',
               JWT_SECRET='synthetic-agent-tests-only-key-32-bytes', CORS_ORIGIN='http://localhost', UPLOADS_PATH=str(base / 'uploads'))
    command([str(root / 'server/node_modules/.bin/prisma'), 'db', 'push', '--skip-generate', '--schema', str(root / 'server/prisma/schema.prisma')], env=env)
    command(['node', 'tests/stoploss/agent-tasks-http-check.cjs'], env=env)
finally:
    log = base / 'pg.log'
    if log.exists():
        output = root / 'output' / 'agent-tasks-http'
        output.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(log, output / (run + '-postgres.log'))
    try:
        if started:
            command([tool('pg_ctl'), '-D', str(base / 'pg'), '-m', 'immediate', '-w', 'stop'], stdout=subprocess.DEVNULL)
    finally:
        shutil.rmtree(base)
        print('Owned temporary agent-task PostgreSQL instance cleaned', flush=True)
