#!/usr/bin/env python3
"""Native upstream API/SDK acceptance against a synthetic provider, no paid IO."""
import argparse,base64,hashlib,importlib.util,json,os,pathlib,shutil,socket,subprocess,tempfile,threading,time,sys
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib import request,error
ROOT=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--artifact',required=True);args=p.parse_args();artifact=pathlib.Path(args.artifact).resolve();metadata=json.loads((artifact/'image.json').read_text());image=metadata['imageId']
run=os.environ['BT_TEST_RUN'];assert run.startswith('bt-test-') and os.environ['BT_TEST_LABEL']=='com.bubbletea.test-run='+run
base=pathlib.Path(tempfile.mkdtemp(prefix=run+'-',dir='/tmp'));profile='a'*64;key='synthetic-native-api-authentication-key-00000';calls=[];backend=[]
class Provider(BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_POST(self):
  body=json.loads(self.rfile.read(int(self.headers['Content-Length'])));calls.append(body)
  with open(artifact/'synthetic-provider.log','a') as log:log.write(json.dumps({'path':self.path,'tools':len(body.get('tools',[])),'stream':body.get('stream'),'reasoningEffort':body.get('reasoning_effort')})+'\n')
  if self.path=='/backend':backend.append(body);return self.reply({'ok':True,'operations':[{'operationId':'GET /api/products'}]})
  if self.path=='/api/show':return self.reply({'model_info':{'minimax.context_length':200000},'capabilities':['completion','tools','vision']})
  names=[t.get('function',{}).get('name') for t in body.get('tools',[])]
  seen={m.get('tool_call_id') for m in body.get('messages',[]) if m.get('role')=='tool'}
  def tool(name,args,call_id):return {'role':'assistant','content':None,'reasoning_content':'SYNTHETIC_REASONING_'+call_id,'tool_calls':[{'id':call_id,'type':'function','function':{'name':name,'arguments':json.dumps(args)}}]}
  reason='tool_calls'
  if not names:message={'role':'assistant','content':'NATIVE_PROBE_OK'};reason='stop'
  elif 'call_native_fixture' in seen:message={'role':'assistant','content':'NATIVE_ACCEPTANCE_PASSED'};reason='stop'
  elif 'store_backend' in names:message=tool('store_backend',{'action':'catalog','search':'products'},'call_native_fixture')
  elif 'call_native_describe' in seen:message=tool('tool_call',{'name':'store_backend','arguments':{'action':'catalog','search':'products'}},'call_native_fixture')
  elif 'call_native_search' in seen:message=tool('tool_describe',{'names':['store_backend']},'call_native_describe')
  else:message=tool('tool_search',{'queries':['store_backend'],'limit':5},'call_native_search')
  if body.get('stream'):
   delta=dict(message);delta.pop('role',None)
   if 'tool_calls' in delta:delta['tool_calls']=[dict(t,index=i) for i,t in enumerate(delta['tool_calls'])]
   chunk={'id':'synthetic-native-provider','object':'chat.completion.chunk','created':1,'model':body['model'],'choices':[{'index':0,'delta':{'role':'assistant',**delta},'finish_reason':None}]}
   final={**chunk,'choices':[{'index':0,'delta':{},'finish_reason':reason}],'usage':{'prompt_tokens':10,'completion_tokens':10,'total_tokens':20}}
   raw=('data: '+json.dumps(chunk)+'\n\ndata: '+json.dumps(final)+'\n\ndata: [DONE]\n\n').encode()
   self.send_response(200);self.send_header('Content-Type','text/event-stream');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
  else:self.reply({'id':'synthetic-native-provider','object':'chat.completion','model':body['model'],'choices':[{'index':0,'message':message,'finish_reason':reason}],'usage':{'prompt_tokens':10,'completion_tokens':10,'total_tokens':20}})
 def reply(self,v):
  raw=json.dumps(v).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
server=ThreadingHTTPServer(('0.0.0.0',0),Provider);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
name=run+'-native-api';home=base/'home';home.mkdir();child=None
loaded=subprocess.run(['docker','image','inspect',image],capture_output=True).returncode!=0
if metadata.get('imageTarSha256'):
 with (artifact/'native-image.tar').open('rb') as stream:assert hashlib.file_digest(stream,'sha256').hexdigest()==metadata['imageTarSha256'],'NATIVE_IMAGE_TAR_CHANGED'
if loaded:subprocess.run(['docker','load','-i',str(artifact/'native-image.tar')],check=True,stdout=subprocess.DEVNULL)
if metadata.get('sourceSha'):
 revision=subprocess.check_output(['docker','image','inspect',image,'--format','{{index .Config.Labels "org.opencontainers.image.revision"}}'],text=True).strip()
 assert revision==metadata['sourceSha'],'NATIVE_IMAGE_SOURCE_CHANGED'
def call(path,body=None):
 req=request.Request('http://127.0.0.1:'+str(port)+path,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','X-Hermes-Session-Key':'store_'+profile,**({'Idempotency-Key':'native-sdk-real-fixture'} if path=='/v1/runs' else {})})
 with request.urlopen(req,timeout=120) as response:return json.load(response)
try:
 log=open(artifact/'native-api-test.log','wb')
 child=subprocess.Popen(['docker','run','--rm','--name',name,'--label',os.environ['BT_TEST_LABEL'],'--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--tmpfs','/tmp:rw,nosuid,nodev,size=256m','--shm-size=256m',*(['--add-host','host.docker.internal:host-gateway'] if sys.platform=='linux' else []),'-p','127.0.0.1:'+str(port)+':8643','--mount','type=bind,src='+str(home)+',dst=/home/hermes','-i',image],stdin=subprocess.PIPE,stdout=log,stderr=log)
 config={'profileRoot':'/home/hermes','profileKey':profile,'port':8643,'listenHost':'0.0.0.0','apiKey':key,'repository':'/opt/store-adapter','hermesSource':'/opt/hermes','hermesExpectedSha':metadata['hermesSha'],'path':'/opt/venv/bin:/usr/local/bin:/usr/bin:/bin'}
 child.stdin.write(json.dumps(config).encode()+b'\n');child.stdin.close();log.close()
 for _ in range(180):
  if child.poll() is not None:raise RuntimeError('NATIVE_API_TEST_START_FAILED: see native-api-test.log')
  try:call('/health');break
  except Exception:time.sleep(.5)
 else:raise RuntimeError('NATIVE_API_TEST_START_TIMEOUT')
 capabilities=call('/v1/capabilities');assert capabilities
 for relative,sha in metadata.get('adapterFiles',{}).items():
  actual=subprocess.check_output(['docker','exec',name,'sha256sum','/opt/store-adapter/'+relative],text=True).split()[0]
  assert actual==sha,'NATIVE_ADAPTER_CHANGED: '+relative
 context={'jobId':'synthetic-job','sessionKey':'store_'+profile,'model':'MiniMax-M3.1-Flash','providerBaseUrl':'http://host.docker.internal:'+str(server.server_port)+'/v1','providerCredential':'synthetic-provider','backendUrl':'http://host.docker.internal:'+str(server.server_port)+'/backend','callbackCredential':'synthetic-callback'}
 assert call('/native/context',context)['ok']
 body={'input':'NATIVE_TOOL_TEST: discover product routes only, never mutate.','session_id':'store_'+profile}
 result=call('/v1/runs',body);run_id=result['run_id'];assert call('/v1/runs',body)['run_id']==run_id
 for _ in range(120):
  result=call('/v1/runs/'+run_id)
  if result['status'] in ('completed','failed','interrupted','cancelled'):break
  time.sleep(.5)
 assert result['status']=='completed',result
 assert result['output']=='NATIVE_ACCEPTANCE_PASSED',result
 main_requests=[c for c in calls if c.get('tools')]
 replayed=[m for c in main_requests for m in c.get('messages',[]) if m.get('role')=='assistant' and m.get('tool_calls')]
 wire={'mainRequests':len(main_requests),'efforts':sorted({str(c.get('reasoning_effort')) for c in main_requests}),'replayedToolTurns':len(replayed),'missingOrChangedReasoning':sum(m.get('reasoning_content')!='SYNTHETIC_REASONING_'+m['tool_calls'][0]['id'] for m in replayed)}
 (artifact/'native-wire-verification.json').write_text(json.dumps(wire,indent=2))
 assert all(t.get('function',{}).get('name')=='store_backend' for c in main_requests for t in c.get('tools',[])), 'NATIVE_UNREVIEWED_TOOL_EXPOSED'
 assert main_requests and all(c.get('reasoning_effort')=='low' for c in main_requests),'MINIMAX_EFFORT_NOT_SENT'
 assert replayed,'NO_NATIVE_TOOL_REPLAY'
 assert all(m.get('reasoning_content')=='SYNTHETIC_REASONING_'+m['tool_calls'][0]['id'] for m in replayed),'MINIMAX_REASONING_CHAIN_STRIPPED'
 assert len(backend)==1,backend
 assert backend[0]['toolCallId'];assert backend[0]['sessionId']
 assert call('/native/admission',{'key':'native-sdk-real-fixture','request':body})['run_id']==run_id
 result={'state':'passed','upstreamHermesSha':metadata['hermesSha'],'baseImageId':image,'adapterOverlay':False,'adapterFiles':metadata.get('adapterFiles',{}),'nativeRunId':run_id,'nativeToolCount':max(len(c.get('tools',[])) for c in calls),'providerCalls':len(calls)-len(backend),'backendCalls':len(backend),'reasoningEchoTurnsVerified':len(replayed),'reasoningEffort':'low','production':False,'paidProviderCalls':0,'testBatch':run}
 (artifact/'native-api-acceptance.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
finally:
 subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 if child:child.wait(timeout=30)
 server.shutdown();server.server_close();thread.join();shutil.rmtree(base)
 if loaded:subprocess.run(['python3',str(ROOT/'scripts/with-docker-test.py'),'--cleanup',metadata['testBatch']],check=True)
