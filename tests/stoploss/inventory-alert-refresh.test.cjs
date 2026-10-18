const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(file,stubs,cache={}){const resolved=path.resolve(file);if(cache[resolved])return cache[resolved].exports;const module={exports:{}};cache[resolved]=module;const code=ts.transpileModule(fs.readFileSync(resolved,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(id=>id in stubs?stubs[id]:id.startsWith('.')?load(path.resolve(path.dirname(resolved),id+'.ts'),stubs,cache):require(id),module,module.exports);return module.exports}
const policy=load('server/src/utils/inventoryUsagePolicy.ts',{});
test('bulk packaging keeps cost, self-made plain water/ice exclude cost; other food never matches',async()=>{
 const cost=load('server/src/services/InventoryQuantityService.ts',{});
 for(const [name,category,mode,expected] of [['Cup 500ml','packaging','bulk',500],['Ice Cream Spoon','packaging','bulk',500],['Air Panas / Hot Water (制备冲泡热水)','raw_material','self_produced',0],['Es Batu / Ice Cube (食用冰块)','raw_material','self_produced',0],['Es Krim Matcha / Matcha Ice Cream Base (抹茶冰淇淋浆)','semi_finished','tracked',500],['Black Tea Liquid','semi_finished','tracked',500]]){
  const item={name,category,unit:'g',type:'raw_material',avgCost:500,storeId:'owned'};assert.equal(policy.inventoryUsageMode(item),mode);assert.equal(await cost.inventoryQuantityCost({inventory:{findUnique:async()=>item}},'material',1,'g',0,'owned'),expected);
 }
});
function fixture(){
 const config=new Map([['employee_inventory_flow_started_at','2026-10-17T00:00:00Z'],['employee_consumption_checkpoint','2026-10-17'],['employee_consumption_refresh_version','2'],['employee_consumption_dirty:2026-10-17','old-token']]),alerts=new Map(),deleted=[];
 const inventory=[{id:'cup',name:'Cup',category:'packaging',unit:'pcs'},{id:'water',name:'Hot Water',category:'raw_material',unit:'ml'},{id:'syrup',name:'Syrup',category:'raw_material',unit:'g'}];
 const materials=[{inventoryId:'cup',unit:'pcs',quantity:67},{inventoryId:'water',unit:'ml',quantity:15000},{inventoryId:'syrup',unit:'g',quantity:625}];
 const db={config:{findUnique:async({where})=>config.has(where.storeId_key.key)?{value:config.get(where.storeId_key.key)}:null,findMany:async()=>[...config].filter(([key])=>key.startsWith('employee_consumption_dirty:')).map(([key,value])=>({key,value})),upsert:async({where,create,update})=>{const key=where.storeId_key.key,value=config.has(key)?update.value??config.get(key):create.value;config.set(key,value);return{value}},deleteMany:async({where})=>{deleted.push(where);if(!where.value||config.get(where.key)===where.value)config.delete(where.key);return {count:1}}},inventory:{findMany:async()=>inventory},orderConsumptionSnapshot:{findMany:async()=>[{orderId:'late-order',materials:JSON.stringify(materials),issues:'[]'}]},stockOutLog:{findMany:async()=>[]},order:{count:async()=>0},consumptionAlert:{upsert:async({create})=>alerts.set(create.inventoryId,create)},store:{findMany:async()=>[{id:'owned'}]}};
 const calendar={boundary:s=>new Date(s),startOfDay:d=>new Date(d.toISOString().slice(0,10)),addDays:(d,n)=>new Date(d.getTime()+n*86400000),formatDate:d=>d.toISOString().slice(0,10)};
 const service=load('server/src/services/EmployeeConsumptionService.ts',{'../config/database':{default:db,__esModule:true},'../utils/inventoryBusinessCalendar':{inventoryBusinessCalendar:async()=>calendar},'./InventoryAlertConfigService':{getInventoryAlertConfig:async()=>({enableConsumptionAlert:true,varianceWarningPercent:10,varianceCriticalPercent:20})},'./OrderConsumptionService':{FLOW_CUTOVER_KEY:'employee_inventory_flow_started_at',ensureInventoryFlow:async()=>new Date('2026-10-17T00:00Z')}});
 return{service,db,config,alerts,deleted,materials};
}
test('alert refresh uses latest late-synced quantities, suppresses bulk/self-produced daily losses, keeps ingredient use as a reference instead of a false loss warning',async()=>{
 const f=fixture();await f.service.refreshStoreConsumptionDays('owned',new Date('2026-10-18T12:00Z'));
 assert.equal(JSON.parse(f.alerts.get('cup').detail).theoreticalConsumption,67);assert.equal(f.alerts.get('cup').status,'not_compared');assert.equal(JSON.parse(f.alerts.get('cup').detail).variance,-67);
 assert.equal(f.alerts.get('water').status,'not_compared');assert.equal(f.alerts.get('syrup').status,'not_compared');assert.equal(JSON.parse(f.alerts.get('syrup').detail).theoreticalConsumption,625);
 assert.ok(f.deleted.some(w=>w.key==='employee_consumption_dirty:2026-10-17'&&w.value==='old-token'));assert.ok(f.deleted.some(w=>w.key==='inventory_alert_center_checked_at'));
});
test('dirty token written during recalculation survives compare-and-delete; concurrent readers share store refresh',async()=>{
 const f=fixture();f.db.consumptionAlert.upsert=async({create})=>{f.config.set('employee_consumption_dirty:2026-10-17','new-token');f.alerts.set(create.inventoryId,create)};
 const one=f.service.refreshStoreConsumptionDays('owned',new Date('2026-10-18T12:00Z')),two=f.service.refreshStoreConsumptionDays('owned',new Date('2026-10-18T12:00Z'));assert.equal(one,two);await one;
 assert.equal(f.config.get('employee_consumption_dirty:2026-10-17'),'new-token');
});
test('old completed checkpoint is repaired once after upgrade; calculation failure retains pending evidence',async()=>{
 const f=fixture();f.config.delete('employee_consumption_refresh_version');await f.service.refreshStoreConsumptionDays('owned',new Date('2026-10-18T12:00Z'));assert.equal(f.config.get('employee_consumption_refresh_version'),'2');assert.equal(f.alerts.get('cup').status,'not_compared');
 const g=fixture();g.db.orderConsumptionSnapshot.findMany=async()=>{throw Error('offline DB')};await assert.rejects(g.service.refreshStoreConsumptionDays('owned',new Date('2026-10-18T12:00Z')),/offline DB/);assert.equal(g.config.get('employee_consumption_dirty:2026-10-17'),'old-token');
});
test('new historical-order snapshot durably invalidates its business day in the sale operation',async()=>{
 const writes=[],at=new Date('2026-10-17T12:00Z');const db={order:{findUniqueOrThrow:async()=>({storeId:'owned',createdAt:at})},bOMItem:{findMany:async()=>[]},config:{upsert:async q=>{writes.push(q);return {value:at.toISOString()}}},orderConsumptionSnapshot:{create:async({data})=>data}};
 const service=load('server/src/services/OrderConsumptionService.ts',{'../config/database':{default:db,__esModule:true},'../utils/inventoryBusinessCalendar':{inventoryBusinessCalendar:async(storeId)=>{assert.equal(storeId,'owned');return {formatDate:date=>{assert.equal(date,at);return '2026-10-17'}}}}});
 await service.recordOrderConsumption(db,'owned','late',[{productId:'tea',quantity:1}]);const dirty=writes.find(w=>w.where.storeId_key.key==='employee_consumption_dirty:2026-10-17');assert.ok(dirty);assert.equal(dirty.where.storeId_key.storeId,'owned');assert.ok(dirty.update.value);
});

test('sub-kilogram theoretical amounts stay visible instead of rounding to zero',()=>{const format=load('client-admin/src/utils/consumptionQuantity.ts',{}).consumptionQuantity;assert.equal(format(0.394,'en'),'0.394');assert.equal(format(3,'zh'),'3');assert.equal(format(0.0000001,'en'),'<0.000001');assert.equal(format(null),'—')});

test('3kg powder issued versus daily recipe theory remains visible as a reference balance, not waste',async()=>{const f=fixture();const inventory=await f.db.inventory.findMany();inventory[2].unit='kg';inventory[2].name='Vanilla powder';f.materials[2].unit='kg';f.materials[2].quantity=2.931428571;f.db.stockOutLog.findMany=async()=>[{inventoryId:'syrup',reason:'withdrawal',quantity:3}];const result=await f.service.employeeConsumption({storeId:'owned',startDate:'2026-10-17',endDate:'2026-10-17'});const row=result.list.find(r=>r.inventoryId==='syrup');assert.equal(row.actualConsumption,3);assert.equal(row.theoreticalConsumption,2.931428571);assert.equal(row.variance,0.068571429);assert.equal(row.varianceStatus,'not_compared');assert.equal(row.variancePercent,null)});
