from contextlib import closing
import importlib.util
import pathlib
import shutil
import socket
import sqlite3
import struct
import tempfile
import unittest
import zipfile
from unittest import mock

SPEC = importlib.util.spec_from_file_location('upgrade', pathlib.Path(__file__).parents[2] / 'scripts/desktop-db-upgrade.py')
U = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(U)


class UpgradeTests(unittest.TestCase):
    def test_automatic_close_targets_only_the_original_pos_directory(self):
        root = self.root / 'btps-close-owned'
        self.assertTrue(U.owned_pos_executable(root / 'BTPS.exe', root))
        self.assertFalse(U.owned_pos_executable(root / 'node.exe', root))
        self.assertFalse(U.owned_pos_executable(root.parent / 'other-pos' / 'BTPS.exe', root))

    def test_wait_allows_a_pos_that_is_finishing_normal_exit(self):
        with mock.patch.object(U.time, 'sleep') as sleep:
            U.wait_stopped(mock.Mock(side_effect=[['BTPS.exe'], []]), timeout=15)
        sleep.assert_called_once()

    def test_wait_requests_shutdown_when_the_pos_is_still_running(self):
        close = mock.Mock()
        with mock.patch.object(U.time, 'sleep'):
            U.wait_stopped(mock.Mock(side_effect=[['BTPS.exe'], []]), on_running=close)
        close.assert_called_once()

    def test_installer_retries_graceful_close_when_pos_remains_or_reappears(self):
        close = mock.Mock(return_value=1)
        clock = iter([0.0, 0.5, 1.1]).__next__
        with mock.patch.object(U, 'wait_stopped') as wait:
            wait.side_effect = lambda _processes, _timeout, on_running, quiet_period: [on_running() for _ in range(3)]
            requests = U.request_stop_until_closed(lambda: ['BTPS.exe'], self.app, 60, close, clock)
        self.assertEqual(requests, 2)
        self.assertEqual(close.call_count, 2)
        wait.assert_called_once()
        self.assertEqual(wait.call_args.kwargs['quiet_period'], 8)

    def test_installer_does_not_accept_a_brief_gap_before_old_pos_reappears(self):
        elapsed = [0.0]
        def advance(seconds):
            elapsed[0] += seconds
        def processes():
            return ['BTPS.exe'] if elapsed[0] < 1 or 3 <= elapsed[0] < 4 else []
        close = mock.Mock(return_value=1)
        with mock.patch.object(U.time, 'monotonic', side_effect=lambda: elapsed[0]), mock.patch.object(U.time, 'sleep', side_effect=advance):
            requests = U.request_stop_until_closed(processes, self.app, 20, close)
        self.assertEqual(requests, 2)
        self.assertGreaterEqual(elapsed[0], 12)

    def test_successful_upgrade_stages_do_not_write_diagnostic_file(self):
        diagnostic = self.root / 'upgrade-check.json'
        previous = U.LAST_DIAGNOSTIC
        try:
            U.LAST_DIAGNOSTIC = diagnostic
            U.upgrade_stage('automatic-pos-shutdown')
            self.assertFalse(diagnostic.exists())
            self.assertEqual(U.LAST_STAGE, 'automatic-pos-shutdown')
        finally:
            U.LAST_DIAGNOSTIC = previous

    def test_still_running_reports_the_specific_blocker(self):
        with self.assertRaises(U.PosStillRunningError) as caught:
            U.wait_stopped(lambda: ['BTPS.exe'], timeout=0)
        report = U.failure_report(caught.exception)
        self.assertEqual(report['details']['posProcesses'], ['btps.exe'])
        self.assertEqual(report['reason'], 'POS_OR_LOCAL_API_STILL_RUNNING')

    def test_local_api_is_reported_without_blame_on_unrelated_node(self):
        with mock.patch.object(U, 'windows_local_api_listening', return_value=True):
            with self.assertRaises(U.PosStillRunningError) as caught:
                U.wait_stopped(lambda: ['node.exe'], timeout=0)
        self.assertEqual(caught.exception.details, {'posProcesses': [], 'localApiPort': 7072})

    def test_local_api_listener_table_does_not_depend_on_tcp_accept_queue(self):
        listening = struct.pack('<I6I', 1, 2, 0, socket.htons(7072), 0, 0, 1234)
        closed = struct.pack('<I6I', 1, 5, 0, socket.htons(7072), 0, 0, 1234)
        self.assertTrue(U.tcp_table_has_listener(listening, 7072))
        self.assertFalse(U.tcp_table_has_listener(closed, 7072))
        with self.assertRaises(RuntimeError):
            U.tcp_table_has_listener(listening[:-1], 7072)

    def test_unrelated_node_process_does_not_block_pos_upgrade(self):
        self.assertIsNone(U.require_stopped(lambda: ['node.exe']))

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='btps-owned-upgrade-')
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name).resolve()
        self.db = self.root / 'data' / 'dev.db'
        self.db.parent.mkdir()
        self.app = self.root / 'program' / 'BTPS'
        self.app.mkdir(parents=True)
        (self.app / 'BTPS.exe').write_bytes(b'owned-old-program')
        (self.app / 'history-file').write_bytes(b'preserve-me')
        (self.app / 'empty-uploads').mkdir()
        template = self.root / 'empty.db'
        with closing(sqlite3.connect(template)) as c, c:
            c.execute('CREATE TABLE "Order" (id TEXT PRIMARY KEY, total REAL, evidence BLOB, pickupNumber TEXT, requestFingerprint TEXT, requestReceipt TEXT, checkoutTaxAmount INTEGER)')
        with closing(sqlite3.connect(template)) as c, c:
            c.execute('CREATE TABLE Leave (id TEXT PRIMARY KEY, totalDays REAL NOT NULL)')
            c.execute('CREATE TABLE LeaveBalance (id TEXT PRIMARY KEY, usedLeave REAL NOT NULL, usedSick REAL NOT NULL)')
            for table in ['Staff','Inventory','StockInLog','StockOutLog','RefundRequest','PurchaseOrder','PurchaseOrderItem','Expense']:
                fields=', '.join(U.quote(name)+' '+declaration for t,name,declaration in U.COLUMN_ADDITIONS if t==table)
                c.execute('CREATE TABLE '+U.quote(table)+' (id TEXT PRIMARY KEY, '+fields+')')
            c.execute('CREATE TABLE PaymentEvidence (id TEXT PRIMARY KEY, orderId TEXT, image BLOB)')
        self.catalog = U.catalog_from_empty(template, 'a' * 40)
        with closing(sqlite3.connect(self.db)) as c, c:
            c.execute('CREATE TABLE Leave (id TEXT PRIMARY KEY, totalDays INTEGER NOT NULL)')
            c.execute('INSERT INTO Leave VALUES (?, ?)', ('old-leave', 2))
            c.execute('CREATE TABLE LeaveBalance (id TEXT PRIMARY KEY, usedLeave INTEGER NOT NULL, usedSick INTEGER NOT NULL)')
            c.execute('INSERT INTO LeaveBalance VALUES (?, ?, ?)', ('old-balance', 3, 4))
            c.execute('CREATE TABLE "Order" (id TEXT PRIMARY KEY, total REAL, evidence BLOB)')
            c.execute('INSERT INTO "Order" VALUES (?, ?, ?)', ('historical', 123.45, b'\x00\xff'))
            for table in ['Staff','Inventory','StockInLog','StockOutLog','RefundRequest','PurchaseOrder','PurchaseOrderItem','Expense']:
                c.execute('CREATE TABLE '+U.quote(table)+' (id TEXT PRIMARY KEY)')
        self.before = U.digest(self.db)
        self.app_before = U.tree_manifest(self.app)
        self.installer = self.root / 'candidate.exe'
        self.installer.write_bytes(b'owned-candidate-installer')

    def prepare(self, processes=lambda: []):
        return U.prepare(self.db, self.app, self.catalog, processes)

    def employee_number_catalog(self):
        template = self.root / 'empty.db'
        with closing(sqlite3.connect(template)) as c, c:
            c.execute('ALTER TABLE Staff ADD COLUMN employeeNumber TEXT')
            c.execute('CREATE UNIQUE INDEX Staff_employeeNumber_key ON Staff(employeeNumber)')
        with closing(sqlite3.connect(self.db)) as c, c:
            c.execute('ALTER TABLE Staff ADD COLUMN employeeNumber TEXT')
        self.catalog = U.catalog_from_empty(template, 'a' * 40)

    def test_employee_index_keeps_issued_number_and_enforces_uniqueness(self):
        self.employee_number_catalog()
        with closing(sqlite3.connect(self.db)) as c, c:
            c.execute('INSERT INTO Staff(id,employeeNumber) VALUES (?,?)',('worker','EMP005'))
        self.prepare()
        with closing(sqlite3.connect(self.db)) as c:
            self.assertEqual(c.execute('SELECT employeeNumber FROM Staff WHERE id="worker"').fetchone()[0],'EMP005')
            with self.assertRaises(sqlite3.IntegrityError):
                c.execute('INSERT INTO Staff(id,employeeNumber) VALUES (?,?)',('other','EMP005'))

    def test_duplicate_employee_numbers_refuse_upgrade_without_renumbering_or_data_loss(self):
        self.employee_number_catalog()
        with closing(sqlite3.connect(self.db)) as c, c:
            c.executemany('INSERT INTO Staff(id,employeeNumber) VALUES (?,?)',[('one','EMP009'),('two','EMP009')])
        before = U.digest(self.db)
        with self.assertRaisesRegex(RuntimeError,'EMPLOYEE_NUMBER_DUPLICATE'):
            self.prepare()
        self.assertEqual(U.digest(self.db), before)
        self.assertEqual(U.tree_manifest(self.app), self.app_before)

    def test_permission_tables_are_additive_and_repeated_upgrade_preserves_approvals(self):
        template = self.root / 'empty.db'
        with closing(sqlite3.connect(template)) as c, c:
            c.execute('CREATE TABLE StaffActionApproval (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT "pending")')
            c.execute('CREATE TABLE StaffApprovalCredential (userId TEXT PRIMARY KEY, pinHash TEXT NOT NULL)')
            c.execute('CREATE INDEX StaffActionApproval_status_idx ON StaffActionApproval(status)')
        self.catalog = U.catalog_from_empty(template, 'a' * 40)
        receipt = self.prepare()
        self.assertTrue(pathlib.Path(receipt['databaseBackup']).exists())
        with closing(sqlite3.connect(self.db)) as c, c:
            self.assertEqual(c.execute('SELECT total FROM "Order" WHERE id="historical"').fetchone()[0],123.45)
            c.execute('INSERT INTO StaffActionApproval(id,status) VALUES (?,?)',('approval','pending'))
            c.execute('INSERT INTO StaffApprovalCredential(userId,pinHash) VALUES (?,?)',('fixture','synthetic-only'))
        self.prepare()
        with closing(sqlite3.connect(self.db)) as c:
            self.assertEqual(c.execute('SELECT status FROM StaffActionApproval WHERE id="approval"').fetchone()[0],'pending')
            self.assertEqual(c.execute('SELECT pinHash FROM StaffApprovalCredential WHERE userId="fixture"').fetchone()[0],'synthetic-only')

    def test_legacy_expenses_gain_payment_metadata_without_asserting_cash_or_changing_history(self):
        with closing(sqlite3.connect(self.db)) as c, c:
            c.execute('ALTER TABLE Expense ADD COLUMN amount INTEGER')
            c.execute('ALTER TABLE Expense ADD COLUMN date DATETIME')
            c.execute('INSERT INTO Expense VALUES (?, ?, ?)', ('old-purchase', 33520000, '2026-10-18T03:00:00Z'))
        receipt = self.prepare()
        self.assertTrue(U.verify_receipt(receipt, self.catalog, lambda: []))
        with closing(sqlite3.connect(self.db)) as c:
            self.assertEqual(c.execute('SELECT id,amount,date,paymentSource,cashSessionId,cashOccurredAt FROM Expense').fetchall(),
                             [('old-purchase', 33520000, '2026-10-18T03:00:00Z', 'unknown', None, None)])
        unchanged = U.digest(self.db)
        repeated = self.prepare()
        self.assertEqual(repeated['columnsAdded'], [])
        self.assertEqual(U.digest(self.db), unchanged)

    def test_success_preserves_every_old_value_and_verified_backups(self):
        receipt = self.prepare()
        self.assertEqual(pathlib.Path(receipt['appBackup']), U.application_backup_path(self.app, receipt['nonce']))
        self.assertTrue(pathlib.Path(receipt['appBackup']).is_file())
        self.assertEqual(U.archive_manifest(receipt['appBackup']), self.app_before)
        self.assertTrue(receipt['columnAdded'])
        self.assertEqual(receipt['columnsAdded'], [t+'.'+n for t,n,_ in U.COLUMN_ADDITIONS])
        self.assertTrue(receipt['indexAdded'])
        self.assertTrue(U.verify_receipt(receipt, self.catalog, lambda: []))
        self.assertEqual(U.tree_manifest(self.app), self.app_before)
        self.assertTrue((self.app / 'empty-uploads').is_dir())
        with closing(sqlite3.connect(self.db)) as c, c:
            self.assertEqual(c.execute('SELECT * FROM "Order"').fetchall(), [('historical', 123.45, b'\x00\xff', None, None, None, None)])
        self.assertEqual(U.digest(receipt['databaseBackup']), receipt['databaseBackupSha256'])

    def test_inventory_upgrade_keeps_purchase_children_and_all_old_values(self):
        template = self.root / 'empty.db'
        with closing(sqlite3.connect(template)) as c, c:
            c.execute('ALTER TABLE PurchaseOrder ADD COLUMN supplierId TEXT')
            c.execute('ALTER TABLE PurchaseOrderItem ADD COLUMN purchaseOrderId TEXT REFERENCES PurchaseOrder(id) ON DELETE CASCADE')
            c.execute('CREATE UNIQUE INDEX "PurchaseOrder_requestId_key" ON PurchaseOrder(requestId)')
            c.execute('CREATE UNIQUE INDEX "StockInLog_operationId_key" ON StockInLog(operationId)')
            c.execute('CREATE UNIQUE INDEX "StockOutLog_operationId_key" ON StockOutLog(operationId)')
            c.execute('CREATE TABLE OrderConsumptionSnapshot (id TEXT PRIMARY KEY, orderId TEXT NOT NULL, materials TEXT NOT NULL)')
            c.execute('CREATE UNIQUE INDEX OrderConsumptionSnapshot_orderId_key ON OrderConsumptionSnapshot(orderId)')
            c.execute('CREATE TABLE ConsumptionAlert (id TEXT PRIMARY KEY, storeId TEXT NOT NULL)')
        self.catalog = U.catalog_from_empty(template, 'a' * 40)
        with closing(sqlite3.connect(self.db)) as c, c:
            c.execute('ALTER TABLE PurchaseOrder ADD COLUMN supplierId TEXT NOT NULL DEFAULT "original-supplier"')
            c.execute('ALTER TABLE PurchaseOrderItem ADD COLUMN purchaseOrderId TEXT REFERENCES PurchaseOrder(id) ON DELETE CASCADE')
            c.execute('CREATE INDEX historical_purchase_supplier ON PurchaseOrder(supplierId)')
            c.execute('INSERT INTO PurchaseOrder(id) VALUES ("old-purchase")')
            c.execute('INSERT INTO PurchaseOrderItem(id,purchaseOrderId) VALUES ("old-item","old-purchase")')
            c.execute('INSERT INTO Inventory(id) VALUES ("original-stock")')
        receipt = self.prepare()
        self.assertTrue(U.verify_receipt(receipt, self.catalog, lambda: []))
        with closing(sqlite3.connect(self.db)) as c, c:
            c.execute('PRAGMA foreign_keys=ON')
            self.assertEqual(c.execute('SELECT supplierId,source FROM PurchaseOrder WHERE id="old-purchase"').fetchone(), ('original-supplier', 'admin'))
            self.assertEqual(c.execute('SELECT purchaseOrderId FROM PurchaseOrderItem WHERE id="old-item"').fetchone(), ('old-purchase',))
            self.assertEqual(c.execute('SELECT id FROM Inventory').fetchall(), [('original-stock',)])
            self.assertEqual(c.execute('PRAGMA foreign_key_check').fetchall(), [])
            self.assertIsNotNone(c.execute('SELECT name FROM sqlite_master WHERE name="historical_purchase_supplier"').fetchone())
            c.execute('INSERT INTO PurchaseOrder(id,supplierId) VALUES ("online-purchase",NULL)')
            c.execute('INSERT INTO OrderConsumptionSnapshot VALUES ("snapshot","order","[]")')
            c.execute('INSERT INTO StockOutLog(id,operationId) VALUES ("actual","once")')
            with self.assertRaises(sqlite3.IntegrityError):
                c.execute('INSERT INTO StockOutLog(id,operationId) VALUES ("duplicate","once")')
        self.prepare()
        with closing(sqlite3.connect(self.db)) as c:
            self.assertEqual(c.execute('SELECT materials FROM OrderConsumptionSnapshot WHERE id="snapshot"').fetchone(), ('[]',))
            self.assertEqual(c.execute('SELECT count(*) FROM PurchaseOrderItem').fetchone()[0], 1)

    def test_deep_prisma_asset_stays_below_windows_backup_path_limit(self):
        folder = self.app / 'resources' / 'app.asar.unpacked' / 'server' / 'node_modules' / '.prisma' / 'client'
        leaf_length = 224 - len(str(folder)) - 1
        self.assertGreater(leaf_length, 0)
        asset = folder / ('x' * leaf_length)
        folder.mkdir(parents=True)
        asset.write_bytes(b'old-prisma-cache')
        self.app_before = U.tree_manifest(self.app)

        receipt = self.prepare()
        relative = asset.relative_to(self.app)
        previous_backup = self.app.parent / ('.BTPS-upgrade-' + receipt['nonce']) / relative
        current_backup = pathlib.Path(receipt['appBackup'])
        self.assertGreaterEqual(len(str(previous_backup)), 260)
        self.assertLess(len(str(current_backup)), 260)
        with zipfile.ZipFile(current_backup) as backup:
            self.assertEqual(backup.read(relative.as_posix()), b'old-prisma-cache')
        self.assertTrue(U.verify_receipt(receipt, self.catalog, lambda: []))
        (self.app / 'BTPS.exe').write_bytes(b'partially-installed-new')
        U.restore_application(receipt, self.catalog, lambda: [])
        self.assertEqual((self.app / relative).read_bytes(), b'old-prisma-cache')

    def test_repeat_is_idempotent_and_preserves_existing_pickup_values(self):
        self.prepare()
        with closing(sqlite3.connect(self.db)) as c, c:
            c.execute('UPDATE "Order" SET pickupNumber=?', ('P-001',))
        receipt = self.prepare()
        self.assertFalse(receipt['columnAdded'])
        self.assertEqual(receipt['columnsAdded'], [])
        self.assertFalse(receipt['indexAdded'])
        self.assertTrue(U.verify_receipt(receipt, self.catalog, lambda: []))
        with closing(sqlite3.connect(self.db)) as c, c:
            self.assertEqual(c.execute('SELECT pickupNumber FROM "Order"').fetchone()[0], 'P-001')

    def test_historical_integer_leave_columns_preserve_schema_and_values(self):
        with closing(sqlite3.connect(self.db)) as c:
            before = {table: c.execute('SELECT sql FROM sqlite_master WHERE name=?', (table,)).fetchone()[0] for table in ('Leave', 'LeaveBalance')}
        receipt = self.prepare()
        self.assertTrue(U.verify_receipt(receipt, self.catalog, lambda: []))
        with closing(sqlite3.connect(self.db)) as c, c:
            self.assertEqual(c.execute('SELECT totalDays,typeof(totalDays) FROM Leave').fetchone(), (2, 'integer'))
            self.assertEqual(c.execute('SELECT usedLeave,usedSick FROM LeaveBalance').fetchone(), (3, 4))
            for table, ddl in before.items():
                self.assertEqual(c.execute('SELECT sql FROM sqlite_master WHERE name=?', (table,)).fetchone()[0], ddl)
            c.execute('UPDATE Leave SET totalDays=2.5')
            c.execute('UPDATE LeaveBalance SET usedLeave=3.5,usedSick=4.5')
            self.assertEqual(c.execute('SELECT totalDays FROM Leave').fetchone()[0], 2.5)
            self.assertEqual(c.execute('SELECT usedLeave,usedSick FROM LeaveBalance').fetchone(), (3.5, 4.5))

    def test_historical_procurement_cost_affinity_and_new_nullable_columns(self):
        template = self.root / 'empty.db'
        with closing(sqlite3.connect(template)) as c, c:
            c.execute('CREATE TABLE Batch (id TEXT PRIMARY KEY, unitCost REAL NOT NULL)')
            for table, name in U.LEGACY_COST_FLOAT_COLUMNS:
                if (table, name) not in [('Batch', 'unitCost'), ('PurchaseOrderItem', 'inputUnitCost')]:
                    c.execute('ALTER TABLE '+U.quote(table)+' ADD COLUMN '+U.quote(name)+' REAL NOT NULL DEFAULT 0')
        with closing(sqlite3.connect(self.db)) as c, c:
            c.execute('CREATE TABLE Batch (id TEXT PRIMARY KEY, unitCost INTEGER NOT NULL)')
            c.execute('INSERT INTO Batch VALUES ("old-batch",123)')
            for (table, name), affinity in U.LEGACY_COST_FLOAT_COLUMNS.items():
                if (table, name) != ('Batch', 'unitCost'):
                    suffix = '' if name == 'inputUnitCost' else ' NOT NULL DEFAULT 0'
                    c.execute('ALTER TABLE '+U.quote(table)+' ADD COLUMN '+U.quote(name)+' '+affinity+suffix)
            c.execute('INSERT INTO Inventory(id,avgCost) VALUES ("old-inventory",1234)')
        self.catalog = U.catalog_from_empty(template, 'a' * 40)
        receipt = self.prepare()
        self.assertTrue(U.verify_receipt(receipt, self.catalog, lambda: []))
        with closing(sqlite3.connect(self.db)) as c, c:
            self.assertEqual(c.execute('SELECT unitCost,typeof(unitCost) FROM Batch').fetchone(), (123, 'integer'))
            self.assertEqual(c.execute('SELECT avgCost,typeof(avgCost) FROM Inventory').fetchone(), (1234, 'integer'))
            c.execute('UPDATE Batch SET unitCost=123.5')
            c.execute('UPDATE Inventory SET avgCost=1234.5')
            self.assertEqual(c.execute('SELECT unitCost FROM Batch').fetchone()[0], 123.5)
            self.assertEqual(c.execute('SELECT avgCost FROM Inventory').fetchone()[0], 1234.5)
            self.assertEqual(c.execute('SELECT name FROM pragma_table_info("PurchaseOrder") WHERE name="paidAt"').fetchone()[0], 'paidAt')
            self.assertEqual(c.execute('SELECT name FROM pragma_table_info("PurchaseOrderItem") WHERE name="lineAmount"').fetchone()[0], 'lineAmount')

    def test_unapproved_type_and_constraint_drift_still_block_with_field_diagnostics(self):
        for declaration in ('TEXT NOT NULL', 'INTEGER'):
            with closing(sqlite3.connect(self.db)) as c, c:
                c.execute('DROP TABLE Leave')
                c.execute('CREATE TABLE Leave (id TEXT PRIMARY KEY, totalDays '+declaration+')')
            before = U.digest(self.db)
            with self.assertRaises(U.SchemaCompatibilityError) as result:
                self.prepare()
            self.assertEqual(result.exception.details['table'], 'Leave')
            self.assertEqual(result.exception.details['column'], 'totalDays')
            self.assertEqual(U.digest(self.db), before)
            self.assertFalse((self.db.parent / 'upgrade-backups').exists())

    def test_partial_old_schema_preserves_existing_receipt_values(self):
        with closing(sqlite3.connect(self.db)) as c, c:
            c.execute('ALTER TABLE "Order" ADD COLUMN requestFingerprint TEXT')
            c.execute('UPDATE "Order" SET requestFingerprint=?', ('old-fingerprint',))
        receipt = self.prepare()
        self.assertEqual(receipt['columnsAdded'], [t+'.'+n for t,n,_ in U.COLUMN_ADDITIONS if not (t=='Order' and n=='requestFingerprint')])
        with closing(sqlite3.connect(self.db)) as c, c:
            self.assertEqual(c.execute('SELECT requestFingerprint,requestReceipt,pickupNumber FROM "Order"').fetchone(), ('old-fingerprint', None, None))

    def test_current_database_needs_no_ddl_and_keeps_receipts(self):
        self.prepare()
        with closing(sqlite3.connect(self.db)) as c, c:
            c.execute('UPDATE "Order" SET requestFingerprint=?,requestReceipt=?', ('fingerprint', 'original-receipt'))
        before = U.digest(self.db)
        receipt = self.prepare()
        self.assertEqual(receipt['columnsAdded'], [])
        self.assertFalse(receipt['indexAdded'])
        self.assertEqual(U.digest(self.db), before)
        self.assertTrue(U.verify_receipt(receipt, self.catalog, lambda: []))

    def test_running_app_refuses_before_backups_or_database_write(self):
        with self.assertRaises(RuntimeError):
            self.prepare(lambda: ['BTPS.exe'])
        self.assertEqual(U.digest(self.db), self.before)
        self.assertFalse((self.db.parent / 'upgrade-backups').exists())

    def test_backup_failure_preserves_original_bytes(self):
        (self.db.parent / 'upgrade-backups').write_bytes(b'obstruction')
        with self.assertRaises(OSError):
            self.prepare()
        self.assertEqual(U.digest(self.db), self.before)
        self.assertEqual(U.tree_manifest(self.app), self.app_before)

    def test_archive_failure_preserves_original_database_and_program(self):
        problem = OSError(5, 'Access is denied', str(self.app / 'BTPS.exe'))
        with mock.patch.object(U, 'create_application_archive', side_effect=problem):
            with self.assertRaises(OSError) as result:
                self.prepare()
        report = U.failure_report(result.exception)
        self.assertEqual(report['stage'], 'application-backup')
        self.assertEqual(report['reason'], 'OSError')
        self.assertIn('Access is denied', report['message'])
        self.assertEqual(U.digest(self.db), self.before)
        self.assertEqual(U.tree_manifest(self.app), self.app_before)

    def test_real_ddl_failure_rolls_back_column_and_bytes(self):
        with closing(sqlite3.connect(self.db)) as c, c:
            c.execute('CREATE VIEW Order_pickupNumber_idx AS SELECT 1')
        before = U.digest(self.db)
        with self.assertRaises(sqlite3.OperationalError):
            self.prepare()
        self.assertEqual(U.digest(self.db), before)
        self.assertEqual(U.tree_manifest(self.app), self.app_before)
        self.assertEqual(len(list((self.db.parent / 'upgrade-backups').glob('*/before.db'))), 1)

    def test_program_failure_restores_full_old_application_without_database_restore(self):
        receipt = self.prepare()
        committed = U.digest(self.db)
        (self.app / 'BTPS.exe').write_bytes(b'partially-installed-new')
        (self.app / 'new-file').write_bytes(b'keep-failure-evidence')
        outcome = U.restore_application(receipt, self.catalog, lambda: [])
        self.assertFalse(outcome['databaseRestored'])
        self.assertEqual(U.digest(self.db), committed)
        self.assertEqual(U.tree_manifest(self.app), self.app_before)
        self.assertTrue((self.app / 'empty-uploads').is_dir())
        self.assertEqual(len(list(self.app.parent.glob('.BTPS-failed-new-*'))), 1)
        self.assertTrue(pathlib.Path(receipt['databaseBackup']).is_file())

    def test_corrupt_archive_refuses_rollback_before_moving_current_program(self):
        receipt = self.prepare()
        (self.app / 'BTPS.exe').write_bytes(b'partially-installed-new')
        current = U.tree_manifest(self.app)
        archive = pathlib.Path(receipt['appBackup'])
        with open(archive, 'r+b') as stream:
            stream.seek(0)
            stream.write(b'corrupt archive header')
        with self.assertRaisesRegex(RuntimeError, 'BACKUP_BYTES_CHANGED'):
            U.restore_application(receipt, self.catalog, lambda: [])
        self.assertEqual(U.tree_manifest(self.app), current)
        self.assertFalse(list(self.app.parent.glob('.BTPS-failed-new-*')))

    def test_schema_drift_refuses_before_backup(self):
        with closing(sqlite3.connect(self.db)) as c, c:
            c.execute('ALTER TABLE "Order" RENAME COLUMN total TO amount')
        before = U.digest(self.db)
        with self.assertRaises(RuntimeError):
            self.prepare()
        self.assertEqual(U.digest(self.db), before)
        self.assertFalse((self.db.parent / 'upgrade-backups').exists())

    def test_changed_backup_or_new_sale_refuses_restore(self):
        receipt = self.prepare()
        with closing(sqlite3.connect(self.db)) as c, c:
            c.execute('INSERT INTO "Order" (id,total,evidence,pickupNumber) VALUES (?, ?, ?, ?)', ('new-sale', 10, b'', None))
        before = U.digest(self.db)
        with self.assertRaisesRegex(RuntimeError, 'DATABASE_CHANGED_DURING_INSTALLATION'):
            U.restore_application(receipt, self.catalog, lambda: [])
        self.assertEqual(U.digest(self.db), before)
        self.assertEqual(U.tree_manifest(self.app), self.app_before)
        pathlib.Path(receipt['databaseBackup']).write_bytes(b'corrupt-backup')
        with self.assertRaisesRegex(RuntimeError, 'BACKUP_BYTES_CHANGED'):
            U.verify_receipt(receipt, self.catalog, lambda: [])

    def test_background_stage_reuses_verified_backup_without_copying_in_installer(self):
        staged = U.stage_backup(self.db, self.app, self.installer)
        pointer = self.root / 'upgrade-stage.json'
        U.durable_json(pointer, {'format': 1, 'nonce': staged['nonce'],
                                  'receiptPath': staged['receiptPath'],
                                  'installerSha512': staged['installerSha512']})
        selected = U.staged_receipt(pointer, self.installer, self.db, self.app)
        with mock.patch.object(U, 'create_application_archive', side_effect=AssertionError('must not copy during install')):
            receipt = U.prepare(self.db, self.app, self.catalog, lambda: [], staged=selected)
        self.assertEqual(receipt['nonce'], staged['nonce'])
        self.assertTrue(receipt['preverifiedBackup'])
        self.assertTrue(U.verify_receipt(receipt, self.catalog, lambda: []))

    def stage_pointer(self):
        staged = U.stage_backup(self.db, self.app, self.installer)
        pointer = self.root / 'upgrade-stage.json'
        U.durable_json(pointer, {'format': 1, 'nonce': staged['nonce'],
                                  'receiptPath': staged['receiptPath'],
                                  'installerSha512': staged['installerSha512']})
        return pointer, staged

    def test_old_installer_stage_is_preserved_and_new_installer_gets_fresh_verified_backup(self):
        pointer, staged = self.stage_pointer()
        evidence = {path: path.read_bytes() for path in [pointer, pathlib.Path(staged['receiptPath']),
                    pathlib.Path(staged['databaseBackup']), pathlib.Path(staged['appBackup'])]}
        self.installer.write_bytes(b'newer-installer')
        selected = U.installer_stage(pointer, self.installer, self.db, self.app)
        self.assertIsNone(selected)
        receipt = U.prepare(self.db, self.app, self.catalog, lambda: [], staged=selected)
        self.assertNotEqual(receipt['nonce'], staged['nonce'])
        self.assertTrue(U.verify_receipt(receipt, self.catalog, lambda: []))
        for path, original in evidence.items():
            self.assertEqual(path.read_bytes(), original)

    def test_matching_installer_corrupt_backup_still_blocks(self):
        pointer, staged = self.stage_pointer()
        pathlib.Path(staged['databaseBackup']).write_bytes(b'corrupted')
        with self.assertRaisesRegex(RuntimeError, 'STAGED_DATABASE_BACKUP_CHANGED'):
            U.installer_stage(pointer, self.installer, self.db, self.app)
        self.assertEqual(U.digest(self.db), self.before)
        self.assertEqual(U.tree_manifest(self.app), self.app_before)

    def test_invalid_pointer_does_not_fall_back_to_new_backup(self):
        pointer, staged = self.stage_pointer()
        U.durable_json(pointer, {'format': 1, 'nonce': staged['nonce'],
                               'receiptPath': staged['receiptPath'], 'installerSha512': 'invalid'})
        with self.assertRaisesRegex(RuntimeError, 'UNVERIFIED_STAGED_POINTER'):
            U.installer_stage(pointer, self.installer, self.db, self.app)
        self.assertEqual(U.digest(self.db), self.before)

    def test_new_sale_requires_background_refresh_before_install(self):
        staged = U.stage_backup(self.db, self.app, self.installer)
        pointer = self.root / 'upgrade-stage.json'
        U.durable_json(pointer, {'format': 1, 'nonce': staged['nonce'],
                                  'receiptPath': staged['receiptPath'],
                                  'installerSha512': staged['installerSha512']})
        with closing(sqlite3.connect(self.db)) as c, c:
            c.execute('INSERT INTO "Order" (id,total,evidence) VALUES (?, ?, ?)', ('later-sale', 10, b''))
        with self.assertRaisesRegex(RuntimeError, 'DATABASE_CHANGED_AFTER_STAGE'):
            U.staged_receipt(pointer, self.installer, self.db, self.app)
        U.refresh_stage_database(pointer, self.installer, self.db, self.app)
        refreshed = U.staged_receipt(pointer, self.installer, self.db, self.app)
        receipt = U.prepare(self.db, self.app, self.catalog, lambda: [], staged=refreshed)
        self.assertTrue(U.verify_receipt(receipt, self.catalog, lambda: []))
        with closing(sqlite3.connect(receipt['databaseBackup'])) as backup:
            self.assertEqual(backup.execute('SELECT count(*) FROM "Order"').fetchone()[0], 2)


if __name__ == '__main__':
    unittest.main()
