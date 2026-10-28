import { useEffect, useRef, useState } from 'react'
import { Printer, CheckCircle2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type Prompt = {requestId:string;title:string;message:string;button:string;orderNum:string;copiesSubmitted:number;printCopies:number}

/** Output assistance stays nonmodal: a second customer can still place an order. */
export function ReceiptHandoverModal(){
 const {t}=useTranslation()
 const [prompt,setPrompt]=useState<Prompt|null>(null)
 const active=useRef<Prompt|null>(null)
 useEffect(()=>{
  const api=window.electronAPI
  const unsubscribe=api?.onReceiptHandover?.(next=>{active.current=next;setPrompt(next)})
  return ()=>{unsubscribe?.();if(active.current)api?.confirmReceiptHandover?.(active.current.requestId,false);active.current=null}
 },[])
 const respond=(confirmed:boolean)=>{
  const current=active.current
  if(!current)return
  active.current=null;setPrompt(null)
  window.electronAPI?.confirmReceiptHandover?.(current.requestId,confirmed)
 }
 useEffect(()=>{
  if(!prompt)return
  const timer=window.setTimeout(()=>{if(active.current?.requestId===prompt.requestId)respond(false)},30000)
  return ()=>window.clearTimeout(timer)
 },[prompt?.requestId])
 if(!prompt)return null
 return <aside aria-label={prompt.title} className="fixed top-4 right-4 z-[200] w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-amber-300 bg-white p-3 shadow-xl" data-testid="receipt-handover-assistance">
  <button type="button" onClick={()=>respond(false)} aria-label={t('common.close')} data-testid="receipt-handover-close" className="absolute top-3 right-3 min-h-12 min-w-12 flex items-center justify-center rounded-lg border"><X size={20}/></button>
  <details key={prompt.requestId}>
    <summary className="min-h-12 cursor-pointer pr-14 list-none flex items-center gap-3"><Printer size={20} className="shrink-0"/><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{prompt.title}</span><span className="block truncate font-mono text-xs text-gray-600">#{prompt.orderNum}</span></span><span className="shrink-0 text-xs text-gray-600">{prompt.copiesSubmitted} / {prompt.printCopies}</span></summary>
    <p className="my-3 text-sm">{prompt.message}</p>
    <button type="button" onClick={()=>respond(true)} className="min-h-12 w-full rounded-xl bg-primary px-3 py-3 font-bold text-white flex items-center justify-center gap-2"><CheckCircle2 size={20}/>{prompt.button}</button>
  </details>
 </aside>
}
