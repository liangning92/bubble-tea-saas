"""Installer-only narrow upgrade. Production CLI runs only on Windows/current profile.
No server startup migration, arbitrary SQL, database restore, or test fault flags.
"""
from contextlib import closing
import argparse
import ctypes
import hashlib
import json
import os
import pathlib
import shutil
import sqlite3
import sys
import tempfile
import urllib.parse
import uuid

LOCAL_COLUMNS = ('pickupNumber', 'requestFingerprint', 'requestReceipt')
COLUMN_ADDITIONS = [('Order',name,'TEXT') for name in LOCAL_COLUMNS] + [
    ('Order','checkoutTaxAmount','INTEGER'), ('Staff','baseSalary','INTEGER'),
    ('Inventory','ledgerSequence','BIGINT NOT NULL DEFAULT 0'), ('Inventory','ledgerEpoch','BIGINT NOT NULL DEFAULT 0'),
    ('StockInLog','ledgerSequence','BIGINT'), ('StockOutLog','ledgerSequence','BIGINT'),
    ('RefundRequest','reasonCode',"TEXT NOT NULL DEFAULT 'legacy'"), ('RefundRequest','selectedItemIds',"TEXT NOT NULL DEFAULT '[]'")]
CHANGES = [table+'.'+name+' '+declaration for table,name,declaration in COLUMN_ADDITIONS] + ['PaymentEvidence and LocalSchemaMigration tables and indexes', 'Order_pickupNumber_idx nonunique index']
LEGACY_INTEGER_FLOAT_COLUMNS = {('Leave', 'totalDays'), ('LeaveBalance', 'usedLeave'), ('LeaveBalance', 'usedSick')}
CHANGES += ['Preserve compatible legacy INTEGER affinity for leave day Float columns']
APP_GUID = 'adc89314-e162-5542-b50f-86df40f517f2'
LAST_DIAGNOSTIC = None


class SchemaCompatibilityError(RuntimeError):
    def __init__(self, table, column, expected, actual):
        super().__init__('UNSUPPORTED_SCHEMA_COLUMN')
        self.details = {'table': table, 'column': column, 'expected': expected, 'actual': actual}


def compatible_column(table, name, actual, expected):
    if actual == expected:
        return True
    # These three historical columns stored whole days before half-day leave.
    # SQLite INTEGER affinity also stores REAL values; preserve the original
    # table and every historical value rather than rebuilding financial DBs.
    if (table, name) in LEGACY_INTEGER_FLOAT_COLUMNS and actual is not None:
        return expected['type'] == 'REAL' and actual == {**expected, 'type': 'INTEGER'}
    return False


def fail(reason):
    raise RuntimeError(reason)


