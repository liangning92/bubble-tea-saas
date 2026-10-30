"""One native Hermes API process per immutable account/audience compartment.

Uses the installed, pinned Hermes API and SDK directly. No replacement Agent loop,
per-business tools, provider-history emulation, shared default home or paid fallback.
The supervisor owns this process and supplies private transport context on stdin.
"""
from __future__ import annotations
import asyncio
import base64
import hashlib
import json
import os
import re
import shutil
from pathlib import Path
import sys
import threading
import tempfile
from urllib import request
from urllib.parse import urlsplit


def native_provider_config(value, model):
    """Use the upstream SDK's opt-in for providers behind our private proxy.
    MiniMax requires complete reasoning_content on assistant tool-call replays.
    Keep every other account-local setting and the original session journal.
    """
    if not isinstance(value, dict) or not isinstance(value.get('model', {}), dict):
        raise ValueError('NATIVE_MODEL_CONFIG_INVALID')
    tools=value.get('tools', {})
    if not isinstance(tools,dict):raise ValueError('NATIVE_MODEL_CONFIG_INVALID')
    search=tools.get('tool_search', {})
    search=search if isinstance(search,dict) else {}
    # The pinned SDK supports eager loading. One mediated business tool must not
    # be deferred behind search/describe/call wrappers (extra provider rounds).
    return {**value, 'model': {**value.get('model', {}), 'reasoning_echo': model in ('MiniMax-M3.1-Flash', 'MiniMax-M3')},
            'tools':{**tools,'tool_search':{**search,'enabled':'off'}}}


def native_provider_options(model, reasoning_config=None, request_overrides=None):
    """Supply MiniMax's documented wire field through native AIAgent options.
    Omitted Flash effort defaults to max at the provider; store work defaults to
    low without disabling thinking, capping tokens or changing the model.
    """
    if model != 'MiniMax-M3.1-Flash':return {}
    reasoning_config = reasoning_config or {}
    overrides = dict(request_overrides or {})
    effort = overrides.get('reasoning_effort', reasoning_config.get('effort', 'low'))
    if reasoning_config.get('enabled') is False or effort not in ('low', 'medium', 'high', 'xhigh', 'max'):
        raise ValueError('NATIVE_MINIMAX_REASONING_EFFORT_INVALID')
    return {'reasoning_config': {**reasoning_config, 'enabled': True, 'effort': effort},
            'request_overrides': {**overrides, 'reasoning_effort': effort}}


def configure_native_provider(home, model):
    import yaml
    path = home/'config.yaml'
    if path.is_symlink():raise ValueError('NATIVE_MODEL_CONFIG_INVALID')
    value = yaml.safe_load(path.read_text()) if path.exists() else {}
    updated = native_provider_config(value or {}, model)
    if value == updated:return
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w',prefix='.native-provider-',dir=home,delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(updated, stream)
            stream.flush();os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary and temporary.exists():temporary.unlink()


def private_url(value):
    u=urlsplit(value)
    if u.scheme!='http' or u.hostname not in ('127.0.0.1','localhost','host.docker.internal') or u.username or u.password or u.fragment:
        raise ValueError('NATIVE_PRIVATE_TRANSPORT_REQUIRED')
    return value


def materialize_images(value,workspace):
    """Transport inline image bytes into the same private native workspace.
    No business-specific image schema or model-authored verification is involved.
    """
    if isinstance(value,list):return [materialize_images(v,workspace) for v in value]
    if not isinstance(value,dict):return value
    out={}
    for key,item in value.items():
        match=re.fullmatch(r'data:(image/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)',item) if isinstance(item,str) else None
        if match:
            data=base64.b64decode(match[2],validate=True);sha=hashlib.sha256(data).hexdigest()
            directory=workspace/'files';directory.mkdir(parents=True,exist_ok=True)
            file=directory/sha;file.write_bytes(data);file.chmod(0o600)
            if key=='dataUrl':out.update(localPath=str(file),mimeType=match[1],sha256=sha)
            else:out[key]={'localPath':str(file),'mimeType':match[1],'sha256':sha}
        else:out[key]=materialize_images(item,workspace)
    return out


