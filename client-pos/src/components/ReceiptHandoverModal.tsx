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
 return <aside aria-label={prompt.title} className="fixed bottom-4 right-4 z-[200] w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-amber-300 bg-white p-4 shadow-xl" data-testid="receipt-handover-assistance">
  <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-bold"><Printer size={20}/>{prompt.title}</h2><button type="button" onClick={()=>respond(false)} aria-label={t('common.close')} className="min-h-12 min-w-12 flex items-center justify-center rounded-lg border"><X size={20}/></button></div>
  <p className="my-3 text-sm">{prompt.message}</p>
  <p className="mb-3 flex justify-between gap-3 text-sm text-gray-600"><span className="font-mono break-all">#{prompt.orderNum}</span><span>{prompt.copiesSubmitted} / {prompt.printCopies}</span></p>
  <button type="button" onClick={()=>respond(true)} className="min-h-12 w-full rounded-xl bg-primary px-3 py-3 font-bold text-white flex items-center justify-center gap-2"><CheckCircle2 size={20}/>{prompt.button}</button>
 </aside>
}
