import fs from 'fs'
import { optimizeUploadedImage } from '../utils/imageOptimization'
import { randomUUID } from 'crypto'
import prisma from '../config/database'
import { inspectFile, localUploadPath, mediaPath, uploadRoot } from '../utils/mediaFiles'

export async function saveMediaFiles(storeId: string, uploadedBy: string, files: any[], allowed = ['image','video','audio']) {
  const created: string[] = []
  try {
    const checked = []
    for (const file of files) {
      const type = await inspectFile(file.path)
      if (!type || !allowed.includes(type.kind)) throw Error('INVALID_MEDIA_TYPE')
      if (file.size > (type.kind==='image'?5:50)*1024*1024) throw Error('MEDIA_TOO_LARGE')
      const optimized = await optimizeUploadedImage(file.path,type)
      checked.push({file,type:optimized.type,size:optimized.size})
    }
    await fs.promises.mkdir(mediaPath('media'),{recursive:true})
    return await prisma.$transaction(async tx => {
      const result=[]
      for (const {file,type,size} of checked) {
        const storagePath=`media/${randomUUID()}${type.ext}`
        await fs.promises.rename(file.path,mediaPath(storagePath)); created.push(storagePath)
        result.push(await tx.mediaAsset.create({data:{storeId,uploadedBy,name:file.originalname.slice(0,200),kind:type.kind,mimeType:type.mimeType, size,storagePath,url:`/uploads/${storagePath}`} as any}))
      }
      return result
    })
  } catch(error) {
    await Promise.all(created.map(p=>fs.promises.unlink(mediaPath(p)).catch(()=>{})))
    throw error
  } finally { await Promise.all(files.map(f=>fs.promises.unlink(f.path).catch(()=>{}))) }
}

