"""Native transport journal/recovery tests. No SDK/model/production requests."""
import hashlib,json,os,tempfile,threading,unittest
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib import request,error
from native_gateway import NativeGateway
from native_api_service import native_provider_config,native_provider_options

class NativeProviderTests(unittest.TestCase):
    def test_reasoning_echo_preserves_native_configuration(self):
        previous={'model':{'supports_vision':True},'memory':{'memory_enabled':True},'tools':{'unrelated':{'setting':True},'tool_search':{'enabled':'auto','listing_max_tokens':4000}}}
        updated=native_provider_config(previous,'MiniMax-M3.1-Flash')
        self.assertTrue(updated['model']['reasoning_echo'])
        self.assertTrue(updated['model']['supports_vision'])
        self.assertEqual(updated['memory'],previous['memory'])
        self.assertNotIn('reasoning_echo',previous['model'])
        self.assertEqual(updated['tools']['tool_search']['enabled'],'off')
        self.assertEqual(updated['tools']['tool_search']['listing_max_tokens'],4000)
        self.assertEqual(updated['tools']['unrelated'],previous['tools']['unrelated'])
        self.assertEqual(previous['tools']['tool_search']['enabled'],'auto')
        self.assertFalse(native_provider_config(updated,'strict-other-model')['model']['reasoning_echo'])
    def test_flash_uses_documented_effort_and_preserves_explicit_native_choices(self):
        value=native_provider_options('MiniMax-M3.1-Flash')
        self.assertEqual(value['request_overrides'],{'reasoning_effort':'low'})
        self.assertEqual(value['reasoning_config'],{'enabled':True,'effort':'low'})
        value=native_provider_options('MiniMax-M3.1-Flash',{'effort':'high'},{'temperature':1})
        self.assertEqual(value['request_overrides'],{'temperature':1,'reasoning_effort':'high'})
        self.assertNotIn('max_tokens',value['request_overrides'])
        self.assertEqual(native_provider_options('another-model'),{})
        for invalid in [{'enabled':False},{'effort':'none'},{'effort':'ultra'}]:
            with self.assertRaisesRegex(ValueError,'NATIVE_MINIMAX_REASONING_EFFORT_INVALID'):
                native_provider_options('MiniMax-M3.1-Flash',invalid)

class NativeGatewayTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();root=Path(self.tmp.name)
        token=root/'token';token.write_text('synthetic-native-gateway-token-000000000');token.chmod(0o600)
        self.cfg={'gatewayBearerFile':str(token),'isolatedRoot':str(root),'maxConcurrency':2,'listenHost':'127.0.0.1','listenPort':0}
        self.gateway=NativeGateway(self.cfg);self.runs={};self.writes=0;self.lost=False
        owner=self
        class Native(BaseHTTPRequestHandler):
            def log_message(self,*a):pass
            def do_GET(self):
                if '/events' in self.path:
                    raw=b'event: tool.complete\ndata: {"event":"tool.complete","tool":"store_backend"}\n\n';self.send_response(200);self.send_header('Content-Type','text/event-stream');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw);return
                self.reply({'status':'completed'} if '/v1/runs/' in self.path else {'activeRuns':0,'activeDelegations':0,'activeProcesses':0})
            def do_POST(self):
                body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                if self.path=='/v1/runs':
                    key=self.headers['Idempotency-Key']
                    if key not in owner.runs:owner.writes+=1;owner.runs[key]='run_'+key
                    if owner.lost:owner.lost=False;self.close_connection=True;return
                    self.reply({'run_id':owner.runs[key],'status':'running'})
                elif self.path=='/native/admission':self.reply({'state':'reused' if body['key'] in owner.runs else 'missing','run_id':owner.runs.get(body['key'])})
                else:self.reply({'ok':True})
            def reply(self,v):
                raw=json.dumps(v).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
        self.native=ThreadingHTTPServer(('127.0.0.1',0),Native);self.nt=threading.Thread(target=self.native.serve_forever,daemon=True);self.nt.start()
        self.gateway.profile=lambda name:{'port':self.native.server_port,'key':'synthetic-profile-key'}
        self.server=self.gateway.server();self.st=threading.Thread(target=self.server.serve_forever,daemon=True);self.st.start()
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.st.join();self.native.shutdown();self.native.server_close();self.nt.join();self.gateway.close();self.tmp.cleanup()
    def call(self,path,body=None,key=None,auth=True):
        headers={'Content-Type':'application/json'}
        if auth:headers['Authorization']='Bearer '+Path(self.cfg['gatewayBearerFile']).read_text()
        if key:headers['Idempotency-Key']=key
        req=request.Request('http://127.0.0.1:'+str(self.server.server_port)+path,data=None if body is None else json.dumps(body).encode(),headers=headers)
        try:
            with request.urlopen(req,timeout=3) as response:return response.status,response.read()
        except error.HTTPError as e:
            with e:return e.code,e.read()
    def path(self,suffix,profile='a'*64):return '/profiles/'+profile+suffix
    def test_auth_and_retired_transport(self):
        self.assertEqual(self.call('/health',auth=False)[0],401)
        self.assertEqual(self.call('/employee-runs',{})[0],410)
        health=json.loads(self.call('/health')[1]);self.assertEqual(health['protocol'],'hermes_native_api_v1');self.assertEqual(health['maxConcurrency'],2)
    def test_durable_identity_prevents_changed_or_duplicate_admission(self):
        body={'input':'read only','session_id':'store_'+'a'*64}
        self.assertEqual(self.call(self.path('/v1/runs'),body,'job-a')[0],200)
        self.assertEqual(self.call(self.path('/v1/runs'),body,'job-a')[0],200);self.assertEqual(self.writes,1)
        self.assertEqual(self.call(self.path('/v1/runs'),{**body,'input':'changed'},'job-a')[0],409)
        self.assertEqual(self.call(self.path('/v1/runs','b'*64),body,'job-a')[0],409)
    def test_lost_response_is_reconciled_without_new_execution(self):
        body={'input':'read only','session_id':'store_'+'a'*64};self.lost=True
        self.assertEqual(self.call(self.path('/v1/runs'),body,'lost')[0],503)
        status,raw=self.call(self.path('/native/admission'),{'key':'lost','request':body});self.assertEqual(status,200);self.assertEqual(json.loads(raw)['run_id'],'run_lost');self.assertEqual(self.writes,1)
        row=self.gateway.db.execute('SELECT state,run_id FROM runs WHERE key=?',('lost',)).fetchone();self.assertEqual(row,('running','run_lost'))
    def test_capacity_is_resource_budget_not_a_tool_allowlist(self):
        for n in range(2):self.assertEqual(self.call(self.path('/v1/runs'),{'input':str(n)},'job-'+str(n))[0],200)
        self.assertEqual(self.call(self.path('/v1/runs'),{'input':'third'},'third')[0],429)
        self.call(self.path('/v1/runs/run_job-0'))
        self.assertEqual(self.call(self.path('/v1/runs'),{'input':'third'},'third')[0],200)
    def test_original_sdk_event_frames_pass_unchanged(self):
        status,raw=self.call(self.path('/v1/runs/run_x/events'));self.assertEqual(status,200);self.assertIn(b'event: tool.complete\ndata:',raw)
    def test_only_one_supervisor_owns_journal(self):
        with self.assertRaises(BlockingIOError):NativeGateway(self.cfg)

    def test_resident_limit_preserves_active_work_and_evicts_only_idle_home(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        profile='b'*64;meta=self.gateway.root/(profile+'.json');meta.write_text(json.dumps({'apiKey':'fixture'}))
        self.cfg['maxResidentProfiles']=1
        value={'State':{'Running':True},'Config':{'Labels':{'com.bubbletea.native-profile':profile}},'NetworkSettings':{'Ports':{'8643/tcp':[{'HostIp':'127.0.0.1','HostPort':str(self.native.server_port)}]}}}
        stopped=[]
        def docker(cmd,**kwargs):
            if cmd[1]=='inspect':return SimpleNamespace(returncode=0,stdout=json.dumps([value]))
            stopped.append(cmd);return SimpleNamespace(returncode=0)
        self.gateway.db.execute("INSERT INTO runs VALUES ('active',?,?,?,'running')",(profile,'digest','run_active'))
        with patch('native_gateway.subprocess.run',side_effect=docker):
            with self.assertRaisesRegex(ValueError,'NATIVE_RESOURCE_BUSY'):self.gateway.make_room('a'*64,{})
            self.assertEqual(stopped,[])
            self.gateway.db.execute("UPDATE runs SET state='completed'")
            self.gateway.make_room('a'*64,{})
        self.assertEqual(len(stopped),1);self.assertEqual(stopped[0][1],'stop');self.assertTrue(meta.exists())

if __name__=='__main__':unittest.main()
