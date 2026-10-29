"""Supervise native Hermes API compartments; no business/tool dispatch loop."""
from __future__ import annotations
import fcntl,hashlib,hmac,json,os,re,secrets,signal,socket,sqlite3,subprocess,sys,threading,time
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib import request,error




class NativeGateway:
    def __init__(self,cfg):
        self.cfg=cfg;self.key=Path(cfg['gatewayBearerFile']).read_text().strip();self.root=Path(cfg['isolatedRoot'])/'native-api';self.root.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.owner_lock=open(self.root/'supervisor.lock','a+b')
        try:fcntl.flock(self.owner_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BaseException:self.owner_lock.close();raise
        self.lock=threading.RLock();self.profiles={};self.stopping=False
        self.capacity=int(cfg.get('maxConcurrency',2))
        if self.capacity<1:raise ValueError('NATIVE_CAPACITY_INVALID')
        self.db=sqlite3.connect(self.root/'supervisor.sqlite',check_same_thread=False,isolation_level=None)
        self.db.execute('CREATE TABLE IF NOT EXISTS runs (key TEXT PRIMARY KEY,profile TEXT NOT NULL,digest TEXT NOT NULL,run_id TEXT,state TEXT NOT NULL)')
    def profile(self,name):
        if not re.fullmatch('[a-f0-9]{64}',name):raise ValueError('NATIVE_PROFILE_INVALID')
        with self.lock:
            existing=self.profiles.get(name)
            if existing and (existing['process'] is None or existing['process'].poll() is None):return existing
            if self.stopping:raise ValueError('NATIVE_STOPPING')
            home=self.root/'profiles'/name;home.mkdir(parents=True,exist_ok=True,mode=0o700)
            meta=self.root/(name+'.json')
            if meta.exists():api_key=json.loads(meta.read_text())['apiKey']
            else:
                api_key=secrets.token_urlsafe(48);fd=os.open(meta,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
                with os.fdopen(fd,'w') as f:json.dump({'apiKey':api_key},f)
            with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
            image=self.cfg.get('nativeImage','')
            if not re.fullmatch('sha256:[a-f0-9]{64}',image):raise ValueError('NATIVE_VERIFIED_IMAGE_REQUIRED')
            container='bubble-tea-hermes-'+hashlib.sha256(str(self.root).encode()).hexdigest()[:12]+'-'+name[:24]
            env={'PATH':self.cfg.get('path','/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin'),'HOME':str(Path.home())}
            inspected=subprocess.run(['docker','inspect',container],capture_output=True,text=True,env=env)
            if inspected.returncode==0:
                value=json.loads(inspected.stdout)[0]
                if value['Config'].get('Labels',{}).get('com.bubbletea.native-profile')!=name or value['Image']!=image:raise ValueError('NATIVE_CONTAINER_IDENTITY_CHANGED')
                host=value['HostConfig'];mounts=value.get('Mounts',[])
                if not host.get('ReadonlyRootfs') or host.get('CapDrop')!=['ALL'] or 'no-new-privileges' not in ' '.join(host.get('SecurityOpt') or []):raise ValueError('NATIVE_CONTAINER_SANDBOX_CHANGED')
                source=lambda value:value[len('/host_mnt'):] if value.startswith('/host_mnt/') else value
                if len(mounts)!=1 or mounts[0].get('Type')!='bind' or mounts[0].get('Destination')!='/home/hermes' or source(mounts[0].get('Source',''))!=str(home):raise ValueError('NATIVE_CONTAINER_MOUNTS_CHANGED')
                if value['State']['Running']:
                    mapped=value['NetworkSettings']['Ports']['8643/tcp'][0]
                    if mapped['HostIp']!='127.0.0.1':raise ValueError('NATIVE_CONTAINER_LISTENER_CHANGED')
                    p={'process':None,'port':int(mapped['HostPort']),'key':api_key,'container':container};self.profiles[name]=p;return p
                subprocess.run(['docker','rm',container],check=True,stdout=subprocess.DEVNULL,env=env)
            cmd=['docker','run','--name',container,'--rm','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=256','--shm-size=256m','--tmpfs','/tmp:rw,nosuid,nodev,size=256m','--label','com.bubbletea.native-profile='+name,'-p','127.0.0.1:'+str(port)+':8643','--mount','type=bind,src='+str(home)+',dst=/home/hermes','-i',image]
            log=open(self.root/(name+'.log'),'ab',buffering=0)
            child=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=log,stderr=log,start_new_session=True,env={'PATH':self.cfg.get('path','/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin'),'HOME':str(Path.home())})
            payload={'profileRoot':'/home/hermes','profileKey':name,'port':8643,'listenHost':'0.0.0.0','apiKey':api_key,'repository':'/opt/store-adapter','hermesSource':'/opt/hermes','hermesExpectedSha':self.cfg['hermesExpectedSha'],'path':'/opt/venv/bin:/usr/local/bin:/usr/bin:/bin'}
            child.stdin.write(json.dumps(payload).encode()+b'\n');child.stdin.close();log.close()
            p={'process':child,'port':port,'key':api_key,'container':container};self.profiles[name]=p
        for _ in range(900):
            if child.poll() is not None:raise ValueError('NATIVE_API_CHILD_FAILED')
            try:
                with self.child_request(p,'/health') as response:
                    if response.status==200:return p
            except Exception:time.sleep(.1)
        raise ValueError('NATIVE_API_START_TIMEOUT')
    def child_request(self,p,path,body=None,headers=None):
        return request.urlopen(request.Request('http://127.0.0.1:'+str(p['port'])+path,data=body,headers={'Authorization':'Bearer '+p['key'],**(headers or {})}),timeout=120)
    def server(self):
        owner=self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*a):pass
            def do_GET(self):self.forward()
            def do_POST(self):self.forward()
            def forward(self):
                if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+owner.key):return self.reply(401,{'error':'unauthorized'})
                if self.path=='/health':
                    with owner.lock:running=owner.db.execute("SELECT count(*) FROM runs WHERE state IN ('reserved','running')").fetchone()[0]
                    return self.reply(200,{'status':'ok','protocol':'hermes_native_api_v1','maxConcurrency':owner.capacity,'running':running,'queued':0})
                match=re.fullmatch(r'/profiles/([a-f0-9]{64})(/[^\r\n]*)',self.path)
                if not match:return self.reply(410,{'error':'LEGACY_HERMES_EXECUTION_RETIRED'})
                name,path=match.groups();body=self.rfile.read(int(self.headers.get('Content-Length','0'))) if self.command=='POST' else None
                idem=self.headers.get('Idempotency-Key','');new_admission=False
                try:
                    p=owner.profile(name)
                    if self.command=='POST' and path=='/v1/runs':
                        if not idem or len(idem)>255:return self.reply(400,{'error':'NATIVE_IDEMPOTENCY_REQUIRED'})
                        digest=hashlib.sha256(body or b'').hexdigest()
                        with owner.lock:
                            prior=owner.db.execute('SELECT profile,digest,state FROM runs WHERE key=?',(idem,)).fetchone()
                            if prior and prior[:2]!=(name,digest):return self.reply(409,{'error':'NATIVE_ADMISSION_CHANGED'})
                            if not prior or prior[2]=='not_admitted':
                                active=owner.db.execute("SELECT count(*) FROM runs WHERE state IN ('reserved','running')").fetchone()[0]
                                if active>=owner.capacity:return self.reply(429,{'error':'NATIVE_RESOURCE_BUSY'})
                                owner.db.execute("INSERT INTO runs VALUES (?,?,?,NULL,'reserved') ON CONFLICT(key) DO UPDATE SET state='reserved'",(idem,name,digest));new_admission=True
                    headers={k:self.headers[k] for k in ('Content-Type','Idempotency-Key','X-Hermes-Session-Key','Accept') if k in self.headers}
                    with owner.child_request(p,path,body,headers) as response:
                        kind=response.headers.get('Content-Type','application/json')
                        if 'text/event-stream' in kind:
                            self.send_response(response.status);self.send_header('Content-Type',kind);self.send_header('Connection','close');self.end_headers()
                            while True:
                                chunk=response.read1(65536)
                                if not chunk:break
                                self.wfile.write(chunk);self.wfile.flush()
                            self.close_connection=True;return
                        raw=response.read()
                        if self.command=='POST' and path=='/v1/runs':
                            data=json.loads(raw);run_id=data.get('run_id') or data.get('id')
                            if not run_id:raise ValueError('NATIVE_RUN_ID_MISSING')
                            with owner.lock:owner.db.execute("UPDATE runs SET run_id=?,state='running' WHERE key=?",(run_id,idem))
                        elif self.command=='POST' and path=='/native/admission':
                            data=json.loads(raw)
                            if data.get('run_id'):
                                lookup=json.loads(body)
                                with owner.lock:owner.db.execute("UPDATE runs SET run_id=?,state='running' WHERE key=? AND profile=?",(data['run_id'],lookup['key'],name))
                        elif self.command=='GET' and re.fullmatch('/v1/runs/[^/]+',path):
                            data=json.loads(raw);status=data.get('status')
                            if status in ('completed','failed','cancelled','interrupted','unknown'):
                                with owner.child_request(p,'/native/readiness') as ready:r=json.load(ready)
                                if not sum(r.get(k,0) for k in ('activeRuns','blockingProcesses','activeDelegations')):
                                    with owner.lock:owner.db.execute('UPDATE runs SET state=? WHERE profile=? AND run_id=?',(status,name,path.rsplit('/',1)[1]))
                        self.send_response(response.status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
                except error.HTTPError as e:
                    if new_admission and e.code in (400,401,403,404,409,429):
                        with owner.lock:owner.db.execute("UPDATE runs SET state='not_admitted' WHERE key=? AND state='reserved'",(idem,))
                    self.reply(e.code,{'error':'NATIVE_API_REJECTED'})
                except Exception as e:
                    code=str(e);code=code if re.fullmatch('[A-Z][A-Z0-9_]{1,90}',code) else 'NATIVE_TRANSPORT_UNCONFIRMED'
                    self.reply(503,{'error':code})
            def reply(self,status,value):
                data=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        return ThreadingHTTPServer((self.cfg['listenHost'],self.cfg['listenPort']),Handler)
    def close(self):
        # Native API processes keep owning their runs if the supervisor restarts.
        # Reconnect by immutable container/profile identity; never replay a run.
        self.stopping=True
        self.db.close()
        self.owner_lock.close()


def main():
    from native_config import load_config
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--config',required=True);cfg=load_config(parser.parse_args().config)
    gateway=NativeGateway(cfg);server=gateway.server()
    def stop(*a):threading.Thread(target=server.shutdown,daemon=True).start()
    for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,stop)
    try:server.serve_forever(.25)
    finally:server.server_close();gateway.close()

if __name__=='__main__':main()