def digest(file):
    h = hashlib.sha256()
    with open(file, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def connection(db, writable=False):
    mode = 'rw' if writable else 'ro'
    return sqlite3.connect('file:' + urllib.parse.quote(pathlib.Path(db).as_posix(), safe='/:') + '?mode=' + mode,
                           uri=True, timeout=5, isolation_level=None)


def regular(path):
    path = pathlib.Path(path).absolute()
    for entry in [path, *path.parents]:
        if entry.exists():
            stat = entry.lstat()
            if entry.is_symlink() or getattr(stat, 'st_file_attributes', 0) & 0x400:
                fail('REPARSE_OR_SYMLINK_PATH_REFUSED')
    return path.resolve()


def tables(c):
    return [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]


def column_map(c):
    return {table: [r[1] for r in c.execute('PRAGMA table_info(' + quote(table) + ')')] for table in tables(c)}


def fingerprints(c, columns):
    result = {}
    for table, names in columns.items():
        h, count = hashlib.sha256(), 0
        selected = ','.join(quote(name) for name in names)
        ordered = ','.join(quote(name) + ' COLLATE BINARY' for name in names)
        for row in c.execute('SELECT ' + selected + ' FROM ' + quote(table) + ' ORDER BY ' + ordered):
            values = [{'blob': value.hex()} if isinstance(value, bytes) else value for value in row]
            h.update(json.dumps(values, ensure_ascii=True, separators=(',', ':'), allow_nan=False).encode('ascii') + b'\n')
            count += 1
        result[table] = {'rows': count, 'sha256': h.hexdigest()}
    return result


def integrity(c):
    if c.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
        fail('DATABASE_INTEGRITY_FAILED')
    if c.execute('PRAGMA foreign_key_check').fetchall():
        fail('DATABASE_FOREIGN_KEYS_FAILED')


def catalog_from_empty(db, source_sha):
    with closing(connection(db)) as c:
        integrity(c)
        result = {'version': 2, 'sourceSha': source_sha, 'changes': CHANGES, 'tables': {}, 'newTableDDL': [row[0] for row in c.execute("SELECT sql FROM sqlite_master WHERE (type='table' AND name IN ('PaymentEvidence','LocalSchemaMigration')) OR (type='index' AND tbl_name IN ('PaymentEvidence','LocalSchemaMigration') AND sql IS NOT NULL) ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END,name")]}
        for table in tables(c):
            if c.execute('SELECT count(*) FROM ' + quote(table)).fetchone()[0]:
                fail('CATALOG_REQUIRES_EMPTY_TEMPLATE')
            result['tables'][table] = {r[1]: {'type': r[2].upper(), 'notnull': r[3], 'pk': r[5]}
                                       for r in c.execute('PRAGMA table_info(' + quote(table) + ')')}
        for name in LOCAL_COLUMNS:
            field = result['tables'].get('Order', {}).get(name)
            if field != {'type': 'TEXT', 'notnull': 0, 'pk': 0}:
                fail('INVALID_AUTHORITATIVE_ORDER_COLUMN')
        return result


def supported_schema(c, catalog, allow_missing=True):
    if catalog.get('version') != 2 or catalog.get('changes') != CHANGES:
        fail('UNSUPPORTED_UPGRADE_CATALOG')
    actual_tables = set(tables(c))
    for table, expected in catalog['tables'].items():
        if table not in actual_tables:
            if table in ('PaymentEvidence','LocalSchemaMigration') and allow_missing:
                continue
            fail('UNSUPPORTED_SCHEMA_MISSING_TABLE')
        fields = {r[1]: {'type': r[2].upper(), 'notnull': r[3], 'pk': r[5]}
                  for r in c.execute('PRAGMA table_info(' + quote(table) + ')')}
        for name, spec in expected.items():
            if any(t==table and n==name for t,n,_ in COLUMN_ADDITIONS) and name not in fields and allow_missing:
                continue
            if not compatible_column(table, name, fields.get(name), spec):
                raise SchemaCompatibilityError(table, name, spec, fields.get(name))
    indexes = c.execute('PRAGMA index_list("Order")').fetchall()
    existing = next((row for row in indexes if row[1] == 'Order_pickupNumber_idx'), None)
    if existing:
        fields = [r[2] for r in c.execute('PRAGMA index_info("Order_pickupNumber_idx")')]
        if existing[2] != 0 or fields != ['pickupNumber']:
            fail('UNSUPPORTED_PICKUP_INDEX')
    return existing is not None


def tree_manifest(root):
    root = regular(root)
    files = {}
    def visit(folder):
        for child in sorted(folder.iterdir()):
            regular(child)
            if child.is_dir():
                visit(child)
            elif child.is_file():
                files[child.relative_to(root).as_posix()] = digest(child)
            else:
                fail('UNSUPPORTED_APPLICATION_FILE')
    visit(root)
    if 'BTPS.exe' not in files:
        fail('OLD_APPLICATION_EXECUTABLE_MISSING')
    return files


def durable_json(path, data):
    path = pathlib.Path(path)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as stream:
        json.dump(data, stream, ensure_ascii=True, sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())
        temp = stream.name
    os.replace(temp, path)


def windows_processes():
    if sys.platform != 'win32':
        fail('WINDOWS_REQUIRED')
    from ctypes import wintypes
    class Entry(ctypes.Structure):
        _fields_ = [('dwSize', wintypes.DWORD), ('cntUsage', wintypes.DWORD), ('pid', wintypes.DWORD),
                    ('heap', ctypes.c_size_t), ('module', wintypes.DWORD), ('threads', wintypes.DWORD),
                    ('parent', wintypes.DWORD), ('priority', wintypes.LONG), ('flags', wintypes.DWORD),
                    ('name', wintypes.WCHAR * 260)]
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    kernel.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    kernel.Process32FirstW.argtypes = kernel.Process32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(Entry)]
    kernel.Process32FirstW.restype = kernel.Process32NextW.restype = wintypes.BOOL
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.CreateToolhelp32Snapshot(2, 0)
    if handle == ctypes.c_void_p(-1).value:
        fail('PROCESS_STATUS_UNAVAILABLE')
    names = []
    try:
        entry = Entry()
        entry.dwSize = ctypes.sizeof(entry)
        ok = kernel.Process32FirstW(handle, ctypes.byref(entry))
        if not ok:
            fail('PROCESS_STATUS_UNAVAILABLE')
        while ok:
            names.append(entry.name.lower())
            ok = kernel.Process32NextW(handle, ctypes.byref(entry))
    finally:
        kernel.CloseHandle(handle)
    return names


