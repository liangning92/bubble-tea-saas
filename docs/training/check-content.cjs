// Structural and contamination checks are not a substitute for independent content review.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const file=path.resolve(__dirname,'../../server/src/data/training-library.json');
function validate(c){
 assert.equal(c.version,1);assert.equal(c.modules.length,12);assert.equal(c.assessment.reviewed,true);
 const ids=new Set(),questionIds=new Set();let lessons=0,questions=0,texts=0;
 const blockedScript=/[\p{Script=Han}\p{Script=Cyrillic}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
 function walk(v,location){
  if(!v||typeof v!=='object')return;
  if(Object.hasOwn(v,'zh')||Object.hasOwn(v,'id')){
   assert.equal(typeof v.zh,'string',location+' Chinese missing');assert.equal(typeof v.id,'string',location+' Indonesian missing');
   assert(v.zh.trim().length>0&&/\p{Script=Han}/u.test(v.zh),location+' Chinese incomplete');assert(v.id.trim().length>5,location+' Indonesian incomplete');
   assert(!blockedScript.test(v.id),location+' illegal script in Indonesian');assert(!/\p{Script=Cyrillic}/u.test(v.zh),location+' Cyrillic contamination');
   // Only approved universal unit identities may contain numerical physical units.
   const id=v.id.replace('1 kg = 1000 g dan 1 L = 1000 ml','');
   const zh=v.zh.replace('1 kg = 1000 g，1 L = 1000 ml','');
   assert(!/\d+(?:[.,]\d+)?\s*(?:°\s*[cCfF]|derajat|menit|jam|ml\b|kg\b|g\b|L\b|%|ppm)/i.test(id),location+' unapproved numerical operating parameter');
   assert(!/\d+(?:\.\d+)?\s*(?:°|摄氏|分钟|小时|毫升|克|%|％|ppm)/i.test(zh),location+' unapproved Chinese operating parameter');
   texts++;
  }
  for(const [k,x] of Object.entries(v))walk(x,location+'.'+k);
 }
 c.modules.forEach((m,i)=>{
  assert.equal(m.key,`training-${String(i+1).padStart(2,'0')}`);assert.equal(m.reviewed,true);assert.equal(m.sections.length,3);assert.equal(m.quiz.length,3);assert(m.practical.length>=2);
  for(const [j,s] of m.sections.entries()){
   assert.equal(s.key,`training_${String(i+1).padStart(2,'0')}_${j+1}`);assert(!ids.has(s.key));ids.add(s.key);assert(s.points.length>=3);assert(s.errors.length>=1);assert(s.practice);assert(s.checklist.length>=2);lessons++;
  }
  for(const [j,q] of m.quiz.entries()){
   assert.equal(q.key,`training_${String(i+1).padStart(2,'0')}_q${j+1}`);assert(!questionIds.has(q.key));questionIds.add(q.key);assert(q.options.length>=2);assert(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<q.options.length);assert(q.explanation);questions++;
  }
 });
 assert.equal(c.assessment.rows.length,12);assert.deepEqual(c.assessment.rows.map(r=>r.key),c.modules.map(m=>m.key));
 for(const row of c.assessment.rows)for(const key of ['station','scenario','action','evidence','result','critical'])assert(row[key],key);
 assert(c.standardsToConfirm.length<=12&&c.standardsToConfirm.length>0);walk(c,'catalogue');
 const payment=JSON.stringify(c.modules[9]),prep=JSON.stringify(c.modules[6]),closing=JSON.stringify(c.modules[10]),coaching=JSON.stringify(c.modules[11]);
 for(const fragment of ['只有老板查询商户到账','不逐单等待老板','不超过购买数量','不超过原实际付款','已制作产品退款不回库原料','原始库存扣减证据','部分退款整批改动尚未发布','永远不是再次收费的依据','bukan bukti dana','belum dirilis'])assert(payment.includes(fragment),'Missing binding payment rule: '+fragment);
 for(const fragment of ['实际净产量','分层自动化尚未确认上线','不与销售重复扣减','实盘剩余'])assert(prep.includes(fragment),'Missing production boundary: '+fragment);
 for(const fragment of ['冰箱、冷冻及安全系统','不能全断电'])assert(closing.includes(fragment));
 for(const fragment of ['七班次仅是可延长的建议','不在教材中自定抽查次数','不能用其他项目高分抵消'])assert(coaching.includes(fragment));
 return {modules:c.modules.length,lessons,questions,bilingualTextPairs:texts,assessmentRows:c.assessment.rows.length};
}
const c=JSON.parse(fs.readFileSync(file));console.log('PASS content '+JSON.stringify(validate(c)));
for(const [name,mutate] of [
 ['mixed script',x=>x.modules[0].sections[0].points[0].id+=' 中文'],
 ['Cyrillic',x=>x.modules[0].sections[0].points[0].id+=' пример'],
 ['extra question',x=>x.modules[9].quiz.push(x.modules[9].quiz[0])],
 ['invalid answer',x=>x.modules[0].quiz[0].answer=99],
 ['missing Chinese checklist',x=>delete x.modules[0].sections[0].checklist[0].zh],
 ['invented recipe parameter',x=>x.modules[6].sections[0].points[0].id+=' Masak 30 menit.']
]){const bad=JSON.parse(JSON.stringify(c));mutate(bad);assert.throws(()=>validate(bad));console.log('PASS rejects '+name)}
assert.equal(fs.readFileSync(path.resolve(__dirname,'../../client-admin/src/components/TrainingLibrary.tsx'),'utf8'),fs.readFileSync(path.resolve(__dirname,'../../client-staff/src/components/TrainingLibrary.tsx'),'utf8'));
console.log('PASS shared reader implementations identical; reviewed general seed; operational parameters still require store-approved cards');
