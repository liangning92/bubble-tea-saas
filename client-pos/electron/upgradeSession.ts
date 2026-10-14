import { app, safeStorage } from 'electron'
import { mkdir, open, rename, readFile, unlink } from 'fs/promises'
import { randomUUID } from 'crypto'
import path from 'path'

const file=()=>path.join(app.getPath('userData'),'data','upgrade-session.bin')
export async function clearUpgradeSession(){await unlink(file()).catch(error=>{if(error.code!=='ENOENT')throw error})}

function acceptedAuth(raw:unknown):string|null {
 if(typeof raw!=='string'||Buffer.byteLength(raw)>65536)return null
 try{
  const auth=JSON.parse(raw),state=auth.state
  if(!state?.isAuthenticated||!state.user||typeof state.user.id!=='string'||typeof state.apiUrl!=='string')return null
  const url=new URL(state.apiUrl)
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)return null
  if(state.token!==null&&typeof state.token!=='string')return null
  if(state.token?.split('.').length===3){
   const claims=JSON.parse(Buffer.from(state.token.split('.')[1],'base64url').toString())
   if(typeof claims.exp!=='number'||claims.exp*1000<=Date.now())return null
  }
  const u=state.user,staff=u.staff
  const user={id:u.id,phone:u.phone,role:u.role,storeId:u.storeId,staff:staff?{id:staff.id,name:staff.name,employeeNumber:staff.employeeNumber,position:staff.position}:null}
  return JSON.stringify({state:{token:state.token,user,apiUrl:state.apiUrl,isAuthenticated:true},version:0})
 }catch{return null}
}

/** Only an upgrade handoff persists a login; never passwords or a permanent login. */
export async function saveUpgradeSession(raw:unknown){
 const auth=acceptedAuth(raw)
 if(!auth){await clearUpgradeSession();return}
 if(!safeStorage.isEncryptionAvailable())throw Error('UPDATE_SESSION_ENCRYPTION_UNAVAILABLE')
 const bytes=safeStorage.encryptString(JSON.stringify({format:'POS-upgrade-session-v1',createdAt:Date.now(),auth}))
 await mkdir(path.dirname(file()),{recursive:true})
 const temp=file()+'.'+randomUUID(),handle=await open(temp,'wx',0o600)
 try{await handle.writeFile(bytes);await handle.sync()}finally{await handle.close()}
 await rename(temp,file())
}

/** Same Windows account/profile only, one use, bounded to the installation interval. */
export async function consumeUpgradeSession():Promise<string|null>{
 let bytes:Buffer
 try{bytes=await readFile(file())}catch(error:any){if(error.code==='ENOENT')return null;throw error}
 await clearUpgradeSession()
 try{
  if(!safeStorage.isEncryptionAvailable())return null
  const handoff=JSON.parse(safeStorage.decryptString(bytes))
  if(handoff.format!=='POS-upgrade-session-v1'||!Number.isFinite(handoff.createdAt)||Date.now()-handoff.createdAt<0||Date.now()-handoff.createdAt>15*60*1000)return null
  return acceptedAuth(handoff.auth)
 }catch{return null}
}