// Only explicitly referenced local files with a unique store owner are adopted.
export async function adoptLegacyMedia(storeId: string) {
  const products=await prisma.product.findMany({where:{storeId,image:{not:null}},select:{id:true,image:true}})
  const configs=await prisma.config.findMany({where:{storeId,key:{in:['hardwareSettings','tv_screen_marketing_config']}},select:{key:true,value:true}})
  const candidates=new Map<string,string>()
  products.forEach(p=>{if(p.image)candidates.set(p.image,p.id)})
  function collect(value:any) { if(!value||typeof value!=='object')return; if(typeof value.url==='string')candidates.set(value.url,''); if(typeof value.imageUrl==='string')candidates.set(value.imageUrl,''); Object.values(value).forEach(v=>{if(typeof v==='object')collect(v)}) }
  configs.forEach(c=>{try{collect(JSON.parse(c.value))}catch{}})
  for(const [url,productId] of candidates) {
    const storagePath=localUploadPath(url); if(!storagePath)continue
    let asset=await prisma.mediaAsset.findUnique({where:{storagePath}})
    if(asset && asset.storeId!==storeId)continue
    if(!asset) {
      // A legacy URL reused across stores cannot safely be assigned to one store.
      const owners=await prisma.product.findMany({where:{image:url},select:{storeId:true}})
      const configOwners=await prisma.config.findMany({where:{key:{in:['hardwareSettings','tv_screen_marketing_config']},value:{contains:url}},select:{storeId:true}})
      if([...owners,...configOwners].some(o=>o.storeId!==storeId))continue
      try {
        const type=await inspectFile(mediaPath(storagePath)); if(!type)continue
        const stat=await fs.promises.stat(mediaPath(storagePath))
        asset=await prisma.mediaAsset.upsert({where:{storagePath},update:{},create:{storeId,name:storagePath.split('/').pop()!,kind:type.kind,mimeType:type.mimeType,size:stat.size,storagePath,url,uploadedBy:'legacy'}})
      }catch{continue}
    }
    if(asset.storeId!==storeId)continue
    const matching=products.filter(p=>p.image===url)
    for(const p of matching) {
      if(!await prisma.productImage.count({where:{productId:p.id}})) {
        await prisma.productImage.upsert({where:{productId_mediaId:{productId:p.id,mediaId:asset.id}},update:{},create:{productId:p.id,mediaId:asset.id,position:0}})
      }
    }
    for(const c of configs.filter(c=>c.value.includes(url))) {
      await prisma.mediaReference.upsert({where:{storeId_configKey_mediaId:{storeId,configKey:c.key,mediaId:asset.id}},update:{},create:{storeId,configKey:c.key,mediaId:asset.id}})
    }
  }
}
export async function mediaReferences(db: any, asset: {id:string;url:string;storeId:string}) {
  const products=await db.product.findMany({where:{storeId:asset.storeId,OR:[{image:asset.url},{images:{some:{mediaId:asset.id}}}]},select:{id:true,name:true,deletedAt:true}})
  const configs=await db.config.findMany({where:{storeId:asset.storeId,OR:[{value:{contains:asset.id}},{value:{contains:asset.url}}]},select:{key:true}})
  const tvRefs=await db.mediaReference.findMany({where:{storeId:asset.storeId,mediaId:asset.id,configKey:{startsWith:'tv.'}}})
  return [...tvRefs.map((r:any)=>({kind:'tv',id:r.configKey,name:r.configKey})),...products.map((p:any)=>({kind:'product',id:p.id,name:p.name,isDeleted:!!p.deletedAt})),...configs.map((c:any)=>({kind:'config',id:c.key,name:c.key}))]
}
export async function unlinkMediaReference(db: any, asset: {id:string;url:string;storeId:string}, ref: {kind:string;id:string}) {
  if (ref.kind === 'product') {
    await db.productImage.deleteMany({ where: { productId: ref.id, mediaId: asset.id } })
    const remaining = await db.productImage.findMany({
      where: { productId: ref.id },
      include: { media: true },
      orderBy: { position: 'asc' }
    })
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].position !== i) {
        await db.productImage.update({ where: { id: remaining[i].id }, data: { position: i } })
      }
    }
    const product = await db.product.findFirst({ where: { id: ref.id, storeId: asset.storeId } })
    if (product && (product.image === asset.url || !remaining.length)) {
      await db.product.update({
        where: { id: ref.id },
        data: { image: remaining.length ? remaining[0].media.url : null }
      })
    }
  } else if (ref.kind === 'tv') {
    await db.mediaReference.deleteMany({ where: { storeId: asset.storeId, mediaId: asset.id, configKey: ref.id } })
  } else if (ref.kind === 'config') {
    await db.mediaReference.deleteMany({ where: { storeId: asset.storeId, mediaId: asset.id, configKey: ref.id } })
    const cfg = await db.config.findUnique({ where: { storeId_key: { storeId: asset.storeId, key: ref.id } } })
    if (cfg && cfg.value) {
      try {
        const val = JSON.parse(cfg.value)
        if (val && typeof val === 'object') {
          const cleanObj = (obj: any) => {
            if (!obj || typeof obj !== 'object') return
            if (Array.isArray(obj)) {
              for (let i = obj.length - 1; i >= 0; i--) {
                const item = obj[i]
                if (item && typeof item === 'object') {
                  if (item.mediaId === asset.id || item.imageMediaId === asset.id || item.url === asset.url || item.imageUrl === asset.url) {
                    obj.splice(i, 1)
                    continue
                  }
                }
                cleanObj(item)
              }
            } else {
              for (const k of Object.keys(obj)) {
                if (obj[k] === asset.id || obj[k] === asset.url) {
                  delete obj[k]
                } else if (typeof obj[k] === 'object') {
                  cleanObj(obj[k])
                }
              }
            }
          }
          cleanObj(val)
          await db.config.update({
            where: { storeId_key: { storeId: asset.storeId, key: ref.id } },
            data: { value: JSON.stringify(val) }
          })
        }
      } catch {}
    }
  }
}
export async function forceUnlinkAllMediaReferences(db: any, asset: {id:string;url:string;storeId:string}) {
  const refs = await mediaReferences(db, asset)
  for (const ref of refs) {
    await unlinkMediaReference(db, asset, ref)
  }
  await db.productImage.deleteMany({ where: { mediaId: asset.id } })
  await db.product.updateMany({
    where: { storeId: asset.storeId, image: asset.url },
    data: { image: null }
  })
  await db.mediaReference.deleteMany({ where: { storeId: asset.storeId, mediaId: asset.id } })
}
export async function setProductImages(tx:any,productId:string,storeId:string,ids:string[]) {
  if(ids.length>5 || new Set(ids).size!==ids.length)throw Error('INVALID_PRODUCT_IMAGES')
  const assets=await tx.mediaAsset.findMany({where:{id:{in:ids},storeId,kind:'image'}})
  if(assets.length!==ids.length)throw Error('MEDIA_STORE_OR_TYPE_MISMATCH')
  await tx.productImage.deleteMany({where:{productId}})
  for(let position=0;position<ids.length;position++)await tx.productImage.create({data:{productId,mediaId:ids[position],position}})
  await tx.product.update({where:{id:productId},data:{image:ids.length?assets.find((a:any)=>a.id===ids[0]).url:null}})
}
export async function saveMediaConfig(db:any,storeId:string,key:string,value:any,category:string) {
  if(!['hardwareSettings','tv_screen_marketing_config'].includes(key))return db.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,value:typeof value==='string'?value:JSON.stringify(value),category},update:{value:typeof value==='string'?value:JSON.stringify(value),category}})
  const parsed=typeof value==='string'?JSON.parse(value):value
  const ids=new Set<string>()
  const urls=new Set<string>()
  const musicTracks=key==='tv_screen_marketing_config'&&Array.isArray(parsed?.idleMusic?.tracks)?parsed.idleMusic.tracks:[]
  const audioIds=new Set(musicTracks.map((t:any)=>t.mediaId).filter(Boolean))
  const audioPaths=new Set(musicTracks.map((t:any)=>localUploadPath(t.url||'')).filter(Boolean))
  function collect(v:any) {
    if(!v||typeof v!=='object')return
    if(v.mediaId)ids.add(v.mediaId)
    if(v.imageMediaId)ids.add(v.imageMediaId)
    Object.values(v).forEach(x=>{if(typeof x==='string'&&localUploadPath(x))urls.add(x)})
    Object.values(v).forEach(x=>{if(typeof x==='object')collect(x)})
  }
  collect(parsed)
  const assets=await db.mediaAsset.findMany({where:{storeId,id:{in:[...ids]}}})
  if(assets.length!==ids.size||assets.some((a:any)=>a.kind==='audio'&&!audioIds.has(a.id)))throw Error('MEDIA_STORE_OR_TYPE_MISMATCH')
  function canonical(v:any) {
    if(!v||typeof v!=='object')return
    for(const [idKey,urlKey] of [['mediaId','url'],['imageMediaId','imageUrl']])if(v[idKey]) {
      const asset=assets.find((a:any)=>a.id===v[idKey]); if(asset.kind==='audio'&&!musicTracks.includes(v))throw Error('INVALID_MEDIA_TYPE'); if(urlKey==='imageUrl' && asset.kind!=='image')throw Error('INVALID_MEDIA_TYPE')
      v[urlKey]=asset.url
      if(urlKey==='url'){v.kind=asset.kind;v.isVideo=asset.kind==='video';v.mimetype=asset.mimeType}
    }
    Object.values(v).forEach(x=>{if(typeof x==='object')canonical(x)})
  }
  canonical(parsed)
  for(const asset of await db.mediaAsset.findMany({where:{OR:[{url:{in:[...urls]}},{storagePath:{in:[...urls].map(u=>localUploadPath(u)).filter(Boolean)}}]}})) {
    if(asset.storeId!==storeId)throw Error('MEDIA_STORE_OR_TYPE_MISMATCH')
    if(asset.kind==='audio'&&(!audioPaths.has(asset.storagePath)||(parsed.mediaFiles||[]).some((m:any)=>localUploadPath(m.url||'')===asset.storagePath)))throw Error('INVALID_MEDIA_TYPE')
    ids.add(asset.id)
  }
  await db.mediaReference.deleteMany({where:{storeId,configKey:key}})
  for(const mediaId of ids)await db.mediaReference.create({data:{storeId,configKey:key,mediaId}})
  return db.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,value:JSON.stringify(parsed),category},update:{value:JSON.stringify(parsed),category}})
}

export async function legacyProductImage(tx:any,storeId:string,url:string,existingUrl?:string|null):Promise<string[]|undefined> {
  if(!url)return []
  const local=localUploadPath(url)
  if(!local){if(!/^https?:\/\//i.test(url))throw Error('INVALID_MEDIA_URL');return undefined}
  const asset=await tx.mediaAsset.findUnique({where:{storagePath:local}})
  if(asset){if(asset.storeId!==storeId||asset.kind!=='image')throw Error('MEDIA_STORE_OR_TYPE_MISMATCH');return [asset.id]}
  if(url!==existingUrl)throw Error('UNREGISTERED_MEDIA')
  return undefined
}
