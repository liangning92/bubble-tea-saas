import { confirmAdmin } from './AdminFeedback'
import { AdminDialog } from './AdminDialog'
import { TrainingDocument } from './TrainingDocument'
import { TrainingVideo } from './TrainingVideo'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { ArrowLeft, Plus, Save, Send, Trash2, History, Loader2 } from 'lucide-react'
import { trainingCopy } from '../../../shared/utils/trainingCopy'
import { tr } from '../../../shared/hooks/useTrainingCatalogue'

type Path = (string | number)[]
const blankText = () => ({ zh: '新内容', id: 'Materi baru', en: 'New content' })
const lessonTemplate = () => ({ key: 'item-' + crypto.randomUUID(), title: blankText(), points: [blankText()] })
const optionalFields = ['tip', 'warning', 'errors', 'practice', 'checklist']
export function TrainingLibraryEditor({ token, onClose, initialSelection }: { token: string | null; onClose: () => void; initialSelection?: string }) {
  const { t, i18n } = useTranslation(), w = trainingCopy(i18n.language)
  const [document,setDocument] = useState<any>(null), [generation,setGeneration] = useState<string | null>(null), [published,setPublished] = useState<string | null>(null)
  const [dirty,setDirty] = useState(false), [busy,setBusy] = useState(false), [loading,setLoading] = useState(true), [message,setMessage] = useState(''), [note,setNote] = useState('')
  const [selected,setSelected] = useState(''), [language,setLanguage] = useState(i18n.language.startsWith('zh')?'zh':i18n.language.startsWith('en')?'en':'id')
  const [history,setHistory] = useState<any[]>([]), [historyError,setHistoryError] = useState(false), [cursor,setCursor] = useState<string | null>(null), [showHistory,setShowHistory] = useState(false), [preview,setPreview] = useState<any>(null)
  const blocker = useBlocker(dirty)
  const loadSequence = useRef(0)
  const retry = useRef<{signature: string;id: string} | null>(null)
  const label = (key: string) => (w as Record<string,string>)[key] || key
  const humanError = (status: number, code: string) => status===409 ? (code==='TRAINING_REQUEST_CONFLICT'?w.requestConflict:w.conflict) : status===403 ? w.forbidden : code.includes('REFERENCE') ? w.mediaInvalid : status===413 ? w.tooLarge : status===400 ? w.invalid : w.failed
  async function api(path: string, method='GET', body?: unknown) {
    const response=await fetch('/api/training/library'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
    const result=await response.json();if(!response.ok)throw Error(humanError(response.status,result.message || ''));return result.data
  }
  async function load(initial=false) {
    const sequence=++loadSequence.current
    const data=await api('/edit');if(sequence!==loadSequence.current)return;let value=data.catalogue
    if(initial && (initialSelection==='new-course' || initialSelection==='new-checklist')) {
      value=structuredClone(value)
      if(initialSelection==='new-course' && value.modules.length<100){const item=courseTemplate();value.modules.push(item);setSelected(item.key)}
      else if(initialSelection==='new-checklist' && value.checklists.length<100){const item=listTemplate();value.checklists.push(item);setSelected('checklist:'+item.key)}
      setDirty(true)
    } else {
      setDirty(false)
      if(initial)setSelected(initialSelection || value.modules[0]?.key || (value.checklists[0]?'checklist:'+value.checklists[0].key:''))
    }
    setDocument(value);setGeneration(data.generation);setPublished(data.publishedRevision);retry.current=null
  }
  async function historyPage(next?: string) {
    setHistoryError(false)
    try {const data=await api('/history?limit=20'+(next?'&cursor='+encodeURIComponent(next):''));setHistory(old=>next?[...old,...data.list]:data.list);setCursor(data.nextCursor)}catch{setHistoryError(true)}
  }
  useEffect(()=>{let alive=true;setLoading(true);load(true).catch(e=>{if(alive)setMessage(e.message)}).finally(()=>{if(alive)setLoading(false)});void historyPage();return()=>{alive=false;loadSequence.current++}},[token])
  useEffect(()=>{const guard=(event: BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[dirty])
  function change(path: Path,value: any){setDocument((old:any)=>{const next=structuredClone(old);let node=next;for(const key of path.slice(0,-1))node=node[key];if(value===undefined)delete node[path[path.length-1]];else node[path[path.length-1]]=value;return next});setDirty(true);setMessage('')}
  function courseTemplate(){return {key:'course-'+crypto.randomUUID(),reviewed:false,title:blankText(),subtitle:blankText(),minutes:10,sections:[lessonTemplate()],quiz:[],practical:[],sources:[]}}
  function listTemplate(){return {key:'standard-'+crypto.randomUUID(),title:blankText(),items:[blankText()]}}
  async function upload(path: Path,file: File|undefined,kind:'documents'|'videos'){
    if(!file||busy)return
    const pdf=kind==='documents'
    if(file.size>20*1024*1024 || (pdf?!file.name.toLowerCase().endsWith('.pdf'):!file.name.toLowerCase().endsWith('.mp4'))){setMessage(pdf?w.pdfLimit:t('trainingMedia.failed'));return}
    setBusy(true);setMessage('')
    try {const body=new FormData();body.append(pdf?'document':'video',file);const response=await fetch('/api/training/library/'+kind,{method:'POST',headers:{Authorization:'Bearer '+token},body});const result=await response.json();if(!response.ok)throw Error(w.uploadFailed);change([...path,pdf?'documentId':'videoId'],result.data.id);setMessage(w.uploaded)}catch{setMessage(w.uploadFailed)}finally{setBusy(false)}
  }
  async function write(kind:'save'|'publish'|'restore',id?:string){
    if(busy || !document)return
    if(kind!=='save'&&dirty)return
    if(kind==='publish'&&!await confirmAdmin(w.publishConfirm))return
    if(kind==='restore'&&!await confirmAdmin(w.restoreConfirm))return
    setBusy(true);setMessage('')
    const payload={expectedGeneration:generation,note,...(kind==='save'?{catalogue:document}:{})}
    const signature=JSON.stringify({kind,id,payload});if(retry.current?.signature!==signature)retry.current={signature,id:crypto.randomUUID()}
    try {
      const result=await api(kind==='save'?'/draft':kind==='publish'?'/publish':'/restore/'+id,kind==='save'?'PUT':'POST',{...payload,requestId:retry.current.id})
      if(kind==='restore')await load();else {setGeneration(result.generation);setDirty(false);if(kind==='publish')setPublished(result.generation)}
      retry.current=null;setNote('');setMessage(kind==='save'?w.saved:kind==='publish'?w.published:w.restored);await historyPage()
    }catch(e:any){setMessage(e.message || w.failed)}finally{setBusy(false)}
  }
  function arrayChange(value:any[],path:Path,action:'add'|'delete'|'up'|'down',index=0){
    const next=structuredClone(document);let parent=next;for(const part of path.slice(0,-1))parent=parent[part]
    const key=path[path.length-1],items=structuredClone(value)
    if(action==='add'){
      const templates:Record<string,any>={sources:{title:label('sources'),url:''},quiz:{key:'item-'+crypto.randomUUID(),q:blankText(),options:[blankText(),blankText()],answer:0,explanation:blankText()},sections:lessonTemplate(),rows:{key:next.modules[0]?.key||'',station:blankText(),scenario:blankText(),action:blankText(),evidence:blankText(),result:blankText(),critical:blankText()},modules:courseTemplate(),checklists:listTemplate()}
      items.push(templates[String(key)] || blankText())
    }else if(action==='delete')items.splice(index,1)
    else {const other=action==='up'?index-1:index+1;[items[index],items[other]]=[items[other],items[index]]}
    if(key==='options'){
      if(action==='delete')parent.answer=parent.answer===index?0:parent.answer>index?parent.answer-1:parent.answer
      else if(action==='up'||action==='down'){const other=action==='up'?index-1:index+1;if(parent.answer===index)parent.answer=other;else if(parent.answer===other)parent.answer=index}
    }
    parent[key]=items;setDocument(next);setDirty(true);setMessage('')
  }
  function fields(value:any,path:Path):React.ReactNode{
    const key=String(path[path.length-1])
    if(value&&typeof value==='object'&&typeof value.zh==='string'&&typeof value.id==='string')return <textarea aria-label={path.join('.')+'.'+language} className='input w-full resize-y' rows={key==='title'?2:3} maxLength={20000} value={value[language]||''} onChange={e=>change([...path,language],e.target.value)}/>
    if(Array.isArray(value)){
      const minimum=key==='options'?2:key==='sections'?1:0,maximum=key==='options'?20:key==='sections'?100:200
      return <div className='space-y-3'>{value.map((item,index)=><div key={item.key || index} className='rounded-xl border bg-white p-3 space-y-2'><div className='flex items-center justify-between gap-2'><span className='text-xs font-medium text-gray-500'>{label(key)} {index+1}</span><div className='flex gap-1'><button type='button' className='px-2 py-1 text-xs rounded hover:bg-gray-100 disabled:opacity-30' aria-label={`${label(key)} ${index+1} ${w.up}`} disabled={index===0} onClick={()=>arrayChange(value,path,'up',index)}>↑</button><button type='button' className='px-2 py-1 text-xs rounded hover:bg-gray-100 disabled:opacity-30' aria-label={`${label(key)} ${index+1} ${w.down}`} disabled={index===value.length-1} onClick={()=>arrayChange(value,path,'down',index)}>↓</button><button type='button' aria-label={`${label(key)} ${index+1} ${w.delete}`} className='px-2 py-1 text-xs text-red-600 rounded hover:bg-red-50 disabled:opacity-30' disabled={value.length<=minimum} onClick={async ()=>{if(await confirmAdmin(w.deleteConfirm))arrayChange(value,path,'delete',index)}}>{w.delete}</button></div></div>{fields(item,[...path,index])}</div>)}<button type='button' className='btn-secondary text-sm flex items-center gap-1' disabled={value.length>=maximum || (key==='rows'&&!document.modules.length)} onClick={()=>arrayChange(value,path,'add')}><Plus size={14}/>{w.addItem} {label(key)}</button></div>
    }
    if(value&&typeof value==='object'){
      const isLesson=path.length===4&&path[0]==='modules'&&path[2]==='sections'
      const keys=Object.keys(value).filter(key=>key!=='reviewed'&&key!=='videoId'&&key!=='documentId'&&(key!=='key'||path[0]==='assessment'))
      return <div className='space-y-4'>{keys.map(field=><fieldset key={field} className='block min-w-0 space-y-1'><legend className='text-sm font-medium'>{label(field)}</legend>{field==='answer'?<select aria-label={path.join('.')+'.answer'} className='input w-full' value={value.answer} onChange={e=>change([...path,field],Number(e.target.value))}>{value.options.map((option:any,index:number)=><option key={index} value={index}>{index+1}. {tr(option,language)}</option>)}</select>:fields(value[field],[...path,field])}</fieldset>)}
        {isLesson&&<><div className='flex gap-2 flex-wrap'>{optionalFields.filter(field=>value[field]===undefined).map(field=><button type='button' key={field} className='text-sm text-primary border rounded-lg px-2 py-1' onClick={()=>change([...path,field],['errors','checklist'].includes(field)?[blankText()]:blankText())}>{w.addField} · {label(field)}</button>)}</div>{optionalFields.filter(field=>value[field]!==undefined).map(field=><button type='button' key={field} className='text-xs text-gray-500 mr-3' onClick={async ()=>{if(await confirmAdmin(w.deleteConfirm))change([...path,field],undefined)}}>{w.removeField} · {label(field)}</button>)}
        <div className='rounded-xl border p-3 space-y-2'><span className='text-sm font-medium'>{w.pdf}</span><input aria-label={path.join('.')+'.documentUpload'} className='w-full min-w-0 text-xs' type='file' accept='application/pdf,.pdf' disabled={busy} onChange={e=>{const input=e.currentTarget;void upload(path,input.files?.[0],'documents').finally(()=>{input.value=''})}}/>{value.documentId&&<><TrainingDocument id={value.documentId} token={token}/><button type='button' className='text-sm text-red-600' onClick={()=>change([...path,'documentId'],undefined)}>{w.removePdf}</button></>}</div>
        <div className='rounded-xl border p-3 space-y-2'><span className='text-sm font-medium'>{t('trainingMedia.title')}</span><p className='text-xs text-gray-500'>{t('trainingMedia.limits')}</p><input aria-label={path.join('.')+'.videoUpload'} className='w-full min-w-0 text-xs' type='file' accept='video/mp4,.mp4' disabled={busy} onChange={e=>{const input=e.currentTarget;void upload(path,input.files?.[0],'videos').finally(()=>{input.value=''})}}/>{value.videoId&&<><TrainingVideo id={value.videoId} token={token}/><button type='button' className='text-sm text-red-600' onClick={()=>change([...path,'videoId'],undefined)}>{t('trainingMedia.remove')}</button></>}</div></>}
      </div>
    }
    if(key==='key')return <select aria-label={path.join('.')} className='input w-full' value={value} onChange={e=>change(path,e.target.value)}>{document.modules.map((m:any)=><option key={m.key} value={m.key}>{tr(m.title,language)}</option>)}</select>
    if(typeof value==='number')return <input aria-label={path.join('.')} className='input w-full' type='number' min={1} max={1440} value={value} onChange={e=>change(path,Number(e.target.value))}/>
    if(typeof value==='string')return <input aria-label={path.join('.')} className='input w-full' type={key==='url'?'url':'text'} value={value} maxLength={key==='url'?2048:20000} onChange={e=>change(path,e.target.value)}/>
    return null
  }
  const discard=async ()=>!dirty||await confirmAdmin(w.discard)
  const courseIndex=document?.modules.findIndex((item:any)=>item.key===selected) ?? -1
  const listIndex=document?.checklists.findIndex((item:any)=>'checklist:'+item.key===selected) ?? -1
  const active=courseIndex>=0?document.modules[courseIndex]:listIndex>=0?document.checklists[listIndex]:null
  async function removeActive(){if(!active||!await confirmAdmin(courseIndex>=0?w.deleteCourseConfirm:w.deleteConfirm))return;const next=structuredClone(document);if(courseIndex>=0){next.modules.splice(courseIndex,1);if(next.assessment)next.assessment.rows=next.assessment.rows.filter((row:any)=>row.key!==active.key)}else next.checklists.splice(listIndex,1);setDocument(next);setDirty(true);setSelected('');setMessage('')}
  function add(kind:'course'|'checklist'){const next=structuredClone(document);const item=kind==='course'?courseTemplate():listTemplate();next[kind==='course'?'modules':'checklists'].push(item);setDocument(next);setSelected(kind==='course'?item.key:'checklist:'+item.key);setDirty(true);setMessage('')}
  return <main className='space-y-5 pb-8' data-testid='training-editor'>
    {blocker.state==='blocked'&&<AdminDialog title={w.pending} onClose={()=>blocker.reset()} className='max-w-sm' chrome><p>{w.discard}</p><div className='admin-dialog-footer'><button className='btn-secondary' onClick={()=>blocker.reset()} data-dialog-close="true">{w.keepEditing}</button><button className='btn-primary' onClick={()=>blocker.proceed()}>{w.discardLeave}</button></div></AdminDialog>}
    <div className='sticky top-0 z-10 bg-gray-50 py-3 border-b flex flex-wrap items-center justify-between gap-3'><div><button className='text-sm text-gray-600 flex items-center gap-1' disabled={busy} onClick={async ()=>{if(await discard())onClose()}}><ArrowLeft size={16}/>{w.back}</button><h1 className='text-xl font-bold mt-2'>{w.manage}</h1><p className='text-xs text-gray-500 mt-1'>{w.hint}</p></div><div className='flex flex-wrap gap-2'><button className='btn-secondary text-sm flex gap-1 items-center' disabled={busy||loading||!document||(!dirty&&!!generation)} onClick={()=>write('save')}>{busy?<Loader2 size={16} className='animate-spin'/>:<Save size={16}/>} {w.save}</button><button className='btn-primary text-sm flex gap-1 items-center' disabled={busy||loading||dirty||!generation||generation===published} onClick={()=>write('publish')}><Send size={16}/>{w.publish}</button></div></div>
    <div className='flex flex-wrap items-center gap-3 text-sm'><span className={`rounded-full px-3 py-1 ${dirty?'bg-amber-100 text-amber-800':generation!==published?'bg-blue-50 text-blue-700':'bg-green-50 text-green-700'}`}>{dirty?w.pending:!generation?w.initial:generation!==published?w.draft:w.publishedVersion}</span><button className='text-gray-500 underline' disabled={busy} onClick={async ()=>{if(await discard()){setLoading(true);load().catch(e=>setMessage(e.message)).finally(()=>setLoading(false))}}}>{w.reload}</button><button className='text-gray-500 flex gap-1 items-center' onClick={()=>setShowHistory(!showHistory)}><History size={15}/>{w.showHistory}</button></div>
    {message&&<p role='status' className='border rounded-xl bg-white p-3 text-sm'>{message}</p>}
    {loading?<p className='flex gap-2 items-center'><Loader2 className='animate-spin' size={18}/>{w.loading}</p>:!document?<button className='btn-secondary' onClick={()=>{setLoading(true);load(true).catch(e=>setMessage(e.message)).finally(()=>setLoading(false))}}>{w.retry}</button>:<fieldset disabled={busy} className='grid lg:grid-cols-[260px_1fr] gap-5 min-w-0'>
      <aside className='card space-y-4 self-start'><div><h2 className='font-semibold mb-2'>{w.courses} ({document.modules.length})</h2><button type='button' className='text-primary text-sm flex gap-1 items-center mb-2' disabled={document.modules.length>=100} onClick={()=>add('course')}><Plus size={15}/>{w.addCourse}</button>{document.modules.map((m:any)=><button type='button' key={m.key} className={`block w-full text-left text-sm p-2 rounded-lg ${selected===m.key?'bg-primary/10 text-primary':'hover:bg-gray-50'}`} onClick={()=>setSelected(m.key)}>{tr(m.title,language)}</button>)}</div>
      <div className='border-t pt-3'><h2 className='font-semibold mb-2'>{w.checklists} ({document.checklists.length})</h2><button type='button' className='text-primary text-sm flex gap-1 items-center mb-2' disabled={document.checklists.length>=100} onClick={()=>add('checklist')}><Plus size={15}/>{w.addChecklist}</button>{document.checklists.map((list:any)=><button type='button' key={list.key} className={`block w-full text-left text-sm p-2 rounded-lg ${selected==='checklist:'+list.key?'bg-primary/10 text-primary':'hover:bg-gray-50'}`} onClick={()=>setSelected('checklist:'+list.key)}>{tr(list.title,language)}</button>)}</div>
      <div className='border-t pt-3'>{document.assessment&&<button type='button' className='block text-sm text-gray-600 py-2' onClick={()=>setSelected('assessment')}>{w.assessment}</button>}{document.standardsToConfirm&&<button type='button' className='block text-sm text-gray-600 py-2' onClick={()=>setSelected('standardsToConfirm')}>{w.standardsToConfirm}</button>}</div></aside>
      <section className='card min-w-0 space-y-5'><div className='flex flex-wrap justify-between items-center gap-2'><label className='text-sm flex gap-2 items-center'>{w.language}<select aria-label={w.language} className='input' value={language} onChange={e=>setLanguage(e.target.value)}><option value='zh'>中文</option><option value='id'>Bahasa Indonesia</option><option value='en'>English</option></select></label>{active&&<div className='flex gap-2'><button type='button' className='text-xs text-gray-500' disabled={courseIndex===0||listIndex===0} aria-label={w.up} onClick={()=>arrayChange(courseIndex>=0?document.modules:document.checklists,[courseIndex>=0?'modules':'checklists'],'up',courseIndex>=0?courseIndex:listIndex)}>↑</button><button type='button' className='text-xs text-gray-500' disabled={courseIndex>=0?courseIndex===document.modules.length-1:listIndex===document.checklists.length-1} aria-label={w.down} onClick={()=>arrayChange(courseIndex>=0?document.modules:document.checklists,[courseIndex>=0?'modules':'checklists'],'down',courseIndex>=0?courseIndex:listIndex)}>↓</button><button type='button' className='text-red-600 text-sm flex gap-1 items-center' onClick={removeActive}><Trash2 size={15}/>{w.delete}</button></div>}</div><p className='text-xs text-gray-500'>{w.editHint}</p>{active?fields(active,[courseIndex>=0?'modules':'checklists',courseIndex>=0?courseIndex:listIndex]):selected==='assessment'||selected==='standardsToConfirm'?fields(document[selected],[selected]):<p className='text-gray-500 py-8'>{w.selectionEmpty}</p>}<label className='block text-sm border-t pt-4'>{w.note}<input className='input w-full mt-2' maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label></section>
    </fieldset>}
    {showHistory&&<section className='card space-y-3'><h2 className='text-lg font-semibold'>{w.history}</h2>{historyError&&<button className='text-red-600 underline' onClick={()=>historyPage()}>{w.historyFailed}</button>}{!history.length&&!historyError&&<p className='text-sm text-gray-500'>{w.noHistory}</p>}{history.map(item=><div key={item.id} className='rounded-xl border p-3 flex flex-wrap items-center justify-between gap-3'><div className='text-sm'><p>{new Date(item.createdAt).toLocaleString(i18n.language,{timeZone:'Asia/Jakarta'})} · {item.kind==='publish'?w.published:item.kind==='restore'?w.restored:w.saved}</p><p className='text-xs text-gray-500 mt-1'>{item.note}</p></div><div className='flex gap-3 text-sm'><button disabled={busy} className='text-primary' onClick={()=>api('/history/'+item.id).then(setPreview).catch(e=>setMessage(e.message))}>{w.view}</button><button disabled={busy||dirty} className='text-primary disabled:opacity-40' onClick={()=>write('restore',item.id)}>{w.restore}</button></div></div>)}{cursor&&<button className='btn-secondary' disabled={busy} onClick={()=>historyPage(cursor)}>{w.more}</button>}</section>}
    {preview&&<AdminDialog title={w.historyPreview} onClose={()=>setPreview(null)} className="max-w-3xl" busy={false} trackChanges chrome><p className='text-sm text-gray-500'>{preview.note}</p>{preview.catalogue.modules.map((module:any)=><div key={module.key} className='border rounded-xl p-3'><h3 className='font-semibold'>{tr(module.title,language)}</h3>{module.sections.map((section:any,index:number)=><div key={index} className='text-sm mt-2'><h4>{tr(section.title,language)}</h4><ul className='list-disc pl-5'>{section.points.map((point:any,i:number)=><li key={i}>{tr(point,language)}</li>)}</ul></div>)}</div>)}{preview.catalogue.checklists?.map((list:any)=><div key={list.key}><h3>{tr(list.title,language)}</h3><ul className='list-disc pl-5'>{list.items.map((item:any,index:number)=><li key={index}>{tr(item,language)}</li>)}</ul></div>)}</AdminDialog>}
  </main>
}
