"""Owned Windows runner only: original signed-hash 295 payload and original updater IPC.
The update feed is a local HTTP fixture containing the candidate installer. No store access.
"""
import ctypes
from ctypes import wintypes
from contextlib import closing
import functools
import hashlib
import http.server
import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import threading
import time
import urllib.request

OLD_HASH = 'a8bae6ebd282d643b9eff983b8a79cefc0d6c45ca26212852c51a005d2c7dcd8'


def validate(root, temp, app, data, db, drive, historic, verify_started, version):
    assert os.environ.get('GITHUB_ACTIONS') == 'true' and os.name == 'nt'
    old = temp / 'original-295.exe'
    urllib.request.urlretrieve('https://github.com/liangning92/bubble-tea-saas/releases/download/v2026.10.295/BTPS-2026.10.295-Windows-x64.exe', old)
    assert hashlib.sha256(old.read_bytes()).hexdigest() == OLD_HASH
    archive = temp / 'original-295-archive'
    subprocess.run(['7z', 'x', str(old), '-o' + str(archive), '-y'], check=True, stdout=subprocess.DEVNULL)
    # Original release payload, with no replacements of program/updater code.
    shutil.rmtree(app)
    subprocess.run(['7z', 'x', str(archive / '$PLUGINSDIR/app-64.7z'), '-o' + str(app), '-y'], check=True, stdout=subprocess.DEVNULL)
    seed = app / 'resources/app.asar.unpacked/server/prisma/seed.db'
    with closing(sqlite3.connect(seed)) as c:
        ddl = c.execute("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name").fetchall()
    # Retain owned test rows from previous tests; recreate authentic 295 schema only.
    with closing(sqlite3.connect(db)) as c:
        rows = {t: (list(map(lambda r:r[1], c.execute('PRAGMA table_info("'+t+'")'))), c.execute('SELECT * FROM "'+t+'"').fetchall()) for t in ['Tenant','Store','User','Staff','Leave','LeaveBalance','Order']}
    db.unlink()
    with closing(sqlite3.connect(db)) as c, c:
        for (statement,) in ddl:
            c.execute(statement)
        for table, (names, values) in rows.items():
            old_names = [r[1] for r in c.execute('PRAGMA table_info("'+table+'")')]
            columns = [n for n in names if n in old_names]
            indexes = [names.index(n) for n in columns]
            c.executemany('INSERT INTO "'+table+'" ('+','.join('"'+n+'"' for n in columns)+') VALUES ('+','.join('?' for n in columns)+')', [tuple(row[i] for i in indexes) for row in values])
    before = historic()
    feed = temp / 'feed'
    feed.mkdir()
    candidate = next(root.glob('release/BTPS-*-Windows-x64.exe'))
    shutil.copy2(candidate, feed / 'candidate.exe')
    import base64
    h = base64.b64encode(hashlib.sha512(candidate.read_bytes()).digest()).decode()
    (feed / 'latest.yml').write_text('version: '+version+'\nfiles:\n  - url: candidate.exe\n    sha512: '+h+'\n    size: '+str(candidate.stat().st_size)+'\npath: candidate.exe\nsha512: '+h+'\nreleaseDate: 2026-10-08T00:00:00.000Z\n')
    server = http.server.ThreadingHTTPServer(('127.0.0.1',0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(feed)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    log = open(temp / 'original-295-runtime.log','w')
    old_process = subprocess.Popen([str(app / 'BTPS.exe'),'--inspect=127.0.0.1:19295'], stdout=log, stderr=log)
    inspector = root / 'scripts/validate-authentic-295-inspector.cjs'
    try:
        downloaded = subprocess.check_output(['node',str(inspector),'download',str(server.server_port)], text=True, cwd=root, timeout=240).strip()
        result = json.loads(downloaded)
        assert result['version'] == '2026.10.295', result
        installer_path = result['installerPath']
        assert hashlib.sha512(pathlib.Path(installer_path).read_bytes()).digest() == hashlib.sha512(candidate.read_bytes()).digest()
        subprocess.run(['node',str(inspector),'install',str(server.server_port)], check=True, cwd=root, timeout=30)
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE,ctypes.POINTER(wintypes.DWORD)]
        kernel.TerminateProcess.argtypes = [wintypes.HANDLE,wintypes.UINT]
        class OwnedInstaller:
            def __init__(self,pid):
                self.pid=pid
                # PROCESS_QUERY_LIMITED_INFORMATION is required by
                # GetExitCodeProcess in addition to SYNCHRONIZE/TERMINATE.
                self.handle=kernel.OpenProcess(0x101001,False,pid)
                assert self.handle
                self.returncode=None
            def poll(self):
                code=wintypes.DWORD()
                assert kernel.GetExitCodeProcess(self.handle,ctypes.byref(code))
                self.returncode=None if code.value==259 else code.value
                return self.returncode
            def terminate(self):
                kernel.TerminateProcess(self.handle,73)
            def wait(self, timeout=30):
                deadline=time.monotonic()+timeout
                while self.poll() is None and time.monotonic()<deadline:
                    time.sleep(.1)
                if self.returncode is None:
                    raise subprocess.TimeoutExpired(installer_path, timeout)
                return self.returncode
        process=None
        deadline=time.monotonic()+45
        env=dict(os.environ,BTPS_OWNED_INSTALLER=installer_path)
        while not process and time.monotonic()<deadline:
            raw=subprocess.check_output(['powershell.exe','-NoProfile','-Command',"$p=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq $env:BTPS_OWNED_INSTALLER});if($p.Count){$p[0].ProcessId}"],env=env,text=True).strip()
            if raw:
                process=OwnedInstaller(int(raw))
            else:
                time.sleep(.5)
        assert process, 'Original 295 updater did not launch candidate installer'
        try:
            drive(candidate, process=process)
        except Exception:
            diagnostic = data / 'logs/upgrade-check.json'
            if diagnostic.is_file():
                print('Original 295 online upgrade diagnostic: ' + diagnostic.read_text(errors='replace'), flush=True)
            raise
        runtime=verify_started(version)
        assert historic()==before
        return {'originalVersion':'2026.10.295','originalInstallerSha256':OLD_HASH,'originalPayloadUnmodified':True,'originalUpdaterIpcUsed':True,'downloadedCandidateHashMatched':True,'historicalRowsPreserved':True,'restartedRuntime':runtime}
    finally:
        server.shutdown()
        if old_process.poll() is None:
            subprocess.run(['taskkill','/PID',str(old_process.pid),'/T','/F'],capture_output=True)
        log.close()
