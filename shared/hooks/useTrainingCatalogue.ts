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
    const controller=new AbortController();setLoading(true);setError(false);setState({modules:[],checklists:[],revision:''})
    fetch('/api/training/library',{headers:{Authorization:`Bearer ${token || ''}`, ...(clientApp ? {'X-Client-App':clientApp} : {})},signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error('TRAINING_READ_FAILED');return response.json()})
      .then(body=>{
        const value=body.data
        if(!value || !Array.isArray(value.modules) || !Array.isArray(value.checklists))throw Error('TRAINING_READ_INVALID')
        const modules=value.modules.map((module: any)=>{const [icon,color]=visuals[module.key]||['📖','from-sky-500 to-indigo-500'];return {...module,icon,color}})
        if(!controller.signal.aborted)setState({modules,checklists:value.checklists,revision:value.revision || 'default'})
      }).catch(()=>{if(!controller.signal.aborted)setError(true)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return ()=>controller.abort()
  },[token,storeId,nonce,clientApp])
  return {...state,loading,error,refresh}
}
