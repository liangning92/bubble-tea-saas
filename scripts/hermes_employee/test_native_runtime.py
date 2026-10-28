"""Native trace isolation plus a real Hermes/SKD/OS-sandbox regression.
All provider responses use a loopback synthetic server: zero subscription calls.
"""
import copy,json,os,sys,threading,uuid,unittest,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from native_runtime import NativeTrace,SerializedRpc,CURRENT_TRACE,js_json

def ticket(label='root'):
    execution=str(uuid.uuid4());h='a'*64;namespace=hashlib.sha256(label.encode()).hexdigest()
    return {'protocol':'employee_work_trace_v1','executionId':execution,'requestId':str(uuid.uuid4()),'traceVersion':1,
        'compartmentKey':h,'audienceHash':h,'model':'MiniMax-M3.1-Flash','tools':[],
        'isolation':{'protocol':'employee_work_trace_v1','profile':'native_work','sessionId':'native_work_'+hashlib.sha256(execution.encode()).hexdigest(),'compartmentKey':h,'memoryNamespace':namespace,'memoryEnabled':True,'contextFilesEnabled':True,'builtinToolsEnabled':True,'auxiliaryModelsEnabled':False,'sharedHistoryEnabled':False},
        'sealedUserContent':label,'instruction':'Use only the current account conversation. Never send child output directly to a channel.','native':{'memoryNamespace':namespace,
            'reviewedProfileHash':'b'*64,'catalogHash':'c'*64,'delivery':'channel'}}

class Port:
    def __init__(self):self.calls=[];self.versions={};self.lock=threading.Lock()
    def __getattr__(self,method):
        def call(p):
            with self.lock:
                execution=p['executionId'];expected=self.versions.get(execution,1)
                if expected!=p['expectedTraceVersion']:raise AssertionError('crossed execution version')
                self.calls.append((method,copy.deepcopy(p)));self.versions[execution]=expected+1
                result={'traceVersion':expected+1}
                if method=='recordInput':result['maySend']=True
                if method=='recordOutput':result.update(requestId=self.tickets[execution]['requestId'],text=p['providerMessage']['content'])
                return result
        return call
    def markUnknown(self,*args):pass

class NativeIsolationTests(unittest.TestCase):
    def test_wire_hash_uses_exact_backend_ecmascript_number_representation(self):
        value=[1.0,-0.0,1e-7,1e-6,1e21,9007199254740993]
        self.assertEqual(js_json(value),'[1,0,1e-7,0.000001,1e+21,9007199254740992]')
        self.assertEqual(js_json({'\ue000':1,'😀':2},sort_keys=True),'{"😀":2,"\ue000":1}')

    def test_parallel_conversations_keep_their_own_context_and_reply(self):
        port=Port();a,b=ticket('conversation-A'),ticket('conversation-B');port.tickets={t['executionId']:t for t in [a,b]}
        traces=[NativeTrace(t,port) for t in [a,b]];barrier=threading.Barrier(2);results=[];errors=[]
        def run(trace):
            try:
                with trace.activate():
                    barrier.wait(timeout=2)
                    self.assertIs(CURRENT_TRACE.get(),trace)
                    payload={'model':trace.ticket['model'],'messages':[{'role':'user','content':trace.ticket['sealedUserContent']}],'tools':[]}
                    trace.input(payload)
                    message={'role':'assistant','content':'Reply only for '+trace.ticket['sealedUserContent']}
                    trace.response({'httpStatus':200,'contentType':'application/json','body':json.dumps({'id':trace.ticket['executionId'],'choices':[{'finish_reason':'stop','message':message}]})})
                    results.append(trace.finish(message['content']))
                self.assertIsNone(CURRENT_TRACE.get())
            except BaseException as e:errors.append(e)
        workers=[threading.Thread(target=run,args=(t,)) for t in traces]
        for w in workers:w.start()
        for w in workers:w.join(3)
        self.assertFalse(errors);self.assertEqual(len(results),2)
        for result in results:
            expected=next(t for t in [a,b] if t['requestId']==result['requestId'])
            self.assertEqual(result['text'],'Reply only for '+expected['sealedUserContent'])

    def test_ambiguous_same_name_tool_calls_require_exact_id(self):
        trace=NativeTrace(ticket(),Port());trace.phase='tools'
        trace.pending=[{'ordinal':i,'call':{'id':str(i),'function':{'name':'memory','arguments':'{}'}},'started':False} for i in range(2)]
        with self.assertRaisesRegex(RuntimeError,'AMBIGUOUS'):trace.call('memory',{})
        self.assertEqual(trace.call('memory',{},tool_call_id='1')['ordinal'],1)

    def test_forged_or_late_response_cannot_become_a_reply(self):
        trace=NativeTrace(ticket(),Port())
        with self.assertRaisesRegex(RuntimeError,'WITHOUT_INPUT'):trace.response({})
        with self.assertRaisesRegex(RuntimeError,'NOT_RECORDED'):trace.finish('some other answer')

    def test_ipc_pairs_do_not_interleave_under_child_concurrency(self):
        seen=[];active=0;lock=threading.Lock()
        def rpc(method,p):
            nonlocal active
            with lock:active+=1;self.assertEqual(active,1)
            seen.append(p['executionId'])
            with lock:active-=1
            return p
        port=SerializedRpc(rpc)
        workers=[threading.Thread(target=lambda i=i:[port.recordInput({'executionId':i}) for _ in range(20)]) for i in range(4)]
        for w in workers:w.start()
        for w in workers:w.join()
        self.assertEqual(len(seen),80)

