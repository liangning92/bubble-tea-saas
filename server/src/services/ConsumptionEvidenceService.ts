import {createHash} from 'crypto'
import {markConsumptionDayDirty} from './OrderConsumptionService'
export const THEORY_CORRECTION_PREFIX='inventory.theory-correction.v1:'
export function consumptionEvidenceHash(snapshot:any){return createHash('sha256').update(JSON.stringify([snapshot.storeId,snapshot.orderId,snapshot.createdAt.toISOString(),snapshot.materials,snapshot.issues])).digest('hex')}
/** Additive, audited theory corrections never rewrite the sale snapshot or physical stock. */
export async function appendConsumptionCorrection(db:any,storeId:string,snapshotId:string,materials:{inventoryId:string;name:string;unit:string;quantity:number}[],reason:string,batch:string){
 if(!reason.trim()||!batch||!materials.length||new Set(materials.map(m=>m.inventoryId)).size!==materials.length)throw Error('INVALID_THEORY_CORRECTION')
 const source=await db.orderConsumptionSnapshot.findFirst({where:{id:snapshotId,storeId}})
 if(!source)throw Error('CONSUMPTION_SOURCE_NOT_FOUND')
 const original=JSON.parse(source.materials)
 for(const material of materials){
  const item=await db.inventory.findFirst({where:{id:material.inventoryId,storeId}})
  if(!item||item.unit!==material.unit||!Number.isFinite(material.quantity)||Math.abs(material.quantity)>1e12)throw Error('INVALID_THEORY_CORRECTION')
  const base=original.find((m:any)=>m.inventoryId===material.inventoryId)
  if(base&&base.unit!==material.unit||(base?.quantity||0)+material.quantity<0)throw Error('INVALID_THEORY_CORRECTION')
 }
 const key=THEORY_CORRECTION_PREFIX+source.id,sourceHash=consumptionEvidenceHash(source)
 const previous=await db.config.findUnique({where:{storeId_key:{storeId,key}}})
 const entry={version:1,storeId,snapshotId,sourceHash,materials,reason,batch}
 if(previous){const saved=JSON.parse(previous.value);if(JSON.stringify([saved.sourceHash,saved.materials,saved.batch])!==JSON.stringify([sourceHash,materials,batch]))throw Error('THEORY_CORRECTION_CONFLICT');return saved}
 const value={...entry,createdAt:new Date().toISOString()}
 await db.config.create({data:{storeId,key,category:'inventory_theory_audit',value:JSON.stringify(value)}})
 await markConsumptionDayDirty(db,storeId,source.createdAt)
 return value
}
export async function correctedConsumptionSnapshots(db:any,where:{storeId:string;createdAt?:any}){
 const snapshots:any[]=await db.orderConsumptionSnapshot.findMany({where})
 const records:any[]=[]
 for(let start=0;start<snapshots.length;start+=400)records.push(...await db.config.findMany({where:{storeId:where.storeId,key:{in:snapshots.slice(start,start+400).map(s=>THEORY_CORRECTION_PREFIX+s.id)}},select:{key:true,value:true}}))
 const corrections=new Map(records.map(r=>[r.key,r.value]))
 return snapshots.map(snapshot=>{
  const raw=corrections.get(THEORY_CORRECTION_PREFIX+snapshot.id)
  if(!raw||snapshot.reversedAt)return snapshot
  const correction=JSON.parse(raw)
  if(correction.version!==1||correction.storeId!==where.storeId||correction.snapshotId!==snapshot.id||correction.sourceHash!==consumptionEvidenceHash(snapshot)||!Array.isArray(correction.materials))throw Error('INVALID_THEORY_CORRECTION_EVIDENCE')
  const materials:any[]=JSON.parse(snapshot.materials)
  for(const delta of correction.materials){
   if(!delta.inventoryId||typeof delta.unit!=='string'||!Number.isFinite(delta.quantity))throw Error('INVALID_THEORY_CORRECTION_EVIDENCE')
   const item=materials.find(m=>m.inventoryId===delta.inventoryId)
   if(item&&item.unit!==delta.unit)throw Error('INVALID_THEORY_CORRECTION_EVIDENCE')
   const quantity=(item?.quantity||0)+delta.quantity
   if(!Number.isFinite(quantity)||quantity<0)throw Error('INVALID_THEORY_CORRECTION_EVIDENCE')
   if(item)item.quantity=quantity;else materials.push({...delta,quantity})
  }
  return {...snapshot,materials:JSON.stringify(materials),theoryCorrectionApplied:true}
 })
}
