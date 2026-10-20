#!/usr/bin/env python3
"""An owned temporary PostgreSQL instance; no production URL, volume or service."""
import os, subprocess, pathlib, tempfile, time, socket, shutil, sys
root = pathlib.Path(__file__).resolve().parents[1]
run = os.environ.get('BT_TEST_RUN', '')
assert run.startswith('bt-test-')
base = pathlib.Path(tempfile.mkdtemp(prefix=run + '-'))
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
def command(args, **kwargs):
    return subprocess.run(args, cwd=root, check=True, **kwargs)
def tool(name):
    value = shutil.which(name)
    if not value: raise RuntimeError('Missing temporary test database tool: ' + name)
    return value
started = False
try:
    command([tool('postgres'), '--version'])
    command([tool('initdb'), '-D', str(base / 'pg'), '--username=team_test', '--auth=trust', '--no-locale', '-E', 'UTF8'], stdout=subprocess.DEVNULL)
    command([tool('pg_ctl'), '-D', str(base / 'pg'), '-l', str(base / 'pg.log'), '-o', '-h 127.0.0.1 -p ' + str(port) + ' -k ' + str(base), '-w', 'start'], stdout=subprocess.DEVNULL)
    started = True
    command([tool('createdb'), '-h', '127.0.0.1', '-p', str(port), '-U', 'team_test', 'team_test'])
    env = dict(os.environ, NODE_ENV='production', DATABASE_URL='postgresql://team_test@127.0.0.1:' + str(port) + '/team_test',
               JWT_SECRET='synthetic-team-tests-only-key-32-bytes', CORS_ORIGIN='http://localhost', UPLOADS_PATH=str(base / 'uploads'))
    command([str(root / 'server/node_modules/.bin/prisma'), 'db', 'push', '--skip-generate', '--schema', str(root / 'server/prisma/schema.prisma')], env=env)
    script = ('tests/stoploss/team-management-http-check.cjs' if '--management-loop' in sys.argv else
              'tests/stoploss/team-routine-http-check.cjs' if '--routine-auto' in sys.argv else
              'tests/stoploss/team-chat-notification-http-check.cjs' if '--chat-notify' in sys.argv else
              'tests/stoploss/team-ai-settings-http-check.cjs' if '--ai-settings' in sys.argv else
              'tests/stoploss/team-operations-ui-runtime.cjs' if '--operations-ui' in sys.argv else 'tests/stoploss/team-communication-http-check.cjs')
    command(['node', script], env=env)
finally:
    if started: command([tool('pg_ctl'), '-D', str(base / 'pg'), '-m', 'immediate', '-w', 'stop'], stdout=subprocess.DEVNULL)
    shutil.rmtree(base)
    print('Owned temporary PostgreSQL instance cleaned', flush=True)
