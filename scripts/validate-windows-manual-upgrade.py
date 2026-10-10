"""Windows-only, owned fixtures: exercise the shipped helper and NSIS UI, never store data."""
from contextlib import closing
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import winreg
import runpy
import urllib.request

assert sys.platform == 'win32' and os.environ.get('GITHUB_ACTIONS') == 'true'
ROOT = pathlib.Path(__file__).resolve().parents[1]
HELPER = ROOT / 'build/upgrade-helper/btps-db-upgrade.exe'
SEED = ROOT / 'server/prisma/seed.db'
GUID = 'adc89314-e162-5542-b50f-86df40f517f2'
REG = 'Software\\' + GUID
DATA = pathlib.Path(os.environ['APPDATA']) / 'BTPS'
assert not DATA.exists(), 'Runner profile must have no existing POS data'
try:
    winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG)
except FileNotFoundError:
    pass
else:
    raise RuntimeError('Runner must have no existing POS installation registry')
TEMP = pathlib.Path(tempfile.mkdtemp(prefix='btps-manual-owned-', dir=os.environ['RUNNER_TEMP']))
APP = TEMP / 'BTPS'
APP.mkdir()
(APP / 'BTPS.exe').write_bytes(b'owned synthetic historical program; not a real store installation')
DATA.joinpath('data').mkdir(parents=True)
DB = DATA / 'data/dev.db'
CASES = []
COMPLETED = False


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fixture(collision=False, legacy_affinity=True):
    if DB.exists():
        DB.unlink()
    if legacy_affinity:
        with closing(sqlite3.connect(SEED)) as source:
            ddl = source.execute("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name").fetchall()
        with closing(sqlite3.connect(DB)) as target, target:
            for (statement,) in ddl:
                for name in ('totalDays', 'usedLeave', 'usedSick'):
                    statement = statement.replace('"'+name+'" REAL', '"'+name+'" INTEGER')
                target.execute(statement)
    else:
        shutil.copy2(SEED, DB)
    with closing(sqlite3.connect(DB)) as c, c:
        c.execute('DROP INDEX Order_pickupNumber_idx')
        c.execute('DROP TABLE PaymentEvidence')
        c.execute('DROP TABLE LocalSchemaMigration')
        c.execute('DROP INDEX StockInLog_inventoryId_ledgerSequence_key')
        c.execute('DROP INDEX StockOutLog_inventoryId_ledgerSequence_key')
        for table,name in [('Order','pickupNumber'),('Order','requestFingerprint'),('Order','requestReceipt'),('Order','checkoutTaxAmount'),('Staff','baseSalary'),('Inventory','ledgerSequence'),('Inventory','ledgerEpoch'),('StockInLog','ledgerSequence'),('StockOutLog','ledgerSequence'),('RefundRequest','reasonCode'),('RefundRequest','selectedItemIds')]:
            c.execute('ALTER TABLE "'+table+'" DROP COLUMN "'+name+'"')
        c.execute('INSERT INTO Tenant (id,name,updatedAt) VALUES (?,?,?)', ('tenant', 'Owned synthetic tenant', 0))
        c.execute('INSERT INTO Store (id,tenantId,name,updatedAt) VALUES (?,?,?,?)', ('store', 'tenant', 'Owned synthetic store', 0))
        c.execute('INSERT INTO User (id,phone,password,role,storeId,updatedAt) VALUES (?,?,?,?,?,?)', ('user', 'synthetic-only', 'disabled', 'cashier', 'store', 0))
        c.execute('INSERT INTO Staff (id,userId,storeId,name,employeeNumber,updatedAt) VALUES (?,?,?,?,?,?)', ('staff', 'user', 'store', 'Owned synthetic staff', 'SYNTHETIC', 0))
        c.execute('INSERT INTO Leave (id,staffId,storeId,leaveType,startDate,endDate,totalDays,updatedAt) VALUES (?,?,?,?,?,?,?,?)', ('historical-leave', 'staff', 'store', 'annual', 0, 0, 2, 0))
        c.execute('INSERT INTO LeaveBalance (id,staffId,year,usedLeave,usedSick,updatedAt) VALUES (?,?,?,?,?,?)', ('historical-balance', 'staff', 2026, 3, 4, 0))
        c.execute('INSERT INTO "Order" (id,storeId,staffId,orderNumber,totalAmount,finalAmount,paymentMethod,updatedAt) VALUES (?,?,?,?,?,?,?,?)', ('historical','store','staff','OLD-001',125000,125000,'cash',0))
        if collision:
            c.execute('CREATE VIEW Order_pickupNumber_idx AS SELECT 1')
    with closing(sqlite3.connect(DB)) as c:
        assert not c.execute('PRAGMA foreign_key_check').fetchall()


