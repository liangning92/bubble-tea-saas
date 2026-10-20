"""Child-only isolation guard. Runs unchanged archived Hermes CLI, never real home."""
import json
import os
from pathlib import Path
import runpy
import socket
import sys

spec=json.loads(Path(sys.argv[1]).read_text())
root=Path(spec['root']).resolve(); real=Path(spec['real_source']).resolve()
site=[Path(p).resolve() for p in spec['sites']]
source=Path(spec['source']).resolve()
violations=root/'isolation-violations.jsonl'
def within(p,base):
    try: p.relative_to(base); return True
    except ValueError: return False
def deny(code):
    # Fixed diagnostic only; no attempted content or secret values.
    with violations.open('a') as f: f.write(json.dumps({'code':code})+'\n')
    raise PermissionError(code)
def audit(event,args):
    if event=='open' and isinstance(args[0],(str,bytes,os.PathLike)):
        p=Path(os.fsdecode(args[0])).resolve()
        if within(p,real) and not any(within(p,s) for s in site): deny('ACTUAL_HERMES_SOURCE_OR_PROFILE_READ_DENIED')
        actual_home=Path('/Users/liangning')
        if within(p,actual_home) and not (within(p,root) or any(within(p,s) for s in site) or within(p,Path(sys.base_prefix)) or within(p,Path(__file__).resolve().parent)):
            deny('ACTUAL_USER_HOME_READ_DENIED')
    if event in ('socket.getaddrinfo','socket.connect','socket.bind'):
        host=args[0] if event=='socket.getaddrinfo' else args[1][0] if len(args)>1 and isinstance(args[1],tuple) else None
        if isinstance(host,bytes): host=host.decode('ascii','strict')
        if host is not None and host not in ('127.0.0.1','localhost','::1'): deny('NON_LOOPBACK_NETWORK_DENIED')
    if event in ('subprocess.Popen','os.system','os.posix_spawn'): deny('CHILD_PROCESS_DENIED')
sys.addaudithook(audit)
sys.path[:0]=[str(source),*(str(p) for p in site)]
os.chdir(spec['profile'])
# Observe the actual constructed class; do not replace its constructor or loop.
import run_agent
_original_init=run_agent.AIAgent.__init__
def observed_init(self,*args,**kwargs):
    _original_init(self,*args,**kwargs)
    snapshot={'class':type(self).__name__,'module':type(self).__module__,
              'base_url':getattr(self,'base_url',None),
              'tools':sorted(getattr(self,'valid_tool_names',[]) or []),
              'fallback_count':len(getattr(self,'_fallback_chain',[]) or []),
              'memory_enabled':getattr(self,'_memory_enabled',None),
              'user_profile_enabled':getattr(self,'_user_profile_enabled',None),
              'compression_enabled':getattr(self,'compression_enabled',None),
              'streaming_disabled':getattr(self,'_disable_streaming',None)}
    (root/'actual-agent.json').write_text(json.dumps(snapshot))
    allowed={'store_task_get','store_task_claim','store_task_read_stock_evidence','store_task_report'}
    if (set(snapshot['tools'])!=allowed or snapshot['fallback_count']!=0 or
        snapshot['memory_enabled'] is not False or snapshot['user_profile_enabled'] is not False or
        snapshot['compression_enabled'] is not False or snapshot['streaming_disabled'] is not True):
        deny('ACTUAL_RESOLVED_AGENT_UNSAFE')
run_agent.AIAgent.__init__=observed_init
sys.argv=['hermes','--profile','stock-ro-001','gateway','run']
runpy.run_module('hermes_cli.main',run_name='__main__')
