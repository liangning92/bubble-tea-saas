import {db} from '../db/offline'
import {currentBackendIdentity,readBackendAuth} from './backendIdentity'
export const offlineQrKey=(storeId:string,posId:string)=>`offline.attendance.qr:${encodeURIComponent(currentBackendIdentity())}:${encodeURIComponent(storeId)}:${encodeURIComponent(posId)}`
const running=new Map<string,Promise<void>>()
export async function prepareOfflineAttendanceQR(posId:string,request:()=>Promise<any>){
 const auth=readBackendAuth(),storeId=auth.user?.storeId
 if(!auth.token||!storeId||posId!==storeId)return
 const key=offlineQrKey(storeId,posId),old=await db.config.get(key)
 if(old&&Date.now()-new Date(old.updatedAt).getTime()<5*60000&&old.value?.expiresAt>Date.now())return
 if(running.has(key))return running.get(key)
 const promise=(async()=>{
  const response=await request(),data=response.data?.data
  if(data?.version!==1||data.storeId!==storeId||data.posId!==posId||data.windowMs!==300000||!data.codes||!Number.isFinite(data.expiresAt)||data.expiresAt<=Date.now()||data.issuedAt>Date.now()+1000)throw Error('OFFLINE_ATTENDANCE_QR_UNAVAILABLE')
  if(currentBackendIdentity()!==auth.apiUrl||readBackendAuth().user?.id!==auth.user?.id||readBackendAuth().token!==auth.token)throw Error('CHECKOUT_AUTH_CHANGED')
  await db.config.put({key,value:data,updatedAt:new Date()})
 })().finally(()=>running.delete(key))
 running.set(key,promise);return promise
}
export async function cachedAttendanceQR(posId:string){
 const storeId=readBackendAuth().user?.storeId
 if(!storeId)throw Error('OFFLINE_ATTENDANCE_QR_UNAVAILABLE')
 const row=await db.config.get(offlineQrKey(storeId,posId)),data=row?.value,now=Date.now()
 if(!data||data.storeId!==storeId||data.posId!==posId||now<data.issuedAt||now>=data.expiresAt)throw Error('OFFLINE_ATTENDANCE_QR_UNAVAILABLE')
 const slot=Math.floor(now/300000)*300000,qrData=data.codes?.[String(slot)]
 if(typeof qrData!=='string')throw Error('OFFLINE_ATTENDANCE_QR_UNAVAILABLE')
 return {data:{code:200,data:{qrData,posId,storeName:data.storeName,expiresAt:Math.min(slot+300000,data.expiresAt),refreshInterval:300000},offline:true}}
}
