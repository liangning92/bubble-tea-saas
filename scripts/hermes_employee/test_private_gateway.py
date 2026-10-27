"""Actual loopback HTTP / SQLite / child process. No Hermes/model or production."""
import concurrent.futures
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import uuid
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import request, error

from private_gateway import Gateway

CHILD = r'''
import json,sys,time
first=json.loads(sys.stdin.readline());t=first['ticket'];v=t['traceVersion'];mode=t.get('testMode')
if mode=='closed_stdin':
 import os
 os.close(0)
 print(json.dumps({'protocol':t['protocol'],'method':'recordInput','params':{'executionId':t['executionId'],'expectedTraceVersion':v}}),flush=True)
 time.sleep(10);sys.exit()
if mode=='hang':time.sleep(10);sys.exit()
if mode!='fake':
 for method,extra in [('recordInput',{}),('recordResponse',{}),('executeTool',{}),('recordOutput',{'providerMessage':{'content':'synthetic report'}})]:
  p={'executionId':t['executionId'],'expectedTraceVersion':v,**extra}
  print(json.dumps({'protocol':t['protocol'],'method':method,'params':p}),flush=True)
  v=json.loads(sys.stdin.readline())['result']['traceVersion']
print(json.dumps({'protocol':t['protocol'],'method':'finished','params':{'stored':{'requestId':t['requestId'],'traceVersion':v}}}),flush=True)
'''


