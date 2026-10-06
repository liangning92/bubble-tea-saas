const {test}=require('node:test'),assert=require('node:assert/strict');
const {extractI18nKeys}=require('../../scripts/i18n-check.js');
test('inline namespace does not swallow following keys; quoted braces and escapes are literals',()=>{
 const source=String.raw`const resources = { id: { translation: {
   inline: { one: 'Satu', two: 'Dua {count}' },
   common: { save: 'Simpan', escaped: 'don\'t } close', back: "{ go }" },
   pos: { nested: { enabled: 'Aktif' } }
 } }, en: { translation: { common: { save: 'Save' } } } }`;
 const keys=extractI18nKeys(source,'id');assert.deepEqual([...keys].sort(),['common.back','common.escaped','common.save','inline.one','inline.two','pos.nested.enabled']);assert.equal(keys.has('common.missing'),false);
});
test('duplicate resource namespaces follow runtime last-wins semantics',()=>{
 const keys=extractI18nKeys("const resources={id:{translation:{common:{old:'old'},common:{new:'new'}}}}",'id');
 assert.deepEqual([...keys],['common.new']);
});
test('unreadable or missing locale fails rather than disabling validation',()=>{
 assert.throws(()=>extractI18nKeys('const resources={}', 'id'),/Missing literal/);
});
test('CLI still exits nonzero for a genuinely missing Indonesian key',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-i18n-negative-'));fs.mkdirSync(path.join(dir,'src/i18n'),{recursive:true});
 fs.writeFileSync(path.join(dir,'src/i18n/index.ts'),"const resources={id:{translation:{common:{save:'Simpan'}}},en:{translation:{common:{save:'Save'}}}}");
 fs.writeFileSync(path.join(dir,'src/page.tsx'),"t('common.missing')");
 const result=spawnSync(process.execPath,[path.resolve('scripts/i18n-check.js'),dir],{encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stdout,/Missing Indonesian translation: 'common.missing'/);
});
