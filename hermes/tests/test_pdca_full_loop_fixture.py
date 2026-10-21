"""Pure fixture recovery tests; no Hermes, model, gateway or database starts."""
import importlib.util
import io
import json
import os
import subprocess
import sys
import tarfile
from pathlib import Path
import shutil
import socket
import unittest
from urllib.error import URLError
from urllib.request import Request
spec=importlib.util.spec_from_file_location('full_loop_fixture',Path(__file__).parent/'full_loop/run.py')
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)

class PollTests(unittest.TestCase):
    def clock(self):
        state=[0.0]
        return state,lambda:state[0],lambda seconds:state.__setitem__(0,state[0]+seconds)
    def test_timeout_continues_only_get_under_original_deadline(self):
        clock,now,pause=self.clock();calls=[]
        class Opener:
            def open(self,request,timeout):
                calls.append((request.get_method(),timeout));clock[0]+=timeout
                if len(calls)==1:raise TimeoutError('synthetic blocked loop')
                if len(calls)==2:raise URLError(socket.timeout('synthetic read timeout'))
                return io.StringIO('{"status":"completed"}')
        result=fixture.poll_run_status(Opener(),Request('http://localhost/status'),45,now=now,pause=pause)
        self.assertEqual(result['status'],'completed');self.assertEqual(calls,[('GET',3)]*3)
        self.assertLess(clock[0],45)
    def test_absolute_deadline_unchanged_and_single_timeout_capped(self):
        clock,now,pause=self.clock();calls=[]
        class Opener:
            def open(self,request,timeout):
                calls.append(timeout);clock[0]+=timeout;raise TimeoutError()
        with self.assertRaisesRegex(RuntimeError,'ISOLATED_REAL_LOOP_TIMEOUT'):
            fixture.poll_run_status(Opener(),Request('http://localhost/status'),1,now=now,pause=pause)
        self.assertEqual(calls,[1]);self.assertEqual(clock[0],1)
    def test_non_timeout_network_error_is_not_hidden(self):
        class Opener:
            def open(self,*args,**kwargs):raise URLError(ConnectionRefusedError())
        with self.assertRaises(URLError):fixture.poll_run_status(Opener(),Request('http://localhost/status'),float('inf'))
    def test_post_cannot_be_retried_by_status_helper(self):
        with self.assertRaisesRegex(AssertionError,'READ_ONLY'):
            fixture.poll_run_status(None,Request('http://localhost/run',data=b'{}'),float('inf'))
    def test_owned_profile_tick_socket_fits_darwin_boundary(self):
        run='bt-test-abcdef123456'
        base=fixture.short_owned_base(run)
        try:
            self.assertIn(run,str(base))
            profile=fixture.fixture_profile(base)
            self.assertEqual(profile.name,'stock-ro-001')
            self.assertEqual(profile.parent.name,'profiles')
            self.assertEqual(str(base.parent),'/tmp')
            path=profile/'state/gateway.loop-tick.9999999999.sock'
            self.assertLess(len(str(path).encode()),104)
            path.parent.mkdir(parents=True)
            with socket.socket(socket.AF_UNIX) as server:server.bind(str(path))
        finally:shutil.rmtree(base)

