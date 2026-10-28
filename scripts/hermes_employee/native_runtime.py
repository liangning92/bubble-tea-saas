"""Native Hermes conversation runner, separate from the legacy restricted profile.

The host issues account/channel-bound tickets. Native tool implementations and
delegate_task stay Hermes implementations; business calls still execute in the
store backend. This module never enrolls credentials or changes account rights.
Production callers MUST enter an OS sandbox before importing this module.
"""
from __future__ import annotations
import contextvars
import hashlib
import json
import threading
from contextlib import contextmanager
from pathlib import Path
from runtime_capture import canonical_tools, canonical_tools_digest, digest, parse_provider_response, matched_provider_final_text

CURRENT_TRACE = contextvars.ContextVar('native_execution_trace', default=None)

def js_json(value, *, sort_keys=False):
    """Use the existing Node runtime for exact ECMAScript number/key spelling.

    No heuristic float conversion: exponents, negative zero and numbers beyond
    2**53 must match the actual Node backend's JSON.parse/JSON.stringify too.
    Input/output stay on private pipes; no payload appears in argv or logs.
    """
    import shutil,subprocess
    node=shutil.which('node',path='/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin')
    if not node:raise RuntimeError('NATIVE_NODE_SERIALIZER_REQUIRED')
    wire=json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)
    program="const fs=require('node:fs');const v=JSON.parse(fs.readFileSync(0,'utf8'));"
    if sort_keys:
        program+="function canon(v){return Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v};process.stdout.write(JSON.stringify(canon(v)))"
    else:program+="process.stdout.write(JSON.stringify(v))"
    result=subprocess.run([node,'-e',program],
        input=wire,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10)
    if result.returncode:raise RuntimeError('NATIVE_NODE_SERIALIZER_FAILED')
    return result.stdout

def template_native_tools(tools,profile):
    wire=json.dumps(tools,ensure_ascii=False)
    for path in sorted({str(profile),str(profile.resolve())},key=len,reverse=True):wire=wire.replace(path,'$PROFILE')
    return json.loads(wire)

def native_profile_hash(hermes_sha, tools):
    here=Path(__file__).resolve().parent
    body={'profile':'hermes-native-v2','hermesSha':hermes_sha,
        'runtimeSha':hashlib.sha256((here/'native_runtime.py').read_bytes()).hexdigest(),
        'sandboxSha':hashlib.sha256((here/'native_host_stdio.py').read_bytes()).hexdigest(),
        'tools':canonical_tools(tools)}
    return digest(js_json(body,sort_keys=True))

def bind_native_profile(profile, source, model, provider_url):
    import os,sys,types
    os.environ.update(HOME=str(profile/'home'),HERMES_HOME=str(profile),TMPDIR=str(profile/'tmp'),HERMES_TELEMETRY_ENABLED='false')
    sys.path.insert(0,str(source))
    frozen={'model':{'default':model,'provider':'custom','base_url':provider_url},
        'fallback_models':[], 'fallback_providers':[], 'agent':{'max_turns':100,'api_max_retries':0,'environment_probe':False},
        'memory':{'memory_enabled':True,'user_profile_enabled':True},
        'tools':{'tool_search':{'enabled':'off'}},
        'terminal':{'backend':'local','cwd':str(profile/'workspace')},
        'delegation':{'max_concurrent_children':2,'max_iterations':100},
        'auxiliary':{'compression':{'provider':'main'},'title_generation':{'provider':'main'},'review':{'provider':'main'}}}
    loader=types.ModuleType('hermes_cli.env_loader');loader.__file__=str(Path(__file__).resolve())
    loader.load_hermes_dotenv=lambda **kwargs: []
    loader.hydrate_profile_secret_sources=lambda *args,**kwargs:{}
    loader.get_secret_source_values=lambda *args,**kwargs:{}
    loader.get_secret_source=lambda *args,**kwargs:None
    loader.reset_secret_source_cache=lambda *args,**kwargs:None
    loader.format_secret_source_suffix=lambda *args,**kwargs:''
    sys.modules['hermes_cli.env_loader']=loader
    if (source/'agent'/'safe_worker_policy.py').is_file():
        from agent.safe_worker_policy import _bind_worker_config
        _bind_worker_config(frozen)
    else:
        # The deployed pinned Hermes predates its public managed-worker config
        # snapshot. Freeze only configuration readers, retaining its native
        # registry, handlers, memory and delegation implementations unchanged.
        from hermes_cli import config as hermes_config
        import copy
        def merge(base,extra):
            for key,value in extra.items():
                if isinstance(value,dict) and isinstance(base.get(key),dict):merge(base[key],value)
                else:base[key]=copy.deepcopy(value)
            return base
        snapshot=merge(copy.deepcopy(hermes_config.DEFAULT_CONFIG),frozen)
        hermes_config.load_config=lambda *args,**kwargs:copy.deepcopy(snapshot)
        hermes_config.load_config_readonly=lambda *args,**kwargs:copy.deepcopy(snapshot)