class TestGateway(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.calls=[];self.starts=[];self.bearer='synthetic-gateway-'+'g'*32;self.rejection=None
        owner=self
        class Rpc(BaseHTTPRequestHandler):
            def log_message(self,*a):pass
            def do_POST(self):
                body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                owner.calls.append((body,self.headers.get('Authorization')))
                if owner.rejection and body['method']=='recordInput':
                    raw=json.dumps({'error':'EMPLOYEE_RUNTIME_RPC_DENIED','code':owner.rejection}).encode();self.send_response(403);self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw);return
                if self.path=='/slow-headers':
                    time.sleep(.6)
                    return
                if self.path=='/redirect':
                    self.send_response(302);self.send_header('Location',f'http://127.0.0.1:{self.server.server_port}/unexpected');self.end_headers();return
                value=None if body['method']=='markUnknown' else {'traceVersion':body['params']['expectedTraceVersion']+1}
                if body['method']=='recordOutput':value.update(requestId=owner.request_id,text='synthetic report')
                raw=json.dumps({'result':value}).encode();self.send_response(200);self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
        self.rpc=ThreadingHTTPServer(('127.0.0.1',0),Rpc);threading.Thread(target=self.rpc.serve_forever,daemon=True).start()
        self.request_id=str(uuid.uuid4())
        def command(e):self.starts.append(e['ticket']['executionId']);return [sys.executable,'-I','-B','-c',CHILD]
        self.kw=dict(journal=str(self.root/'admissions.sqlite'),bearer=self.bearer,backend_rpc_url=f'http://127.0.0.1:{self.rpc.server_port}/rpc',isolated_root=str(self.root),command_factory=command,max_seconds=5)
        self.gateway=Gateway(**self.kw);self.server=self.gateway.server();threading.Thread(target=self.server.serve_forever,daemon=True).start()

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.rpc.shutdown();self.rpc.server_close();self.gateway.close();self.tmp.cleanup()

    def envelope(self,mode=None,seconds=4):
        ticket={'protocol':'employee_work_trace_v1','executionId':str(uuid.uuid4()),'requestId':self.request_id,'traceVersion':1}
        if mode:ticket['testMode']=mode
        return dict(ticket=ticket,deadlineAt=(datetime.now(timezone.utc)+timedelta(seconds=seconds)).isoformat(),callbackCredential='callback-private-'+'c'*32,providerCredential='provider-private-'+'p'*32)

    def http(self,path,body=None,bearer=None):
        req=request.Request(f'http://127.0.0.1:{self.server.server_port}'+path,data=json.dumps(body).encode() if body else None,headers={'Authorization':'Bearer '+(bearer or self.bearer),'Content-Type':'application/json'})
        with request.urlopen(req,timeout=5) as r:return json.load(r)

    def final(self,e):
        for _ in range(150):
            value=self.http('/employee-runs/'+e['ticket']['executionId'])
            if value['state']!='running':return value
            time.sleep(.02)
        self.fail('child did not terminate')

    def test_real_http_stdio_callbacks_and_no_secret_journal(self):
        e=self.envelope();self.assertIn(self.http('/employee-runs',e)['state'],['running','complete']);self.assertEqual(self.final(e)['state'],'complete')
        self.assertEqual([c[0]['method'] for c in self.calls],['recordInput','recordResponse','executeTool','recordOutput'])
        self.assertTrue(all(c[1]=='Bearer '+e['callbackCredential'] for c in self.calls))
        raw=(self.root/'admissions.sqlite').read_bytes();self.assertNotIn(e['providerCredential'].encode(),raw);self.assertNotIn(e['callbackCredential'].encode(),raw)

    def test_backend_failure_category_survives_without_persisting_raw_error_text(self):
        for rejection,expected in [('EMPLOYEE_BUSINESS_ACTION_NOT_GRANTED','EMPLOYEE_BUSINESS_ACTION_NOT_GRANTED'),('token=SECRET-RPC-ERROR','RPC_REJECTED')]:
            self.rejection=rejection;e=self.envelope();self.http('/employee-runs',e);result=self.final(e)
            self.assertEqual(result['state'],'unknown');self.assertEqual(result['code'],expected)
            marked=[c[0] for c in self.calls if c[0]['method']=='markUnknown' and c[0]['executionId']==e['ticket']['executionId']]
            self.assertEqual(marked[-1]['params']['code'],expected)
        self.assertNotIn(b'SECRET-RPC-ERROR',(self.root/'admissions.sqlite').read_bytes())

    def test_concurrent_duplicate_and_changed_auth_never_second_child(self):
        e=self.envelope()
        with concurrent.futures.ThreadPoolExecutor(4) as pool:list(pool.map(lambda _:self.http('/employee-runs',e),range(8)))
        self.assertEqual(self.final(e)['state'],'complete');self.assertEqual(len(self.starts),1)
        changed={**e,'callbackCredential':'changed-'+'z'*32}
        with self.assertRaises(error.HTTPError) as denied:self.http('/employee-runs',changed)
        self.assertEqual(denied.exception.code,409);denied.exception.close();self.assertEqual(len(self.starts),1)

    def test_finished_without_output_is_unknown(self):
        e=self.envelope('fake');self.http('/employee-runs',e);self.assertEqual(self.final(e)['state'],'unknown')
        self.assertEqual([c[0]['method'] for c in self.calls],['markUnknown'])

    def test_closed_child_pipe_releases_capacity_and_records_unknown(self):
        # One slot makes a cleanup leak observable on the next independent turn.
        self.gateway.capacity=threading.BoundedSemaphore(1)
        e=self.envelope('closed_stdin')
        self.http('/employee-runs',e)
        self.assertEqual(self.final(e)['state'],'unknown')
        self.assertEqual(self.http('/employee-runs',e)['state'],'unknown')
        followup=self.envelope()
        self.http('/employee-runs',followup)
        self.assertEqual(self.final(followup)['state'],'complete')
        self.assertEqual(self.starts.count(e['ticket']['executionId']),1)

    def test_deadline_unknown_does_not_restart_on_same_post(self):
        e=self.envelope('hang',seconds=.15);self.http('/employee-runs',e);self.assertEqual(self.final(e)['state'],'unknown')
        # deadline has elapsed: no new admission even when caller resubmits.
        with self.assertRaises(error.HTTPError) as denied:self.http('/employee-runs',e)
        denied.exception.close()
        self.assertEqual(len(self.starts),1)

    def test_restart_marks_inflight_unknown_and_same_id_never_resumes(self):
        e=self.envelope();digest=__import__('hashlib').sha256(json.dumps(e,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        with self.assertRaises(ValueError):Gateway(**self.kw)
        self.gateway.db.execute("INSERT INTO admission VALUES (?,?, 'running',NULL)",(e['ticket']['executionId'],digest))
        # Simulate process exit without calling close (a live close refuses
        # in-flight work). No child was started for this seeded crash point.
        self.gateway.db.close();__import__('fcntl').flock(self.gateway.journal_lock,__import__('fcntl').LOCK_UN);__import__('os').close(self.gateway.journal_lock)
        restarted=Gateway(**self.kw)
        self.gateway=restarted
        self.assertEqual(restarted.admit(e)['state'],'unknown');self.assertEqual(self.starts,[])

    def test_unauthorized_external_urls_listener_and_redirect_rejected(self):
        e=self.envelope()
        with self.assertRaises(error.HTTPError) as denied:self.http('/employee-runs',e,bearer='wrong')
        self.assertEqual(denied.exception.code,401);denied.exception.close();self.assertEqual(self.starts,[])
        with self.assertRaises(ValueError):self.gateway.server('0.0.0.0')
        with self.assertRaises(ValueError):Gateway(**{**self.kw,'backend_rpc_url':'http://example.com/rpc'})
        self.gateway.rpc_url=f'http://127.0.0.1:{self.rpc.server_port}/redirect'
        self.http('/employee-runs',e);self.assertEqual(self.final(e)['state'],'unknown')
        self.assertTrue(all(c[0]['method'] in ['recordInput','markUnknown'] for c in self.calls))

    def test_callback_absolute_deadline_interrupts_waiting_headers(self):
        self.gateway.rpc_url=f'http://127.0.0.1:{self.rpc.server_port}/slow-headers'
        e=self.envelope();started=time.monotonic()
        with self.assertRaises(Exception):self.gateway._rpc(e,'recordInput',{'executionId':e['ticket']['executionId'],'expectedTraceVersion':1},time.time()+.1)
        self.assertLess(time.monotonic()-started,.5)


if __name__=='__main__':unittest.main()
