import { Router, Response, NextFunction } from 'express'
import fs from 'fs'
import path from 'path'
// @ts-ignore
import multer from 'multer'
import { randomUUID } from 'crypto'
import prisma from '../config/database'
import { authenticate, AuthRequest } from '../middlewares/auth'
import { adoptLegacyMedia, mediaReferences, saveMediaFiles } from '../services/MediaService'
import { mediaPath } from '../utils/mediaFiles'

const router=Router()
export function mediaAccess(req:AuthRequest,res:Response,next:NextFunction) {
  const scene=String(req.query.scene||'library')
  if(!['library','product','display','tv'].includes(scene))return res.status(400).json({code:400,message:'INVALID_MEDIA_SCENE'})
  const write=!['GET','HEAD'].includes(req.method)
  const management=req.method==='PATCH'||req.method==='DELETE'||req.path.endsWith('/references')
  const required=management||scene==='library'?'marketing.'+(write?'write':'read'):scene==='product'?'products.'+(write?'write':'read'):scene==='tv'?'marketing.'+(write?'write':'read'):'orders.create'
  const user=req.user!
  const allowed=user.role==='admin'||(user.accessRole?required!==null&&user.accessRole.permissions.includes(required):user.role==='manager'||(!management&&scene==='display'&&user.role==='cashier')||(!management&&!write&&scene==='product'&&['cashier','staff'].includes(user.role)))
  if(!allowed)return res.status(403).json({code:403,message:'MEDIA_PERMISSION_DENIED'})
  next()
}
const pending=mediaPath('.media-pending')
const upload=multer({storage:multer.diskStorage({destination:(_req:any,_file:any,cb:any)=>{fs.mkdirSync(pending,{recursive:true});cb(null,pending)},filename:(_req:any,_file:any,cb:any)=>cb(null,randomUUID())}),limits:{fileSize:50*1024*1024,files:10}}).array('files',10)
router.use(authenticate,mediaAccess)
router.get('/',async(req:AuthRequest,res)=>{
  try {
    await adoptLegacyMedia(req.user!.storeId)
    const page=Math.max(1,Math.min(100000,Math.floor(Number(req.query.page))||1)),pageSize=Math.max(1,Math.min(50,Math.floor(Number(req.query.pageSize))||24))
    const scene=String(req.query.scene||'library'),kind=String(req.query.kind||'')
    const kinds=scene==='product'?['image']:scene==='library'?['image','video','audio']:['image','video']
    const where={storeId:req.user!.storeId,kind:{in:kind?kinds.filter(k=>k===kind):kinds},...(req.query.search?{name:{contains:String(req.query.search).slice(0,200)}}:{})}
    const [list,total]=await Promise.all([prisma.mediaAsset.findMany({where,orderBy:[{createdAt:'desc'},{id:'asc'}],skip:(page-1)*pageSize,take:pageSize}),prisma.mediaAsset.count({where})])
    res.json({code:200,data:{list,total,page,pageSize}})
  }catch{res.status(500).json({code:500,message:'MEDIA_LOAD_FAILED'})}
})
router.post('/',(req:AuthRequest,res,next)=>upload(req,res,async(error:any)=>{
  if(error){await Promise.all(((req.files||[]) as any[]).map(f=>fs.promises.unlink(f.path).catch(()=>{})));return res.status(400).json({code:400,message:error.code||'MEDIA_UPLOAD_FAILED'})}
  next()
}),async(req:AuthRequest,res)=>{
  try {
    const files=req.files as any[];if(!files?.length)return res.status(400).json({code:400,message:'NO_FILES'})
    const scene=String(req.query.scene||'library')
    const list=await saveMediaFiles(req.user!.storeId,req.user!.id,files,scene==='product'?['image']:scene==='library'?['image','video','audio']:['image','video'])
    res.json({code:200,data:{list}})
  }catch(error:any){res.status(400).json({code:400,message:error.message||'MEDIA_UPLOAD_FAILED'})}
})
router.patch('/:id',async(req:AuthRequest,res)=>{
  const name=typeof req.body.name==='string'?req.body.name.trim():''
  if(!name||name.length>200)return res.status(400).json({code:400,message:'INVALID_MEDIA_NAME'})
  try {
    const result=await prisma.mediaAsset.updateMany({where:{id:req.params.id,storeId:req.user!.storeId},data:{name}})
    res.status(result.count?200:404).json({code:result.count?200:404})
  }catch{res.status(500).json({code:500,message:'MEDIA_RENAME_FAILED'})}
})
router.get('/:id/references',async(req:AuthRequest,res)=>{
  try {
    const asset=await prisma.mediaAsset.findFirst({where:{id:req.params.id,storeId:req.user!.storeId}})
    if(!asset)return res.status(404).json({code:404,message:'MEDIA_NOT_FOUND'})
    res.json({code:200,data:{list:await mediaReferences(prisma,asset)}})
  }catch{res.status(500).json({code:500,message:'MEDIA_LOAD_FAILED'})}
})
router.delete('/:id',async(req:AuthRequest,res)=>{
  try {
    const outcome=await prisma.$transaction(async tx=>{
      const asset=await tx.mediaAsset.findFirst({where:{id:req.params.id,storeId:req.user!.storeId}})
      if(!asset)return {status:404}
      const references=await mediaReferences(tx,asset)
      if(references.length)return {status:409,references}
      await tx.mediaAsset.delete({where:{id:asset.id}})
      return {status:200,asset}
    })
    if(outcome.asset)await fs.promises.unlink(mediaPath(outcome.asset.storagePath)).catch(error=>{if(error.code!=='ENOENT')console.error('Media file cleanup failed',error.code)})
    res.status(outcome.status).json({code:outcome.status,message:outcome.status===409?'MEDIA_IN_USE':undefined,data:{list:outcome.references||[]}})
  }catch(error:any){
    if(error.code==='P2003'){
      const asset=await prisma.mediaAsset.findFirst({where:{id:req.params.id,storeId:req.user!.storeId}})
      return res.status(409).json({code:409,message:'MEDIA_IN_USE',data:{list:asset?await mediaReferences(prisma,asset):[]}})
    }
    res.status(500).json({code:500,message:'MEDIA_DELETE_FAILED'})
  }
})
export {router as mediaRouter}
