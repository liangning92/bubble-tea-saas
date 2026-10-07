import importlib.util
import hashlib
import pathlib
import sqlite3
import tempfile
import unittest
import os

spec = importlib.util.spec_from_file_location('preflight', 'scripts/desktop-db-preflight.py')
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class DesktopUpgradeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='btps-upgrade-synthetic-')
        self.root = pathlib.Path(self.temp.name)
        self.db = self.root / 'legacy.db'
        with sqlite3.connect(self.db) as c:
            c.execute('CREATE TABLE "Order" (id TEXT PRIMARY KEY, totalAmount INTEGER, finalAmount INTEGER, paymentMethod TEXT)')
            c.execute('INSERT INTO "Order" VALUES (?,?,?,?)', ('synthetic-history', 10000, 9000, 'cash'))

    def tearDown(self):
        self.temp.cleanup()

    def digest(self):
        return hashlib.sha256(self.db.read_bytes()).hexdigest()

    def rows(self, filename):
        with sqlite3.connect(filename) as c:
            return c.execute('SELECT id,totalAmount,finalAmount,paymentMethod FROM "Order"').fetchall()

    def rehearsal(self, backup, fail=False):
        # Test-only implementation: all paths are created by this test in owned temp.
        assert self.root in backup.parents
        c = sqlite3.connect(self.db)
        try:
            c.execute('VACUUM INTO ?', (str(backup),))
            with open(backup, 'r+b') as handle:
                os.fsync(handle.fileno())
            with sqlite3.connect(backup) as snapshot:
                self.assertEqual(snapshot.execute('PRAGMA integrity_check').fetchall(), [('ok',)])
            c.execute('BEGIN IMMEDIATE')
            c.execute('ALTER TABLE "Order" ADD COLUMN pickupNumber TEXT')
            c.execute('CREATE INDEX Order_pickupNumber_idx ON "Order"(pickupNumber)')
            if fail:
                raise RuntimeError('synthetic failure after DDL')
            c.commit()
        except Exception:
            c.rollback()
            raise
        finally:
            c.close()

    def test_readonly_old_missing_and_new_ready_never_permit_install(self):
        before = self.digest()
        files = list(self.root.iterdir())
        report = preflight.inspect_database(self.db)
        self.assertEqual(report['status'], 'blocked')
        self.assertFalse(report['installationAllowed'])
        self.assertEqual(before, self.digest())
        self.assertEqual(files, list(self.root.iterdir()))
        self.rehearsal(self.root / 'snapshot.db')
        before = self.digest()
        report = preflight.inspect_database(self.db)
        self.assertEqual(report['status'], 'column-ready')
        self.assertFalse(report['installationAllowed'])
        self.assertEqual(before, self.digest())
        self.assertEqual(self.rows(self.db), self.rows(self.root / 'snapshot.db'))
        self.assertEqual(preflight.inspect_database(self.root / 'missing.db')['status'], 'blocked')
        self.assertFalse((self.root / 'missing.db').exists())

    def test_backup_failure_preserves_old_file_and_history(self):
        before = self.digest()
        backup = self.root / 'already-exists.db'
        backup.write_bytes(b'synthetic obstruction')
        with self.assertRaises(sqlite3.Error):
            self.rehearsal(backup)
        self.assertEqual(before, self.digest())
        self.assertEqual(backup.read_bytes(), b'synthetic obstruction')
        self.assertEqual(preflight.inspect_database(self.db)['status'], 'blocked')

    def test_ddl_failure_rolls_back_and_snapshot_remains_unchanged(self):
        before = self.digest()
        history = self.rows(self.db)
        backup = self.root / 'rollback-snapshot.db'
        with self.assertRaises(RuntimeError):
            self.rehearsal(backup, fail=True)
        self.assertEqual(before, self.digest())
        self.assertEqual(history, self.rows(backup))
        backup_hash = hashlib.sha256(backup.read_bytes()).hexdigest()
        self.assertEqual(preflight.inspect_database(self.db)['status'], 'blocked')
        self.assertEqual(preflight.inspect_database(backup)['status'], 'blocked')
        self.assertEqual(backup_hash, hashlib.sha256(backup.read_bytes()).hexdigest())

    def test_active_wal_is_refused_without_touching_sidecars(self):
        c = sqlite3.connect(self.db)
        try:
            c.execute('PRAGMA journal_mode=WAL')
            c.execute('INSERT INTO "Order" VALUES (?,?,?,?)', ('synthetic-wal', 1, 1, 'cash'))
            c.commit()
            before = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.root.iterdir()}
            self.assertEqual(preflight.inspect_database(self.db)['reason'], 'ACTIVE_OR_UNCHECKPOINTED_DATABASE')
            self.assertEqual(before, {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.root.iterdir()})
        finally:
            c.close()


if __name__ == '__main__':
    unittest.main()
