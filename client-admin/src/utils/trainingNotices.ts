import api from '../services/api'
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

/** Inbox read receipts belong to the current person; they never update learning progress. */
export function useAdminTrainingNotices(scope: string, revision: string, current:()=>boolean) {
  const [state,setState]=useState<{scope:string;items:TrainingNotice[]}>({scope:'',items:[]})
  const [failed,setFailed]=useState(false),[readFailed,setReadFailed]=useState(false),[nonce,setNonce]=useState(0)
  const reading=useRef(new Set<string>())
  const refresh=()=>setNonce(value=>value+1)
  useEffect(()=>{
    let active=true,inFlight=false
    setFailed(false);setReadFailed(false)
    async function load(){
      if(inFlight||!current())return
      inFlight=true
      try{
        const body=(await api.get('/staff-work/my/inbox',{timeout:12000})).data.data
        if(!Array.isArray(body?.items))throw Error('TRAINING_INBOX_INVALID')
        if(active&&current()){
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
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume)}
  },[scope,revision,nonce])
  const items=state.scope===scope?state.items:[]
  const unread=(kind:'module'|'checklist',key:string)=>items.filter(item=>!item.read&&item.trainingUpdate.kind===kind&&(kind==='module'?item.trainingUpdate.moduleKey:item.trainingUpdate.itemKey)===key)
  async function markRead(kind:'module'|'checklist',key:string){
    if(!current())return
    for(const notice of unread(kind,key)){
      const requestKey=scope+':'+notice.id
      if(reading.current.has(requestKey))continue
      reading.current.add(requestKey)
      try{
        await api.post('/staff-work/my/inbox/'+encodeURIComponent(notice.id)+'/read',{}, {timeout:12000})
        if(!current())return
        setState(previous=>previous.scope===scope?{scope,items:previous.items.map(item=>item.id===notice.id?{...item,read:true}:item)}:previous)
        setReadFailed(false)
        window.dispatchEvent(new Event('employee-inbox-updated'))
      }catch{if(current())setReadFailed(true)}
      finally{reading.current.delete(requestKey)}
    }
  }
  return {items,unread,markRead,refresh,failed,readFailed}
}
