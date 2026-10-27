const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
function load(file){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:m.exports,module:m,require:name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name)+'.ts'):require(name),Intl,Date});return m.exports;}
const {splitPriceCopy,readPosterCopy}=load('client-admin/src/components/marketing/posterCopySnapshot.ts');
const text=s=>({nodeType:3,textContent:s}),element=(tag,children=[],amount=false)=>({nodeType:1,tagName:tag,childNodes:children,textContent:children.map(c=>c.textContent||'').join(''),hasAttribute:k=>k==='data-auto-amount'&&amount});
test('price editor displays actual formatted copy, including zero amounts and suffixes',()=>{
 for(const amount of ['12000','12.000','Rp 12.000','0']){
  const s=splitPriceCopy('Promo: '+amount+' / cup',amount);assert.equal(s.before,'Promo: ');assert.equal(s.after,' / cup');assert.equal(s.hasAmount,true);
 }
 const repeated=splitPriceCopy('12000 points, price 12000','12000');assert.equal(repeated.before,'12000 points, price ');
 assert.equal(splitPriceCopy('Choose a product','').hasAmount,false);
});
test('only immutable amount chips create bindings; plain copy and manual line breaks remain editable',()=>{
 const root=element('DIV',[text('Promo: '),element('SPAN',[text('12.000')],true),text(' / cup'),element('DIV',[text('Today only')])]);
 assert.equal(readPosterCopy(root),'Promo: {amount} / cup\nToday only');
 assert.equal(readPosterCopy(root,false),'Promo: 12.000 / cup\nToday only');
 const literal=element('DIV',[text('Buy 2, get 1: '),element('SPAN',[text('Rp 0')],true)]);
 assert.equal(readPosterCopy(literal),'Buy 2, get 1: {amount}');
});
