#!/usr/bin/env python3
"""Synthetic PostgreSQL check, invoked only through with-docker-test.py."""
import os, secrets, subprocess, time, tempfile
from pathlib import Path
run = os.environ['BT_TEST_RUN']
label = os.environ['BT_TEST_LABEL']
password = secrets.token_hex(16)
subprocess.run(['docker','run','-d','--name',run+'-db','--label',label,'--mount','type=tmpfs,destination=/var/lib/postgresql/data','-e','POSTGRES_USER=inventory_test','-e','POSTGRES_DB=inventory_test','-e','POSTGRES_PASSWORD='+password,'-p','127.0.0.1::5432','postgres:16-alpine'],check=True,stdout=subprocess.DEVNULL)
for attempt in range(60):
    if subprocess.run(['docker','exec',run+'-db','pg_isready','-U','inventory_test'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode == 0: break
    time.sleep(0.5)
else: raise RuntimeError('Test PostgreSQL failed to become ready')
port = subprocess.check_output(['docker','port',run+'-db','5432'],text=True).strip().split(':')[-1]
env = dict(os.environ, DATABASE_URL=f'postgresql://inventory_test:{password}@127.0.0.1:{port}/inventory_test', NODE_ENV='test', JWT_SECRET=secrets.token_hex(32), CORS_ORIGIN='http://127.0.0.1')
with tempfile.TemporaryDirectory(prefix='inventory-records-migration-') as directory:
    schema = Path('server/prisma/schema.prisma').read_text()
    legacy = schema.replace('  @@index([occurredOn, id])\n', '').replace('  @@index([storeId, purchasedOn, id])\n', '').replace('  occurredOn DateTime?\n', '').replace('  purchasedOn DateTime?\n', '')
    schema_file = Path(directory) / 'schema.prisma'
    schema_file.write_text(legacy)
    subprocess.run(['node','server/node_modules/prisma/build/index.js','db','push','--skip-generate','--schema',str(schema_file)],env=env,check=True)
    subprocess.run(['node','server/node_modules/prisma/build/index.js','db','execute','--schema','server/prisma/schema.prisma','--file','server/prisma/migrations/202610290001_inventory_operation_dates/migration.sql'],env=env,check=True)
subprocess.run(['node','tests/stoploss/inventory-records-http-check.cjs'],env=env,check=True)
