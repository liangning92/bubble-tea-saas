"""Pure fixture recovery tests; no Hermes, model, gateway or database starts."""
import importlib.util
import io
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
            path=profile/'state/gateway.loop-tick.9999999999.sock'
            self.assertLess(len(str(path).encode()),104)
            path.parent.mkdir(parents=True)
            with socket.socket(socket.AF_UNIX) as server:server.bind(str(path))
        finally:shutil.rmtree(base)

if __name__=='__main__':unittest.main()