def real_native_smoke(source,manifest_file):
    import tempfile,subprocess,http.server,time,hashlib
    manifest=json.loads(Path(manifest_file).read_text());events=[];requests=[];root_ticket=ticket('root');fixture_paths={}
    root_ticket['native'].update(reviewedProfileHash=manifest['reviewedProfileHash'],catalogHash='c'*64,memoryNamespace=hashlib.sha256(b'native-smoke-account-A-channel-A').hexdigest())
    root_ticket['isolation']['memoryNamespace']=root_ticket['native']['memoryNamespace']
    root_ticket['tools']=manifest['tools'];root_ticket['executionTimeoutMs']=90000
    class Model(http.server.BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def do_POST(self):
            payload=json.loads(self.rfile.read(int(self.headers['content-length'])))
            execution=self.headers.get('X-Hermes-Execution-Id');requests.append((execution,payload))
            own=[p for e,p in requests if e==execution]
            calls=None
            if fixture_paths.get('reload'):
                calls=None
            elif execution==root_ticket['executionId'] and len(own)==1:
                calls=[{'id':'memory-1','type':'function','function':{'name':'memory','arguments':json.dumps({'target':'memory','action':'add','content':'NATIVE-ACCOUNT-A-ONLY: gunakan kalimat singkat.'})}},
                    {'id':'skills-1','type':'function','function':{'name':'skills_list','arguments':'{}'}}]
            elif execution==root_ticket['executionId'] and len(own)==2:
                calls=[{'id':'delegate-1','type':'function','function':{'name':'delegate_task','arguments':json.dumps({'tasks':[{'goal':'Child A: reply A only'},{'goal':'Child B: reply B only'}]})}}]
            elif execution!=root_ticket['executionId'] and len(own)==1:
                content=json.dumps(payload['messages'],ensure_ascii=False)
                path=fixture_paths['other'] if 'Child B:' in content else fixture_paths['own']
                calls=[{'id':'read-'+execution,'type':'function','function':{'name':'read_file','arguments':json.dumps({'path':path})}}]
            message={'role':'assistant','content':None if calls else ('ROOT-A-ONLY' if execution==root_ticket['executionId'] else 'CHILD-'+execution)}
            if calls:message['tool_calls']=calls
            response={'id':'response-'+execution+'-'+str(len(own)),'model':payload['model'],'choices':[{'index':0,'finish_reason':'tool_calls' if calls else 'stop','message':message}]}
            if payload.get('stream'):
                delta={**message}
                if calls:delta['tool_calls']=[{'index':i,**c} for i,c in enumerate(calls)]
                base={'id':response['id'],'model':payload['model'],'object':'chat.completion.chunk','created':1}
                raw=('data: '+json.dumps({**base,'choices':[{'index':0,'delta':delta,'finish_reason':None}]})+'\n\ndata: '+json.dumps({**base,'choices':[{'index':0,'delta':{},'finish_reason':response['choices'][0]['finish_reason']}]})+'\n\ndata: [DONE]\n\n').encode();content='text/event-stream'
            else:raw=json.dumps(response).encode();content='application/json'
            self.send_response(200);self.send_header('content-type',content);self.send_header('content-length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Model);threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with tempfile.TemporaryDirectory(prefix='native-hermes-real-') as folder:
            root=Path(folder).resolve();os.chmod(root,0o700)
            profile=root/'native_profiles'/root_ticket['native']['memoryNamespace']
            profile.parent.mkdir(mode=0o700);profile.mkdir(mode=0o700)
            (profile/'workspace').mkdir(mode=0o700)
            (profile/'workspace'/'own.txt').write_text('ACCOUNT-A-ALLOWED')
            other=root/'native_profiles'/('f'*64);other.mkdir(mode=0o700)
            (other/'private.txt').write_text('ACCOUNT-B-PRIVATE-DO-NOT-LOAD')
            fixture_paths.update(own=str(profile/'workspace'/'own.txt'),other=str(other/'private.txt'))
            root_ticket['tools']=json.loads(json.dumps(manifest['tools']).replace('$PROFILE',str(profile)))
            config={'isolatedRoot':str(root),'hermesSource':str(Path(source).resolve()),'hermesExpectedSha':manifest['hermesSha'],
                'providerBaseUrl':f'http://127.0.0.1:{server.server_port}/v1','providerCredential':'synthetic-loopback-no-paid-model','diagnosticCatalog':True}
            log=(root/'stderr.log').open('w+')
            process=subprocess.Popen([sys.executable,'-I','-B',str(Path(__file__).with_name('host_stdio.py'))],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=log,text=True)
            try:
                process.stdin.write(json.dumps({'ticket':root_ticket,'config':config})+'\n');process.stdin.flush()
                versions={root_ticket['executionId']:1};tickets={root_ticket['executionId']:root_ticket};finished=None
                for line in process.stdout:
                    frame=json.loads(line);method,p=frame['method'],frame['params'];events.append(frame)
                    if method=='finished':finished=p;continue
                    execution=p['executionId'];assert p['expectedTraceVersion']==versions[execution]
                    if method=='markUnknown':reply=None
                    else:
                        versions[execution]+=1;reply={'traceVersion':versions[execution]}
                        if method=='recordInput':reply['maySend']=True
                        if method=='beginChild':
                            child=copy.deepcopy(root_ticket);child.update(executionId=str(uuid.uuid4()),requestId=str(uuid.uuid4()),traceVersion=1,sealedUserContent=json.dumps({'goal':p['goal']}))
                            child['native'].update(delivery='parent_only',parentExecutionId=execution,parentToolCallId=p['toolCallId'])
                            child['isolation'].update(memoryEnabled=False,contextFilesEnabled=False,sessionId='native_work_'+hashlib.sha256(child['executionId'].encode()).hexdigest())
                            versions[child['executionId']]=1;tickets[child['executionId']]=child;reply['ticket']=child
                        if method=='recordOutput':reply.update(requestId=tickets[execution]['requestId'],text=p['providerMessage']['content'])
                    process.stdin.write(json.dumps({'result':reply})+'\n');process.stdin.flush()
                code=process.wait(timeout=10);log.seek(0);diagnostic=log.read()
                assert code==0,(code,diagnostic[-6000:])
                assert finished and not finished.get('unknown'),(finished,diagnostic[-6000:])
                assert finished['stored']['text']=='ROOT-A-ONLY'
                assert finished['native']['children']==2,(finished,diagnostic[-6000:])
                memory=list((root/'native_profiles'/root_ticket['native']['memoryNamespace']).rglob('MEMORY.md'))
                assert any('NATIVE-ACCOUNT-A-ONLY' in p.read_text() for p in memory)
                outputs=[e for e in events if e['method']=='recordOutput'];assert len(outputs)==3
                inputs=json.dumps(requests,ensure_ascii=False)
                assert 'ACCOUNT-A-ALLOWED' in inputs
                assert 'ACCOUNT-B-PRIVATE-DO-NOT-LOAD' not in inputs
                read_results=[e['params']['value'] for e in events if e['method']=='executeNativeTool' and e['params'].get('stage')=='complete' and e['params'].get('name')=='read_file']
                assert len(read_results)==2
                assert any('denied' in json.dumps(v).lower() or 'not permitted' in json.dumps(v).lower() for v in read_results),read_results
                fixture_paths['reload']=True
                root_ticket.update(executionId=str(uuid.uuid4()),requestId=str(uuid.uuid4()),sealedUserContent='This is a new question in the same account conversation. Use its stable preferences.')
                root_ticket['isolation']['sessionId']='native_work_'+hashlib.sha256(root_ticket['executionId'].encode()).hexdigest()
                second=subprocess.Popen([sys.executable,'-I','-B',str(Path(__file__).with_name('host_stdio.py'))],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=log,text=True)
                try:
                    second.stdin.write(json.dumps({'ticket':root_ticket,'config':config})+'\n');second.stdin.flush();v=1;second_done=None
                    for line in second.stdout:
                        frame=json.loads(line);method,p=frame['method'],frame['params']
                        if method=='finished':second_done=p;continue
                        assert p['executionId']==root_ticket['executionId'] and p['expectedTraceVersion']==v
                        assert method!='markUnknown',p
                        v+=1;reply={'traceVersion':v}
                        if method=='recordInput':reply['maySend']=True
                        if method=='recordOutput':reply.update(requestId=root_ticket['requestId'],text=p['providerMessage']['content'])
                        second.stdin.write(json.dumps({'result':reply})+'\n');second.stdin.flush()
                    assert second.wait(timeout=10)==0 and second_done and not second_done.get('unknown'),second_done
                    reloads=[p for e,p in requests if e==root_ticket['executionId']]
                    assert len(reloads)==1
                    assert 'NATIVE-ACCOUNT-A-ONLY' in json.dumps(reloads[0]['messages'])
                    assert 'ACCOUNT-B-PRIVATE-DO-NOT-LOAD' not in json.dumps(reloads)
                finally:
                    if second.poll() is None:second.kill();second.wait()
                return {'realHermes':True,'hermesSha':manifest['hermesSha'],'nativeMemoryWritten':True,'nativeMemoryReloadedInFreshQuestionProcess':True,'nativeSkillsListed':True,'nativeChildren':2,'ownFileReadable':True,'otherAccountFileDenied':True,'providerRequests':len(requests),'providerRequestKeys':sorted(set(k for _,p in requests for k in p)),'paidModelCalls':0,'productionWrites':0,'newSpendCents':0,'outputsBoundToExecutions':True}
            finally:
                if process.poll() is None:process.kill();process.wait()
                log.close()
    finally:server.shutdown();server.server_close()

if __name__=='__main__':
    if sys.argv[1:2]==['--real']:
        print(json.dumps(real_native_smoke(sys.argv[2],sys.argv[3]),ensure_ascii=False))
    else:unittest.main()
