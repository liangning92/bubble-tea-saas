"""Windows-only, owned fixtures: exercise the shipped helper and NSIS UI, never store data."""
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


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fixture(collision=False):
    if DB.exists():
        DB.unlink()
    shutil.copy2(SEED, DB)
    with sqlite3.connect(DB) as c:
        c.execute('DROP INDEX Order_pickupNumber_idx')
        for name in ('pickupNumber', 'requestFingerprint', 'requestReceipt'):
            c.execute('ALTER TABLE "Order" DROP COLUMN ' + name)
        c.execute('INSERT INTO Tenant (id,name,updatedAt) VALUES (?,?,?)', ('tenant', 'Owned synthetic tenant', 0))
        c.execute('INSERT INTO Store (id,tenantId,name,updatedAt) VALUES (?,?,?,?)', ('store', 'tenant', 'Owned synthetic store', 0))
        c.execute('INSERT INTO "Order" (id,storeId,staffId,orderNumber,totalAmount,finalAmount,paymentMethod,updatedAt) VALUES (?,?,?,?,?,?,?,?)', ('historical','store','staff','OLD-001',125000,125000,'cash',0))
        if collision:
            c.execute('CREATE VIEW Order_pickupNumber_idx AS SELECT 1')
    assert not sqlite3.connect(DB).execute('PRAGMA foreign_key_check').fetchall()


def invoke(command, expect=0, receipt=None):
    args = [str(HELPER), command]
    if command == 'prepare':
        args += ['--old-app', str(APP), '--result', str(TEMP / 'result.json'), '--operator-confirmed']
    elif command in ('verify', 'restore'):
        args += ['--receipt', str(receipt or TEMP / 'result.json')]
    result = subprocess.run(args, capture_output=True, text=True, timeout=180)
    assert result.returncode == expect, (command, result.returncode, result.stdout, result.stderr)
    return json.loads(result.stdout.strip())


def historic():
    with sqlite3.connect(DB) as c:
        return c.execute('SELECT id,totalAmount,finalAmount,paymentMethod FROM "Order"').fetchall()


def drive_installer(exe):
    # Click ordinary visible NSIS controls. No test flag or confirmation bypass is shipped.
    user = ctypes.windll.user32
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user.SendMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    user.SendMessageW.restype = wintypes.LPARAM
    process = subprocess.Popen([str(exe), '/D=' + str(APP)])
    visited_confirmation = False
    finish_seen = False
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
            controls = []
            @callback_type
            def child(control, _):
                buf = ctypes.create_unicode_buffer(1024)
                user.GetWindowTextW(control, buf, len(buf))
                controls.append((control, user.GetDlgCtrlID(control), buf.value))
                return True
            user.EnumChildWindows(hwnd, child, 0)
            yes = next((c for c in controls if c[1] == 6 and user.IsWindowEnabled(c[0])), None)
            if yes:
                visited_confirmation = True
                user.SendMessageW(yes[0], 0xF5, 0, 0)
                continue
            next_button = next((c for c in controls if c[1] == 1 and user.IsWindowEnabled(c[0]) and user.IsWindowVisible(c[0])), None)
            if next_button:
                if 'finish' in next_button[2].lower():
                    finish_seen = True
                    for control, _, text in controls:
                        if ('run' in text.lower() or 'launch' in text.lower()) and user.SendMessageW(control, 0xF0, 0, 0) == 1:
                            user.SendMessageW(control, 0xF5, 0, 0)
                user.SendMessageW(next_button[0], 0xF5, 0, 0)
        time.sleep(.5)
    if process.poll() is None:
        process.terminate()  # Only the installer this synthetic test owns.
        raise RuntimeError('Owned interactive installer did not finish within timeout')
    assert process.returncode == 0 and visited_confirmation and finish_seen, ('NSIS UI', process.returncode, visited_confirmation, finish_seen)


try:
    fixture()
    history = historic()
    result = invoke('prepare')
    receipt = json.loads((TEMP / 'result.json').read_text())
    assert result['historicalRowsPreserved'] and historic() == history
    assert receipt['columnAdded'] and receipt['indexAdded']
    assert receipt['columnsAdded'] == ['pickupNumber','requestFingerprint','requestReceipt']
    assert sha(pathlib.Path(receipt['databaseBackup'])) == receipt['databaseBackupSha256']
    invoke('verify')
    CASES.append('compiled-helper-old-database-upgrade-and-verified-backups')
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
    invoke('prepare', expect=73)
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
    drive_installer(installer)
    assert historic() == history
    with sqlite3.connect(DB) as c:
        assert c.execute('SELECT pickupNumber,requestFingerprint,requestReceipt FROM "Order"').fetchone() == (None,None,None)
    assert (APP / 'BTPS.exe').read_bytes()[:2] == b'MZ'
    assert (APP / 'resources/app.asar').is_file()
    CASES.append('real-interactive-nsis-install-with-ordinary-confirmation-and-history-preserved')
    report = {'sourceSha': os.environ['GITHUB_SHA'], 'syntheticOnly': True, 'noRealDatabaseAccess': True,
              'allCriticalCasesPassed': True, 'cases': CASES,
              'changes': ['Order.pickupNumber nullable TEXT', 'Order.requestFingerprint nullable TEXT', 'Order.requestReceipt nullable TEXT', 'Order_pickupNumber_idx nonunique index']}
    (ROOT / 'desktop-manual-upgrade-report.json').write_text(json.dumps(report, indent=2))
    manifest_path = ROOT / 'desktop-template-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    manifest.update(existingDatabaseCompatible=True,
                    existingDatabaseCompatibilityMode='employee-confirmed-verified-backup-narrow-additive-upgrade',
                    requiredExistingDatabaseChanges=report['changes'])
    manifest.pop('existingDatabaseBlocker', None)
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(json.dumps(report))
finally:
    # Remove only fixture roots created after absence assertions in this script.
    # On failure retain all synthetic artifacts for CI diagnosis.
    if len(CASES) == 6:
        shutil.rmtree(DATA)