def invoke(command, expect=0, receipt=None, diagnostic=False):
    args = [str(HELPER), command]
    if command == 'prepare':
        args += ['--old-app', str(APP), '--result', str(TEMP / 'result.json'), '--operator-confirmed']
        if diagnostic:
            args += ['--diagnostic', str(TEMP / 'upgrade-diagnostic.json')]
    elif command in ('stage', 'refresh-stage'):
        args += ['--old-app', str(APP), '--installer', str(next(ROOT.glob('release/BTPS-*-Windows-x64.exe')))]
        if command == 'stage':
            args += ['--result', str(pathlib.Path(os.environ['APPDATA']) / 'BTPS/upgrade-stage.json')]
        else:
            args += ['--staged-pointer', str(pathlib.Path(os.environ['APPDATA']) / 'BTPS/upgrade-stage.json')]
    elif command in ('verify', 'restore'):
        args += ['--receipt', str(receipt or TEMP / 'result.json')]
    result = subprocess.run(args, capture_output=True, text=True, timeout=180)
    assert result.returncode == expect, (command, result.returncode, result.stdout, result.stderr)
    return json.loads(result.stdout.strip())


def historic():
    with closing(sqlite3.connect(DB)) as c, c:
        return c.execute('SELECT id,totalAmount,finalAmount,paymentMethod FROM "Order"').fetchall()


def drive_installer(exe, process=None):
    # Click ordinary visible NSIS controls. No test flag or confirmation bypass is shipped.
    user = ctypes.windll.user32
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user.EnumWindows.argtypes = [callback_type, wintypes.LPARAM]
    user.EnumChildWindows.argtypes = [wintypes.HWND, callback_type, wintypes.LPARAM]
    user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user.IsWindowVisible.argtypes = user.IsWindowEnabled.argtypes = [wintypes.HWND]
    user.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user.GetDlgCtrlID.argtypes = [wintypes.HWND]
    user.SetForegroundWindow.argtypes = [wintypes.HWND]
    user.SendMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    user.SendMessageW.restype = wintypes.LPARAM
    user.PostMessageW.argtypes = user.SendMessageW.argtypes
    user.PostMessageW.restype = wintypes.BOOL
    # Same interactive handoff arguments used by electron-updater's NsisUpdater.
    process = process or subprocess.Popen([str(exe), '--updated', '--force-run', '/D=' + str(APP)])
    visited_confirmation = False
    finish_seen = False
    observed = set()
    deadline = time.monotonic() + 300
    while process.poll() is None and time.monotonic() < deadline:
        windows = []
        @callback_type
        def enum(hwnd, _):
            pid = wintypes.DWORD()
            user.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value == process.pid and user.IsWindowVisible(hwnd):
                windows.append(hwnd)
            return True
        user.EnumWindows(enum, 0)
        for hwnd in windows:
            if finish_seen:
                continue
            controls = []
            @callback_type
            def child(control, _):
                buf = ctypes.create_unicode_buffer(1024)
                user.GetWindowTextW(control, buf, len(buf))
                controls.append((control, user.GetDlgCtrlID(control), buf.value))
                return True
            user.EnumChildWindows(hwnd, child, 0)
            page_state = json.dumps([(control_id, text) for _, control_id, text in controls], ensure_ascii=True)
            if page_state not in observed:
                observed.add(page_state)
                print('Owned NSIS page: ' + page_state, flush=True)
            user.SetForegroundWindow(hwnd)
            error_ok = next((c for c in controls if c[2].replace('&', '').strip().lower() == 'ok' and user.IsWindowEnabled(c[0])), None)
            if error_ok:
                user.PostMessageW(error_ok[0], 0xF5, 0, 0)
                process.wait(timeout=30)
                raise RuntimeError('Owned NSIS installation refused: ' + page_state)
            yes = next((c for c in controls if c[1] == 6 and user.IsWindowEnabled(c[0])), None)
            if yes:
                visited_confirmation = True
                user.PostMessageW(yes[0], 0xF5, 0, 0)
                continue
            next_button = next((c for c in controls if c[1] == 1 and user.IsWindowEnabled(c[0]) and user.IsWindowVisible(c[0])), None)
            if next_button:
                if 'finish' in next_button[2].lower():
                    run = next((c for c in controls if c[1] == 1203 and 'run btps' in c[2].lower()), None)
                    if run:
                        checked = user.SendMessageW(run[0], 0xF0, 0, 0)
                        print('Owned NSIS Run checkbox state: ' + str(checked), flush=True)
                        if checked != 1:
                            user.PostMessageW(run[0], 0xF5, 0, 0)
                            continue
                    finish_seen = True
                    # Select the ordinary Run checkbox before pressing Finish.
                user.PostMessageW(next_button[0], 0xF5, 0, 0)
        time.sleep(.5)
    if process.poll() is None:
        process.terminate()  # Only the installer this synthetic test owns.
        raise RuntimeError('Owned interactive installer did not finish within timeout; page states: ' + str(sorted(observed)))
    assert process.returncode == 0 and visited_confirmation and finish_seen, ('NSIS UI', process.returncode, visited_confirmation, finish_seen)


