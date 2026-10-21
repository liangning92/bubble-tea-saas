"""Launcher tests use private tempdirs and fake processes only."""
import copy
import ast
import contextlib
import types
import json
import os
import shutil
import subprocess
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pdca_launcher import plan, activate, gateway_config, live_runtime_projector, verify_source_tree, PINNED_HERMES, PROFILE
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
        with patch.dict(os.environ, {'MINIMAX_API_KEY': 'must-not-inherit', 'OPENAI_API_KEY': 'must-not-inherit', 'TELEGRAM_BOT_TOKEN': 'must-not-inherit', 'HERMES_DISABLE_LAZY_INSTALLS': '0', 'TIRITH_ENABLED': '1'}): self.start()
        args, kw = self.spawned[0]; env = kw['env']; home = Path(self.spec['profile_home'])
        self.assertEqual(env['API_SERVER_HOST'], '127.0.0.1')
        self.assertEqual(env['HERMES_DISABLE_LAZY_INSTALLS'], '1'); self.assertEqual(env['TIRITH_ENABLED'], '0')
        self.assertEqual(env['API_SERVER_KEY'], (self.root / 'gateway-key').read_text())
        self.assertNotIn('MINIMAX_API_KEY', env); self.assertNotIn('OPENAI_API_KEY', env); self.assertNotIn('TELEGRAM_BOT_TOKEN', env)
        self.assertEqual(env['HOME'], str(home / 'isolated-user-home'))
        self.assertEqual(kw['cwd'], str(home)); self.assertTrue(kw['start_new_session'])
        cfg = json.loads((home / 'config.yaml').read_text())
        self.assertEqual(cfg['platform_toolsets']['api_server'], ['pdca_executor_only'])
        self.assertEqual(cfg['fallback_model'], [])
        self.assertEqual(cfg['tools'], {'tool_search': {'enabled': 'off'}})
        self.assertEqual(cfg['security'], {'allow_lazy_installs': False, 'tirith_enabled': False})
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
    def test_tool_search_cannot_be_enabled_or_implicitly_auto(self):
        self.start(); home=Path(self.spec['profile_home']); env=self.spawned[0][1]['env']
        original=json.loads((home/'config.yaml').read_text())
        for tools in (None, {}, {'tool_search': {'enabled': 'auto'}}, {'tool_search': {'enabled': 'on'}}):
            with self.subTest(tools=tools):
                changed=copy.deepcopy(original)
                if tools is None:changed.pop('tools')
                else:changed['tools']=tools
                (home/'config.yaml').write_text(json.dumps(changed))
                with self.assertRaisesRegex(Blocked,'UNSAFE_LIVE_PROFILE'):live_runtime_projector(home,environment=env)
        (home/'config.yaml').write_text(json.dumps(original))
        self.assertEqual(live_runtime_projector(home,environment=env)['enabled_tools'],sorted(TOOLS))
    def test_runtime_installer_config_cannot_be_removed_or_enabled(self):
        self.start(); home=Path(self.spec['profile_home']); env=self.spawned[0][1]['env']
        original=json.loads((home/'config.yaml').read_text())
        for value in (None, {}, {'allow_lazy_installs': True,'tirith_enabled':False}, {'allow_lazy_installs':False,'tirith_enabled':True}):
            with self.subTest(security=value):
                changed=copy.deepcopy(original)
                if value is None:changed.pop('security')
                else:changed['security']=value
                (home/'config.yaml').write_text(json.dumps(changed))
                with self.assertRaises(Blocked):live_runtime_projector(home,environment=env)
        (home/'config.yaml').write_text(json.dumps(original))
        self.assertEqual(live_runtime_projector(home,environment=env)['profile'],PROFILE)
    def test_runtime_installer_environment_cannot_be_removed_or_enabled(self):
        self.start();home=Path(self.spec['profile_home']);env=self.spawned[0][1]['env']
        for key,bad in [('HERMES_DISABLE_LAZY_INSTALLS','0'),('TIRITH_ENABLED','1')]:
            for remove in (False,True):
                changed=dict(env)
                if remove:changed.pop(key)
                else:changed[key]=bad
                with self.assertRaisesRegex(Blocked,'RUNTIME_INSTALL_GUARD_CHANGED'):live_runtime_projector(home,environment=changed)
    def test_actual_a719_installer_gates_return_before_probe_or_download(self):
        root=Path(os.environ.get('HERMES_SOURCE','/Users/liangning/.hermes/hermes-agent'))
        if not root.exists():self.skipTest('explicit pinned Hermes source unavailable')
        # Compile only pure gate functions. Never import the real env/config loader or
        # installer modules, which could access user state or start background work.
        def functions(path,names,namespace):
            tree=ast.parse(path.read_text());selected=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
            self.assertEqual({n.name for n in selected},set(names))
            exec(compile(ast.Module(body=selected,type_ignores=[]),str(path),'exec',flags=__import__('__future__').annotations.compiler_flag),namespace)
        cfg={'security':{'allow_lazy_installs':False,'tirith_enabled':False}}
        config=types.ModuleType('hermes_cli.config');config.load_config=lambda:cfg;config.load_config_readonly=lambda:cfg
        package=types.ModuleType('hermes_cli');package.config=config
        def forbidden(*args,**kwargs):self.fail('installer probe/download must not run')
        with patch.dict(sys.modules,{'hermes_cli':package,'hermes_cli.config':config}),patch.dict(os.environ,{'HERMES_DISABLE_LAZY_INSTALLS':'1','TIRITH_ENABLED':'0'}):
            lazy={'contextlib':contextlib,'os':os,'_lazy_install_target':forbidden}
            functions(root/'tools/lazy_deps.py',{'_allow_lazy_installs'},lazy)
            self.assertFalse(lazy['_allow_lazy_installs']())
            tirith={'os':os,'_cached_path':forbidden,'_install_thread':None,'is_platform_supported':forbidden}
            functions(root/'tools/tirith_security.py',{'_env_bool','_env_int','_load_security_config','ensure_installed'},tirith)
            self.assertFalse(tirith['_load_security_config']()['tirith_enabled'])
            self.assertIsNone(tirith['ensure_installed'](log_failures=False))

    def test_bootstrap_template_is_deferred_and_actual_factory_signatures(self):
        path = Path(__file__).parents[1] / 'plugin/bootstrap.py.template'
        namespace = {}; exec(compile(path.read_text(), str(path), 'exec'), namespace)
        self.assertTrue(callable(namespace['build_bridge']))
        self.assertEqual(set(namespace) - {'__builtins__', '__doc__'}, {'build_bridge'})

class SourceBytesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name); self.source = self.root / 'source'; self.source.mkdir()
        self.env = {'PATH':'/usr/bin:/bin','GIT_CONFIG_GLOBAL':os.devnull,'GIT_CONFIG_NOSYSTEM':'1','GIT_TERMINAL_PROMPT':'0'}
        self.git('init', '-q'); (self.source / 'pkg').mkdir()
        (self.source / 'pkg/__init__.py').write_text('VALUE = "pinned"\n')
        (self.source / '.gitignore').write_text('*.ignored.py\n__pycache__/\n')
        self.git('add', '.')
        self.git('-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','-c','commit.gpgsign=false','commit','-qm','Synthetic source fixture')
        self.sha = self.git('rev-parse','HEAD').strip()
        for name, text in [('gateway-key','synthetic-only-gateway-bearer-0123456789'),('client.json','{}')]:
            path=self.root/name;path.write_text(text);path.chmod(0o600)
        self.spec={'profile_home':str(self.root/'profiles'/PROFILE),'hermes_source':str(self.source),'python_executable':sys.executable,'gateway_bearer_file':str(self.root/'gateway-key'),'private_client_file':str(self.root/'client.json'),'endpoints':{'api_origin':'https://api.aicube.online','issuer':'https://api.aicube.online/identity/realms/store-agents','resource':'https://api.aicube.online/mcp/agent-tasks'},'pilot':PILOT,'port':18642}
        self.spawned=[]
    def tearDown(self): self.temp.cleanup()
    def git(self,*args):return subprocess.check_output(['/usr/bin/git','-C',str(self.source),*args],env=self.env,text=True,stderr=subprocess.DEVNULL)
    def spawn(self,*a,**kw):self.spawned.append((a,kw));return FakeProcess()
    def activation(self):
        # This changes the expected revision only. The actual byte validator and git
        # commands remain intact; no verify_source callback is supplied.
        with patch('pdca_launcher.PINNED_HERMES', self.sha):
            return activate(self.spec,spawn=self.spawn,now=lambda:NOW,start_watchdog=False,stop=lambda:None)
    def rejected_before_spawn(self):
        with self.assertRaises(Blocked):self.activation()
        self.assertEqual(self.spawned,[]);self.assertFalse(Path(self.spec['profile_home']).exists())
    def test_clean_repo_and_full_temporary_copy_verified_bytes_then_fake_spawn(self):
        self.assertEqual(verify_source_tree(self.source,expected_commit=self.sha),self.sha)
        copied=self.root/'copy';shutil.copytree(self.source,copied)
        self.assertEqual(verify_source_tree(copied,expected_commit=self.sha),self.sha)
        self.spec['hermes_source']=str(copied);self.activation()
        self.assertEqual(len(self.spawned),1)
        self.assertEqual(self.spawned[0][1]['env']['PYTHONDONTWRITEBYTECODE'],'1')
    def test_tracked_mutation_assume_unchanged_is_not_trusted(self):
        self.git('update-index','--assume-unchanged','pkg/__init__.py')
        (self.source/'pkg/__init__.py').write_text('VALUE = "changed behind clean index"\n')
        self.assertEqual(self.git('diff','--name-only').strip(),'')
        self.rejected_before_spawn()
    def test_tracked_mutation_skip_worktree_is_not_trusted(self):
        self.git('update-index','--skip-worktree','pkg/__init__.py')
        (self.source/'pkg/__init__.py').write_text('VALUE = "changed behind skip-worktree"\n')
        self.rejected_before_spawn()
    def test_git_replace_cannot_substitute_matching_malicious_index_and_worktree(self):
        original = self.sha
        (self.source/'pkg/__init__.py').write_text('VALUE = "malicious replacement tree"\n')
        self.git('add','pkg/__init__.py')
        self.git('-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','-c','commit.gpgsign=false','commit','-qm','Synthetic replacement')
        malicious = self.git('rev-parse','HEAD').strip()
        self.git('update-ref','HEAD',original)
        self.git('replace',original,malicious)
        self.assertEqual(self.git('rev-parse','HEAD').strip(),original)
        # Ordinary Git honors replace: both index and tree now agree with tampered bytes.
        self.assertEqual(self.git('diff','HEAD','--name-only').strip(),'')
        self.rejected_before_spawn()

    def test_actual_a719_normal_checkout_keeps_trusted_crlf_and_fake_activation_passes(self):
        source = Path(os.environ.get('HERMES_SOURCE','/Users/liangning/.hermes/hermes-agent'))
        if not source.exists(): self.skipTest('explicit a719 source checkout not available')
        clone = self.root/'actual-a719-clone'
        args=['/usr/bin/git','--no-replace-objects','-c','core.fsmonitor=false','-c','core.hooksPath='+os.devnull,'-c','core.attributesFile='+os.devnull]
        subprocess.check_call(args+['clone','--no-local','--no-checkout','--quiet',str(source),str(clone)],env=self.env,stderr=subprocess.DEVNULL,timeout=120)
        subprocess.check_call(args+['-C',str(clone),'-c','core.autocrlf=false','checkout','--quiet',PINNED_HERMES],env=self.env,stderr=subprocess.DEVNULL,timeout=120)
        powershell=(clone/'evals/update_streaming/watchdog.ps1').read_bytes()
        self.assertEqual(powershell.count(b'\r\n'),44)
        self.assertEqual(powershell.count(b'\n'),44)
        self.spec['hermes_source']=str(clone)
        # No verify_source injection and no revision patch: actual a719 object chain.
        activate(self.spec,spawn=self.spawn,now=lambda:NOW,start_watchdog=False,stop=lambda:None)
        self.assertEqual(len(self.spawned),1)
    def test_actual_a719_git_replace_matching_worktree_rejected_before_profile_and_spawn(self):
        source=Path(os.environ.get('HERMES_SOURCE','/Users/liangning/.hermes/hermes-agent'))
        if not source.exists():self.skipTest('explicit a719 source checkout not available')
        result={}
        with tempfile.TemporaryDirectory(prefix='a719-replace-',dir=self.root) as owned:
            clone=Path(owned)/'clone'
            command=['/usr/bin/git','-c','core.fsmonitor=false','-c','core.hooksPath='+os.devnull,'-c','core.attributesFile='+os.devnull]
            def git(*args):return subprocess.check_output(command+['-C',str(clone),*args],env=self.env,stderr=subprocess.DEVNULL,text=True)
            subprocess.check_call(command+['clone','--depth=1','--single-branch','--no-tags','--no-local','--no-checkout','--quiet',str(source),str(clone)],env={**self.env,'GIT_NO_REPLACE_OBJECTS':'1'},stderr=subprocess.DEVNULL,timeout=120)
            git('-c','core.autocrlf=false','checkout','--quiet',PINNED_HERMES)
            target=clone/'hermes_cli/main.py'
            with target.open('a') as stream:stream.write('\n# synthetic replace proof: this altered source is never executed\n')
            git('add','hermes_cli/main.py')
            git('-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','-c','commit.gpgsign=false','commit','-qm','Synthetic replacement probe only')
            replacement=git('rev-parse','HEAD').strip()
            git('update-ref','HEAD',PINNED_HERMES)
            git('replace',PINNED_HERMES,replacement)
            self.assertEqual(git('rev-parse','HEAD').strip(),PINNED_HERMES)
            self.assertEqual(git('diff','HEAD','--name-only').strip(),'')
            self.spec['hermes_source']=str(clone)
            # No revision patch and no verify_source callback: production default validator.
            with self.assertRaises(Blocked) as failure:
                activate(self.spec,spawn=self.spawn,now=lambda:NOW,start_watchdog=False,stop=lambda:None)
            self.assertEqual(self.spawned,[]);self.assertFalse(Path(self.spec['profile_home']).exists())
            result={'head':PINNED_HERMES,'replacement':replacement,'normalGitTreeIndexWorktreeAgree':True,'rejectedCode':str(failure.exception),'profileCreated':False,'processSpawns':0,'hermesCalls':0,'modelCalls':0,'ownedDirectory':owned}
        self.assertFalse(Path(owned).exists());result['cleanupComplete']=True
        evidence=Path(__file__).parents[2]/'output/hermes-pdca-bridge/actual-a719-replace-delivery.json'
        evidence.parent.mkdir(parents=True,exist_ok=True);evidence.write_text(json.dumps(result,indent=2)+'\n')
    def test_staged_python_shadow_outside_head_is_rejected(self):
        (self.source/'json.py').write_text('raise RuntimeError("staged shadow")\n');self.git('add','json.py');self.rejected_before_spawn()
    def test_untracked_python_shadow_is_rejected(self):
        (self.source/'json.py').write_text('raise RuntimeError("shadow")\n');self.rejected_before_spawn()
    def test_ignored_python_shadow_is_rejected(self):
        (self.source/'shadow.ignored.py').write_text('raise RuntimeError("ignored shadow")\n');self.rejected_before_spawn()
    def test_tracked_symlink_replacement_is_rejected_even_same_target_bytes(self):
        target=self.root/'outside.py';target.write_text((self.source/'pkg/__init__.py').read_text())
        (self.source/'pkg/__init__.py').unlink();(self.source/'pkg/__init__.py').symlink_to(target)
        self.rejected_before_spawn()
    def test_executable_mode_change_is_rejected(self):
        (self.source/'pkg/__init__.py').chmod(0o755);self.rejected_before_spawn()
    def test_symlinked_package_directory_is_rejected(self):
        original=self.root/'outside-pkg';shutil.move(self.source/'pkg',original);(self.source/'pkg').symlink_to(original,target_is_directory=True)
        self.rejected_before_spawn()

if __name__ == '__main__': unittest.main()
