#!/usr/bin/env python3
"""Owned, credential-free native SDK build. Must use with-docker-test.py."""
import argparse,hashlib,json,os,pathlib,shutil,subprocess,tarfile,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
PIN='a7198a8855ad98681114ff5138eb01fe132a62e7'
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--artifact',required=True);p.add_argument('--base-artifact');args=p.parse_args()
run=os.environ['BT_TEST_RUN'];assert run.startswith('bt-test-') and os.environ['BT_TEST_LABEL']=='com.bubbletea.test-run='+run
artifact=pathlib.Path(args.artifact).resolve();artifact.mkdir(parents=True,exist_ok=True)
context=pathlib.Path(tempfile.mkdtemp(prefix=run+'-',dir='/tmp'))
def command(*cmd,**kw):return subprocess.run(cmd,check=True,**kw)
try:
    extra=[]
    if args.base_artifact:
        base=pathlib.Path(args.base_artifact).resolve()
        layout=(context/'native-base').resolve();layout.mkdir()
        with tarfile.open(base/'native-image.tar') as archive:
            for member in archive.getmembers():
                if member.issym() or member.islnk() or not (layout/member.name).resolve().is_relative_to(layout):raise ValueError('UNSAFE_BASE_ARTIFACT')
            archive.extractall(layout,filter='data')
        extra=['--build-context','nativebase=oci-layout://'+str(layout)]
    else:
        env={**os.environ,'GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':os.devnull,'GIT_TERMINAL_PROMPT':'0'}
        command('git','clone','--no-local','--no-checkout',args.source,str(context/'hermes-source'),env=env,stdout=subprocess.DEVNULL)
        command('git','-C',str(context/'hermes-source'),'remote','remove','origin',env=env)
        command('git','-C',str(context/'hermes-source'),'checkout','--detach',PIN,env=env,stdout=subprocess.DEVNULL)
    for relative in ('hermes/source_verification.py','scripts/hermes_employee/native_api_service.py','hermes/store-operations/SKILL.md'):
        dest=context/'adapter'/relative;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/relative,dest)
    if args.base_artifact:(context/'Dockerfile').write_text('FROM nativebase\nCOPY adapter /opt/store-adapter\n')
    else:shutil.copy2(ROOT/'ops/hermes-native/Dockerfile',context/'Dockerfile')
    command('docker','buildx','create','--name',run,'--driver','docker-container')
    with open(artifact/'build.log','w') as log:
        command('docker','buildx','build','--builder',run,'--load','--label',os.environ['BT_TEST_LABEL'],'--tag',run+':native',*extra,str(context),stdout=log,stderr=subprocess.STDOUT)
    result=subprocess.check_output(['docker','image','inspect',run+':native','--format','{{.Id}}'],text=True).strip()
    command('docker','save','-o',str(artifact/'native-image.tar'),run+':native')
    (artifact/'image.json').write_text(json.dumps({'imageId':result,'hermesSha':PIN,'testBatch':run,'state':'built_not_accepted','adapterFiles':{str(f.relative_to(context/'adapter')):hashlib.sha256(f.read_bytes()).hexdigest() for f in (context/'adapter').rglob('*') if f.is_file()}},indent=2))
finally:shutil.rmtree(context)
