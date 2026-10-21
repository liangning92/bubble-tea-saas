"""Real isolated a719 AIAgent; backend/provider are explicit synthetic callbacks."""
import copy,json,os,pathlib,sys,time,uuid
from types import SimpleNamespace
cfg=json.loads(pathlib.Path(sys.argv[1]).read_text()); base=pathlib.Path(cfg['base']); source=pathlib.Path(cfg['source']); repo=pathlib.Path(cfg['repo'])
sys.path[:0]=[str(source),cfg['site'],str(repo/'hermes')]
# Deny any provider/download access. Only local AF_UNIX lock activity is permitted.
def audit(event,args):
 if event in ('socket.connect','socket.getaddrinfo','subprocess.Popen','os.system','os.posix_spawn'):raise PermissionError('SYNTHETIC_FIXTURE_EXTERNAL_IO_DENIED')
 if event=='open' and isinstance(args[0],(str,bytes,os.PathLike)):
  p=pathlib.Path(os.fsdecode(args[0])).resolve()
  if str(p).startswith('/Users/liangning/') and not any(p.is_relative_to(x) for x in (base,source,repo/'hermes',repo/'output/tool-recognition',pathlib.Path(sys.base_prefix))):raise PermissionError('ACTUAL_USER_STATE_READ_DENIED')
sys.addaudithook(audit)
from pdca_bridge import Bridge,ProfilePolicy,TOOLS,SCOPES,encoded
now=time.time(); stamp={'id':str(uuid.uuid4()),'startedAt':__import__('datetime').datetime.fromtimestamp(now-1,__import__('datetime').timezone.utc).isoformat(),'expiresAt':__import__('datetime').datetime.fromtimestamp(now-1+86400,__import__('datetime').timezone.utc).isoformat()}
# Bootstrap is a test-only factory called by real PluginContext registration.
profile=pathlib.Path(os.environ['HERMES_HOME']); fixture_module=profile/'plugins/pdca-bridge/fixture_runtime.py'
fixture_module.write_text('''import copy,json,time,uuid\nfrom pdca_bridge import Bridge,ProfilePolicy,TOOLS,SCOPES,encoded\nstate=None\ndef build_bridge(ctx):\n return state\n''')
# The plugin invokes this helper after the fake native bindings are assigned below.
sys.path.insert(0,str(fixture_module.parent));import fixture_runtime
refs={'taskCode':'STOCK-RO-001','taskId':str(uuid.uuid4()),'backendRunId':str(uuid.uuid4()),'eventId':str(uuid.uuid4()),'executorId':'synthetic-executor','round':1,'taskVersion':1,'leaseVersion':0}
task={'taskId':refs['taskId'],'taskCode':'STOCK-RO-001','runId':refs['backendRunId'],'round':1,'executorId':refs['executorId'],'taskVersion':1,'leaseVersion':0,'state':'assigned'}
operations=[]; model_requests=[]; receipts={};binding={};responses=[]
policy=ProfilePolicy('stock-ro-001','https://synthetic.invalid','https://synthetic.invalid/agent-model/v1','pdca-raw-provider-denied',(),TOOLS,SCOPES,stamp)
runtime={'profile':'stock-ro-001','base_url':policy.provider_base_url,'api_key':'pdca-raw-provider-denied','fallback_providers':[],'enabled_tools':sorted(TOOLS),'executor_scopes':sorted(SCOPES),'auxiliary_models_enabled':False,'memory_enabled':False,'compression_enabled':False}
def native(name,args):
 operations.append({'name':name,'requestId':args.get('requestId')})
 if args.get('requestId') in receipts:return copy.deepcopy(receipts[args['requestId']])
 if name!='store_task_get':
  assert args['expectedVersion']==task['taskVersion']
  if name=='store_task_claim':
   assert task['state']=='assigned';task.update(state='running',leaseToken=str(uuid.uuid4()),leaseVersion=1)
  elif name=='store_task_read_stock_evidence':task.update(evidenceId=str(uuid.uuid4()),inputSnapshotHash='a'*64,evidence={'synthetic':True})
  elif name=='store_task_report':task.update(state='awaiting_review',report={'id':str(uuid.uuid4()),'version':1,'outcome':args['outcome']})
  task['taskVersion']+=1
 result={'structuredContent':{'task':copy.deepcopy(task)}}
 if 'requestId'in args:receipts[args['requestId']]=copy.deepcopy(result)
 return result
