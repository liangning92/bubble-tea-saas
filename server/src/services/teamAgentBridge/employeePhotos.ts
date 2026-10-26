import { createHash } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { z } from 'zod'
import { readTeam, TeamError } from '../TeamCommunicationService'
import { readWork } from '../EmployeeWorkspaceStore'
import { readAuthorizedBridgeChannel } from './directDelegation'
import type { BridgeGrant, CommunicationScope } from './contract'
import type { StockOperation } from '../InventoryService'

export interface EmployeePhoto {fileId:string;messageId:string;seq:number;sha256:string;type:string}
const deny=():never=>{throw new TeamError(403,'EMPLOYEE_PHOTO_NOT_AUTHORIZED')}
const root=()=>path.resolve(process.env.UPLOADS_PATH||path.resolve(__dirname,'../../../uploads'),'.employee-private')
/** Only files actually granted in a current, employee-authored message. No URL/path supplied by the model. */
export async function employeeMessagePhotos(db:any,g:BridgeGrant,scope:CommunicationScope,message:any,includePixels=false){
 if(!g.actions.includes('messages.read')||!scope.channelId||!scope.audienceStaffIds.includes(message.authorId))deny()
 const settings=await readTeam<any>(db,g.storeId,'ai.agent.settings')
 if(settings?.photoRecognitionEnabled===false)return []
 const {channel,fromSeq}=await readAuthorizedBridgeChannel(db,g,scope.task,scope.channelId!)
 const stored=await readTeam<any>(db,g.storeId,`message.${scope.channelId}.${String(message.seq).padStart(12,'0')}`)
 if(!stored||stored.id!==message.id||stored.authorId!==message.authorId||message.seq<fromSeq||stored.agent||channel.members.some(m=>m.fromSeq>message.seq))deny()
 const photos:(EmployeePhoto&{dataUrl?:string})[]=[]
 for(const id of (stored.files||[]).slice(0,5)){
  z.string().uuid().parse(id)
  const grant=await readTeam<any>(db,g.storeId,`fileGrant.${scope.channelId}.${id}.${String(message.seq).padStart(12,'0')}`)
  const file=await readWork<any>(g.storeId,'file.'+id,db)
  if(!grant||grant.seq!==message.seq||!file||file.staffId!==stored.authorId||file.purpose!=='team')deny()
  if(!['image/jpeg','image/png'].includes(file.type))continue
  const filename=path.join(await fs.realpath(root()),id),stat=await fs.lstat(filename)
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>10*1024*1024||await fs.realpath(filename)!==filename)deny()
  const bytes=await fs.readFile(filename),sha256=createHash('sha256').update(bytes).digest('hex')
  if(file.sha256&&file.sha256!==sha256)deny()
  const photo:EmployeePhoto&{dataUrl?:string}={fileId:id,messageId:stored.id,seq:stored.seq,sha256,type:file.type}
  if(includePixels){
   let jpeg=Buffer.alloc(0)
   for(const [width,quality] of [[1440,78],[1280,65],[1024,50],[800,40]]){
    jpeg=await sharp(bytes,{limitInputPixels:40_000_000,failOn:'error'}).rotate().resize({width,withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality}).toBuffer()
    if(jpeg.length<=80*1024)break
   }
   if(jpeg.length>80*1024)throw new TeamError(400,'EMPLOYEE_PHOTO_TOO_COMPLEX')
   photo.dataUrl='data:image/jpeg;base64,'+jpeg.toString('base64')
  }
  photos.push(photo)
 }
 return photos
}

/** Associate only a photograph actually included in this execution's authorized facts. */
export async function employeeStockPhotoEvidence(db:any,g:BridgeGrant,scope:CommunicationScope,facts:any[],requestedId?:string):Promise<StockOperation['sourceEvidence']|{needsPhotoSelection:true;photoMessageIds:string[]}>{
 const direct=facts.filter(f=>f.source?.kind==='conversation'&&f.value?.role==='user').map(f=>f.value)
 const prior=facts.filter(f=>f.source?.kind==='employee_exchange').flatMap(f=>f.value?.employeeFacts||[])
 const current=direct.sort((a,b)=>b.seq-a.seq).slice(0,1).filter(m=>m.photos?.length)
 if(requestedId==='none'){if(!current.length)return undefined;return {needsPhotoSelection:true as const,photoMessageIds:current.map(m=>m.messageId)}}
 if(!requestedId&&!current.length&&prior.some(m=>m.photos?.length))return {needsPhotoSelection:true as const,photoMessageIds:[...new Set(prior.filter(m=>m.photos?.length).map(m=>m.messageId))].slice(-5)}
 const candidates=requestedId?[...direct,...prior].filter(m=>m.messageId===requestedId&&m.photos?.length):current
 if(requestedId&&!candidates.length)deny()
 const selected=candidates[0];if(!selected)return undefined
 const message=await readTeam<any>(db,g.storeId,`message.${scope.channelId}.${String(selected.seq).padStart(12,'0')}`)
 const photos=await employeeMessagePhotos(db,g,scope,message)
 if(!photos.length)deny()
 return {kind:'hermes-photo' as const,channelId:scope.channelId!,messageId:message.id,seq:message.seq,submittedBy:message.authorId,submittedName:message.authorName,agentId:g.agentId,photos:photos.map(p=>({fileId:p.fileId,sha256:p.sha256}))}
}
/** Inventory viewers read only photos attached to a committed, same-store stock-out receipt. */
export async function stockOutPhoto(db:any,storeId:string,logId:string,fileId:string){
 z.string().uuid().parse(fileId)
 const log=await db.stockOutLog.findFirst({where:{id:logId,inventory:{storeId}},select:{note:true}})
 let evidence:any;try{evidence=JSON.parse(log?.note||'null')?.sourceEvidence}catch{}
 const photo=evidence?.kind==='hermes-photo'&&evidence.photos?.find((p:any)=>p.fileId===fileId)
 if(!photo)deny()
 const file=await readWork<any>(storeId,'file.'+fileId,db)
 if(!file||file.staffId!==evidence.submittedBy||file.purpose!=='team'||!['image/jpeg','image/png'].includes(file.type))deny()
 const filename=path.join(await fs.realpath(root()),fileId),stat=await fs.lstat(filename)
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>10*1024*1024||await fs.realpath(filename)!==filename)deny()
 const bytes=await fs.readFile(filename)
 if(createHash('sha256').update(bytes).digest('hex')!==photo.sha256)deny()
 return {bytes,type:file.type}
}
