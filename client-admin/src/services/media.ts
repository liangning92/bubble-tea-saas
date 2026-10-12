import api from './api'
export type MediaAsset = {id:string;name:string;kind:'image'|'video'|'audio';mimeType:string;size:number;url:string;createdAt:string}
export type MediaScene='library'|'product'|'display'|'tv'
export const mediaApi={
  list:(scene:MediaScene,params:Record<string,unknown>={})=>api.get('/media',{params:{scene,...params}}),
  upload:(scene:MediaScene,files:File[])=>{const body=new FormData();files.forEach(f=>body.append('files',f));return api.post('/media',body,{params:{scene},headers:{'Content-Type':'multipart/form-data'}})},
  rename:(id:string,name:string)=>api.patch(`/media/${id}`,{name}),
  references:(id:string)=>api.get(`/media/${id}/references`),
  remove:(id:string)=>api.delete(`/media/${id}`)
}
