"""Launcher tests use private tempdirs and fake processes only."""
import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pdca_launcher import plan, activate, gateway_config, live_runtime_projector, PINNED_HERMES, PROFILE
from pdca_bridge import Blocked
from test_pdca_bridge import NOW, PILOT, TOOLS


class FakeProcess:
    pid = 123456
    def poll(self): return None
    def wait(self): return 0


class LauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        (self.root / 'source').mkdir()
        for name, text in [('gateway-key', 'synthetic-only-gateway-bearer-0123456789'), ('client.json', '{}')]:
            p = self.root / name; p.write_text(text); p.chmod(0o600)
        self.spec = {'profile_home': str(self.root / 'profiles' / PROFILE), 'hermes_source': str(self.root / 'source'), 'python_executable': sys.executable, 'gateway_bearer_file': str(self.root / 'gateway-key'), 'private_client_file': str(self.root / 'client.json'), 'endpoints': {'api_origin': 'https://api.aicube.online', 'issuer': 'https://api.aicube.online/identity/realms/store-agents', 'resource': 'https://api.aicube.online/mcp/agent-tasks'}, 'pilot': PILOT, 'port': 18642}
        self.spawned = []
    def tearDown(self): self.temp.cleanup()
    def spawn(self, args, **kwargs): self.spawned.append((args, kwargs)); return FakeProcess()
    def start(self, **kwargs):
        original = Path.read_text
        # The runtime author owns this file; fake its source if not yet available.
        def source_read(path, *a, **kw):
            if path.name == 'pdca_runtime.py' and not path.exists(): return '# synthetic runtime placeholder for launcher fake-process tests\n'
            return original(path, *a, **kw)
        with patch.object(Path, 'read_text', source_read):
            return activate(self.spec, spawn=self.spawn, now=lambda: NOW, start_watchdog=False, verify_source=lambda _: PINNED_HERMES, **kwargs)
    def test_plan_has_zero_mutation_and_actual_cli_shape(self):
        result = plan(self.spec, now=lambda: NOW)
        self.assertEqual(result['argv'], [sys.executable, '-m', 'hermes_cli.main', '--profile', PROFILE, 'gateway', 'run'])
        self.assertFalse(Path(self.spec['profile_home']).exists())
    def test_activation_isolated_env_bearer_and_exact_toolset(self):
        with patch.dict(os.environ, {'MINIMAX_API_KEY': 'must-not-inherit', 'OPENAI_API_KEY': 'must-not-inherit', 'TELEGRAM_BOT_TOKEN': 'must-not-inherit'}): self.start()
        args, kw = self.spawned[0]; env = kw['env']; home = Path(self.spec['profile_home'])
        self.assertEqual(env['API_SERVER_HOST'], '127.0.0.1')
        self.assertEqual(env['API_SERVER_KEY'], (self.root / 'gateway-key').read_text())
        self.assertNotIn('MINIMAX_API_KEY', env); self.assertNotIn('OPENAI_API_KEY', env); self.assertNotIn('TELEGRAM_BOT_TOKEN', env)
        self.assertEqual(env['HOME'], str(home / 'isolated-user-home'))
        self.assertEqual(kw['cwd'], str(home)); self.assertTrue(kw['start_new_session'])
        cfg = json.loads((home / 'config.yaml').read_text())
        self.assertEqual(cfg['platform_toolsets']['api_server'], ['pdca_executor_only'])
        self.assertEqual(cfg['fallback_model'], [])
        self.assertFalse(cfg['auxiliary']['title_generation']['enabled'])
        self.assertFalse(cfg['compression']['enabled'])
        self.assertNotIn(env['API_SERVER_KEY'], (home / 'config.yaml').read_text())
        self.assertEqual((home / 'config.yaml').stat().st_mode & 0o777, 0o600)
        self.assertEqual(live_runtime_projector(home, environment=env)['enabled_tools'], sorted(TOOLS))
    def test_expired_before_activation_no_writes_no_process(self):
        with self.assertRaises(Blocked): activate(self.spec, now=lambda: NOW + 86400, spawn=self.spawn)
        self.assertFalse(Path(self.spec['profile_home']).exists()); self.assertEqual(self.spawned, [])
    def test_sleep_resume_and_exact_cutoff_stop_only_owned_process(self):
        stopped = []; running = self.start(stop=lambda: stopped.append(True))
        self.assertTrue(running.check())
        running.now = lambda: NOW - 10 + 86400
        self.assertFalse(running.check()); self.assertFalse(running.check())
        self.assertEqual(stopped, [True])
    def test_source_env_refused_without_read_or_profile_creation(self):
        path = self.root / 'source' / '.env'; path.write_text('NEVER_READ_ME'); path.chmod(0o000)
        with self.assertRaisesRegex(Blocked, 'SOURCE_SECRET_FILES_FORBIDDEN'): self.start()
        self.assertFalse(Path(self.spec['profile_home']).exists()); self.assertFalse(self.spawned)
    def test_existing_profile_never_overwritten(self):
        home = Path(self.spec['profile_home']); home.mkdir(parents=True); home.parent.chmod(0o700)
        marker = home / 'owner-data'; marker.write_text('preserve')
        with self.assertRaises(FileExistsError): self.start()
        self.assertEqual(marker.read_text(), 'preserve'); self.assertFalse(self.spawned)
    def test_changed_runtime_config_refused(self):
        self.start(); home = Path(self.spec['profile_home']); env = self.spawned[0][1]['env']
        cfg = json.loads((home / 'config.yaml').read_text()); cfg['platform_toolsets']['api_server'].append('terminal')
        (home / 'config.yaml').write_text(json.dumps(cfg))
        with self.assertRaises(Blocked): live_runtime_projector(home, environment=env)
    def test_bootstrap_template_is_deferred_and_actual_factory_signatures(self):
        path = Path(__file__).parents[1] / 'plugin/bootstrap.py.template'
        namespace = {}; exec(compile(path.read_text(), str(path), 'exec'), namespace)
        self.assertTrue(callable(namespace['build_bridge']))
        self.assertEqual(set(namespace) - {'__builtins__', '__doc__'}, {'build_bridge'})

if __name__ == '__main__': unittest.main()
