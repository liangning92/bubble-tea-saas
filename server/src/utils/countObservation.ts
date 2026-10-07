import {assertLedgerInstalled} from './inventoryLedger'
export const COUNT_OBSERVATION_PREFIX='inventoryCountObservation.'
// Caller holds the inventory write lock through observation commit. No history scan.
export async function captureCountBoundary(tx:any,inventoryId:string){
 const sqlite=(process.env.DATABASE_URL||'').startsWith('file:')
 await assertLedgerInstalled(tx,sqlite)
 const inventory=await tx.inventory.findUniqueOrThrow({where:{id:inventoryId},select:{ledgerSequence:true,ledgerEpoch:true}})
 return {inventoryId,sequence:inventory.ledgerSequence.toString(),epoch:inventory.ledgerEpoch.toString()}
}
