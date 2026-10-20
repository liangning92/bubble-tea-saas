"""Official SDK1.27 + synthetic loopback AS/MCP only; no real profile or model."""
import base64
import copy
import importlib.metadata
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import threading
import time
import unittest
import uuid
from datetime import datetime, timezone
from dataclasses import replace
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pdca_bridge import Blocked, ProfilePolicy, TOOLS, SCOPES
from pdca_runtime import EndpointPolicy, ExecutorBroker, load_private_config, build_runtime
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes


def b64(raw): return base64.urlsafe_b64encode(raw).decode().rstrip('=')
def number(x): return b64(x.to_bytes((x.bit_length()+7)//8, 'big'))


class Fixture:
    def __init__(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='pdca-runtime-synthetic-')
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.claim_overrides, self.auth_calls, self.tool_calls = {}, 0, []
        self.drop_reports = False
        self.clock = time.time
        self.token_requests = []
        fixture = self
        class AS(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_GET(self):
                if self.path != '/issuer/protocol/openid-connect/certs': self.send_error(404); return
                n = fixture.key.public_key().public_numbers()
                self.send({'keys': [{'kty':'RSA', 'kid':'synthetic-key', 'alg':'RS256', 'use':'sig', 'n':number(n.n), 'e':number(n.e)}]})
            def do_POST(self):
                fixture.auth_calls += 1
                data = parse_qs(self.rfile.read(int(self.headers['Content-Length'])).decode())
                fixture.token_requests.append(data)
                if (self.path != '/issuer/protocol/openid-connect/token' or
                        self.headers.get('Authorization') != 'Basic ' + base64.b64encode(b'synthetic-client:synthetic-secret').decode()):
                    self.send_error(401); return
                now = fixture.clock()
                claims = {'iss':fixture.endpoints.issuer, 'aud':fixture.endpoints.resource, 'azp':'synthetic-client',
                          'scope':' '.join(sorted(SCOPES)), 'iat':now-1, 'exp':now+60, **fixture.claim_overrides}
                signed = b64(json.dumps({'alg':'RS256','kid':'synthetic-key'}).encode()) + '.' + b64(json.dumps(claims).encode())
                token = signed + '.' + b64(fixture.key.sign(signed.encode(), padding.PKCS1v15(), hashes.SHA256()))
                self.send({'access_token':token,'token_type':'Bearer','expires_in':60})
            def send(self, data):
                raw = json.dumps(data).encode(); self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(raw))); self.end_headers(); self.wfile.write(raw)
        self.as_server = ThreadingHTTPServer(('127.0.0.1',0), AS)
        self.as_thread = threading.Thread(target=self.as_server.serve_forever,daemon=True); self.as_thread.start()
        self.sock = socket.socket(); self.sock.bind(('127.0.0.1',0)); self.sock.listen()
        origin = 'http://127.0.0.1:' + str(self.sock.getsockname()[1])
        self.endpoints = EndpointPolicy(origin, 'http://127.0.0.1:'+str(self.as_server.server_port)+'/issuer',origin+'/mcp/agent-tasks')
        now = time.time()
        self.policy = ProfilePolicy('stock-ro-001',origin,origin+'/agent-model/v1','pdca-raw-provider-denied',(),TOOLS,SCOPES,
            {'id':str(uuid.uuid4()), 'startedAt':datetime.fromtimestamp(now-10,timezone.utc).isoformat(),
             'expiresAt':datetime.fromtimestamp(now-10+86400,timezone.utc).isoformat()})
        self.settings = {'profile':self.policy.profile, 'base_url':self.policy.provider_base_url,'api_key':'pdca-raw-provider-denied',
            'fallback_providers':[],'enabled_tools':sorted(TOOLS),'executor_scopes':sorted(SCOPES),
            'auxiliary_models_enabled':False,'memory_enabled':False,'compression_enabled':False}
        self.path = Path(self.tmp.name).resolve()/'client.json'
        self.path.write_text(json.dumps({**vars(self.endpoints), 'client_id':'synthetic-client','client_secret':'synthetic-secret','scopes':sorted(SCOPES)})); self.path.chmod(0o600)
        self.config = load_private_config(self.path,endpoints=self.endpoints,policy=self.policy)
        self.handles=[]; self.server=None

    def start_mcp(self):
        from mcp.server.fastmcp import FastMCP
        from mcp.types import CallToolResult
        import uvicorn
        fixture=self
        mcp=FastMCP('synthetic-only',json_response=True,stateless_http=True,log_level='CRITICAL',streamable_http_path='/mcp/agent-tasks')
        @mcp.tool()
        def store_task_get(taskId:str)->CallToolResult:
            fixture.tool_calls.append(('get',taskId)); return CallToolResult(content=[],structuredContent={'task':{'taskId':taskId,'synthetic':True}})
        @mcp.tool()
        def store_task_report(taskId:str)->CallToolResult:
            fixture.tool_calls.append(('report',taskId)); return CallToolResult(content=[],structuredContent={'task':{'taskId':taskId,'state':'awaiting_review'}})
        app=mcp.streamable_http_app()
        class AuthMiddleware:
            async def __call__(self, scope, receive, send):
                if scope['type']=='http' and not dict(scope['headers']).get(b'authorization',b'').startswith(b'Bearer '):
                    await send({'type':'http.response.start','status':401,'headers':[]}); await send({'type':'http.response.body','body':b''}); return
                if scope['type']=='http' and scope['method']=='POST' and fixture.drop_reports:
                    body=b''
                    while True:
                        message=await receive();body+=message.get('body',b'')
                        if not message.get('more_body'):break
                    data=json.loads(body)
                    replayed=False
                    async def replay():
                        nonlocal replayed
                        if not replayed:
                            replayed=True;return {'type':'http.request','body':body,'more_body':False}
                        return await receive()
                    if data.get('method')=='tools/call' and data.get('params',{}).get('name')=='store_task_report':
                        async def discard(_):pass
                        await app(scope,replay,discard)
                        await send({'type':'http.response.start','status':503,'headers':[]})
                        await send({'type':'http.response.body','body':b''});return
                    await app(scope,replay,send);return
                await app(scope,receive,send)
        self.server=uvicorn.Server(uvicorn.Config(AuthMiddleware(),log_level='critical',lifespan='on'))
        self.mcp_thread=threading.Thread(target=lambda:self.server.run(sockets=[self.sock]),daemon=True); self.mcp_thread.start()
        deadline=time.time()+5
        while not self.server.started and time.time()<deadline: time.sleep(.01)
        assert self.server.started

    def runtime(self,now=time.time):
        handle=build_runtime(self.config,policy=self.policy,journal_directory=Path(self.tmp.name)/'journal',runtime_settings=lambda:copy.deepcopy(self.settings),now=now)
        self.handles.append(handle); return handle

    def close(self):
        for h in self.handles: h.close()
        if self.server:
            self.server.should_exit=True; self.mcp_thread.join(5)
            assert not self.mcp_thread.is_alive()
        self.sock.close(); self.as_server.shutdown(); self.as_server.server_close(); self.as_thread.join(5); self.tmp.cleanup()


class RuntimeTests(unittest.TestCase):
    def setUp(self): self.f=Fixture()
    def tearDown(self): self.f.close()
    def test_private_config_pins_permissions_and_no_secret_repr(self):
        self.assertNotIn('synthetic-secret',repr(self.f.config))
        self.f.path.chmod(0o644)
        with self.assertRaisesRegex(Blocked,'UNSAFE_CLIENT_FILE'): load_private_config(self.f.path,endpoints=self.f.endpoints,policy=self.f.policy)
        self.f.path.chmod(0o600)
        link=self.f.path.parent/'link';link.symlink_to(self.f.path)
        with self.assertRaisesRegex(Blocked,'UNSAFE_CLIENT_FILE'): load_private_config(link,endpoints=self.f.endpoints,policy=self.f.policy)
    def test_signed_exact_executor_token_and_cache(self):
        b=ExecutorBroker(self.f.config,self.f.policy)
        self.assertEqual(b.token(),b.token());self.assertEqual(self.f.auth_calls,1)
        self.assertEqual(self.f.token_requests[0]['resource'],[self.f.endpoints.resource])
        self.assertEqual(set(self.f.token_requests[0]['scope'][0].split()),SCOPES)
    def test_wrong_scope_audience_issuer_client_and_expiry_rejected(self):
        for override in ({'scope':'executor.claim admin'}, {'aud':[self.f.endpoints.resource,'extra']}, {'iss':'https://other.invalid'}, {'azp':'staff'}, {'exp':time.time()-10}):
            with self.subTest(override=override):
                self.f.claim_overrides=override
                with self.assertRaisesRegex(Blocked,'EXECUTOR_TOKEN_REJECTED'): ExecutorBroker(self.f.config,self.f.policy).token()
    def test_refresh_never_extends_pilot(self):
        clock=[time.time()]; self.f.clock=lambda:clock[0]
        b=ExecutorBroker(self.f.config,self.f.policy,now=lambda:clock[0]); b.token(); clock[0]+=58;b.token()
        self.assertEqual(self.f.auth_calls,2)
        clock[0]=self.f.policy.validate(time.time())
        with self.assertRaisesRegex(Blocked,'PILOT_EXPIRED'):b.token()
        self.assertEqual(self.f.auth_calls,2)
    def test_official_sdk_raw_structured_content_and_owned_close(self):
        self.assertEqual(importlib.metadata.version('mcp'),'1.27.0')
        self.f.start_mcp();h=self.f.runtime()
        self.assertEqual(self.f.auth_calls,0);h.start()
        raw=h.raw_call('store_task_get',{'taskId':'synthetic-task'})
        self.assertEqual(raw['structuredContent']['task'],{'taskId':'synthetic-task','synthetic':True})
        h.raw_call('store_task_report',{'taskId':'synthetic-task'})
        self.assertEqual(self.f.tool_calls,[('get','synthetic-task'),('report','synthetic-task')])
        with self.assertRaisesRegex(Blocked,'TOOL_NOT_ALLOWED'):h.raw_call('shell',{})
        h.close();self.assertFalse(h._thread.is_alive())
    def test_runtime_expiry_refuses_new_call_and_disconnects(self):
        self.f.start_mcp();clock=[time.time()];h=self.f.runtime(now=lambda:clock[0]);h.start()
        clock[0]=self.f.policy.validate(time.time())
        with self.assertRaisesRegex(Blocked,'PILOT_EXPIRED'):h.raw_call('store_task_get',{})
        h.close();self.assertFalse(h._thread.is_alive());self.assertEqual(self.f.tool_calls,[])
    def test_lost_mutation_response_is_unknown_without_automatic_retry(self):
        self.f.start_mcp();h=self.f.runtime();h.start();self.f.drop_reports=True
        with self.assertRaisesRegex(Blocked,'NATIVE_OUTCOME_UNKNOWN'):
            h.raw_call('store_task_report',{'taskId':'synthetic-once'})
        self.assertEqual(self.f.tool_calls,[('report','synthetic-once')])
        h.close()
    def test_absolute_deadline_automatically_closes_owned_session(self):
        self.f.start_mcp();end=time.time()+1.5
        self.f.policy=replace(self.f.policy,pilot={'id':str(uuid.uuid4()),
            'startedAt':datetime.fromtimestamp(end-86400,timezone.utc).isoformat(),
            'expiresAt':datetime.fromtimestamp(end,timezone.utc).isoformat()})
        h=self.f.runtime();h.start()
        self.assertTrue(h._closed.wait(4));h._thread.join(1)
        self.assertFalse(h._thread.is_alive())
        with self.assertRaisesRegex(Blocked,'PILOT_EXPIRED'):h.raw_call('store_task_get',{})


if __name__=='__main__':unittest.main()
