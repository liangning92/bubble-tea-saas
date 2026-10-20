import { useEffect, useState, useRef } from 'react'

export type TrainingNotice = {
  id: string; read: boolean; event: string
  trainingUpdate: {kind: 'module'|'checklist'; moduleKey: string; itemKey?: string; fingerprint: string; revision: string; generation: string}
}
export const trainingNoticeWords = (language: string) => language.startsWith('zh')
  ? {updated:'新内容',open:'查看更新',failed:'更新提醒读取失败，请重试。',readFailed:'阅读状态未保存，请重试。',missing:'这项培训资料已更新或撤回，请查看当前资料。',retry:'重试'}
  : language.startsWith('en')
    ? {updated:'New content',open:'View update',failed:'Could not load updates. Please retry.',readFailed:'Reading status could not be saved. Please retry.',missing:'This material changed or was withdrawn. View the current materials.',retry:'Retry'}
    : {updated:'Materi baru',open:'Lihat pembaruan',failed:'Gagal memuat pembaruan. Coba lagi.',readFailed:'Status baca belum tersimpan. Coba lagi.',missing:'Materi berubah atau ditarik. Lihat materi terkini.',retry:'Coba lagi'}

// Keep this canonicalization identical to TrainingLibraryStore.trainingContentFingerprint.
// icon/color are presentation-only fields added by useTrainingCatalogue.
export async function displayedTrainingFingerprint(kind: 'module'|'checklist', sourceItem: any): Promise<string> {
  if (!sourceItem || typeof sourceItem.key !== 'string') throw Error('TRAINING_DISPLAY_SOURCE_REQUIRED')
  const item = {...sourceItem}
  if (kind === 'module') {delete item.icon;delete item.color}
  const contentValue = (value: any): any => {
    if (Array.isArray(value)) return value.map(contentValue)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.keys(value).sort().filter(key=>key!=='reviewed'&&key!=='key').map(key=>[key,contentValue(value[key])]))
  }
  const bytes = new TextEncoder().encode(JSON.stringify([kind,item.key,contentValue(item)]))
  const digest = await crypto.subtle.digest('SHA-256',bytes)
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')
}

/** Inbox read receipts belong to the current person; they never update learning progress. */
export function useTrainingNotices(scope: string, revision: string, api: {get:(path:string)=>Promise<any>;post:(path:string,data:any)=>Promise<any>}, current:()=>boolean) {
  const [state,setState]=useState<{scope:string;items:TrainingNotice[]}>({scope:'',items:[]})
  const [failed,setFailed]=useState(false),[readFailed,setReadFailed]=useState(false),[nonce,setNonce]=useState(0)
  const reading=useRef(new Set<string>()), readGeneration=useRef(0)
  const refresh=()=>setNonce(value=>value+1)
  useEffect(()=>{
    let active=true,inFlight=false
    readGeneration.current++
    setFailed(false);setReadFailed(false)
    async function load(){
      if(inFlight||!current())return
      inFlight=true
      try{
        const body=await api.get('/my/inbox')
        if(!Array.isArray(body?.items))throw Error('TRAINING_INBOX_INVALID')
        if(active&&current()){
          readGeneration.current++
          setState({scope,items:body.items.filter((item:any)=>item?.trainingUpdate&&item.event?.startsWith('training-content:'))})
          setFailed(false)
        }
      }catch{if(active&&current()){setFailed(true);setState({scope,items:[]})}}
      finally{inFlight=false}
    }
    const resume=()=>{if(document.visibilityState==='visible')void load()}
    void load()
    const timer=window.setInterval(resume,30000)
    window.addEventListener('focus',resume);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume)
    return()=>{active=false;readGeneration.current++;window.clearInterval(timer);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume)}
  },[scope,revision,api,nonce])
  const items=state.scope===scope?state.items:[]
  const unread=(kind:'module'|'checklist',key:string)=>items.filter(item=>!item.read&&item.trainingUpdate.kind===kind&&(kind==='module'?item.trainingUpdate.moduleKey:item.trainingUpdate.itemKey)===key)
  async function markRead(kind:'module'|'checklist',key:string,sourceItem:any,isDisplayed:()=>boolean){
    const generation=readGeneration.current
    const shown=()=>current()&&document.visibilityState==='visible'&&isDisplayed()
    const valid=()=>generation===readGeneration.current&&shown()
    if(!valid()||sourceItem?.key!==key)return
    let fingerprint:string
    try{fingerprint=await displayedTrainingFingerprint(kind,sourceItem)}catch{if(valid())setReadFailed(true);return}
    // A newer reminder cannot acknowledge an older open item, even while its refresh is pending.
    if(!valid())return
    for(const notice of unread(kind,key)){
      if(notice.trainingUpdate.fingerprint!==fingerprint||notice.event!=='training-content:'+fingerprint)continue
      if(!valid())return
      const requestKey=scope+':'+notice.id
      if(reading.current.has(requestKey))continue
      reading.current.add(requestKey)
      try{
        await api.post('/my/inbox/'+encodeURIComponent(notice.id)+'/read',{})
        if(!shown())return
        setState(previous=>previous.scope===scope?{scope,items:previous.items.map(item=>item.id===notice.id?{...item,read:true}:item)}:previous)
        setReadFailed(false)
        window.dispatchEvent(new Event('employee-inbox-updated'))
      }catch{if(shown())setReadFailed(true)}
      finally{reading.current.delete(requestKey)}
    }
  }
  return {items,unread,markRead,refresh,failed,readFailed}
}