def verify_started_runtime(expected_version):
    env = dict(os.environ, BTPS_OWNED_RUNTIME=str(APP / 'BTPS.exe'))
    query = "$rows=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq $env:BTPS_OWNED_RUNTIME} | Select-Object ProcessId,ExecutablePath); ConvertTo-Json -InputObject $rows -Compress"
    launched = []
    verified = False
    deadline = time.monotonic() + 60
    try:
        while time.monotonic() < deadline:
            raw = subprocess.check_output(['powershell.exe', '-NoProfile', '-Command', query], env=env, text=True).strip()
            launched = json.loads(raw or '[]')
            log = DATA / 'logs/main.log'
            if launched and log.is_file() and ('App version: ' + expected_version) in log.read_text(errors='replace') and ('userData: ' + str(DATA)) in log.read_text(errors='replace'):
                try:
                    with urllib.request.urlopen('http://127.0.0.1:7072/health', timeout=2) as response:
                        ready = json.load(response).get('status') == 'ok'
                except (OSError, ValueError):
                    ready = False
                if ready:
                    verified = True
                    return {'normalExit': True, 'executable': str(APP / 'BTPS.exe'), 'version': expected_version, 'processStarted': True, 'localApiReady': True, 'originalProfileUsed': True}
            time.sleep(1)
        print('Owned restart processes: ' + json.dumps(launched), flush=True)
        log = DATA / 'logs/main.log'
        if log.is_file():
            print('Owned runtime log tail: ' + json.dumps(log.read_text(encoding='utf-8', errors='replace')[-12000:]), flush=True)
        raise RuntimeError('Installed POS did not start with expected runtime version')
    finally:
        # Normal exit flushes Chromium's encryption-key preferences. Killing the
        # first launch can orphan safeStorage ciphertext before Local State saves.
        if verified:
            user = ctypes.windll.user32
            callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
            user.EnumWindows.argtypes = [callback_type, wintypes.LPARAM]
            user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
            user.IsWindowVisible.argtypes = [wintypes.HWND]
            user.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
            closing_deadline = time.monotonic() + 20
            while launched and time.monotonic() < closing_deadline:
                owned = {row['ProcessId'] for row in launched}
                @callback_type
                def close_window(hwnd, _):
                    pid = wintypes.DWORD()
                    user.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                    if pid.value in owned and user.IsWindowVisible(hwnd):
                        user.PostMessageW(hwnd, 0x10, 0, 0)  # ordinary WM_CLOSE
                    return True
                user.EnumWindows(close_window, 0)
                time.sleep(.5)
                raw = subprocess.check_output(['powershell.exe', '-NoProfile', '-Command', query], env=env, text=True).strip()
                launched = json.loads(raw or '[]')
        # Force termination is only failure cleanup, never a successful upgrade.
        for row in launched:
            subprocess.run(['taskkill', '/PID', str(row['ProcessId']), '/T', '/F'], check=False, capture_output=True)
        if verified and launched:
            raise RuntimeError('Owned installed POS did not exit normally')