class NativeTrace:
    """One execution's state; no process-global current conversation or version."""
    def __init__(self, ticket, port):
        if not ticket.get('native'):
            raise ValueError('NATIVE_TICKET_REQUIRED')
        self.ticket, self.port = ticket, port
        self.version, self.turn, self.phase = ticket['traceVersion'], 0, 'input'
        self.pending, self.final, self.stored = [], None, None
        self.lock = threading.RLock()
        self.children = {}
        self.settled=threading.Event()
        self.active_call = contextvars.ContextVar('native_active_call_' + ticket['executionId'], default=None)

    @contextmanager
    def activate(self):
        token = CURRENT_TRACE.set(self)
        try: yield self
        finally: CURRENT_TRACE.reset(token)

    def rpc(self, method, **params):
        with self.lock:
            result = getattr(self.port, method)({'executionId': self.ticket['executionId'],
                'expectedTraceVersion': self.version, **params})
            if not isinstance(result, dict) or result.get('traceVersion') != self.version + 1:
                raise RuntimeError('NATIVE_TRACE_RECEIPT_VERSION_INVALID')
            self.version = result['traceVersion']
            return result

    def input(self, payload):
        with self.lock:
            if self.phase != 'input': raise RuntimeError('NATIVE_PROVIDER_TURN_ALREADY_RESERVED')
            issued = {t['function']['name']: t for t in self.ticket['tools']}
            actual = payload.get('tools', [])
            if (payload.get('model') != self.ticket['model'] or len({t['function']['name'] for t in actual}) != len(actual)
                    or any(t['function']['name'] not in issued or canonical_tools([t]) != canonical_tools([issued[t['function']['name']]]) for t in actual)):
                raise RuntimeError('NATIVE_TOOL_OR_MODEL_ROUTE_CHANGED')
            self.turn += 1
            admission=self.rpc('recordInput', turn=self.turn, inputHash=digest(js_json(payload)),
                toolSchemaHash=digest(js_json(canonical_tools(actual),sort_keys=True)), isolation=self.ticket['isolation'],
                nativeProfileHash=self.ticket['native']['reviewedProfileHash'], providerRequest=payload)
            if admission.get('maySend') is not True:raise RuntimeError('NATIVE_INPUT_NOT_ADMITTED')
            self.phase = 'response'

    def response(self, record):
        with self.lock:
            if self.phase != 'response': raise RuntimeError('NATIVE_RESPONSE_WITHOUT_INPUT')
            parsed = parse_provider_response(record)
            self.rpc('recordResponse', turn=self.turn, **parsed)
            self.pending = [{'ordinal': n, 'call': c, 'started': False} for n, c in enumerate(parsed['providerMessage'].get('tool_calls', []))]
            self.final = parsed if parsed['finishReason'] == 'stop' else None
            self.phase = 'tools' if self.pending else 'final'

    def call(self, name, args, *, tool_call_id=None):
        matches = [p for p in self.pending if p['call']['function']['name'] == name and json.loads(p['call']['function']['arguments']) == args
                   and (tool_call_id is None or p['call']['id'] == tool_call_id)]
        if len(matches) != 1: raise RuntimeError('NATIVE_TOOL_CALL_BINDING_AMBIGUOUS')
        return matches[0]

    def execute(self, name, args, implementation, *, tool_call_id=None):
        with self.lock:
            if self.phase != 'tools': raise RuntimeError('NATIVE_TOOL_WITHOUT_RESPONSE')
            match = self.call(name, args, tool_call_id=tool_call_id)
            if match['started']: raise RuntimeError('NATIVE_TOOL_ALREADY_STARTED')
            match['started'] = True
            fields = dict(turn=self.turn, callOrdinal=match['ordinal'], toolCallId=match['call']['id'], name=name, args=args)
            if name.startswith('employee_'):
                receipt = self.rpc('executeTool', **fields)
                self.pending.remove(match)
                if not self.pending: self.phase = 'input'
                return json.dumps(receipt['value'], ensure_ascii=False, separators=(',', ':'))
            self.rpc('executeNativeTool', **fields, stage='start')
        # Never hold the parent trace lock while delegate_task waits for children.
        # Each child has its own turn/lock; only framed IPC is serialized.
        token = self.active_call.set(match)
        try:
            with self.activate(): value = implementation()
        finally: self.active_call.reset(token)
        if name=='delegate_task':
            # This transport owns one durable execution, rather than the native
            # CLI's interactive event loop. Retain the native background workers
            # and join their actual receipts before closing this execution; do
            # not discard them when the first status answer ends the turn.
            import time
            deadline=time.monotonic()+self.ticket.get('executionTimeoutMs',600000)/1000
            children=[c for c in self.children.values() if c.ticket['native']['parentToolCallId']==match['call']['id']]
            for child in children:
                if not child.settled.wait(max(0,deadline-time.monotonic())):
                    child.unknown('EMPLOYEE_NATIVE_CHILD_DEADLINE')
            if children:
                dispatched=json.loads(value) if isinstance(value,str) else value
                value=json.dumps({'nativeDispatch':dispatched,'completedChildren':[{'executionId':c.ticket['executionId'],
                    'state':c.phase,'text':c.stored.get('text') if c.stored else None} for c in children]},ensure_ascii=False,separators=(',',':'))
        if isinstance(value, str):
            try: parsed = json.loads(value)
            except ValueError: parsed = value
            wire = value
        else:
            parsed = value
            wire = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        with self.lock:
            self.rpc('executeNativeTool', **fields, stage='complete', value=parsed, wireResult=wire)
            self.pending.remove(match)
            if not self.pending: self.phase = 'input'
        return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, separators=(',', ':'))

    def child(self, child_key, goal):
        with self.lock:
            active = self.active_call.get()
            if not active or active['call']['function']['name'] != 'delegate_task':
                raise RuntimeError('NATIVE_CHILD_WITHOUT_DELEGATE_CALL')
            if child_key in self.children: raise RuntimeError('NATIVE_CHILD_KEY_REUSED')
            result = self.rpc('beginChild', turn=self.turn, toolCallId=active['call']['id'], childKey=child_key, goal=goal)
            ticket = result['ticket']
            lineage = ticket.get('native', {})
            if (lineage.get('delivery') != 'parent_only' or lineage.get('parentExecutionId') != self.ticket['executionId']
                    or lineage.get('parentToolCallId') != active['call']['id']
                    or ticket['compartmentKey'] != self.ticket['compartmentKey']
                    or ticket['model'] != self.ticket['model']
                    or lineage.get('memoryNamespace') != self.ticket['native']['memoryNamespace']):
                raise RuntimeError('NATIVE_CHILD_SCOPE_CHANGED')
            child = NativeTrace(ticket, self.port)
            self.children[child_key] = child
            return child

    def finish(self, presented):
        with self.lock:
            if self.phase != 'final' or self.pending or not self.final:
                raise RuntimeError('NATIVE_FINAL_NOT_RECORDED')
            # Native child final responses are persisted, never published to a channel.
            text = self.final['providerMessage'].get('content')
            if not isinstance(presented, str) or not isinstance(text, str) or not text.strip() or presented.strip() != text.strip():
                raise RuntimeError('NATIVE_FINAL_OUTPUT_CHANGED')
            if any(c.phase not in {'complete','unknown'} for c in self.children.values()):
                raise RuntimeError('NATIVE_CHILDREN_UNRESOLVED')
            self.stored = self.rpc('recordOutput', providerRequestId=self.final['providerRequestId'], providerMessage={'role': 'assistant', 'content': text})
            self.phase = 'complete'
            self.settled.set()
            return self.stored

    def unknown(self, code='EMPLOYEE_NATIVE_RUNTIME_UNCONFIRMED'):
        with self.lock:
            if self.phase == 'complete': return
            for child in self.children.values(): child.unknown(code)
            self.port.markUnknown(self.ticket['executionId'], self.version, code)
            self.phase = 'unknown'
            self.settled.set()


