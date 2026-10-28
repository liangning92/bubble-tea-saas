"""Observe the actual runtime verifier without starting a Windows installer."""
import ast
import ctypes
import io
import json
import pathlib
import re
import tempfile
import types
import unittest
from unittest.mock import Mock
from ctypes import wintypes

TREE = ast.parse(pathlib.Path('scripts/validate-windows-manual-upgrade.py').read_text())
FUNCTIONS = [node for node in TREE.body if isinstance(node, ast.FunctionDef) and node.name in ('startup_metrics', 'verify_started_runtime')]


class RuntimeObservationTests(unittest.TestCase):
    def observe(self, exit_failure=False, disappears=False):
        with tempfile.TemporaryDirectory(prefix='owned-pos-observation-') as directory:
            root = pathlib.Path(directory)
            (root / 'logs').mkdir()
            (root / 'logs/main.log').write_text('App version: verified\nuserData: ' + str(root))
            (root / 'logs/crash.log').write_text('\n'.join('[STARTUP] ' + name + ' pid=20 elapsedMs=' + str(ms) for name, ms in [('window-created', 300), ('login-visible', 600), ('api-ready', 3000)]))
            clock, events, cleanup = [100.0], [], [False]
            def sleep(seconds):
                clock[0] += seconds
            def close(*_):
                cleanup[0] = True
                events.append('normal-close')
            user = types.SimpleNamespace(**{name: Mock() for name in ('EnumWindows', 'GetWindowThreadProcessId', 'IsWindowVisible', 'PostMessageW')})
            user.EnumWindows.side_effect = close
            def query(*_, **__):
                return json.dumps([] if cleanup[0] or (disappears and 'installer-exit' in events) else [{'ProcessId': 20}])
            class Response(io.StringIO):
                status = 200
            def health(*_, **__):
                events.append('health')
                return Response('{"status":"ok"}')
            opener = types.SimpleNamespace(open=health)
            scope = {'os': types.SimpleNamespace(environ={}), 'APP': root / 'BTPS', 'DATA': root,
                     'subprocess': types.SimpleNamespace(check_output=query, run=Mock()), 'json': json, 're': re,
                     'time': types.SimpleNamespace(monotonic=lambda: clock[0], sleep=sleep),
                     'urllib': types.SimpleNamespace(request=types.SimpleNamespace(build_opener=lambda *_: opener, ProxyHandler=lambda *_: None, Request=lambda *_ , **__: None)),
                     'ctypes': types.SimpleNamespace(windll=types.SimpleNamespace(user32=user), WINFUNCTYPE=lambda *_: lambda function: function, POINTER=ctypes.POINTER),
                     'wintypes': wintypes, 'trace': lambda _: None}
            exec(compile(ast.Module(body=FUNCTIONS, type_ignores=[]), '<actual-runtime-verifier>', 'exec'), scope)
            def installer_exit(ready_at):
                self.assertEqual(ready_at, 100)
                self.assertEqual(events, ['health'])
                clock[0] += 40  # Installer temporary cleanup continues after readiness.
                events.append('installer-exit')
                if exit_failure:
                    raise RuntimeError('installer-failed')
            result = scope['verify_started_runtime']('verified', startup_timeout=180, on_ready=installer_exit)
            self.assertEqual(events, ['health', 'installer-exit', 'health', 'normal-close'])
            self.assertEqual(result['readyAtMonotonic'], 100)
            self.assertGreaterEqual(clock[0], 140)
            return result

    def test_observe_readiness_before_cleanup_but_require_installer_exit_and_same_healthy_pid(self):
        self.assertTrue(self.observe()['localApiReady'])

    def test_healthy_runtime_does_not_override_failed_installer(self):
        with self.assertRaisesRegex(RuntimeError, 'installer-failed'):
            self.observe(exit_failure=True)

    def test_runtime_must_still_exist_after_installer_completion(self):
        with self.assertRaisesRegex(AssertionError, 'Verified POS disappeared'):
            self.observe(disappears=True)


if __name__ == '__main__':
    unittest.main()