def require_stopped(processes):
    if {name.lower() for name in processes()} & {'btps.exe', 'bubbleteapos.exe', 'node.exe'}:
        fail('POS_OR_LOCAL_API_STILL_RUNNING')


def profile_database():
    if sys.platform != 'win32':
        fail('WINDOWS_REQUIRED')
    found = set()
    for folder_id in (0x1A, 0x1C):
        buffer = ctypes.create_unicode_buffer(32768)
        if ctypes.windll.shell32.SHGetFolderPathW(None, folder_id, None, 0, buffer) != 0:
            fail('WINDOWS_PROFILE_UNAVAILABLE')
        for app_name in ('BTPS', 'bubble-tea-saas'):
            db = pathlib.Path(buffer.value) / app_name / 'data' / 'dev.db'
            if db.exists():
                found.add(regular(db))
    if len(found) > 1:
        fail('AMBIGUOUS_PROFILE_DATABASE')
    return next(iter(found), None)


def registry_snapshot():
    if sys.platform != 'win32':
        return []
    import winreg
    result = []
    for hive_name in ('HKEY_CURRENT_USER', 'HKEY_LOCAL_MACHINE'):
        for view in (winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY):
            for path in ('Software\\' + APP_GUID, 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + APP_GUID):
                try:
                    with winreg.OpenKey(getattr(winreg, hive_name), path, 0, winreg.KEY_READ | view) as key:
                        values = []
                        for index in range(winreg.QueryInfoKey(key)[1]):
                            name, value, kind = winreg.EnumValue(key, index)
                            values.append([name, {'bytes': value.hex()} if isinstance(value, bytes) else value, kind])
                        result.append({'hive': hive_name, 'view': view, 'path': path, 'values': values})
                except FileNotFoundError:
                    pass
    return result


