"""Check media-only additions against an empty disposable schema template."""
import importlib.util
import pathlib
import shutil
import sqlite3
import sys
import tempfile
root = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('upgrade', root / 'scripts/desktop-db-upgrade.py')
upgrade = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upgrade)
template = pathlib.Path(sys.argv[1]).resolve()
if not str(template).startswith(str(pathlib.Path('/tmp').resolve()) + '/media-product-'):
    raise RuntimeError('USE_DISPOSABLE_TEMPLATE')
catalog = upgrade.catalog_from_empty(template, 'test-sha')
with tempfile.TemporaryDirectory(prefix='media-product-upgrade-', dir='/tmp') as directory:
    legacy = pathlib.Path(directory) / 'legacy.db'
    shutil.copyfile(template, legacy)
    with sqlite3.connect(legacy) as db:
        for name in ['ProductImage', 'MediaReference', 'MediaAsset']:
            db.execute('DROP TABLE ' + name)
        db.execute("INSERT INTO Tenant(id,name,createdAt,updatedAt) VALUES('legacy','Existing tenant',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
        assert upgrade.supported_schema(db, catalog, allow_missing=True)
        before = db.execute('SELECT * FROM Tenant').fetchall()
        for statement in catalog['newTableDDL']:
            db.execute(statement.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ', 1).replace('CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX IF NOT EXISTS ', 1).replace('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ', 1))
        assert upgrade.supported_schema(db, catalog, allow_missing=False)
        assert db.execute('SELECT * FROM Tenant').fetchall() == before
        upgrade.integrity(db)
print('SQLite media upgrade passed: original rows preserved, schema and foreign keys valid.')
