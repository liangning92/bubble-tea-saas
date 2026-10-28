import { ipcMain, WebContents } from 'electron'
import { randomUUID } from 'crypto'

export interface ReceiptHandoverPrompt {
 title:string
 message:string
 button:string
 orderNum:string
 copiesSubmitted:number
 printCopies:number
}
const pending=new Map<string,{sender:WebContents;finish:(confirmed:boolean)=>void}>()
ipcMain.on('receipt-handover-response',(event,response)=>{
 const entry=pending.get(response?.requestId)
 if(entry&&entry.sender===event.sender&&typeof response.confirmed==='boolean')entry.finish(response.confirmed)
})
/** Only the renderer that started this job can release its next receipt copy. */
export function requestReceiptHandover(sender:WebContents,prompt:ReceiptHandoverPrompt):Promise<boolean>{
 if(!sender||sender.isDestroyed())return Promise.resolve(false)
 return new Promise(resolve=>{
  const requestId=randomUUID()
  const cancel=()=>finish(false)
  const finish=(confirmed:boolean)=>{
   if(!pending.delete(requestId))return
   clearTimeout(timer)
   sender.removeListener('destroyed',cancel)
   sender.removeListener('render-process-gone',cancel)
   sender.removeListener('did-navigate',cancel)
   resolve(confirmed)
  }
  const timer=setTimeout(cancel,30000)
  pending.set(requestId,{sender,finish})
  sender.once('destroyed',cancel)
  sender.once('render-process-gone',cancel)
  sender.once('did-navigate',cancel)
  try{sender.send('receipt-handover-request',{...prompt,requestId})}catch{finish(false)}
 })
}