def relay(wire):
 body=json.loads(wire);model_requests.append({'keys':sorted(body),'requestId':body['requestId']})
 if cfg['mode']=='before':
  name='store_task_claim';args={k:body[k]for k in ('taskId','runId','round','expectedVersion')};args['requestId']=str(uuid.uuid4())
 else:
  name='store_task_report';args={k:body[k]for k in ('taskId','runId','round','expectedVersion','leaseVersion','leaseToken','evidenceId','inputSnapshotHash')};args.update(requestId=str(uuid.uuid4()),outcome='completed',rawReport='Synthetic read-only report, requires human review.',sourceRefs=[])
 call={'id':'synthetic-call','type':'function','function':{'name':name,'arguments':encoded(args)}}
 result={'id':'synthetic-relay','object':'chat.completion','created':int(time.time()),'model':'MiniMax-M3.1-Flash','choices':[{'index':0,'message':{'role':'assistant','content':None,'tool_calls':[call]},'finish_reason':'tool_calls'}]}
 responses.append(copy.deepcopy(result));return result
fixture_runtime.state=Bridge(policy,profile/'journal',native,relay,runtime_settings=lambda:runtime)
import run_agent
from agent.turn_tool_validation import validate_tool_calls
agent=run_agent.AIAgent(model='MiniMax-M3.1-Flash',provider='custom',api_key='pdca-raw-provider-denied',base_url=policy.provider_base_url,enabled_toolsets=['pdca_executor_only'],quiet_mode=True,session_id='synthetic-'+cfg['mode'],skip_memory=True,skip_context_files=True,skip_background_review=True,fallback_model=None,max_iterations=8)
snapshot={'valid_tool_names':sorted(agent.valid_tool_names),'schema_names':[x['function']['name']for x in agent.tools]}
# Real registry recognition and denied fallback are checked separately from middleware.
from tools.registry import registry
assert all(registry.get_entry(name) is not None for name in TOOLS)
assert all(json.loads(registry.get_entry(name).handler({}))['status']=='blocked' for name in TOOLS)
if cfg['mode']=='after':
 assert set(agent.valid_tool_names)==set(TOOLS)
 for name in sorted(TOOLS):
  call=SimpleNamespace(id='probe-'+name,function=SimpleNamespace(name=name,arguments='{}'))
  verdict=validate_tool_calls(agent,SimpleNamespace(tool_calls=[call]),'tool_calls',messages=[],conversation_history=[],api_call_count=0,effective_task_id='probe')
  assert verdict.action=='ok',name
result=agent.run_conversation(user_message=encoded({'schemaVersion':1,'references':refs}),task_id='synthetic-task')
before_reject=len(operations)
rejected=json.loads(fixture_runtime.state.tool_execution(session_id=agent.session_id,tool_name='store_task_report',args={},tool_call_id='unregistered-call'))
assert rejected['status']=='blocked' and len(operations)==before_reject
if cfg['mode']=='before':
 assert set(snapshot['valid_tool_names'])=={'tool_search','tool_describe','tool_call'}
 assert result.get('partial') is True and task['state']=='running'
else:
 assert set(snapshot['schema_names'])==set(TOOLS)
 assert result.get('completed') is True and task['state']=='awaiting_review'
assert len(model_requests)==1
assert [x['name'] for x in operations[:3]]==['store_task_get','store_task_claim','store_task_read_stock_evidence']
output={'mode':cfg['mode'],'snapshot':snapshot,'completed':result.get('completed'),'partial':result.get('partial'),'error':result.get('error'),'programTerminal':result.get('final_response','').startswith('HERMES_PROGRAM_'),'nativeState':task['state'],'operations':operations,'modelRequests':model_requests,'unregisteredCallRejected':True,'rawAliasFallbackDenied':True,'actualProvider':False,'actualHermes':True,'defaultStateRead':False}
pathlib.Path(cfg['output']).write_text(json.dumps(output,indent=2))
if hasattr(agent,'close'):agent.close()