class SerializedRpc:
    """Serialize a complete frame/receipt exchange, not entire conversations."""
    def __init__(self, rpc): self._rpc, self._lock = rpc, threading.RLock()
    def __getattr__(self, method):
        def invoke(params):
            with self._lock: return self._rpc(method, params)
        return invoke
    def markUnknown(self, execution, version, code):
        with self._lock: return self._rpc('markUnknown', {'executionId':execution,'expectedTraceVersion':version,'code':code})


def run_native_ticket(ticket, config, port, *, provider_send):
    """Use actual AIAgent and actual native delegate_task/skills/memory handlers.

    Full native filesystem/terminal tools require OS isolation. A caller-selected
    boolean alone is insufficient: the sandbox must deny the host canary from a
    subprocess too. The launcher creates that canary outside this profile.
    """
    import os, subprocess, sys
    sandbox = config.get('nativeSandbox', {})
    namespace = ticket['native']['memoryNamespace']
    if not isinstance(namespace,str) or len(namespace)!=64 or any(c not in 'abcdef0123456789' for c in namespace):
        raise ValueError('NATIVE_MEMORY_NAMESPACE_INVALID')
    profile = Path(config['isolatedRoot'])/'native_profiles'/namespace
    if Path(sandbox.get('profile', '')) != profile or not sandbox.get('canary'):
        raise ValueError('NATIVE_OS_SANDBOX_REQUIRED')
    probe = subprocess.run(['/bin/cat', sandbox['canary']], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if probe.returncode == 0: raise ValueError('NATIVE_OS_SANDBOX_NOT_ENFORCED')
    try: Path(sandbox['canary']).read_bytes()
    except PermissionError: pass
    else: raise ValueError('NATIVE_OS_SANDBOX_NOT_ENFORCED')
    os.chdir(profile/'workspace')
    source = Path(config['hermesSource'])
    native_tools=[t for t in ticket['tools'] if not t['function']['name'].startswith('employee_')]
    if native_profile_hash(config['hermesExpectedSha'],template_native_tools(native_tools,profile))!=ticket['native']['reviewedProfileHash']:
        raise ValueError('NATIVE_REVIEWED_PROFILE_CHANGED')
    bind_native_profile(profile,source,ticket['model'],config['providerBaseUrl'])
    import httpx, run_agent, model_tools
    from tools.registry import registry
    root=NativeTrace(ticket,port)
    traces={ticket['executionId']:root}
    original_send = httpx.Client.send
    original_async_send=httpx.AsyncClient.send
    from agent import tool_executor
    original_middleware = tool_executor._run_agent_tool_execution_middleware
    original_class=run_agent.AIAgent
    from tools import delegate_tool
    original_build=delegate_tool._build_child_agent
    provider_url=config['providerBaseUrl'].rstrip('/')+'/chat/completions'
    # One provider-call lease across parent/children. Parent waiting on children
    # holds none. Gateway remains one process; the local analyst owns the other
    # existing company slot. No paid route/fallback is exposed to any child.
    provider_slot=threading.BoundedSemaphore(1)

    def capture_send(client,request,**kwargs):
        bearer=request.headers.get('authorization','')
        if config['providerCredential'] and config['providerCredential'] in bearer and str(request.url)!=provider_url:
            raise RuntimeError('NATIVE_PROVIDER_DESTINATION_CHANGED')
        if str(request.url) != provider_url:
            if str(request.url).startswith(config['providerBaseUrl'].rstrip('/')+'/'):
                return httpx.Response(404,json={'error':'native_metadata_unavailable'},request=request)
            return original_send(client,request,**kwargs)  # public web tools, inside OS sandbox
        trace=CURRENT_TRACE.get()
        if trace is None: raise RuntimeError('NATIVE_PROVIDER_CONTEXT_REQUIRED')
        payload=json.loads(request.content)
        with provider_slot:
            trace.input(payload)
            # Backend authenticates the root credential and verifies this lineage.
            request.headers['X-Hermes-Execution-Id']=trace.ticket['executionId']
            kwargs['follow_redirects']=False
            response=provider_send(client,request,**kwargs)
            raw=response.read().decode('utf-8')
            trace.response({'httpStatus':response.status_code,'contentType':response.headers.get('content-type',''),'body':raw})
            return response

    async def capture_async(client,request,**kwargs):
        if str(request.url)==provider_url or config['providerCredential'] in request.headers.get('authorization',''):
            # Native chat-completions uses the sync SDK. Auxiliary async requests
            # need their own execution trace before they may spend subscription.
            raise RuntimeError('NATIVE_ASYNC_PROVIDER_TRACE_REQUIRED')
        return await original_async_send(client,request,**kwargs)

    def managed_execution(agent, **kwargs):
        trace=agent._native_trace
        original_execute=kwargs['execute']
        kwargs['execute']=lambda actual_args: trace.execute(kwargs['function_name'],actual_args,
            lambda:original_execute(actual_args),tool_call_id=kwargs['tool_call_id'])
        return original_middleware(agent,**kwargs)

    class BoundAgent(original_class):
        def run_conversation(self,user_message,*args,**kwargs):
            trace=self._native_trace
            kwargs['task_id']=trace.ticket['executionId']
            if trace.ticket['native']['delivery']=='parent_only':
                user_message=trace.ticket['sealedUserContent']
            with trace.activate():
                try:
                    result=super().run_conversation(user_message,*args,**kwargs)
                    trace.finish(result.get('final_response'))
                    return result
                except BaseException:
                    trace.unknown()
                    raise

    def build_child(*args,**kwargs):
        parent=kwargs.get('parent_agent')
        if parent is None or not hasattr(parent,'_native_trace'): raise RuntimeError('NATIVE_PARENT_BINDING_REQUIRED')
        trace=parent._native_trace
        if (kwargs.get('model') not in (None,trace.ticket['model']) or kwargs.get('override_provider') not in (None,'custom')
            or kwargs.get('override_base_url') not in (None,config['providerBaseUrl'])
            or kwargs.get('override_api_key') not in (None,config['providerCredential'])
            or kwargs.get('override_api_mode') not in (None,'chat_completions')
            or kwargs.get('override_acp_command') or kwargs.get('override_acp_args')):
            raise RuntimeError('NATIVE_CHILD_SUBSCRIPTION_ROUTE_CHANGED')
        active=trace.active_call.get()
        child_trace=trace.child(active['call']['id']+':'+str(kwargs.get('task_index')),kwargs['goal'])
        child=original_build(*args,**kwargs)
        child._native_trace=child_trace
        traces[child_trace.ticket['executionId']]=child_trace
        # A child only returns to its parent. Never publish via a business send.
        child.tools=[t for t in child.tools if t['function']['name']!='employee_send_message']
        return child

    agent=None
    try:
        httpx.Client.send=capture_send
        httpx.AsyncClient.send=capture_async
        tool_executor._run_agent_tool_execution_middleware=managed_execution
        run_agent.AIAgent=BoundAgent
        delegate_tool._build_child_agent=build_child
        for entry in ticket['tools']:
            schema=entry['function'];name=schema['name']
            if name.startswith('employee_'):
                # Dispatcher runs the backend operation, never this placeholder.
                registry.register(name=name,toolset='store-business',schema=schema,
                    handler=lambda *_a,**_kw:(_ for _ in ()).throw(RuntimeError('NATIVE_BUSINESS_DISPATCH_REQUIRED')))
        # Native capabilities remain available; capability availability is dictated
        # by the installed Hermes registry, actual integrations and the sandbox.
        from toolsets import TOOLSETS
        toolsets=list(TOOLSETS)+['store-business']
        agent=BoundAgent(model=ticket['model'],provider='custom',api_mode='chat_completions',
            base_url=config['providerBaseUrl'],api_key=config['providerCredential'],
            enabled_toolsets=toolsets,skip_context_files=False,load_soul_identity=True,
            skip_memory=False,skip_background_review=False,fallback_model=None,
            session_id=ticket['isolation']['sessionId'],quiet_mode=True,
            max_iterations=100,run_budget_seconds=ticket.get('executionTimeoutMs',600000)/1000,
            ephemeral_system_prompt=ticket['instruction'])
        agent._native_trace=root
        # Preserve each installed native handler but only its server-reviewed schema.
        # A deployment manifest mismatch stops before any provider request.
        allowed={t['function']['name']:t for t in ticket['tools']}
        if any(t['function']['name'] not in allowed or canonical_tools([t])!=canonical_tools([allowed[t['function']['name']]]) for t in agent.tools):
            if config.get('diagnosticCatalog') is True:
                import sys
                differences=[{'actual':t,'issued':allowed.get(t['function']['name'])} for t in agent.tools if t['function']['name'] not in allowed or canonical_tools([t])!=canonical_tools([allowed[t['function']['name']]])]
                print('NATIVE_CATALOG_DIFF='+json.dumps(differences,ensure_ascii=False),file=sys.stderr)
            raise RuntimeError('NATIVE_CATALOG_DEPLOYMENT_MISMATCH')
        result=agent.run_conversation(ticket['sealedUserContent'],conversation_history=None)
        return {'stored':root.stored,'native':{'executions':list(traces),'children':len(traces)-1},'result':result}
    except BaseException as error:
        import re
        code=str(error) if re.fullmatch(r'[A-Z0-9_]{1,100}',str(error)) else 'NATIVE_RUNTIME_'+type(error).__name__.upper()
        failed_phase=root.phase
        root.unknown()
        return {'unknown':True,'executionId':ticket['executionId'],'code':code,'phaseBeforeFailure':failed_phase}
    finally:
        if agent is not None: agent.close()
        httpx.Client.send=original_send
        httpx.AsyncClient.send=original_async_send
        tool_executor._run_agent_tool_execution_middleware=original_middleware
        run_agent.AIAgent=original_class
        delegate_tool._build_child_agent=original_build
