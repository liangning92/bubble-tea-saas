#!/usr/bin/env python3
"""Run notification HTTP contracts against wrapper-owned disposable PostgreSQL.

First compile the integrated server, then run only through:
  python3 scripts/with-docker-test.py -- python3 scripts/test-notification-awareness.py
No production URL, real Web Push transport, model, or credentials are used.
"""
import os
import pathlib
import shutil
import socket
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
run = os.environ.get('BT_TEST_RUN', '')
assert run.startswith('bt-test-'), 'Use scripts/with-docker-test.py'
assert os.environ.get('BT_TEST_LABEL') == 'com.bubbletea.test-run=' + run
for module in ('NotificationInboxService', 'NotificationApprovalService', 'TeamChatReminderService'):
    assert (root / 'server/dist/services' / (module + '.js')).is_file(), 'Compile integrated server first: ' + module
# macOS Unix socket paths are short; its long default TMPDIR can exceed that
# limit before the database starts. This remains a unique wrapper-owned folder.
base = pathlib.Path(tempfile.mkdtemp(prefix=run + '-', dir='/tmp'))
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]


def tool(name):
    value = shutil.which(name)
    if not value:
        raise RuntimeError('Missing disposable PostgreSQL tool: ' + name)
    return value


def command(args, **kwargs):
    return subprocess.run(args, cwd=root, check=True, **kwargs)


started = False
try:
    command([tool('initdb'), '-D', str(base / 'pg'), '--username=notification_test', '--auth=trust', '--no-locale', '-E', 'UTF8'], stdout=subprocess.DEVNULL)
    try:
        command([tool('pg_ctl'), '-D', str(base / 'pg'), '-l', str(base / 'pg.log'), '-o', '-h 127.0.0.1 -p ' + str(port) + ' -k ' + str(base), '-w', 'start'], stdout=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        print((base / 'pg.log').read_text(), flush=True)
        raise
    started = True
    command([tool('createdb'), '-h', '127.0.0.1', '-p', str(port), '-U', 'notification_test', 'notification_awareness_test'])
    env = dict(os.environ, NODE_ENV='production', DATABASE_URL='postgresql://notification_test@127.0.0.1:' + str(port) + '/notification_awareness_test',
               JWT_SECRET='synthetic-notification-test-only-32-bytes', CORS_ORIGIN='http://localhost', UPLOADS_PATH=str(base / 'uploads'))
    command([str(root / 'server/node_modules/.bin/prisma'), 'db', 'push', '--skip-generate', '--schema', str(root / 'server/prisma/schema.prisma')], env=env)
    command(['node', 'tests/stoploss/notification-awareness-http-check.cjs'], env=env)
finally:
    try:
        if started:
            command([tool('pg_ctl'), '-D', str(base / 'pg'), '-m', 'immediate', '-w', 'stop'], stdout=subprocess.DEVNULL)
    finally:
        shutil.rmtree(base)
    print('Owned notification PostgreSQL instance cleaned', flush=True)
