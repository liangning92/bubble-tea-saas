"""Read the installed Hermes catalog without inference or external services.
Run in a fresh interpreter from the existing Hermes venv. Output has no keys.
"""
import contextlib,json,os,subprocess,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from native_runtime import bind_native_profile,native_profile_hash,canonical_tools,template_native_tools
source=Path(sys.argv[1]).resolve();destination=Path(sys.argv[2]).resolve()
sha=subprocess.check_output(['/usr/bin/git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
with tempfile.TemporaryDirectory(prefix='native-catalog-') as temp:
    profile=Path(temp)
    for name in ['home','tmp','workspace']:(profile/name).mkdir()
    os.environ.clear();os.environ.update(PATH='/usr/bin:/bin',PYTHONDONTWRITEBYTECODE='1',NO_PROXY='*')
    bind_native_profile(profile,source,'MiniMax-M3.1-Flash','http://127.0.0.1:49191/v1')
    import httpx
    httpx.Client.send=lambda *a,**kw:(_ for _ in ()).throw(RuntimeError('CATALOG_NETWORK_DISABLED'))
    httpx.AsyncClient.send=lambda *a,**kw:(_ for _ in ()).throw(RuntimeError('CATALOG_NETWORK_DISABLED'))
    with contextlib.redirect_stdout(sys.stderr):
        from run_agent import AIAgent
        from toolsets import TOOLSETS
        agent=AIAgent(model='MiniMax-M3.1-Flash',provider='custom',api_mode='chat_completions',base_url='http://127.0.0.1:49191/v1',api_key='manifest-no-inference',
            enabled_toolsets=list(TOOLSETS),skip_memory=False,skip_context_files=False,quiet_mode=True,fallback_model=None,session_id='native-manifest')
        tools=canonical_tools(template_native_tools(agent.tools,profile))
        agent.close()
    result={'version':1,'profile':'hermes-native-v2','hermesSha':sha,'reviewedProfileHash':native_profile_hash(sha,tools),'tools':tools}
    destination.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'manifest':str(destination),'tools':len(tools),'names':[t['function']['name'] for t in tools],'modelCalls':0,'newSpendCents':0}))
