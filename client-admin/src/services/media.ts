import api from './api'
export type MediaAsset = {id:string;name:string;kind:'image'|'video'|'audio';mimeType:string;size:number;url:string;createdAt:string}
export type MediaScene='library'|'product'|'display'|'tv'
export function mediaUploadError(error:any): string {
  const code=error?.response?.data?.message||error?.message
  if(error?.code==='ECONNABORTED'||error?.code==='ETIMEDOUT')return 'media.uploadTimeout'
  if(code==='MEDIA_TOO_LARGE'||code==='LIMIT_FILE_SIZE'||error?.response?.status===413)return 'media.tooLarge'
  if(code==='INVALID_PRODUCT_IMAGES')return 'media.maxImages'
  return 'media.failed'
}
export const mediaApi={
  list:(scene:MediaScene,params:Record<string,unknown>={})=>api.get('/media',{params:{scene,...params}}),
  upload:async(scene:MediaScene,files:File[])=>{
    if(scene==='product'&&files.length>5)throw Error('INVALID_PRODUCT_IMAGES')
    for(const file of files){const image=scene==='product'||/\.(jpe?g|png|gif|webp)$/i.test(file.name);if(file.size>(image?5:50)*1024*1024)throw Error('MEDIA_TOO_LARGE')}
    const body=new FormData();files.forEach(f=>body.append('files',f))
    return api.post('/media',body,{params:{scene},timeout:scene==='product'?30000:120000,headers:{'Content-Type':'multipart/form-data'}})
  },
  rename:(id:string,name:string)=>api.patch(`/media/${id}`,{name}),
  references:(id:string)=>api.get(`/media/${id}/references`),
  remove:(id:string)=>api.delete(`/media/${id}`)
}
