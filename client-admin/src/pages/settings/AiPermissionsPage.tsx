import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { aiSettingsCopy } from './aiSettingsCopy'

interface Policy {
 executionEnabled: false
 read: { sales: boolean; inventory: boolean }
 actions: { refund: 'deny' | 'approval' | 'automatic'; purchase: 'deny' | 'approval' | 'automatic'; price: 'deny' | 'approval' | 'automatic' }
}

// Unsupported business permissions remain visible as boundaries, never live controls.
export function AiPermissionsPage() {
 const { i18n }=useTranslation(), c=aiSettingsCopy(i18n.language), {user}=useAuthStore()
 const [legacyOpen,setLegacyOpen]=useState(false),[policy,setPolicy]=useState<Policy|null>(null),[error,setError]=useState(false)
 useEffect(()=>{
  let active=true
  setPolicy(null);setError(false)
  if(legacyOpen&&user?.role==='admin'&&user.storeId){const expected=user.id,store=user.storeId
   void api.get(`/ai/permissions/${store}`).then(result=>{const current=useAuthStore.getState();if(active&&current.user?.id===expected&&current.user?.storeId===store&&current.user?.role==='admin')setPolicy(result.data.data)}).catch(()=>{if(active)setError(true)})
  }
  return()=>{active=false}
 },[legacyOpen,user?.id,user?.storeId,user?.role])
 if(user?.role!=='admin'||!user.storeId)return <p role="alert">{c.denied}</p>
 return <>
  <section className="rounded-xl border bg-white p-4 sm:p-6" aria-labelledby="ai-capabilities">
   <h3 id="ai-capabilities" className="font-semibold">{c.capabilities}</h3>
   <div className="mt-4 grid gap-3 md:grid-cols-3">
    {[[c.communications,c.communicationsDetail,true],[c.followup,c.followupDetail,true],[c.analytics,c.analyticsDetail,false]].map(([title,detail,available])=><div key={String(title)} className="min-w-0 rounded-lg bg-gray-50 p-4">
     <p className={`text-xs font-medium ${available?'text-green-700':'text-gray-500'}`}>{available?c.available:c.notIntegrated}</p>
     <h4 className="mt-1 text-sm font-semibold">{title}</h4><p className="mt-2 text-sm leading-relaxed text-gray-600">{detail}</p>
    </div>)}
   </div>
  </section>
  <section className="rounded-xl border bg-white p-4 sm:p-6" aria-labelledby="ai-boundaries">
   <h3 id="ai-boundaries" className="font-semibold">{c.boundaries}</h3>
   <dl className="mt-3 divide-y">
    {[[c.read,c.readDetail],[c.draft,c.draftDetail],[c.confirm,c.confirmDetail],[c.prohibited,c.prohibitedDetail]].map(([title,detail])=><div key={title} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4"><dt className="text-sm font-medium">{title}</dt><dd className="min-w-0 text-sm leading-relaxed text-gray-600">{detail}</dd></div>)}
   </dl>
   <details className="mt-3 border-t pt-3 text-sm" onToggle={event=>setLegacyOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-gray-600">{c.legacy}</summary>
    <p className="my-3 text-gray-600">{c.legacyNote}</p>
    {error?<p role="alert">{c.loadError}</p>:policy?<dl className="grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3 sm:grid-cols-3">
     {(['sales','inventory'] as const).map(key=><div key={key}><dt>{c[key]}</dt><dd>{c.notIntegrated} · {policy.read[key]?c.allowed:c.deny}</dd></div>)}
     {(['refund','purchase','price'] as const).map(key=><div key={key}><dt>{c[key]}</dt><dd>{c.notIntegrated} · {c[policy.actions[key]]}</dd></div>)}
    </dl>:legacyOpen?<p role="status">{c.loading}</p>:null}
   </details>
  </section>
 </>
}
