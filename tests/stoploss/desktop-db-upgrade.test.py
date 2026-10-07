from contextlib import closing
import importlib.util
import pathlib
import sqlite3
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('upgrade', pathlib.Path(__file__).parents[2] / 'scripts/desktop-db-upgrade.py')
U = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(U)


class UpgradeTests(unittest.TestCase):
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
        template = self.root / 'empty.db'
        with closing(sqlite3.connect(template)) as c, c:
            c.execute('CREATE TABLE "Order" (id TEXT PRIMARY KEY, total REAL, evidence BLOB, pickupNumber TEXT, requestFingerprint TEXT, requestReceipt TEXT)')
        self.catalog = U.catalog_from_empty(template, 'a' * 40)
        with closing(sqlite3.connect(self.db)) as c, c:
            c.execute('CREATE TABLE "Order" (id TEXT PRIMARY KEY, total REAL, evidence BLOB)')
            c.execute('INSERT INTO "Order" VALUES (?, ?, ?)', ('historical', 123.45, b'\x00\xff'))
        self.before = U.digest(self.db)
        self.app_before = U.tree_manifest(self.app)

    def prepare(self, processes=lambda: []):
        return U.prepare(self.db, self.app, self.catalog, processes)

    def test_success_preserves_every_old_value_and_verified_backups(self):
        receipt = self.prepare()
        self.assertTrue(receipt['columnAdded'])
        self.assertEqual(receipt['columnsAdded'], list(U.LOCAL_COLUMNS))
        self.assertTrue(receipt['indexAdded'])
        self.assertTrue(U.verify_receipt(receipt, self.catalog, lambda: []))
        self.assertEqual(U.tree_manifest(self.app), self.app_before)
        with closing(sqlite3.connect(self.db)) as c, c:
            self.assertEqual(c.execute('SELECT * FROM "Order"').fetchall(), [('historical', 123.45, b'\x00\xff', None, None, None)])
        self.assertEqual(U.digest(receipt['databaseBackup']), receipt['databaseBackupSha256'])

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

    def test_partial_old_schema_preserves_existing_receipt_values(self):
        with closing(sqlite3.connect(self.db)) as c, c:
            c.execute('ALTER TABLE "Order" ADD COLUMN requestFingerprint TEXT')
            c.execute('UPDATE "Order" SET requestFingerprint=?', ('old-fingerprint',))
        receipt = self.prepare()
        self.assertEqual(receipt['columnsAdded'], ['pickupNumber', 'requestReceipt'])
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
        self.assertEqual(len(list(self.app.parent.glob('.BTPS-failed-new-*'))), 1)
        self.assertTrue(pathlib.Path(receipt['databaseBackup']).is_file())

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


if __name__ == '__main__':
    unittest.main()
