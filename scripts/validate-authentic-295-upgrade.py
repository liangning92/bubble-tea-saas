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


def validate(root, temp, app, data, db, drive, historic, verify_started, version, alternate_profile, original_version="2026.10.295", original_hash=OLD_HASH, stale_stage=False):
    assert os.environ.get('GITHUB_ACTIONS') == 'true' and os.name == 'nt'
    old = temp / ('original-' + original_version + '.exe')
    urllib.request.urlretrieve(f'https://github.com/liangning92/bubble-tea-saas/releases/download/v{original_version}/BTPS-{original_version}-Windows-x64.exe', old)
    assert hashlib.sha256(old.read_bytes()).hexdigest() == original_hash
    archive = temp / ('original-' + original_version + '-archive')
    subprocess.run(['7z', 'x', str(old), '-o' + str(archive), '-y'], check=True, stdout=subprocess.DEVNULL)
    # Original release payload, with no replacements of program/updater code.
    shutil.rmtree(app)
    subprocess.run(['7z', 'x', str(archive / '$PLUGINSDIR/app-64.7z'), '-o' + str(app), '-y'], check=True, stdout=subprocess.DEVNULL)
    # Recreate the original installed layout, including its original uninstaller.
    # Omitting it would skip removal of obsolete files during the update.
    uninstallers = list(archive.rglob('Uninstall BTPS.exe'))
    assert len(uninstallers) == 1, 'Original release uninstaller missing or ambiguous'
    shutil.copy2(uninstallers[0], app / 'Uninstall BTPS.exe')
    assert hashlib.sha256((app / 'Uninstall BTPS.exe').read_bytes()).digest() == hashlib.sha256(uninstallers[0].read_bytes()).digest()
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
    stale_evidence = {}
    if stale_stage:
        prior_installer = temp / 'previous-staged-installer.exe'
        prior_installer.write_bytes(b'owned obsolete package')
        pointer = pathlib.Path(os.environ['APPDATA']) / 'BTPS/upgrade-stage.json'
        subprocess.run([str(root / 'build/upgrade-helper/btps-db-upgrade.exe'), 'stage', '--old-app', str(app), '--installer', str(prior_installer), '--result', str(pointer)], check=True, timeout=180)
        selected = json.loads(pointer.read_text())
        receipt = json.loads(pathlib.Path(selected['receiptPath']).read_text())
        stale_evidence = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in [pointer, pathlib.Path(selected['receiptPath']), pathlib.Path(receipt['databaseBackup']), pathlib.Path(receipt['appBackup'])]}
    before = historic()
    alternate_db = alternate_profile / 'data/dev.db'
    alternate_before = hashlib.sha256(alternate_db.read_bytes()).hexdigest()
    feed = temp / ('feed-' + original_version)
    feed.mkdir()
    candidate = next(root.glob('release/BTPS-*-Windows-x64.exe'))
    shutil.copy2(candidate, feed / 'candidate.exe')
    import base64
    h = base64.b64encode(hashlib.sha512(candidate.read_bytes()).digest()).decode()
    (feed / 'latest.yml').write_text('version: '+version+'\nfiles:\n  - url: candidate.exe\n    sha512: '+h+'\n    size: '+str(candidate.stat().st_size)+'\npath: candidate.exe\nsha512: '+h+'\nreleaseDate: 2026-10-08T00:00:00.000Z\n')
    server = http.server.ThreadingHTTPServer(('127.0.0.1',0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(feed)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    log = open(temp / ('original-' + original_version + '-runtime.log'),'w')
    old_process = subprocess.Popen([str(app / 'BTPS.exe'),'--inspect=127.0.0.1:19295'], stdout=log, stderr=log)
    inspector = root / 'scripts/validate-authentic-295-inspector.cjs'
    try:
        downloaded = subprocess.check_output(['node',str(inspector),'download',str(server.server_port), original_version], text=True, cwd=root, timeout=240).strip()
        result = json.loads(downloaded)
        print('Original ' + original_version + ' runtime profile: ' + result['userData'], flush=True)
        assert result['version'] == original_version, result
        assert pathlib.Path(result['userData']) == data, result
        installer_path = result['installerPath']
        assert hashlib.sha512(pathlib.Path(installer_path).read_bytes()).digest() == hashlib.sha512(candidate.read_bytes()).digest()
        install_started = time.monotonic()
        subprocess.run(['node',str(inspector),'install',str(server.server_port), original_version], check=True, cwd=root, timeout=30)
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
        background_reused = False
        if original_version == '2026.10.384':
            pointer = pathlib.Path(os.environ['APPDATA']) / 'BTPS/upgrade-stage.json'
            selected = json.loads(pointer.read_text())
            prepared = json.loads(pathlib.Path(selected['receiptPath']).read_text())
            assert prepared['status'] == 'prepared' and prepared['preverifiedBackup']
            background_reused = True
        runtime=verify_started(version)
        downtime = time.monotonic() - install_started
        assert historic()==before
        assert hashlib.sha256(alternate_db.read_bytes()).hexdigest() == alternate_before
        if stale_stage:
            assert all(hashlib.sha256(p.read_bytes()).hexdigest() == value for p, value in stale_evidence.items()), 'Obsolete stage and recovery files must remain untouched'
        return {'backgroundBackupReused': background_reused, 'downtimeSeconds': round(downtime, 3), 'obsoleteStagePreserved': stale_stage, 'originalVersion':original_version,'originalInstallerSha256':original_hash,'originalUninstallerPresent':True,'originalPayloadUnmodified':True,'originalUpdaterIpcUsed':True,'downloadedCandidateHashMatched':True,'historicalRowsPreserved':True,'alternateProfilePreserved':True,'restartedRuntime':runtime}
    finally:
        server.shutdown()
        if old_process.poll() is None:
            subprocess.run(['taskkill','/PID',str(old_process.pid),'/T','/F'],capture_output=True)
        log.close()
