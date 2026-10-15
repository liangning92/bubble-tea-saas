import { db } from '../db/offline'
import { localIdentity } from './offlineSale'
import { readCheckoutGeneration,readCheckoutRecovery } from './checkoutIntent'
const key=(storeId:string)=>`offline.drafts:${encodeURIComponent(localIdentity(storeId))}:${encodeURIComponent(storeId)}`
export async function readOfflineDrafts(storeId:string){return (await db.config.get(key(storeId)))?.value||[]}
/** Unpaid drafts are not sales, cash events or inventory consumption. */
export async function suspendOfflineDraft(storeId:string,cart:any[],channel:any,generation:string){
 return db.transaction('rw',db.config,db.orders,async()=>{
  const backendUrl=localIdentity(storeId)
  if(!cart.length||await readCheckoutGeneration(storeId)!==generation)throw Error('CHECKOUT_BASKET_STALE')
  const recovery=await readCheckoutRecovery(storeId)
  if(recovery.blocked||recovery.confirmed.length)throw Error('CHECKOUT_REVIEW_REQUIRED')
  const draft={id:'SUSP-'+crypto.randomUUID(),storeId,backendUrl,cart:structuredClone(cart),channel:structuredClone(channel),time:new Date().toLocaleTimeString()}
  const drafts=await readOfflineDrafts(storeId)
  await db.config.put({key:key(storeId),value:[...drafts,draft],updatedAt:new Date()})
  await db.config.put({key:`checkout.generation:${encodeURIComponent(storeId)}`,value:crypto.randomUUID(),updatedAt:new Date()})
  return draft
 })
}
export async function removeOfflineDraft(storeId:string,id:string){await db.transaction('rw',db.config,async()=>{const drafts=await readOfflineDrafts(storeId);await db.config.put({key:key(storeId),value:drafts.filter((d:any)=>d.id!==id),updatedAt:new Date()})})}
