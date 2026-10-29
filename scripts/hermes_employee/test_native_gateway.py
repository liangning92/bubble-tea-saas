"""Native transport journal/recovery tests. No SDK/model/production requests."""
import hashlib,json,os,tempfile,threading,unittest
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib import request,error
from native_gateway import NativeGateway

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

if __name__=='__main__':unittest.main()
