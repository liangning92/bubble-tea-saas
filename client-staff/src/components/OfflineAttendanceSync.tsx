import {useEffect} from 'react'
import {useAuthStore} from '../stores/auth'
import {API_BASE,staffApi} from '../services/api'
import {loginBackend} from '../utils/offlineAuth'
import {attendanceState,saveAttendancePreparation,syncAttendance} from '../utils/offlineAttendance'
export function OfflineAttendanceSync(){
 const {user,token}=useAuthStore(),backend=loginBackend(API_BASE)
 useEffect(()=>{
  if(!user)return
  let active=true,running=false
  const run=async()=>{
   if(running||!active||!navigator.onLine)return
   running=true
   try{
    await syncAttendance(API_BASE,backend,user.id)
    const state=await attendanceState(backend,user.id)
    if(active&&token&&(!state||(!state.pending&&Date.now()-state.issuedAt>5*60000))){
     const response=await staffApi.prepareOfflineAttendance()
     if(active&&useAuthStore.getState().user?.id===user.id&&useAuthStore.getState().token===token)await saveAttendancePreparation(backend,user.id,response.data)
    }
   }catch{}finally{running=false}
  }
  void run();const timer=window.setInterval(run,30000)
  window.addEventListener('online',run);window.addEventListener('focus',run)
  return()=>{active=false;window.clearInterval(timer);window.removeEventListener('online',run);window.removeEventListener('focus',run)}
 },[user?.id,token,backend])
 return null
}
