"""Disposable hash-locked gateway venv + actual a719 recognition reproduction."""
import argparse,json,os,pathlib,shutil,subprocess,sys,tarfile,tempfile,time
ROOT=pathlib.Path(__file__).resolve().parents[3];PIN='a7198a8855ad98681114ff5138eb01fe132a62e7'
p=argparse.ArgumentParser();p.add_argument('--lock',required=True);p.add_argument('--hermes-source',required=True);p.add_argument('--gateway-python',required=True);p.add_argument('--uv',default=shutil.which('uv')); p.add_argument('--mode',choices=['before','after','both'],default='both');a=p.parse_args()
base=pathlib.Path(tempfile.mkdtemp(prefix='pdca-tool-recognition-',dir='/tmp')).resolve();out=ROOT/'output/tool-recognition';out.mkdir(parents=True,exist_ok=True)
env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'LANG':'en_US.UTF-8','PIP_CONFIG_FILE':os.devnull,**({'OPENSSL_DIR':os.environ['OPENSSL_DIR']} if 'OPENSSL_DIR'in os.environ else {}),'PYTHONDONTWRITEBYTECODE':'1','PYTHONNOUSERSITE':'1','UV_NO_CONFIG':'1','UV_DEFAULT_INDEX':'https://pypi.org/simple'}
status='failed'
try:
 subprocess.run([a.uv,'venv','--no-config','--no-project','--no-python-downloads','--python',a.gateway_python,str(base/'venv')],check=True,env=env)
 subprocess.run([a.uv,'pip','install','--no-config','--python',str(base/'venv/bin/python'),'--require-hashes','--only-binary',':all:','--no-binary','cryptography','-r',a.lock],check=True,env=env,timeout=600)
 source=base/'source';source.mkdir();archive=base/'source.tar'
 with archive.open('wb')as f:subprocess.run(['/usr/bin/git','--no-replace-objects','-C',a.hermes_source,'archive',PIN],check=True,stdout=f,env={**env,'GIT_CONFIG_GLOBAL':os.devnull,'GIT_CONFIG_NOSYSTEM':'1','GIT_NO_REPLACE_OBJECTS':'1'})
 with tarfile.open(archive)as t:t.extractall(source)
 archive.unlink();site=next((base/'venv/lib').glob('python3.11/site-packages'))
 for mode in (['before','after']if a.mode=='both'else[a.mode]):
  home=base/mode/'profiles/stock-ro-001';plugin=home/'plugins/pdca-bridge';plugin.mkdir(parents=True,mode=0o700);home.chmod(0o700)
  for name in ('pdca_bridge.py','pdca_runtime.py','pdca_launcher.py'):shutil.copyfile(ROOT/'hermes'/name,plugin/name)
  for old,new in [('plugin.yaml','plugin.yaml'),('__init__.py.template','__init__.py')]:shutil.copyfile(ROOT/'hermes/plugin'/old,plugin/new)
  bootstrap=home/'bootstrap.py';bootstrap.write_text('def build_bridge(ctx):\n from fixture_runtime import build_bridge\n return build_bridge(ctx)\n');bootstrap.chmod(0o600)
  config={'model':{'provider':'custom','default':'MiniMax-M3.1-Flash','base_url':'https://synthetic.invalid/agent-model/v1','api_key':'pdca-raw-provider-denied','streaming':False},'fallback_model':[],'compression':{'enabled':False},'memory':{'memory_enabled':False,'user_profile_enabled':False},'security':{'allow_lazy_installs':False,'tirith_enabled':False},'auxiliary':{'title_generation':{'enabled':False}},'plugins':{'enabled':['pdca-bridge'],'entries':{'pdca-bridge':{'settings':{'bootstrap_file':str(bootstrap)}}}}}
  if mode=='after':config['tools']={'tool_search':{'enabled':'off'}}
  (home/'config.yaml').write_text(json.dumps(config));(home/'config.yaml').chmod(0o600)
  args={'base':str(base),'source':str(source),'repo':str(ROOT),'site':str(site),'mode':mode,'output':str(out/(mode+'.json'))};control=base/(mode+'.json');control.write_text(json.dumps(args))
  child_env={**env,'HOME':str(base/'isolated-user-home'),'HERMES_HOME':str(home),'HERMES_DISABLE_LAZY_INSTALLS':'1','TIRITH_ENABLED':'0'};pathlib.Path(child_env['HOME']).mkdir(exist_ok=True)
  with(out/(mode+'.log')).open('w')as log:subprocess.run([str(base/'venv/bin/python'),'-S',str(pathlib.Path(__file__).with_name('child.py')),str(control)],env=child_env,cwd=home,check=True,stdout=log,stderr=subprocess.STDOUT,timeout=120)
 status='passed'
finally:
 shutil.rmtree(base)
 (out/'cleanup.json').write_text(json.dumps({'status':status,'ownedDirectory':str(base),'temporaryFilesRemoved':not base.exists(),'actualModels':0,'actualGateway':False}))
