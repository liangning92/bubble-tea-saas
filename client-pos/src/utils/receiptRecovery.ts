import { db } from '../db/offline'
export type ReceiptResult = {success:boolean;error?:string;deliveryStatus?:string;copiesSubmitted?:number;warnings?:string[]}
export function receiptResultStatus(result:ReceiptResult):'sent'|'failed'|'unknown'{
 return result.success?'sent':result.deliveryStatus==='unconfirmed'||(result.copiesSubmitted||0)>0?'unknown':'failed'
}
export function receiptNeedsPaperCheck(value:{status:string;error?:string}){
 return value.status!=='failed'||!/RECEIPT_(?:QUEUE_EXPIRED|PAINT|RENDER|SIZE|PDF|BITMAP|RENDERER|TEMPLATE)|UnknownVizError|BARCODE_TOO_WIDE|No printer available|PRINTER_(?:API|TARGET)_UNAVAILABLE/.test(value.error||'')
}
// Native Windows accepts one receipt at a time. Keep queued output independent of checkout.
type QueuedReceipt = {send:(payload:any)=>Promise<ReceiptResult>;payload:any;resolve:(result:ReceiptResult)=>void;reject:(error:unknown)=>void;timer?:ReturnType<typeof setTimeout>}
const receiptDeliveryQueue:QueuedReceipt[] = []
let receiptDeliveryBusy = false
const activeReceiptJobs = new Set<string>()
function drainReceiptQueue():void {
 if(receiptDeliveryBusy)return
 const job=receiptDeliveryQueue.shift()
 if(!job)return
 if(job.timer)clearTimeout(job.timer)
 receiptDeliveryBusy=true
 void Promise.resolve().then(()=>job.send(job.payload)).then(job.resolve,job.reject).finally(()=>{receiptDeliveryBusy=false;drainReceiptQueue()})
}
function queueReceiptDelivery(send:(payload:any)=>Promise<ReceiptResult>,payload:any):Promise<ReceiptResult> {
 return new Promise((resolve,reject)=>{
  const job:QueuedReceipt={send,payload,resolve,reject}
  job.timer=setTimeout(()=>{
   const index=receiptDeliveryQueue.indexOf(job)
   if(index<0)return
   receiptDeliveryQueue.splice(index,1)
   resolve({success:false,deliveryStatus:'not-sent',error:'RECEIPT_QUEUE_EXPIRED'})
  },30000)
  receiptDeliveryQueue.push(job)
  drainReceiptQueue()
 })
}
export async function submitSavedReceipt(key:string,send:(payload:any)=>Promise<ReceiptResult>,audit:(status:string,error?:string)=>void,reprint=false):Promise<ReceiptResult>{
 if(reprint&&activeReceiptJobs.has(key))throw Error('RECEIPT_STILL_PROCESSING')
 const record=await db.transaction('rw',db.config,async()=>{
  const job=await db.config.get(key)
  if(!job?.value?.payload)throw Error('RECEIPT_COPY_UNAVAILABLE')
  if(reprint&&job.value.status==='pending'&&Date.now()-new Date(job.value.attemptedAt).getTime()<45000)throw Error('RECEIPT_STILL_PROCESSING')
  await db.config.put({...job,value:{...job.value,status:'pending',attemptedAt:new Date()},updatedAt:new Date()})
  return job
 })
 const persist=async(status:string,error?:string)=>{
  await db.transaction('rw',db.config,async()=>{const current=await db.config.get(key);if(current)await db.config.put({...current,value:{...current.value,status,error},updatedAt:new Date()})})
  audit(status,error)
 }
 audit('pending')
 let timer:ReturnType<typeof setTimeout>|undefined
 // Continue recording a late native result; a UI deadline does not cancel printer delivery.
 activeReceiptJobs.add(key)
 const native=queueReceiptDelivery(send,{...record.value.payload,...(reprint?{openCashDrawer:false,printCopies:1}: {})}).then(async result=>{
  await persist(receiptResultStatus(result),result.error);return result
 },async error=>{await persist('unknown',String(error).slice(0,500));return {success:false,deliveryStatus:'unconfirmed',error:String(error)}}).finally(()=>activeReceiptJobs.delete(key))
 try{
  return await Promise.race([native,new Promise<ReceiptResult>(resolve=>{timer=setTimeout(()=>{resolve({success:false,deliveryStatus:'unconfirmed',error:'RECEIPT_DELIVERY_TIMEOUT'});void persist('unknown','RECEIPT_DELIVERY_TIMEOUT').catch(()=>{})},45000)})])
 }finally{if(timer)clearTimeout(timer)}
}
