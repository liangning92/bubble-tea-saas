// Build-only generator: never opens/migrates a store database.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..'),argv=process.argv.slice(2);
if(argv.length!==2||argv[0]!=='--output')throw Error('Usage: node scripts/prepare-desktop-template.cjs --output NEW_TEMP_DIRECTORY');
const output=path.resolve(argv[1]);
const allowed=[os.tmpdir(),process.env.RUNNER_TEMP,...(process.platform==='win32'?[]:['/tmp'])].filter(Boolean).map(root=>path.resolve(root));
if(!allowed.some(root=>output.startsWith(root+path.sep))||fs.existsSync(output))throw Error('Output must be a NEW directory inside a temporary root; existing databases cannot be overwritten');
fs.mkdirSync(output,{recursive:true});
const original=fs.readFileSync(path.join(repo,'server/prisma/schema.prisma'),'utf8');
if(!/provider\s*=\s*"postgresql"/.test(original))throw Error('Authoritative source must be PostgreSQL; do not prepare from mutated checkout twice');
const desktop=original.replace(/provider\s*=\s*"postgresql"/,'provider = "sqlite"');
fs.writeFileSync(path.join(output,'schema.sqlite.prisma'),desktop);
// These output paths are relative to server/prisma after CI installs this file.
const generated=desktop.replace(/generator client \{/, 'generator client {\n  output = "../node_modules/.prisma/client"')+'\ngenerator rootClient {\n  provider = "prisma-client-js"\n  output = "../../node_modules/.prisma/client"\n  binaryTargets = ["native", "windows"]\n}\n';
fs.writeFileSync(path.join(output,'schema.prisma'),generated);
const prismaCli=path.join(path.dirname(require.resolve('prisma/package.json',{paths:[path.join(repo,'server')]})),'build/index.js');
const sql=execFileSync(process.execPath,[prismaCli,'migrate','diff','--from-empty','--to-schema-datamodel',path.join(output,'schema.sqlite.prisma'),'--script'],{encoding:'utf8',env:{...process.env,NODE_ENV:'production',DATABASE_URL:'file:'+path.join(output,'seed.db').replace(/\\/g,'/')}});
fs.writeFileSync(path.join(output,'schema.sql'),sql);
const python=process.platform==='win32'?'python':'python3';
execFileSync(python,['-c',`import sqlite3,sys,os
sql,db=sys.argv[1:]
assert not os.path.exists(db), 'Existing database refused'
c=sqlite3.connect(db)
c.executescript(open(sql,encoding='utf-8').read())
assert 'pickupNumber' in [r[1] for r in c.execute('PRAGMA table_info("Order")')]
for (table,) in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall():
 assert c.execute('SELECT count(*) FROM "'+table+'"').fetchone()[0]==0, 'Template must be completely empty'
c.close()
`,path.join(output,'schema.sql'),path.join(output,'seed.db')],{stdio:'pipe'});
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest={output,sourceSchemaSha256:hash(path.join(repo,'server/prisma/schema.prisma')),desktopSchemaSha256:hash(path.join(output,'schema.sqlite.prisma')),seedSha256:hash(path.join(output,'seed.db')),seedIsEmpty:true,existingDatabaseCompatible:false,existingDatabaseBlocker:'Installer must back up and validate old databases before additive schema upgrade',requiredExistingDatabaseChanges:['Order.pickupNumber','Order.requestFingerprint','Order.requestReceipt','Order.checkoutTaxAmount','Staff.baseSalary','Inventory ledger fields and triggers','RefundRequest reasonCode and selectedItemIds','PaymentEvidence table and indexes']};
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest));
