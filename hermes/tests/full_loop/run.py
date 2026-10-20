#!/usr/bin/env python3
"""One full real archived-Hermes loop; run through with-docker-test.py.

Requires prebuilt API dist, a temporary Python3.11 SDK1.27 venv and the existing
Hermes read-only dependency directory. Never installs into actual Hermes.
"""
import argparse
from datetime import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import tarfile
import tempfile
import time

ROOT=Path(__file__).resolve().parents[3]
PIN='a7198a8855ad98681114ff5138eb01fe132a62e7'
REAL=Path('/Users/liangning/.hermes/hermes-agent')
OUT=ROOT/'output/hermes-full-loop'

def port():
    with socket.socket() as s: s.bind(('127.0.0.1',0)); return s.getsockname()[1]
def wait_file(p,process,timeout=40):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        if p.exists(): return json.loads(p.read_text())
        if process.poll() is not None: raise RuntimeError('OWNED_CHILD_EXITED_BEFORE_READY')
        time.sleep(.1)
    raise RuntimeError('OWNED_CHILD_START_TIMEOUT')
def command(args,**kw): return subprocess.run(args,check=True,cwd=ROOT,**kw)
def private(path,text): path.write_text(text); path.chmod(0o600)
def kill(p):
    if p and p.poll() is None:
        os.killpg(p.pid,signal.SIGTERM)
        try: p.wait(timeout=10)
        except subprocess.TimeoutExpired: os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=5)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--sdk-python',required=True);args=parser.parse_args()
    run=os.environ.get('BT_TEST_RUN','');assert run.startswith('bt-test-'),'Use scripts/with-docker-test.py'
    sdk=Path(args.sdk_python).resolve();assert sdk.is_file()
    # Resolve symlinks only for validation, use the venv path to discover its owned site.
    sdk_venv=Path(args.sdk_python).parent.parent
    sdk_sites=list((sdk_venv/'lib').glob('python3.11/site-packages'))
    hermes_sites=REAL/'venv/lib/python3.11/site-packages'
    assert len(sdk_sites)==1 and hermes_sites.is_dir(),'PYTHON311_DEPENDENCIES_REQUIRED'
    assert command(['/usr/bin/git','-C',str(REAL),'rev-parse','HEAD'],capture_output=True,text=True).stdout.strip()==PIN
    base=Path(tempfile.mkdtemp(prefix=run+'-hermes-full-',dir='/tmp')).resolve();base.chmod(0o700)
    isolated_env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'LANG':'en_US.UTF-8','HOME':str(base/'user-home'),'BT_TEST_RUN':run,'BT_TEST_LABEL':os.environ.get('BT_TEST_LABEL','')}
    (base/'user-home').mkdir(mode=0o700)
    backend=child=None;started=False;cleanup=False;status='not_run';reason=None;handles=[]
    OUT.mkdir(parents=True,exist_ok=True)
    try:
        source=base/'source';source.mkdir();archive=base/'source.tar'
        with archive.open('wb') as stream: command(['/usr/bin/git','-C',str(REAL),'archive',PIN],stdout=stream,env=isolated_env)
        with tarfile.open(archive) as t:
            for member in t.getmembers():
                p=Path(member.name)
                assert not p.is_absolute() and '..' not in p.parts
                if member.issym() or member.islnk():
                    target=Path(member.linkname);assert not target.is_absolute() and '..' not in target.parts
            t.extractall(source)
        archive.unlink();assert not (source/'.env').exists() and not(source/'.op.env').exists()
        # Verify the real AIAgent/API source bytes, not a replacement fake agent.
        hashes={p:hashlib.sha256((source/p).read_bytes()).hexdigest() for p in ['run_agent.py','gateway/platforms/api_server.py','gateway/platforms/api_server_runs.py']}
        compiled={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'server/dist/services/agentTasks/service.js',ROOT/'server/dist/services/agentTasks/modelRelay.js',ROOT/'server/dist/services/externalMcp/productionAgentBindings.js',ROOT/'server/dist/services/externalMcp/agentTools.js']}
        private(OUT/'inputs.json',json.dumps({'batch':run,'hermesCommit':PIN,'archivedSourceHashes':hashes,'compiledHashes':compiled,'excludedLaterDeltas':['directory-scope-filter','supervise']},indent=2))
        private(base/'tls.cnf','[req]\ndistinguished_name=dn\nx509_extensions=v3\nprompt=no\n[dn]\nCN=localhost\n[v3]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\n')
        command(['/usr/bin/openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',str(base/'tls.key'),'-out',str(base/'tls.crt'),'-config',str(base/'tls.cnf')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,env=isolated_env)
        (base/'tls.key').chmod(0o600)
        pgport=port();command(['initdb','-D',str(base/'pg'),'--username=loop_test','--auth=trust','--no-locale','-E','UTF8'],stdout=subprocess.DEVNULL,env=isolated_env)
        command(['pg_ctl','-D',str(base/'pg'),'-l',str(base/'pg.log'),'-o',f'-h 127.0.0.1 -p {pgport} -k {base}','-w','start'],stdout=subprocess.DEVNULL,env=isolated_env);started=True
        command(['createdb','-h','127.0.0.1','-p',str(pgport),'-U','loop_test','hermes_loop_test'],env=isolated_env)
        backendenv=dict(isolated_env)
        backendenv.update(NODE_ENV='test',DATABASE_URL=f'postgresql://loop_test@127.0.0.1:{pgport}/hermes_loop_test',JWT_SECRET='synthetic-full-loop-unused-key-32bytes',CORS_ORIGIN='http://localhost',UPLOADS_PATH=str(base/'uploads'),HERMES_LOOP_DIR=str(base))
        command([str(ROOT/'server/node_modules/.bin/prisma'),'db','push','--skip-generate','--schema',str(ROOT/'server/prisma/schema.prisma')],env=backendenv,stdout=subprocess.DEVNULL)
        blog=(OUT/(run+'-backend.log')).open('w');handles.append(blog)
        backend=subprocess.Popen(['node',str(Path(__file__).with_name('backend.cjs'))],cwd=ROOT,env=backendenv,stdin=subprocess.PIPE,stdout=blog,stderr=subprocess.STDOUT,text=True,start_new_session=True)
        fixture=wait_file(base/'backend-ready.json',backend)
        profile=base/'hermes-root/profiles/stock-ro-001';bearer='synthetic-only-'+os.urandom(32).hex();private(base/'gateway.key',bearer)
        private(base/'client.json',json.dumps({**fixture['endpoints'],'client_id':'synthetic-executor','client_secret':'synthetic-secret','scopes':['executor.claim','executor.evidence','executor.report']}))
        spec={**{k:fixture[k] for k in ('endpoints','pilot')},'profile_home':str(profile),'hermes_source':str(source),'python_executable':str(Path(args.sdk_python)),'gateway_bearer_file':str(base/'gateway.key'),'private_client_file':str(base/'client.json'),'port':port()}
        sys.path.insert(0,str(ROOT/'hermes'));import pdca_launcher
        guard={'root':str(base),'real_source':str(REAL),'source':str(source),'profile':str(profile),'sites':[str(p) for p in sdk_sites]+[str(hermes_sites)]};private(base/'guard.json',json.dumps(guard))
        glog=(OUT/(run+'-gateway.log')).open('w');handles.append(glog)
        def spawn(argv,**kw):
            # The production bootstrap pins public endpoints; this explicit test-only
            # factory changes only owned loopback dependency construction.
            private(profile/'pdca-bootstrap.py',Path(__file__).with_name('bootstrap.py').read_text())
            # Use unchanged launcher env/args; -S avoids .pth execution or editable imports.
            env=dict(kw['env'],SSL_CERT_FILE=str(base/'tls.crt'),PYTHONDONTWRITEBYTECODE='1')
            env.pop('PYTHONPATH',None)
            return subprocess.Popen([argv[0],'-S',str(Path(__file__).with_name('guard.py')),str(base/'guard.json')],cwd=kw['cwd'],env=env,start_new_session=True,stdout=glog,stderr=subprocess.STDOUT)
        # Explicit test-only launcher. Production activate() stays pinned and is never
        # monkeypatched or called with synthetic endpoints (the original refusal is retained).
        saved_umask=os.umask(0o077)
        try:
            profile.mkdir(parents=True,mode=0o700)
            userhome=profile/'isolated-user-home';userhome.mkdir(mode=0o700)
            plugin=profile/'plugins/pdca-bridge';plugin.mkdir(parents=True,mode=0o700)
        finally: os.umask(saved_umask)
        for name in ('pdca_bridge.py','pdca_runtime.py','pdca_launcher.py'):
            private(plugin/name,(ROOT/'hermes'/name).read_text())
        private(plugin/'plugin.yaml',(ROOT/'hermes/plugin/plugin.yaml').read_text())
        private(plugin/'__init__.py',(ROOT/'hermes/plugin/__init__.py.template').read_text())
        private(profile/'config.yaml',json.dumps(pdca_launcher.gateway_config(spec,profile)))
        private(profile/'pdca-launch.json',json.dumps({'endpoints':spec['endpoints'],'pilot':spec['pilot'],'private_client_file':spec['private_client_file'],'profile_home':str(profile)}))
        env={'PATH':'/usr/bin:/bin','LANG':'en_US.UTF-8','HOME':str(userhome),'HERMES_HOME':str(profile),
             'API_SERVER_HOST':'127.0.0.1','API_SERVER_PORT':str(spec['port']),'API_SERVER_KEY':bearer,
             'HERMES_GATEWAY_NO_SUPERVISE':'1','HERMES_ENABLE_PROJECT_PLUGINS':'0','PYTHONNOUSERSITE':'1'}
        child=spawn([str(Path(args.sdk_python)),'-m','hermes_cli.main','--profile','stock-ro-001','gateway','run'],cwd=str(profile),env=env,start_new_session=True)
        # urllib proxy support disabled; only fixture loopback HTTP is reachable here.
        import urllib.request
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        origin='http://127.0.0.1:'+str(spec['port'])
        deadline=time.monotonic()+45
        while True:
            if child.poll() is not None: raise RuntimeError('ISOLATED_GATEWAY_EXITED')
            try:
                with opener.open(urllib.request.Request(origin+'/health',headers={'Authorization':'Bearer '+bearer}),timeout=1) as r:
                    if r.status==200: break
            except Exception:
                if time.monotonic()>deadline: raise RuntimeError('ISOLATED_GATEWAY_START_TIMEOUT')
                time.sleep(.1)
        body=json.dumps({'input':json.dumps(fixture['dispatch'],separators=(',',':')),'session_id':'synthetic-full-loop','model':'MiniMax-M3.1-Flash','stream':False}).encode()
        req=urllib.request.Request(origin+'/p/stock-ro-001/v1/runs',data=body,headers={'Authorization':'Bearer '+bearer,'Content-Type':'application/json','Idempotency-Key':fixture['dispatch']['references']['eventId']})
        with opener.open(req,timeout=10) as r: assert r.status==202; admitted=json.load(r)
        runid=admitted['run_id'];deadline=time.monotonic()+45
        while True:
            with opener.open(urllib.request.Request(origin+'/p/stock-ro-001/v1/runs/'+runid,headers={'Authorization':'Bearer '+bearer}),timeout=3) as r: state=json.load(r)
            if state['status'] in ('completed','failed','cancelled','stopped'): break
            if time.monotonic()>deadline: raise RuntimeError('ISOLATED_REAL_LOOP_TIMEOUT')
            time.sleep(.15)
        assert state['status']=='completed',json.dumps({'status':state['status']})
        backend.stdin.write('{"command":"finish"}\n');backend.stdin.flush();backend.stdin.close();backend.wait(timeout=10);assert backend.returncode==0,'NATIVE_REPORT_NOT_PERSISTED'
        native=json.loads((base/'backend-result.json').read_text())
        # All denied audit operations raise before the OS operation. Preserve these
        # startup probes as evidence; they are never silently allowed.
        blocked=[json.loads(x)['code'] for x in (base/'isolation-violations.jsonl').read_text().splitlines()] if (base/'isolation-violations.jsonl').exists() else []
        assert 'ACTUAL_RESOLVED_AGENT_UNSAFE' not in blocked,'ACTUAL_RESOLVED_AGENT_UNSAFE'
        status='passed';private(OUT/'result.json',json.dumps({'batch':run,'status':status,'actualHermesCommit':PIN,'productionActivateTested':False,'testOnlyLauncher':True,'actualAIAgent':True,'actualOfficialSdk127':True,'actualNativeCore':True,'actualRestrictedRelay':True,'actualProvider':False,'actualAS':False,'sourceHashes':hashes,'blockedIsolationProbes':blocked,'forbiddenOsOperationsExecuted':0,'native':native},indent=2))
        print('PASS one archived a719 real AIAgent /v1/runs → official SDK → restricted relay → native unverified report')
    except BaseException as e:
        status='failed';reason=str(e);raise
    finally:
        kill(child);kill(backend)
        for h in handles:h.close()
        for n in ('backend-failure.json','backend-result.json','isolation-violations.jsonl','actual-agent.json'):
            if (base/n).exists():shutil.copyfile(base/n,OUT/(run+'-'+n))
        if started:command(['pg_ctl','-D',str(base/'pg'),'-m','immediate','-w','stop'],stdout=subprocess.DEVNULL,env=isolated_env)
        shutil.rmtree(base);cleanup=True
        private(OUT/'cleanup.json',json.dumps({'batch':run,'status':status,'reason':reason,'gatewayStopped':child is None or child.poll() is not None,'backendStopped':backend is None or backend.poll() is not None,'temporaryFilesRemoved':not base.exists(),'postgresStopped':cleanup},indent=2))
if __name__=='__main__':main()
