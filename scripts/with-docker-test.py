#!/usr/bin/env python3
"""Run one isolated Docker test batch and remove only its labelled resources."""
import argparse
import json
import os
import re
import signal
import subprocess
import sys
import uuid

LABEL = 'com.bubbletea.test-run'
PROTECTED = {'bubble-tea-api', 'bubble-tea-admin', 'bubble-tea-pos',
             'bubble-tea-staff', 'bubble-tea-db', 'bubble-tea-redis'}


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True).strip()


def inspect(kind, ids):
    return json.loads(docker(kind, 'inspect', *ids)) if ids else []


def cleanup(run):
    selector = f'{LABEL}={run}'
    all_ids = docker('ps', '-aq').split()
    all_containers = inspect('container', all_ids)
    protected_volumes = {m['Name'] for c in all_containers
                         if c['Name'].lstrip('/') in PROTECTED
                         for m in c['Mounts'] if m['Type'] == 'volume'}
    errors = []

    def remove(*args):
        try:
            docker(*args)
        except subprocess.CalledProcessError:
            errors.append(' '.join(args))

    # Buildx has no arbitrary builder labels. The cryptographically unique
    # batch name is the ownership boundary for an optional private builder.
    builder = subprocess.run(['docker', 'buildx', 'inspect', run],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if builder.returncode == 0:
        remove('buildx', 'rm', '--force', run)

    for c in all_containers:
        if (c['Config'].get('Labels') or {}).get(LABEL) != run:
            continue
        name = c['Name'].lstrip('/')
        if name in PROTECTED or not name.startswith(run + '-'):
            errors.append('refused container ' + name)
            continue
        # Explicit named volumes are removed below; never remove anonymous
        # volumes implicitly because their ownership cannot be established.
        remove('container', 'rm', '-f', c['Id'])
    for kind in ('network', 'volume'):
        ids = docker(kind, 'ls', '-q', '--filter', 'label=' + selector).split()
        for obj in inspect(kind, ids):
            name = obj['Name']
            if (not name.startswith(run + '-') or name in protected_volumes
                    or (obj.get('Labels') or {}).get(LABEL) != run):
                errors.append('refused ' + kind + ' ' + name)
                continue
            # Docker itself refuses removal of volumes/networks still in use.
            remove(kind, 'rm', name)
    ids = docker('image', 'ls', '-q', '--filter', 'label=' + selector).split()
    # Refresh references after test containers have gone, and protect every
    # remaining container, including stopped containers from other test runs.
    current = inspect('container', docker('ps', '-aq').split())
    used = {c['Image'] for c in current}
    production = {c['Image'] for c in all_containers
                  if c['Name'].lstrip('/') in PROTECTED}
    for obj in inspect('image', list(dict.fromkeys(ids))):
        if obj['Id'] in used | production:
            continue
        if (obj.get('Config', {}).get('Labels') or {}).get(LABEL) != run:
            continue
        tags = obj.get('RepoTags') or []
        if any(not t.startswith(run + ':') for t in tags):
            errors.append('refused shared image ' + obj['Id'])
            continue
        for ref in tags or [obj['Id']]:
            remove('image', 'rm', ref)
    if errors:
        raise RuntimeError('Cleanup incomplete: ' + '; '.join(errors))
    print(f'[docker-test] cleaned {run}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cleanup', metavar='RUN', help='retry cleanup of a recorded batch')
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if args.cleanup:
        if not re.fullmatch(r'bt-test-[0-9a-f]{12}', args.cleanup):
            parser.error('invalid batch identifier')
        cleanup(args.cleanup)
        return 0
    command = args.command
    if command[:1] == ['--']:
        command = command[1:]
    if not command:
        parser.error('provide a test command after --')
    docker('info', '--format', '{{.ServerVersion}}')
    run = 'bt-test-' + uuid.uuid4().hex[:12]
    env = dict(os.environ, BT_TEST_RUN=run, BT_TEST_LABEL=f'{LABEL}={run}',
               COMPOSE_PROJECT_NAME=run)
    print(f'[docker-test] batch {run}', flush=True)
    child = None
    interrupted = None

    def stop(signum, _frame):
        nonlocal interrupted
        interrupted = signum
        if child is not None and child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)

    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, stop)
    try:
        child = subprocess.Popen(command, env=env, start_new_session=True)
        while True:
            try:
                code = child.wait(timeout=1)
                break
            except subprocess.TimeoutExpired:
                if interrupted:
                    try:
                        code = child.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(child.pid, signal.SIGKILL)
                        code = child.wait()
                    break
    finally:
        # Ignore repeated interrupts while disposing this batch's resources.
        for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            signal.signal(sig, signal.SIG_IGN)
        cleanup(run)
    return 128 + interrupted if interrupted else (code if code >= 0 else 128 - code)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (RuntimeError, subprocess.CalledProcessError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
