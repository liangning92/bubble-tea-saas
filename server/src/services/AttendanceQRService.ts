import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { config } from '../config/env'
import { POS_OFFLINE_TTL_MS } from '../utils/offlinePolicy'

export const ATTENDANCE_QR_WINDOW = 5 * 60000
const secret = () => createHmac('sha256',config.jwt.secret).update('attendance-qr-v2:'+(process.env.QR_SECRET||'')).digest('hex')
// Older POS builds refresh relative to issuance; keep their full five-minute TTL.
export function onlineAttendanceQR(storeId:string,posId:string,timestamp=Date.now()){
 const signature=createHmac('sha256',secret()).update(`attendance-online:${storeId}:${posId}:${timestamp}`).digest('hex').slice(0,32)
 return Buffer.from(JSON.stringify({storeId,posId,timestamp,signature})).toString('base64')
}
export function verifyOnlineAttendanceQR(qrData:string,storeId:string,at=Date.now()){
 let payload:any
 try{payload=JSON.parse(Buffer.from(qrData,'base64').toString('utf8'))}catch{throw Error('ATTENDANCE_QR_INVALID')}
 if(payload.v===2)return verifyAttendanceQR(qrData,storeId,at)
 if(payload.storeId!==storeId||typeof payload.posId!=='string'||!payload.posId||payload.posId.length>100||!Number.isSafeInteger(payload.timestamp)||at<payload.timestamp||at>=payload.timestamp+ATTENDANCE_QR_WINDOW)throw Error('ATTENDANCE_QR_INVALID_OR_EXPIRED')
 const expected=onlineAttendanceQR(storeId,payload.posId,payload.timestamp)
 if(Buffer.byteLength(expected)!==Buffer.byteLength(qrData)||!timingSafeEqual(Buffer.from(expected),Buffer.from(qrData)))throw Error('ATTENDANCE_QR_INVALID')
 return {s:storeId,p:payload.posId as string,t:payload.timestamp as number}
}
export function attendanceQR(storeId:string,posId:string,timestamp:number){
 const t=Math.floor(timestamp/ATTENDANCE_QR_WINDOW)*ATTENDANCE_QR_WINDOW
 const sig=createHmac('sha256',secret()).update(`attendance-v2:${storeId}:${posId}:${t}`).digest('hex').slice(0,32)
 return Buffer.from(JSON.stringify({v:2,s:storeId,p:posId,t,sig})).toString('base64')
}
export function verifyAttendanceQR(qrData:string,storeId:string,at=Date.now()){
 let payload:any
 try{payload=JSON.parse(Buffer.from(qrData,'base64').toString('utf8'))}catch{throw Error('ATTENDANCE_QR_INVALID')}
 if(payload.v!==2||payload.s!==storeId||typeof payload.p!=='string'||!payload.p||payload.p.length>100||!Number.isSafeInteger(payload.t)||payload.t%ATTENDANCE_QR_WINDOW!==0||at<payload.t||at>=payload.t+ATTENDANCE_QR_WINDOW)throw Error('ATTENDANCE_QR_INVALID_OR_EXPIRED')
 const expected=attendanceQR(storeId,payload.p,payload.t)
 if(Buffer.byteLength(expected)!==Buffer.byteLength(qrData)||!timingSafeEqual(Buffer.from(expected),Buffer.from(qrData)))throw Error('ATTENDANCE_QR_INVALID')
 return payload as {v:number;s:string;p:string;t:number;sig:string}
}
export function attendanceQRBundle(storeId:string,posId:string,now=Date.now()){
 const from=Math.floor(now/ATTENDANCE_QR_WINDOW)*ATTENDANCE_QR_WINDOW,expiresAt=now+POS_OFFLINE_TTL_MS,codes:Record<string,string>={}
 for(let at=from;at<expiresAt;at+=ATTENDANCE_QR_WINDOW)codes[String(at)]=attendanceQR(storeId,posId,at)
 return {version:1,storeId,posId,issuedAt:now,expiresAt,windowMs:ATTENDANCE_QR_WINDOW,codes}
}
export function attendanceQRHashes(storeId:string,posId:string,now=Date.now()){
 const {codes,...scope}=attendanceQRBundle(storeId,posId,now)
 return {...scope,hashes:Object.fromEntries(Object.entries(codes).map(([at,code])=>[at,createHash('sha256').update(code).digest('base64')]))}
}
