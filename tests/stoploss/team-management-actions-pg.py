#!/usr/bin/env python3
"""Only an owned ephemeral PostgreSQL instance; no production credentials/volumes."""
import os,pathlib,subprocess,tempfile,socket,shutil
root=pathlib.Path(__file__).resolve().parents[2]
run=os.environ.get('BT_TEST_RUN','');assert run.startswith('bt-test-')
base=pathlib.Path(tempfile.mkdtemp(prefix=run+'-actions-'));started=False
with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
def command(args,**kw):return subprocess.run(args,cwd=root,check=True,**kw)
def tool(name):
 value=shutil.which(name)
 if not value:raise RuntimeError('Missing temporary PostgreSQL tool: '+name)
 return value
try:
 command([tool('initdb'),'-D',str(base/'pg'),'--username=team_test','--auth=trust','--no-locale','-E','UTF8'],stdout=subprocess.DEVNULL)
 command([tool('pg_ctl'),'-D',str(base/'pg'),'-l',str(base/'pg.log'),'-o','-h 127.0.0.1 -p '+str(port)+' -k '+str(base),'-w','start'],stdout=subprocess.DEVNULL);started=True
 command([tool('createdb'),'-h','127.0.0.1','-p',str(port),'-U','team_test','team_test'])
 env=dict(os.environ,NODE_ENV='production',DATABASE_URL='postgresql://team_test@127.0.0.1:'+str(port)+'/team_test',JWT_SECRET='synthetic-actions-only-key-32-bytes',CORS_ORIGIN='http://localhost',UPLOADS_PATH=str(base/'uploads'))
 command([str(root/'server/node_modules/.bin/prisma'),'db','push','--skip-generate','--schema',str(root/'server/prisma/schema.prisma')],env=env)
 command(['node','tests/stoploss/team-management-actions-pg.cjs'],env=env)
finally:
 if started:command([tool('pg_ctl'),'-D',str(base/'pg'),'-m','immediate','-w','stop'],stdout=subprocess.DEVNULL)
 shutil.rmtree(base);print('Owned temporary PostgreSQL action instance cleaned',flush=True)
