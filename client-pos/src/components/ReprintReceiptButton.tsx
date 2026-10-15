import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../db/offline'
import { posApi } from '../services/api'
import { currentBackendIdentity,readBackendAuth } from '../utils/backendIdentity'
import { submitSavedReceipt } from '../utils/receiptRecovery'
import { selectPrinter } from '../utils/printerRouting'
import { showToast } from './ui'

export function ReprintReceiptButton({storeId,orderNumber}:{storeId?:string|null;orderNumber:string}){
 const {t}=useTranslation(),[busy,setBusy]=useState(false)
 const key=`receipt-print:${storeId}:${orderNumber}`
 const job=useLiveQuery(async()=>{
  if(!storeId)return null
  const saved=await db.config.get(key)
  if(!saved?.value?.payload)return null
  if(saved.value.backendUrl===currentBackendIdentity())return saved
  if(saved.value.backendUrl)return null
  // Legacy copies need an existing order with the same verified backend binding.
  const order=await db.orders.filter(o=>o.storeId===storeId&&o.orderNumber===orderNumber&&o.backendUrl===currentBackendIdentity()).first()
  return order?saved:null
 },[key,storeId,orderNumber])
 if(!job)return null
 return <button type="button" disabled={busy} className="border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:opacity-50" onClick={async event=>{
  event.stopPropagation();if(busy)return;setBusy(true)
  try{
   const backend=currentBackendIdentity(),actor=readBackendAuth().user?.id
   const config=(await posApi.getConfigs(storeId!)).data?.data||{}
   const printer=selectPrinter(config.hardwareSettings||{},'receipt'),send=(window as any).electronAPI?.sendPrintReceipt
   if(!printer.ok||!send)throw Error('PRINTER_TARGET_UNAVAILABLE')
   if(currentBackendIdentity()!==backend||readBackendAuth().user?.id!==actor)throw Error('CHECKOUT_AUTH_CHANGED')
   const result=await submitSavedReceipt(key,payload=>send({...payload,...printer.target,openCashDrawer:false,printCopies:1}),()=>{},true)
   if(!result.success)throw Error(result.error||'Print unconfirmed')
  }catch{showToast(t('printerRouting.failed'),'warning')}finally{setBusy(false)}
 }}>{t('pos.reprint')}</button>
}