def prepare(db, old_app, catalog, processes, registry=None):
    require_stopped(processes)
    db, old_app = regular(db), regular(old_app)
    if not db.is_file() or not old_app.is_dir():
        fail('EXISTING_APP_AND_DATABASE_REQUIRED')
    if db.is_relative_to(old_app) or old_app.is_relative_to(db.parent):
        fail('APPLICATION_DATABASE_PATHS_OVERLAP')
    c = connection(db, writable=True)
    try:
        integrity(c)
        supported_schema(c, catalog)
        columns = column_map(c)
        history = fingerprints(c, columns)
        nonce = str(uuid.uuid4())
        backup_root = db.parent / 'upgrade-backups' / nonce
        regular(backup_root.parent)
        backup_root.mkdir(parents=True, exist_ok=False)
        before_db = backup_root / 'before.db'
        c.execute('VACUUM INTO ?', (str(before_db),))
        with open(before_db, 'r+b') as stream:
            os.fsync(stream.fileno())
        with closing(connection(before_db)) as snapshot:
            integrity(snapshot)
            if fingerprints(snapshot, columns) != history:
                fail('SNAPSHOT_HISTORY_MISMATCH')
        app_files = tree_manifest(old_app)
        app_backup = old_app.parent / ('.BTPS-upgrade-' + nonce)
        shutil.copytree(old_app, app_backup, copy_function=shutil.copy2)
        if tree_manifest(app_backup) != app_files or tree_manifest(old_app) != app_files:
            fail('APPLICATION_BACKUP_VERIFICATION_FAILED')
        for relative in app_files:
            with open(app_backup / relative, 'r+b') as stream:
                os.fsync(stream.fileno())
        receipt_path = backup_root / 'receipt.json'
        receipt = {'format': 1, 'sourceSha': catalog['sourceSha'], 'changes': CHANGES, 'nonce': nonce,
                   'database': str(db), 'databaseBackup': str(before_db), 'databaseBackupSha256': digest(before_db),
                   'oldApp': str(old_app), 'appBackup': str(app_backup), 'appFiles': app_files,
                   'columnsBefore': columns, 'historyBefore': history, 'registry': registry or [],
                   'receiptPath': str(receipt_path), 'status': 'backups-verified'}
        durable_json(receipt_path, receipt)
        require_stopped(processes)
        c.execute('BEGIN EXCLUSIVE')
        try:
            supported_schema(c, catalog)
            if fingerprints(c, columns) != history:
                fail('DATABASE_CHANGED_AFTER_SNAPSHOT')
            added_columns = []
            added_column = False
            for table,name,declaration in COLUMN_ADDITIONS:
                names = [r[1] for r in c.execute('PRAGMA table_info('+quote(table)+')')]
                if name not in names:
                    c.execute('ALTER TABLE '+quote(table)+' ADD COLUMN '+quote(name)+' '+declaration)
                    added_columns.append(table+'.'+name)
                    if table=='Order' and name=='pickupNumber': added_column=True
            if any(table in catalog['tables'] and table not in tables(c) for table in ('PaymentEvidence','LocalSchemaMigration')):
                ddl=catalog.get('newTableDDL',[])
                if not ddl or any(not any(table in statement for table in ('PaymentEvidence','LocalSchemaMigration')) for statement in ddl): fail('UNSUPPORTED_EVIDENCE_DDL')
                for statement in ddl: c.execute(statement.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ', 1).replace('CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX IF NOT EXISTS ', 1).replace('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ', 1))
            added_index = not supported_schema(c, catalog, allow_missing=False)
            if added_index:
                c.execute('CREATE INDEX "Order_pickupNumber_idx" ON "Order"("pickupNumber")')
            supported_schema(c, catalog, allow_missing=False)
            integrity(c)
            if fingerprints(c, columns) != history:
                fail('HISTORICAL_ROWS_CHANGED')
            require_stopped(processes)
            c.commit()
        except Exception:
            c.rollback()
            raise
        receipt.update(status='prepared', columnAdded=added_column, columnsAdded=added_columns, indexAdded=added_index, historicalRowsPreserved=True)
        durable_json(receipt_path, receipt)
        return receipt
    finally:
        c.close()


def verify_receipt(receipt, catalog, processes):
    require_stopped(processes)
    if receipt.get('format') != 1 or receipt.get('sourceSha') != catalog['sourceSha'] or receipt.get('changes') != CHANGES or receipt.get('status') != 'prepared':
        fail('UNVERIFIED_UPGRADE_RECEIPT')
    db, old_app = regular(receipt['database']), regular(receipt['oldApp'])
    nonce = str(uuid.UUID(receipt['nonce']))
    expected_db_backup = db.parent / 'upgrade-backups' / nonce / 'before.db'
    expected_app_backup = old_app.parent / ('.BTPS-upgrade-' + nonce)
    if pathlib.Path(receipt['databaseBackup']) != expected_db_backup or pathlib.Path(receipt['appBackup']) != expected_app_backup:
        fail('BACKUP_PATH_MISMATCH')
    regular(expected_db_backup)
    regular(expected_app_backup)
    if digest(expected_db_backup) != receipt['databaseBackupSha256'] or tree_manifest(expected_app_backup) != receipt['appFiles']:
        fail('BACKUP_BYTES_CHANGED')
    with closing(connection(expected_db_backup)) as backup:
        integrity(backup)
        if fingerprints(backup, receipt['columnsBefore']) != receipt['historyBefore']:
            fail('BACKUP_HISTORY_CHANGED')
    with closing(connection(db)) as current:
        supported_schema(current, catalog, allow_missing=False)
        integrity(current)
        if fingerprints(current, receipt['columnsBefore']) != receipt['historyBefore']:
            fail('DATABASE_CHANGED_DURING_INSTALLATION')
    return True


def restore_application(receipt, catalog, processes):
    # Never restores or overwrites the database. Additive committed schema remains.
    verify_receipt(receipt, catalog, processes)
    old_app, app_backup = regular(receipt['oldApp']), regular(receipt['appBackup'])
    if old_app.exists():
        failed_new = old_app.parent / ('.BTPS-failed-new-' + str(uuid.uuid4()))
        os.rename(old_app, failed_new)
    os.rename(app_backup, old_app)  # Same-volume atomic rollback; no extra disk space.
    if tree_manifest(old_app) != receipt['appFiles']:
        fail('APPLICATION_ROLLBACK_VERIFICATION_FAILED')
    if sys.platform == 'win32':
        import winreg
        for item in receipt['registry']:
            with winreg.CreateKeyEx(getattr(winreg, item['hive']), item['path'], 0, winreg.KEY_SET_VALUE | item['view']) as key:
                for name, value, kind in item['values']:
                    if isinstance(value, dict):
                        value = bytes.fromhex(value['bytes'])
                    winreg.SetValueEx(key, name, 0, kind, value)
    return {'status': 'old-application-restored', 'databaseRestored': False, 'historicalRowsPreserved': True}


def bundled_catalog():
    root = pathlib.Path(getattr(sys, '_MEIPASS', pathlib.Path(__file__).parent))
    return json.loads((root / 'runtime' / 'schema-catalog.json').read_text(encoding='utf-8'))


def load_receipt(result_path, catalog):
    result = json.loads(pathlib.Path(result_path).read_text(encoding='utf-8'))
    current_db = profile_database()
    if current_db is None or pathlib.Path(result['database']) != current_db:
        fail('PROFILE_DATABASE_MISMATCH')
    expected = current_db.parent / 'upgrade-backups' / str(uuid.UUID(result['nonce'])) / 'receipt.json'
    if pathlib.Path(result['receiptPath']) != expected:
        fail('RECEIPT_PATH_MISMATCH')
    receipt = json.loads(regular(expected).read_text(encoding='utf-8'))
    if receipt.get('sourceSha') != catalog['sourceSha']:
        fail('RECEIPT_SOURCE_MISMATCH')
    return receipt


def main():
    global LAST_DIAGNOSTIC
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    build = sub.add_parser('build-catalog')
    build.add_argument('--template', required=True)
    build.add_argument('--output', required=True)
    build.add_argument('--source-sha', required=True)
    sub.add_parser('check-stopped')
    plan = sub.add_parser('prepare')
    plan.add_argument('--old-app', required=True)
    plan.add_argument('--result', required=True)
    plan.add_argument('--operator-confirmed', action='store_true', required=True)
    plan.add_argument('--diagnostic')
    for name in ('verify', 'restore'):
        p = sub.add_parser(name)
        p.add_argument('--receipt', required=True)
    args = parser.parse_args()
    LAST_DIAGNOSTIC = getattr(args, 'diagnostic', None)
    if args.command == 'build-catalog':
        if getattr(sys, 'frozen', False):
            fail('BUILD_COMMAND_NOT_AVAILABLE_IN_INSTALLER')
        catalog = catalog_from_empty(args.template, args.source_sha)
        durable_json(args.output, catalog)
        return
    if sys.platform != 'win32' or not getattr(sys, 'frozen', False):
        fail('NATIVE_WINDOWS_INSTALLER_HELPER_REQUIRED')
    catalog = bundled_catalog()
    if args.command == 'check-stopped':
        require_stopped(windows_processes)
        print(json.dumps({'status': 'stopped'}))
    elif args.command == 'prepare':
        if args.diagnostic:
            diagnostic = regular(args.diagnostic)
            diagnostic.parent.mkdir(parents=True, exist_ok=True)
            durable_json(diagnostic, {'status': 'running', 'stage': 'profile-database'})
        db = profile_database()
        if db is None:
            fail('LEGACY_PROFILE_DATABASE_NOT_FOUND')
        if args.diagnostic:
            durable_json(diagnostic, {'status': 'running', 'stage': 'schema-and-backup'})
        receipt = prepare(db, args.old_app, catalog, windows_processes, registry_snapshot())
        durable_json(args.result, receipt)
        if args.diagnostic:
            durable_json(diagnostic, {'status': 'prepared', 'reason': None})
        print(json.dumps({'status': 'prepared', 'historicalRowsPreserved': True}))
    else:
        receipt = load_receipt(args.receipt, catalog)
        if args.command == 'verify':
            verify_receipt(receipt, catalog, windows_processes)
            print(json.dumps({'status': 'verified'}))
        else:
            print(json.dumps(restore_application(receipt, catalog, windows_processes)))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        report = {'status': 'blocked', 'reason': str(error) if isinstance(error, RuntimeError) else type(error).__name__}
        if isinstance(error, SchemaCompatibilityError):
            report['details'] = error.details
        if LAST_DIAGNOSTIC:
            try:
                durable_json(LAST_DIAGNOSTIC, report)
            except Exception:
                pass
        print(json.dumps(report))
        sys.exit(73)