class PrivateClientPathTests(unittest.TestCase):
    def test_real_config_loader_uses_canonical_client_only_and_keeps_guards(self):
        sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
        from pdca_bridge import Blocked,ProfilePolicy,TOOLS,SCOPES
        from pdca_runtime import EndpointPolicy,load_private_config
        from datetime import datetime,timezone
        import time,uuid
        base=fixture.short_owned_base('bt-test-abcdef123456')
        try:
            origin='http://127.0.0.1:18443'
            pins=EndpointPolicy(origin,origin+'/issuer',origin+'/mcp/agent-tasks')
            now=time.time()
            stamp={'id':str(uuid.uuid4()),'startedAt':datetime.fromtimestamp(now-1,timezone.utc).isoformat(),'expiresAt':datetime.fromtimestamp(now-1+86400,timezone.utc).isoformat()}
            policy=ProfilePolicy('stock-ro-001',origin,origin+'/agent-model/v1','pdca-raw-provider-denied',(),TOOLS,SCOPES,stamp)
            path=fixture.fixture_client_file(base)
            fixture.private(path,json.dumps({**vars(pins),'client_id':'synthetic-client','client_secret':'synthetic-secret','scopes':sorted(SCOPES)}))
            self.assertEqual(load_private_config(path,endpoints=pins,policy=policy).client_id,'synthetic-client')
            self.assertEqual(str(fixture.fixture_profile(base).parent.parent.parent),'/tmp')
            if Path('/tmp').is_symlink():
                with self.assertRaisesRegex(Blocked,'UNSAFE_CLIENT_FILE'):load_private_config(base/'client.json',endpoints=pins,policy=policy)
            path.chmod(0o644)
            with self.assertRaisesRegex(Blocked,'UNSAFE_CLIENT_FILE'):load_private_config(path,endpoints=pins,policy=policy)
            path.chmod(0o600)
            link=path.with_name('client-link.json');link.symlink_to(path)
            with self.assertRaisesRegex(Blocked,'UNSAFE_CLIENT_FILE'):load_private_config(link,endpoints=pins,policy=policy)
        finally:shutil.rmtree(base)

class ActualProfileTests(unittest.TestCase):
    def test_actual_a719_cli_profile_resolver_and_gateway_self_route(self):
        source=os.environ.get('HERMES_SOURCE')
        if not source:self.skipTest('explicit read-only pinned source required')
        base=fixture.short_owned_base('bt-test-abcdef123456')
        try:
            archive=base/'source.tar';owned=base/'source';owned.mkdir()
            env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'HOME':str(base/'user'),'HERMES_HOME':str(fixture.fixture_profile(base)), 'PYTHONDONTWRITEBYTECODE':'1','PYTHONNOUSERSITE':'1','GIT_CONFIG_GLOBAL':os.devnull,'GIT_CONFIG_NOSYSTEM':'1','GIT_NO_REPLACE_OBJECTS':'1'}
            Path(env['HOME']).mkdir();Path(env['HERMES_HOME']).mkdir(parents=True)
            with archive.open('wb') as stream:
                subprocess.run(['git','--no-replace-objects','-C',source,'archive',fixture.PIN],env=env,stdout=stream,check=True)
            with tarfile.open(archive) as bundle:bundle.extractall(owned)
            code="""import os,sys,json
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from hermes_cli.profiles import resolve_profile_env,get_active_profile_name,profile_exists,profile_matches_home
home=os.environ['HERMES_HOME']
assert resolve_profile_env('stock-ro-001')==home
assert get_active_profile_name()=='stock-ro-001'
assert profile_exists('stock-ro-001')
assert profile_matches_home('stock-ro-001')
assert not profile_matches_home('other-profile')
# Preserve the real resolver's refusal of the former leaf-only layout.
os.environ['HERMES_HOME']=str(Path(home).parent.parent/'stock-ro-001')
Path(os.environ['HERMES_HOME']).mkdir()
assert get_active_profile_name()=='default'
try:resolve_profile_env('stock-ro-001')
except FileNotFoundError:pass
else:raise AssertionError('LEAF_ONLY_LAYOUT_ACCEPTED')
print(json.dumps({'actualResolver':True,'namedProfile':'stock-ro-001','gatewaySelfRoute':True,'leafOnlyRejected':True}))
"""
            result=subprocess.run([sys.executable,'-S','-c',code,str(owned)],env=env,cwd=base,text=True,capture_output=True,check=True)
            self.assertTrue(json.loads(result.stdout)['gatewaySelfRoute'])
        finally:shutil.rmtree(base)

if __name__=='__main__':unittest.main()
