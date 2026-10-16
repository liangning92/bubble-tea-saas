const {test}=require('node:test'),assert=require('node:assert/strict');
const {model}=require('../../server/public/tv/lottery.js');
test('all prize pool sizes keep the authoritative highlighted result, including 30 prizes',()=>{
 for(let count=1;count<=30;count++)for(let index=0;index<count;index++){
  const prizes=Array.from({length:count},(_,i)=>({id:'p'+i,name:'Prize '+i,color:'#abcdef'}));
  const m=model({prizeName:prizes[index].name,prizeId:prizes[index].id,prizeIndex:index,prizes});
  assert.equal(m.index,index);assert.equal(m.prizes.length,count);
  assert.equal(m.prizes[m.index].id,prizes[index].id);
 }
});
test('duplicate names use authoritative ID, stale index is corrected and legacy results never invent prizes',()=>{
 const prizes=[{id:'a',name:'Tea'},{id:'b',name:'Tea'}];
 assert.equal(model({prizeName:'Tea',prizeId:'b',prizeIndex:0,prizes}).index,1);
 assert.equal(model({prizeName:'Tea',prizeId:'b',prizeIndex:99,prizes}).index,1);
 const m=model({prizeName:'Thanks',prizes,prizeIndex:0});assert.deepEqual(m.prizes.map(p=>p.name),['Thanks']);
 assert.equal(model({prizeName:'Tea',prizes:[{name:'Tea',color:'url(evil)'}]}).prizes[0].color,'#F8BFD0');
 assert.throws(()=>model({prizeName:''}));
});

test('configured card colors are preserved exactly, never recolored by brand styling',()=>{
 const prizes=[{id:'pink',name:'Pink',color:'#F8BFD0'},{id:'mint',name:'Mint',color:'#BFE2CE'}];
 assert.deepEqual(model({prizeId:'mint',prizeIndex:1,prizeName:'Mint',prizes}).prizes.map(p=>p.color),prizes.map(p=>p.color));
});
