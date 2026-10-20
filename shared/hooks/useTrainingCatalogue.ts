import { useCallback, useEffect, useState } from 'react'

export type TrainingText = { zh: string; id: string; en?: string }
export type TrainingSection = { title: TrainingText; points: TrainingText[]; tip?: TrainingText; warning?: TrainingText; errors?: TrainingText[]; practice?: TrainingText; checklist?: TrainingText[]; videoId?: string; documentId?: string }
export type TrainingModule = { key: string; reviewed: boolean; icon: string; color: string; title: TrainingText; subtitle: TrainingText; minutes: number; sections: TrainingSection[]; quiz: { q: TrainingText; options: TrainingText[]; answer: number; explanation?: TrainingText }[]; practical: TrainingText[]; sources: {title: string; url: string}[] }
export type TrainingChecklist = {key: string; title: TrainingText; items: TrainingText[]}
export const tr = (text: TrainingText | undefined, language: string) => text?.[language.split('-')[0] as keyof TrainingText] || text?.id || text?.zh || ''
const visuals: Record<string, [string,string]> = {
  onboarding: ['👋','from-sky-500 to-indigo-500'], service: ['😊','from-pink-500 to-rose-500'], hygiene: ['🫧','from-emerald-500 to-teal-500'], inventory: ['📦','from-amber-500 to-orange-500'], production: ['🧋','from-purple-500 to-violet-500'], safety: ['🦺','from-orange-500 to-red-500'],
}
/** Both applications read the same published, store-scoped catalogue. Failed reads never fall back to stale built-in courses. */
export function useTrainingCatalogue(token: string | null, storeId?: string | null, clientApp?: 'employee') {
  const [state, setState] = useState<{modules: TrainingModule[];checklists: TrainingChecklist[];revision: string}>({modules:[],checklists:[],revision:''})
  const [loading,setLoading] = useState(true), [error,setError] = useState(false), [nonce,setNonce] = useState(0)
  const refresh = useCallback(()=>setNonce(n=>n+1),[])
  useEffect(()=>{
    let active = true, inFlight = false, controller: AbortController | undefined
    setLoading(true);setError(false);setState({modules:[],checklists:[],revision:''})
    async function load(background = false) {
      if (!active || inFlight || background && document.visibilityState !== 'visible') return
      inFlight = true
      controller = new AbortController()
      const timeout = window.setTimeout(()=>controller?.abort(),12000)
      try {
        const response = await fetch('/api/training/library',{headers:{Authorization:`Bearer ${token || ''}`, ...(clientApp ? {'X-Client-App':clientApp} : {})},signal:controller.signal})
        if(!response.ok)throw Error('TRAINING_READ_FAILED')
        const value=(await response.json()).data
        if(!value || !Array.isArray(value.modules) || !Array.isArray(value.checklists))throw Error('TRAINING_READ_INVALID')
        const modules=value.modules.map((module: any)=>{const [icon,color]=visuals[module.key]||['📖','from-sky-500 to-indigo-500'];return {...module,icon,color}})
        if(active){
          setState(previous=>previous.revision===(value.revision || 'default') ? previous : {modules,checklists:value.checklists,revision:value.revision || 'default'})
          setError(false)
        }
      } catch {
        if(active){setError(true);setState({modules:[],checklists:[],revision:''})}
      } finally {
        window.clearTimeout(timeout);inFlight=false
        if(active)setLoading(false)
      }
    }
    void load()
    const resume=()=>{if(document.visibilityState==='visible')void load(true)}
    const timer=window.setInterval(()=>void load(true),30000)
    window.addEventListener('focus',resume);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume)
    return ()=>{active=false;controller?.abort();window.clearInterval(timer);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume)}
  },[token,storeId,nonce,clientApp])
  return {...state,loading,error,refresh}
}