try:
    fixture()
    history = historic()
    result = invoke('prepare')
    receipt = json.loads((TEMP / 'result.json').read_text())
    assert result['historicalRowsPreserved'] and historic() == history
    assert receipt['columnAdded'] and receipt['indexAdded']
    assert receipt['columnsAdded'] == ['Order.pickupNumber','Order.requestFingerprint','Order.requestReceipt','Order.checkoutTaxAmount','Staff.baseSalary','Inventory.ledgerSequence','Inventory.ledgerEpoch','StockInLog.ledgerSequence','StockOutLog.ledgerSequence','RefundRequest.reasonCode','RefundRequest.selectedItemIds']
    assert sha(pathlib.Path(receipt['databaseBackup'])) == receipt['databaseBackupSha256']
    invoke('verify')
    CASES.append('compiled-helper-old-database-upgrade-and-verified-backups')
    with closing(sqlite3.connect(DB)) as c:
        for table, name in (('Leave', 'totalDays'), ('LeaveBalance', 'usedLeave'), ('LeaveBalance', 'usedSick')):
            field = next(row for row in c.execute('PRAGMA table_info("'+table+'")') if row[1] == name)
            assert field[2] == 'INTEGER'
    CASES.append('compiled-helper-historical-integer-leave-schema-preserved')
    script = """const assert=require('node:assert/strict');const {PrismaClient}=require('./server/node_modules/@prisma/client');(async()=>{const p=new PrismaClient();try{assert.equal((await p.leave.findUnique({where:{id:'historical-leave'}})).totalDays,2);const b=await p.leaveBalance.findUnique({where:{id:'historical-balance'}});assert.equal(b.usedLeave,3);assert.equal(b.usedSick,4);await p.leave.update({where:{id:'historical-leave'},data:{totalDays:2.5,updatedAt:new Date(0)}});await p.leaveBalance.update({where:{id:'historical-balance'},data:{usedLeave:3.5,usedSick:4.5,updatedAt:new Date(0)}});assert.equal((await p.leave.findUnique({where:{id:'historical-leave'}})).totalDays,2.5);const half=await p.leaveBalance.findUnique({where:{id:'historical-balance'}});assert.equal(half.usedLeave,3.5);assert.equal(half.usedSick,4.5);await p.leave.update({where:{id:'historical-leave'},data:{totalDays:2,updatedAt:new Date(0)}});await p.leaveBalance.update({where:{id:'historical-balance'},data:{usedLeave:3,usedSick:4,updatedAt:new Date(0)}})}finally{await p.$disconnect()}})().catch(e=>{console.error(e);process.exitCode=1})"""
    env = dict(os.environ, DATABASE_URL='file:'+DB.as_posix())
    subprocess.run(['node', '-e', script], cwd=ROOT, env=env, check=True, timeout=60)
    invoke('verify')
    CASES.append('generated-prisma-half-day-read-write-on-historical-integer-columns')
    invoke('prepare')
    repeat = json.loads((TEMP / 'result.json').read_text())
    assert not repeat['columnAdded'] and not repeat['indexAdded'] and historic() == history
    assert repeat['columnsAdded'] == []
    CASES.append('compiled-helper-idempotent-repeat')
    committed = sha(DB)
    (APP / 'BTPS.exe').write_bytes(b'failed partial replacement')
    invoke('restore')
    assert sha(DB) == committed
    assert (APP / 'BTPS.exe').read_bytes().startswith(b'owned synthetic historical program')
    CASES.append('compiled-helper-program-rollback-retains-additive-database')
    fixture(collision=True)
    before = sha(DB)
    invoke('prepare', expect=73, diagnostic=True)
    failure = json.loads((TEMP / 'upgrade-diagnostic.json').read_text())
    assert failure['status'] == 'blocked' and failure['reason']
    assert sha(DB) == before and historic() == history
    CASES.append('compiled-helper-real-ddl-failure-byte-identical-rollback')
    fixture()
    backups = DATA / 'data/upgrade-backups'
    saved = DATA / 'data/saved-owned-backups'
    backups.rename(saved)
    backups.write_bytes(b'owned obstruction')
    before = sha(DB)
    invoke('prepare', expect=73)
    assert sha(DB) == before
    backups.unlink()
    saved.rename(backups)
    CASES.append('compiled-helper-backup-failure-preserves-database')
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, REG, 0, winreg.KEY_SET_VALUE | winreg.KEY_WOW64_64KEY) as key:
        winreg.SetValueEx(key, 'InstallLocation', 0, winreg.REG_SZ, str(APP))
    installer = next(ROOT.glob('release/BTPS-*-Windows-x64.exe'))
    stage_pointer = pathlib.Path(os.environ['APPDATA']) / 'BTPS/upgrade-stage.json'
    staged = invoke('stage')
    assert staged['status'] == 'staged'
    invoke('refresh-stage')
    fast_started = time.monotonic()
    drive_installer(installer)
    staged_receipt = json.loads(pathlib.Path(staged['receiptPath']).read_text())
    assert staged_receipt['status'] == 'prepared' and staged_receipt['preverifiedBackup']
    stage_pointer.unlink()
    CASES.append('interactive-nsis-reuses-background-verified-backup')
    assert historic() == history
    with closing(sqlite3.connect(DB)) as c, c:
        assert c.execute('SELECT pickupNumber,requestFingerprint,requestReceipt FROM "Order"').fetchone() == (None,None,None)
    assert (APP / 'BTPS.exe').read_bytes()[:2] == b'MZ'
    assert (APP / 'resources/app.asar').is_file()
    assert (APP / 'resources/upgrade-helper/btps-db-upgrade.exe').is_file(), 'Installed POS must contain its next-update background helper'
    # Confirm the installed payload carries the advertised runtime version.
    expected_version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8-sig'))['version']
    installed_version = subprocess.check_output(['node', '-e', "const asar=require('asar');console.log(JSON.parse(asar.extractFile(process.argv[1],'package.json')).version)", str(APP / 'resources/app.asar')], cwd=ROOT, text=True).strip()
    assert installed_version == expected_version, ('installed version mismatch', installed_version, expected_version)
    restarted_runtime = verify_started_runtime(expected_version)
    fast_downtime = time.monotonic() - fast_started
    print(json.dumps({'preparedDowntimeSeconds': round(fast_downtime, 3), 'localApiReady': restarted_runtime['localApiReady']}), flush=True)
    assert fast_downtime <= 90, ('Prepared upgrade exceeded 90 second release limit', fast_downtime)
    assert historic() == history, 'Restart must preserve the original business rows'
    CASES.append('real-interactive-nsis-install-with-ordinary-confirmation-and-history-preserved')
    # Reproduce the employee failure with a valid receipt for another package.
    obsolete_installer = TEMP / 'obsolete-installer.exe'
    obsolete_installer.write_bytes(b'owned obsolete installer')
    subprocess.run([str(HELPER), 'stage', '--old-app', str(APP), '--installer', str(obsolete_installer), '--result', str(stage_pointer)], check=True, timeout=180)
    obsolete_pointer = stage_pointer.read_bytes()
    obsolete = json.loads(pathlib.Path(json.loads(obsolete_pointer)['receiptPath']).read_text())
    old_evidence = {p: sha(p) for p in [pathlib.Path(obsolete['receiptPath']), pathlib.Path(obsolete['databaseBackup']), pathlib.Path(obsolete['appBackup'])]}
    drive_installer(installer)
    verify_started_runtime(expected_version)
    assert historic() == history
    assert stage_pointer.read_bytes() == obsolete_pointer
    assert all(sha(p) == value for p, value in old_evidence.items())
    stage_pointer.unlink()
    CASES.append('interactive-nsis-obsolete-stage-preserved-new-installer-succeeds')
    # The original 295 package is named bubble-tea-saas. Put owned history in
    # the profile that 295 really opens; the earlier synthetic fixture used BTPS.
    historical_profile = pathlib.Path(os.environ['APPDATA']) / 'bubble-tea-saas'
    assert not (historical_profile / 'data/dev.db').exists(), 'Runner must have no historical 295 database'
    (historical_profile / 'data').mkdir(parents=True, exist_ok=True)
    shutil.copy2(DB, historical_profile / 'data/dev.db')
    alternate_profile = DATA
    DATA = historical_profile
    DB = historical_profile / 'data/dev.db'
    authentic = runpy.run_path(str(ROOT / 'scripts/validate-authentic-295-upgrade.py'))['validate'](ROOT, TEMP, APP, DATA, DB, drive_installer, historic, verify_started_runtime, expected_version, alternate_profile)
    authentic_validate = runpy.run_path(str(ROOT / 'scripts/validate-authentic-295-upgrade.py'))['validate']
    authentic372 = authentic_validate(ROOT, TEMP, APP, DATA, DB, drive_installer, historic, verify_started_runtime, expected_version, alternate_profile,
        original_version='2026.10.372', original_hash='3943a394c848f869c8abc12e5706ce3e4bf2c18ff0412d708537ccfb8cd70acc', stale_stage=True)
    authentic384 = authentic_validate(ROOT, TEMP, APP, DATA, DB, drive_installer, historic, verify_started_runtime, expected_version, alternate_profile,
        original_version='2026.10.384', original_hash='3f52f8c7e19a0f497a53015e402a231adf675d4c2e63bec0d0aef899496810e6')
    assert authentic384['downtimeSeconds'] <= 90, ('Background online upgrade exceeded release limit', authentic384)
    report = {'authentic372': authentic372, 'authentic384': authentic384, 'preparedDowntimeSeconds': round(fast_downtime, 3), 'downtimeLimitSeconds': 90, 'authentic295': authentic, 'sourceSha': os.environ['GITHUB_SHA'], 'syntheticOnly': True, 'noRealDatabaseAccess': True,
              'allCriticalCasesPassed': True, 'installedVersion': installed_version, 'expectedVersion': expected_version, 'cases': CASES,
              'changes': runpy.run_path(str(ROOT / 'scripts/desktop-db-upgrade.py'))['CHANGES'],
              'onlineInstallerArguments': ['--updated', '--force-run'],
              'onlineInteractiveInstallerVerified': True, 'restartedRuntime': restarted_runtime}
    (ROOT / 'desktop-manual-upgrade-report.json').write_text(json.dumps(report, indent=2))
    manifest_path = ROOT / 'desktop-template-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    manifest.update(existingDatabaseCompatible=True,
                    existingDatabaseCompatibilityMode='employee-confirmed-verified-backup-narrow-additive-upgrade',
                    requiredExistingDatabaseChanges=report['changes'])
    manifest.pop('existingDatabaseBlocker', None)
    manifest_path.write_text(json.dumps(manifest, indent=2))
    COMPLETED = True
    print(json.dumps(report))
finally:
    # Remove only fixture roots created after absence assertions in this script.
    # On failure retain all synthetic artifacts for CI diagnosis.
    if COMPLETED:
        shutil.rmtree(DATA)
        shutil.rmtree(pathlib.Path(os.environ['APPDATA']) / 'BTPS')
