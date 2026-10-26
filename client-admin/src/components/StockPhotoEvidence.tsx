import {useEffect,useRef,useState} from 'react'
import api from '../services/api'
import {useAuthStore} from '../stores/auth'
import {AdminDialog} from './AdminDialog'

const copy={zh:{view:'查看出库照片',title:'Hermes 照片出库证据',from:'提交员工',loading:'正在加载照片…',error:'照片加载失败，请重试。',retry:'重试'},en:{view:'View stock-out photos',title:'Hermes photo evidence',from:'Submitted by',loading:'Loading photos…',error:'Could not load photos. Try again.',retry:'Retry'},id:{view:'Lihat foto stok keluar',title:'Bukti foto Hermes',from:'Dikirim oleh',loading:'Memuat foto…',error:'Foto gagal dimuat. Coba lagi.',retry:'Coba lagi'}}
export function StockPhotoEvidence({logId,evidence,language}:{logId:string;evidence:{submittedName?:string;photos:{fileId:string}[]};language:string}){
 const c=copy[language.startsWith('zh')?'zh':language.startsWith('en')?'en':'id']
 const identity=useAuthStore(s=>(s.user?.id||'')+':'+(s.user?.storeId||''))
 const [loadedIdentity,setLoadedIdentity]=useState('')
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(false),[images,setImages]=useState<string[]>([])
 const generation=useRef(0),urls=useRef<string[]>([]),controller=useRef<AbortController>()
 const clear=()=>{generation.current++;controller.current?.abort();urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current=[]}
 useEffect(()=>{setOpen(false);setImages([]);return clear},[logId,identity])
 function close(){clear();setOpen(false);setImages([]);setLoading(false)}
 async function load(){clear();const request=generation.current,abort=new AbortController();controller.current=abort;setLoadedIdentity(identity);setOpen(true);setLoading(true);setError(false);setImages([])
  try{const data=await Promise.all(evidence.photos.slice(0,5).map(p=>api.get(`/inventory/logs/stock-out/${encodeURIComponent(logId)}/photos/${encodeURIComponent(p.fileId)}`,{responseType:'blob',signal:abort.signal})));if(request!==generation.current)return;urls.current=data.map(r=>URL.createObjectURL(r.data));setImages(urls.current)}
  catch{if(request===generation.current)setError(true)}finally{if(request===generation.current)setLoading(false)}
 }
 return <><button type="button" className="mt-2 block min-h-[44px] rounded-lg border px-3 py-2 text-xs text-primary" onClick={()=>void load()}>{c.view} · {evidence.photos.length}</button>{open&&loadedIdentity===identity&&<AdminDialog title={c.title} onClose={close} className="max-w-3xl"><div className="space-y-4 p-4"><p className="text-sm text-gray-600">{c.from}: {evidence.submittedName||'—'}</p>{loading&&<p role="status">{c.loading}</p>}{error&&<div role="alert"><p>{c.error}</p><button type="button" className="btn btn-outline mt-2" onClick={()=>void load()}>{c.retry}</button></div>}<div className="grid gap-4 sm:grid-cols-2">{images.map((url,index)=><a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`${c.title} ${index+1}`} className="max-h-[65vh] w-full rounded-lg border object-contain"/></a>)}</div></div></AdminDialog>}</>
}
