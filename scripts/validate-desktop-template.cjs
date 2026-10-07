// Only creates isolated synthetic copies; never opens a user database.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (index % 2 === 0) pairs.push([value, all[index + 1]]);
  return pairs;
}, []));
const resources = args['--resources'];
const template = args['--template'] || path.join(resources, 'server/prisma/seed.db');
const clients = args['--client'] ? [args['--client']] : [
  path.join(resources, 'server/node_modules/@prisma/client'),
  path.join(resources, 'node_modules/@prisma/client'),
];
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'btps-desktop-compat-'));
const python = process.platform === 'win32' ? 'python' : 'python3';
function sql(file, code) {
  return execFileSync(python, ['-c', 'import sqlite3,sys,json\nc=sqlite3.connect(sys.argv[1])\n' + code + '\nc.commit()\nc.close()\n', file], { encoding: 'utf8' }).trim();
}
async function main() {
  const fresh = path.join(temp, 'fresh.db');
  fs.copyFileSync(template, fresh);
  sql(fresh, `for (table,) in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall():\n assert c.execute('SELECT count(*) FROM "'+table+'"').fetchone()[0]==0, 'Nonempty template refused'`);
  const checked = [];
  for (const clientPath of clients) {
    const { PrismaClient } = require(path.resolve(clientPath));
    const client = new PrismaClient({ datasources: { db: { url: 'file:' + fresh.replace(/\\/g, '/') } } });
    try {
      assert.equal(client._engineConfig.activeProvider, 'sqlite');
      assert.deepEqual(await client.order.findMany(), []);
      const filter = resources
        ? require(path.join(resources, 'server/dist/utils/stringFilter.js')).containsFilter('SYNTHETIC', 'file:fixture.db')
        : { contains: 'SYNTHETIC' };
      assert.deepEqual(await client.order.findMany({ where: { orderNumber: filter } }), []);
      checked.push(clientPath);
    } finally { await client.$disconnect(); }
  }
  const legacy = path.join(temp, 'legacy.db');
  fs.copyFileSync(fresh, legacy);
  sql(legacy, `c.execute('DROP INDEX "Order_pickupNumber_idx"')\nc.execute('ALTER TABLE "Order" DROP COLUMN "pickupNumber"')\nc.execute('PRAGMA foreign_keys=OFF')\nc.execute('INSERT INTO "Order" (id,storeId,staffId,orderNumber,totalAmount,finalAmount,paymentMethod,updatedAt) VALUES (?,?,?,?,?,?,?,?)',('synthetic-history','synthetic-store','synthetic-staff','SYNTHETIC-001',10000,10000,'cash',0))`);
  const history = file => sql(file, `print(json.dumps(c.execute('SELECT id,orderNumber,totalAmount,finalAmount,paymentMethod FROM "Order"').fetchall()))`);
  const before = history(legacy);
  const { PrismaClient } = require(path.resolve(clients[0]));
  const oldClient = new PrismaClient({ datasources: { db: { url: 'file:' + legacy.replace(/\\/g, '/') } } });
  let oldRejected = false;
  try { await oldClient.order.findMany(); } catch (error) {
    assert.equal(error.code, 'P2022');
    assert.match(String(error.message), /pickupNumber/);
    oldRejected = true;
  } finally { await oldClient.$disconnect(); }
  assert.equal(oldRejected, true);
  const upgraded = path.join(temp, 'additive-fixture.db');
  fs.copyFileSync(legacy, upgraded);
  sql(upgraded, `c.execute('ALTER TABLE "Order" ADD COLUMN "pickupNumber" TEXT')\nc.execute('CREATE INDEX "Order_pickupNumber_idx" ON "Order"("pickupNumber")')`);
  const upgradedClient = new PrismaClient({ datasources: { db: { url: 'file:' + upgraded.replace(/\\/g, '/') } } });
  try {
    const rows = await upgradedClient.order.findMany();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].pickupNumber, null);
  } finally { await upgradedClient.$disconnect(); }
  assert.equal(history(upgraded), before);
  assert.equal(history(legacy), before);
  const report = { newTemplateCompatible: true, checkedClients: checked, legacyTemplateCompatible: false, legacyFailure: 'P2022: Order.pickupNumber', syntheticAdditiveFixtureCompatible: true, syntheticHistoryPreserved: true, actualDevicesVerified: false, realDatabasesModified: false };
  fs.writeFileSync(args['--report'], JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