def main():
    config=json.loads(sys.stdin.readline())
    home=Path(config['profileRoot'])
    if not home.is_absolute() or home.is_symlink():raise ValueError('NATIVE_PROFILE_REQUIRED')
    home.mkdir(parents=True,mode=0o700,exist_ok=True)
    workspace=home/'workspace';workspace.mkdir(mode=0o700,exist_ok=True)
    # No owner/default Hermes configuration or credential discovery enters this service.
    os.environ.clear()
    os.environ.update(HOME=str(home),USER='hermes',LOGNAME='hermes',HERMES_HOME=str(home),PATH=config['path'],PYTHONDONTWRITEBYTECODE='1',NO_PROXY='127.0.0.1,localhost,host.docker.internal',TERMINAL_ENV='local',TERMINAL_CWD=str(workspace),XDG_CACHE_HOME=str(home/'.cache'),AGENT_BROWSER_EXECUTABLE_PATH='/usr/bin/chromium')
    (home/'tmp').mkdir(exist_ok=True);os.environ['TMPDIR']=str(home/'tmp')
    if not (home/'config.yaml').exists():(home/'config.yaml').write_text('model:\n  supports_vision: true\n')
    skill=Path(config['repository'])/'hermes'/'store-operations'/'SKILL.md'
    if skill.is_file():
        target=home/'skills'/'store-operations'/'SKILL.md'
        if not target.exists():target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(skill,target)
    os.chdir(workspace)
    sys.path.insert(0,config['hermesSource'])
    sys.path.insert(0,str(Path(config['repository'])/'hermes'))
    from source_verification import verify_source_tree
    verify_source_tree(Path(config['hermesSource']),expected_commit=config['hermesExpectedSha'])
    from aiohttp import web
    from gateway.config import PlatformConfig
    from gateway.platforms.api_server import APIServerAdapter
    from tools.registry import registry
    from tools import approval_context
    from run_agent import AIAgent

    context={};context_lock=threading.RLock()
    def backend(args,**kwargs):
        with context_lock:c=dict(context)
        if not c:raise RuntimeError('NATIVE_CONTEXT_NOT_CONFIGURED')
        call=approval_context._approval_tool_call_id.get('')
        session=approval_context._approval_session_id.get('') or kwargs.get('session_id','')
        if not call or not session:raise RuntimeError('NATIVE_TOOL_IDENTITY_REQUIRED')
        args=dict(args)
        if args.get('action')=='file_write':
            path=Path(args.pop('localPath')).resolve(strict=True)
            if not path.is_relative_to(home.resolve()) or not path.is_file():raise RuntimeError('NATIVE_PRIVATE_FILE_REQUIRED')
            data=path.read_bytes()
            if len(data)>8*1024*1024:raise RuntimeError('NATIVE_ACCOUNT_UPLOAD_LIMIT')
            args['base64']=base64.b64encode(data).decode()
        payload=json.dumps({'jobId':c['jobId'],'sessionId':session,'toolCallId':call,'args':args}).encode()
        req=request.Request(private_url(c['backendUrl']),data=payload,headers={'Authorization':'Bearer '+c['callbackCredential'],'Content-Type':'application/json'})
        with request.urlopen(req,timeout=c.get('requestTimeoutSeconds',120)) as response:result=json.load(response)
        if args.get('action')=='file_read' and result.get('ok'):
            data=base64.b64decode(result.pop('base64'),validate=True)
            if hashlib.sha256(data).hexdigest()!=result['sha256']:raise RuntimeError('NATIVE_FILE_HASH_CHANGED')
            directory=home/'workspace'/'files';directory.mkdir(exist_ok=True)
            file=directory/result['sha256'];file.write_bytes(data);file.chmod(0o600);result['localPath']=str(file)
        artifact=result.get('artifact')
        if isinstance(artifact,dict) and artifact.get('id'):
            try:artifact.update(json.loads(backend({'action':'file_read','fileId':artifact['id']},**kwargs)))
            except Exception:artifact['downloadState']='unavailable_inspect_receipt_do_not_repeat_business_action'
        return json.dumps(materialize_images(result,workspace),ensure_ascii=False)

    registry.register(name='store_backend',toolset='store_backend',schema={
        'name':'store_backend','description':'Discover, describe and execute reviewed store operations under the current requesting account. The server constrains operations, input scope and recipients. Unavailable operations do not grant access through alternative endpoints. File read/write, arbitrary HTTP, SQL and terminal execution are unavailable. Use stored receipts to reconcile uncertain outcomes; never repeat an uncertain mutation. Reviewed handoffs use approved public guidance and do not transfer private history, memory or attachments. Never invent business results or completion.',
        'parameters':{'type':'object','properties':{'action':{'type':'string','enum':['catalog','describe','execute','status','handoff','handoff_status']},'targetChannelId':{'type':'string'},'guideId':{'type':'string'},'targetSourceSeq':{'type':'integer'},'jobId':{'type':'string'},'fileId':{'type':'string'},'localPath':{'type':'string'},'mimeType':{'type':'string'},'search':{'type':'string'},'offset':{'type':'integer'},'limit':{'type':'integer'},'operationId':{'type':'string'},'contractVersion':{'type':'string'},'pathParams':{'type':'object'},'query':{'type':'object'},'body':{'anyOf':[{'type':'object'},{'type':'array','items':{}}]},'files':{'type':'array','items':{'type':'object'}},'receiptId':{'type':'string'}},'required':['action'],'additionalProperties':False}},handler=backend)

    class StoreAPI(APIServerAdapter):
        def _create_agent(self,**kwargs):
            with context_lock:c=dict(context)
            if not c:raise RuntimeError('NATIVE_CONTEXT_NOT_CONFIGURED')
            if kwargs.get('gateway_session_key')!=c['sessionKey']:raise RuntimeError('NATIVE_SESSION_CONTEXT_MISMATCH')
            # Business production has one mediated capability; terminal, generic
            # HTTP, SQL, delegation and file browsing are not business authority.
            toolsets=['store_backend']
            callbacks={k:kwargs.get(k) for k in ('stream_delta_callback','tool_progress_callback','tool_start_callback','tool_complete_callback')}
            options=native_provider_options(c['model'],kwargs.get('reasoning_config'),kwargs.get('request_overrides'))
            agent=AIAgent(model=c['model'],provider='custom',api_mode='chat_completions',base_url=private_url(c['providerBaseUrl']),api_key=c['providerCredential'],fallback_model=None,enabled_toolsets=toolsets,session_id=kwargs.get('session_id'),gateway_session_key=c['sessionKey'],session_db=self._ensure_session_db(),platform='api_server',quiet_mode=True,ephemeral_system_prompt=kwargs.get('ephemeral_system_prompt'),**options,**callbacks)
            agent._hermes_api_runtime={'provider':'custom','model':c['model'],'route_source':'subscribed_store_provider'}
            return agent

        def _http_route_table(self):
            return super()._http_route_table()+[('POST','/native/context',self.configure),('GET','/native/readiness',self.readiness),('POST','/native/admission',self.admission)]

        def authorized(self,req):
            import hmac
            value=req.headers.get('Authorization','')
            return hmac.compare_digest(value,'Bearer '+config['apiKey'])

        def native_work(self):
            from tools.process_registry import process_registry
            runs,pending_completions,delegations=self._readiness_work_counts()
            processes=process_registry.list_sessions()
            blocking=sum(p['status']=='running' and p.get('notify_on_complete',False) for p in processes)
            return {'activeRuns':runs,'activeProcesses':process_registry.count_running(),'blockingProcesses':blocking,'pendingProcessCompletions':pending_completions,'activeDelegations':delegations}

        async def configure(self,req):
            if not self.authorized(req):return web.json_response({'error':'unauthorized'},status=401)
            work=self.native_work()
            if any(work[k] for k in ('activeRuns','blockingProcesses','activeDelegations')):return web.json_response({'error':'native_work_still_active'},status=409)
            v=await req.json()
            required={'jobId','sessionKey','model','providerBaseUrl','providerCredential','backendUrl','callbackCredential'}
            if not required.issubset(v) or v['sessionKey']!='store_'+config['profileKey']:return web.json_response({'error':'native_context_invalid'},status=400)
            private_url(v['providerBaseUrl']);private_url(v['backendUrl'])
            configure_native_provider(home,v['model'])
            with context_lock:context.clear();context.update(v)
            return web.json_response({'ok':True,'profileKey':config['profileKey']})

        async def admission(self,req):
            if not self.authorized(req):return web.json_response({'error':'unauthorized'},status=401)
            v=await req.json();body=v.get('request');key=v.get('key')
            if not isinstance(body,dict) or body.get('session_id')!='store_'+config['profileKey'] or not isinstance(key,str) or not key:
                return web.json_response({'error':'invalid_admission_lookup'},status=400)
            fingerprint=hashlib.sha256(json.dumps({'body':body,'gateway_session_key':body['session_id']},sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
            outcome,record=self._run_idempotency_store.lookup(self._run_idempotency_scope(req),key,fingerprint)
            if outcome=='conflict':return web.json_response({'error':'admission_changed'},status=409)
            return web.json_response({'state':outcome,'run_id':record['run_id'] if record else None})

        async def readiness(self,req):
            if not self.authorized(req):return web.json_response({'error':'unauthorized'},status=401)
            return web.json_response({'status':'ok',**self.native_work(),'profileKey':config['profileKey'],'runtime':'hermes_native_api'})

    adapter=StoreAPI(PlatformConfig(enabled=True,extra={'host':config.get('listenHost','127.0.0.1'),'port':config['port'],'key':config['apiKey'],'model_name':'hermes-agent'}))
    # Conversations serialize within their own compartment; independent compartments
    # are scheduled by the supervisor's configurable global resource capacity.
    adapter._max_concurrent_runs=1
    async def serve():
        import signal
        stop=asyncio.Event();loop=asyncio.get_running_loop()
        for sig in (signal.SIGTERM,signal.SIGINT):loop.add_signal_handler(sig,stop.set)
        if not await adapter.connect():raise RuntimeError('NATIVE_API_START_FAILED')
        print(json.dumps({'state':'listening','profileKey':config['profileKey'],'port':config['port']}),flush=True)
        await stop.wait();await adapter.disconnect()
    asyncio.run(serve())

if __name__=='__main__':main()
