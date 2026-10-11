import { useEffect, useRef, useState } from 'react'
import { Printer, CheckCircle2 } from 'lucide-react'
import { Modal } from './ui/Modal'

type Prompt = {requestId:string;title:string;message:string;button:string;orderNum:string;copiesSubmitted:number;printCopies:number}

/** App-level listener covers checkout, reprints and printer tests. */
export function ReceiptHandoverModal(){
 const [prompt,setPrompt]=useState<Prompt|null>(null)
 const active=useRef<Prompt|null>(null)
 const panel=useRef<HTMLDivElement>(null)
 useEffect(()=>{
  const api=window.electronAPI
  const unsubscribe=api?.onReceiptHandover?.(next=>{active.current=next;setPrompt(next)})
  return ()=>{unsubscribe?.();if(active.current)api?.confirmReceiptHandover?.(active.current.requestId,false);active.current=null}
 },[])
 useEffect(()=>{
  if(!prompt)return
  const previous=document.activeElement as HTMLElement|null
  panel.current?.focus()
  return ()=>{if(previous?.isConnected)previous.focus()}
 },[prompt])
 const respond=(confirmed:boolean)=>{
  const current=active.current
  if(!current)return
  active.current=null
  setPrompt(null)
  window.electronAPI?.confirmReceiptHandover?.(current.requestId,confirmed)
 }
 return <Modal isOpen={!!prompt} onClose={()=>respond(false)} title={prompt?.title} showClose closeOnOverlayClick={false} className="rounded-2xl" overlayClassName="!z-[200] !bg-black/40 backdrop-blur-sm">
  {prompt&&<div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={prompt.title} className="outline-none" onKeyDown={event=>{
   event.stopPropagation()
   if(event.key==='Escape'){event.preventDefault();respond(false)}
   if(event.key==='Tab'){
    event.preventDefault()
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
   }
  }}>
   <div className="p-6 text-center">
    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Printer size={32}/></div>
    <p className="text-lg font-semibold text-gray-900 leading-relaxed">{prompt.message}</p>
    <div className="mt-4 px-4 py-3 bg-gray-50 rounded-xl flex items-center justify-between text-sm text-gray-500">
     <span className="font-mono font-semibold text-gray-700">{prompt.orderNum?'#'+prompt.orderNum:''}</span>
     <span>{prompt.copiesSubmitted} / {prompt.printCopies}</span>
    </div>
   </div>
   <div className="px-6 pb-6">
    <button type="button" onClick={()=>respond(true)} className="w-full py-4 rounded-xl bg-primary text-white font-bold text-lg touch-feedback flex items-center justify-center gap-2"><CheckCircle2 size={22}/>{prompt.button}</button>
   </div>
  </div>}
 </Modal>
}
