import { useEffect, useRef, useState } from 'react'
import type { TeamClient } from './TeamCommunication'

export interface ManagementActionView {
  id: string; channelId: string; assignedStaffId: string; operatorStaffId: string; title: string; nextStep: string
  evidenceRequired: string | null; dueAt: string | null; version: number; sourceSeq: number
  status: 'waiting_details'|'open'|'waiting_owner'|'awaiting_evidence'|'verified'|'cancelled'
  evidence: {sourceSeq:number;attachmentIds:string[];attachmentReview:'not_performed'}[]
  followup?: {deliveryState:'unknown'|'in_app'|'accepted';state:string}
}
type Action = 'submit_evidence'|'verify'|'cancel'
interface Command {actionId:string;requestId:string;expectedVersion:number;action:Action;note:string;sourceSeq:number[];criteriaConfirmed:boolean}
const zh = {
  title:'工作行动与证据',help:'工作承诺和待处理事项保存在本会话。回复“好的”不代表完成；本人提供证据后由负责人验收。',
  loading:'正在读取工作行动…',failed:'无法刷新工作行动，显示的内容可能已过时。',empty:'本会话暂无工作行动',refresh:'刷新行动',owner:'负责人',reviewer:'验收人',due:'期限',missingDue:'待确认期限',next:'下一步',evidenceRequired:'需要的证据',missingEvidence:'待确认验收证据',evidence:'已提交证据',attachments:'附件已记录，系统未自动审阅',source:'来源消息',
  waiting_details:'待补充信息',open:'进行中',waiting_owner:'等待负责人决定',awaiting_evidence:'证据已提交，等待负责人验收',verified:'负责人已验收',cancelled:'已取消',
  unknownDelivery:'提醒结果待核对，不能据此认定员工未配合。',inApp:'提醒仅已保存到系统内，不等于已送达、已读或已执行。',accepted:'员工回应已记录，仍不代表行动已验收。',
  submit_evidence:'提交本人证据',verify:'核验证据并结案',cancel:'取消行动',note:'结果或处理说明',references:'本会话证据消息序号',referenceHelp:'先在本会话发送事实或证据，再填写序号，如 12, 15。提交本人证据时只能引用本人已发消息。',criteria:'我已核对证据及验收要求，确认行动完成',confirm:'保存操作',close:'关闭',
  saved:'行动状态已保存',unknown:'保存结果尚未确定，操作已锁定；只查询原请求回执，不重复提交。',check:'查询操作回执',unresolved:'尚未查到匹配回执，原请求继续保留并锁定。',journal:'无法安全记录操作请求，已停止提交。',conflict:'行动版本已变化，请关闭表单并重新读取；你的输入仍保留。',invalidRefs:'请填写 1 至 20 个有效的消息序号。',failure:'操作失败，请刷新核对当前状态。'
}
const en:typeof zh = {
  title:'Work actions and evidence',help:'Work commitments and pending items stay in this conversation. Saying “OK” does not complete work. The assignee supplies evidence for a responsible person to verify.',
  loading:'Loading work actions…',failed:'Could not refresh work actions. Displayed information may be outdated.',empty:'No work actions in this conversation',refresh:'Refresh actions',owner:'Assignee',reviewer:'Verifier',due:'Due',missingDue:'Deadline needs clarification',next:'Next step',evidenceRequired:'Required evidence',missingEvidence:'Evidence requirements need clarification',evidence:'Submitted evidence',attachments:'Attachments recorded; not automatically reviewed',source:'Source message',
  waiting_details:'Needs details',open:'In progress',waiting_owner:'Awaiting responsible decision',awaiting_evidence:'Evidence submitted; awaiting verification',verified:'Verified by responsible person',cancelled:'Cancelled',
  unknownDelivery:'Reminder outcome is unresolved. This is not evidence of employee noncooperation.',inApp:'Reminder saved in the app only; delivery, read and execution are not proven.',accepted:'Employee response recorded; action completion is not yet verified.',
  submit_evidence:'Submit my evidence',verify:'Verify evidence and close',cancel:'Cancel action',note:'Result or action reason',references:'Evidence message numbers in this conversation',referenceHelp:'Send facts or evidence in this conversation first, then enter numbers such as 12, 15. Your evidence submission may reference only messages you sent.',criteria:'I checked the evidence and acceptance requirements and confirm completion',confirm:'Save action',close:'Close',
  saved:'Action saved',unknown:'The save outcome is unresolved. Actions are locked. Only the original receipt is queried; nothing is submitted again.',check:'Check action receipt',unresolved:'No matching receipt is visible. The original request and lock are retained.',journal:'The request could not be recorded safely. Nothing was submitted.',conflict:'The action changed. Close the form and refresh; your input is retained.',invalidRefs:'Enter between 1 and 20 valid message numbers.',failure:'The action failed. Refresh to check the current state.'
}
const id:typeof zh = {
  title:'Tindakan kerja dan bukti',help:'Janji kerja dan tindak lanjut disimpan di percakapan ini. Jawaban “baik” bukan berarti selesai. Pelaksana mengirim bukti untuk diperiksa penanggung jawab.',
  loading:'Memuat tindakan kerja…',failed:'Tindakan kerja tidak dapat diperbarui. Informasi yang terlihat mungkin sudah berubah.',empty:'Belum ada tindakan kerja di percakapan ini',refresh:'Muat ulang tindakan',owner:'Pelaksana',reviewer:'Pemeriksa',due:'Tenggat',missingDue:'Tenggat perlu dikonfirmasi',next:'Langkah berikutnya',evidenceRequired:'Bukti yang diperlukan',missingEvidence:'Persyaratan bukti perlu dikonfirmasi',evidence:'Bukti terkirim',attachments:'Lampiran dicatat; tidak diperiksa otomatis',source:'Pesan sumber',
  waiting_details:'Perlu informasi',open:'Berjalan',waiting_owner:'Menunggu keputusan penanggung jawab',awaiting_evidence:'Bukti terkirim; menunggu pemeriksaan',verified:'Diverifikasi penanggung jawab',cancelled:'Dibatalkan',
  unknownDelivery:'Hasil pengingat belum pasti. Ini bukan bukti pegawai tidak bekerja sama.',inApp:'Pengingat baru disimpan di aplikasi; belum membuktikan diterima, dibaca atau dilaksanakan.',accepted:'Tanggapan pegawai dicatat; tindakan belum dinyatakan selesai.',
  submit_evidence:'Kirim bukti saya',verify:'Periksa bukti dan tutup',cancel:'Batalkan tindakan',note:'Hasil atau alasan tindakan',references:'Nomor pesan bukti di percakapan ini',referenceHelp:'Kirim fakta atau bukti di percakapan ini dahulu, lalu isi nomor seperti 12, 15. Pengiriman bukti Anda hanya boleh merujuk pesan Anda sendiri.',criteria:'Saya memeriksa bukti dan persyaratan penerimaan serta mengonfirmasi pekerjaan selesai',confirm:'Simpan tindakan',close:'Tutup',
  saved:'Tindakan tersimpan',unknown:'Hasil penyimpanan belum pasti. Tindakan dikunci. Hanya bukti permintaan asli yang diperiksa, tanpa mengirim ulang.',check:'Periksa bukti tindakan',unresolved:'Bukti yang cocok belum terlihat. Permintaan asli dan kunci tetap disimpan.',journal:'Permintaan tidak dapat dicatat dengan aman. Tidak ada yang dikirim.',conflict:'Tindakan berubah. Tutup formulir dan muat ulang; isian Anda tetap disimpan.',invalidRefs:'Isi 1 sampai 20 nomor pesan yang valid.',failure:'Tindakan gagal. Muat ulang untuk memeriksa status terkini.'
}
const button='rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-50', field='mt-1 w-full min-w-0 rounded-lg border bg-white p-2'
const statuses=['waiting_details','open','waiting_owner','awaiting_evidence','verified','cancelled']
const positive=(n:unknown):n is number => typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=999999999999
const valid=(v:any):v is ManagementActionView => v&&typeof v.id==='string'&&typeof v.channelId==='string'&&typeof v.title==='string'&&typeof v.nextStep==='string'&&typeof v.assignedStaffId==='string'&&typeof v.operatorStaffId==='string'&&Number.isSafeInteger(v.version)&&v.version>0&&positive(v.sourceSeq)&&statuses.includes(v.status)&&
  (v.dueAt===null||typeof v.dueAt==='string'&&Number.isFinite(Date.parse(v.dueAt)))&&(v.evidenceRequired===null||typeof v.evidenceRequired==='string')&&Array.isArray(v.evidence)&&v.evidence.every((e:any)=>e&&positive(e.sourceSeq)&&Array.isArray(e.attachmentIds)&&e.attachmentIds.every((id:unknown)=>typeof id==='string')&&e.attachmentReview==='not_performed')&&
  (!v.followup||typeof v.followup.state==='string'&&['unknown','in_app','accepted'].includes(v.followup.deliveryState))
function refs(raw:string):number[]|null {
  const parts=raw.split(/[，,\s]+/u).filter(Boolean).map(s=>s.replace(/^#/,''))
  if(parts.some(s=>!/^\d+$/.test(s)))return null
  const result=[...new Set(parts.map(Number))]
  return result.length<=20&&result.every(n=>Number.isSafeInteger(n)&&n>0&&n<=999999999999)?result:null
}
function savedCommand(raw:string|null):Command|null {
  if(!raw)return null
  const v=JSON.parse(raw)
  if(!v||typeof v.actionId!=='string'||typeof v.requestId!=='string'||!['submit_evidence','verify','cancel'].includes(v.action)||!Number.isSafeInteger(v.expectedVersion)||typeof v.note!=='string'||!Array.isArray(v.sourceSeq)||typeof v.criteriaConfirmed!=='boolean')throw Error('JOURNAL_INVALID')
  return v
}
export function TeamManagementActions({client,scope,channelId,staffId,language,administration,directory=[]}:{
  client:Pick<TeamClient,'request'|'current'>;scope:string;channelId:string;staffId:string;language:string;administration:boolean;directory?:{id:string;name:string}[]
}) {
  const c=language.startsWith('zh')?zh:language.startsWith('en')?en:id, resource=`${scope}:${channelId}:${staffId}:${administration?'admin':'employee'}`
  const storage=`team-management-actions:${resource}`, base=`/team/channels/${encodeURIComponent(channelId)}/management/actions`
  const currentResource=useRef(resource);currentResource.current=resource
  const alive=useRef(true),epoch=useRef(0),reading=useRef(false),writing=useRef(false)
  const [state,setState]=useState<{resource:string;items:ManagementActionView[];loading:boolean;failed:boolean}>({resource,items:[],loading:true,failed:false})
  const [pending,setPending]=useState<{resource:string;command:Command}|null>(null),[editing,setEditing]=useState<{resource:string;record:ManagementActionView;action:Action}|null>(null)
  const [note,setNote]=useState(''),[sourceRefs,setSourceRefs]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false)
  const [feedback,setFeedback]=useState<{resource:string;error:string;notice:string;blocked:boolean}>({resource,error:'',notice:'',blocked:false})
  const current=(n:number)=>alive.current&&client.current()&&currentResource.current===resource&&epoch.current===n
  const items=state.resource===resource?state.items:[], command=pending?.resource===resource?pending.command:null, form=editing?.resource===resource?editing:null
  const feedbackHere=feedback.resource===resource?feedback:{error:'',notice:'',blocked:false}
  const changed=!!form&&items.find(item=>item.id===form.record.id)?.version!==form.record.version
  const name=(id:string)=>directory.find(p=>p.id===id)?.name||id
  const say=(error:string,notice='')=>setFeedback({resource,error,notice,blocked:false})
  async function load(check=false) {
    if(reading.current||!client.current())return
    reading.current=true;const n=epoch.current
    try {
      const saved=savedCommand(sessionStorage.getItem(storage))
      if(current(n))setPending(saved?{resource,command:saved}:null)
      const result=await client.request('get',base+(saved?'?requestId='+encodeURIComponent(saved.requestId):''))
      if(!current(n))return
      if(!result||!Array.isArray(result.actions)||!result.actions.every((item:unknown)=>valid(item)&&item.channelId===channelId))throw Error('ACTION_LIST_INVALID')
      setState({resource,items:result.actions,loading:false,failed:false})
      if(saved&&result.requestReceipt?.requestId===saved.requestId&&result.requestReceipt.actionId===saved.actionId){
        sessionStorage.removeItem(storage);setPending(null);setEditing(null);say('',c.saved)
      }else if(saved&&check)say(c.unresolved)
    }catch(e:any){if(current(n)){const lostAccess=[401,403,404].includes(e?.response?.status);if(lostAccess)setEditing(null);setState(old=>({resource,items:!lostAccess&&old.resource===resource?old.items:[],loading:false,failed:true}));setFeedback({resource,error:e?.message==='JOURNAL_INVALID'?c.journal:c.failed,notice:'',blocked:e?.message==='JOURNAL_INVALID'})}}
    finally{reading.current=false}
  }
  useEffect(()=>{
    alive.current=true;epoch.current++;reading.current=false;setEditing(null);setPending(null);setBusy(false);setState({resource,items:[],loading:true,failed:false});setFeedback({resource,error:'',notice:'',blocked:false})
    void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load()},5000)
    return()=>{alive.current=false;epoch.current++;clearInterval(timer)}
  },[client,resource])
  function begin(record:ManagementActionView,action:Action){setEditing({resource,record,action});setNote('');setSourceRefs('');setConfirmed(false);say('')}
  async function apply() {
    if(!form||changed||command||feedbackHere.blocked||writing.current||!client.current())return
    const numbers=refs(sourceRefs)
    if(!numbers||form.action!=='cancel'&&!numbers.length){say(c.invalidRefs);return}
    if(!note.trim()||form.action==='verify'&&!confirmed)return
    const n=epoch.current
    const payload:Command={actionId:form.record.id,requestId:crypto.randomUUID(),expectedVersion:form.record.version,action:form.action,note:note.trim(),sourceSeq:numbers,criteriaConfirmed:confirmed}
    writing.current=true;setBusy(true);say('')
    try {
      try{sessionStorage.setItem(storage,JSON.stringify(payload));setPending({resource,command:payload})}catch{setFeedback({resource,error:c.journal,notice:'',blocked:true});return}
      try{
        const {actionId,...body}=payload
        await client.request('post',`${base}/${encodeURIComponent(actionId)}/actions`,body)
        if(!current(n))return
        sessionStorage.removeItem(storage);setPending(null);setEditing(null);say('',c.saved);await load()
      }catch(e:any){if(!current(n))return
        if(e?.response?.status>=400&&e.response.status<500&&![408,429].includes(e.response.status)){
          try{sessionStorage.removeItem(storage);setPending(null)}catch{setFeedback({resource,error:c.journal,notice:'',blocked:true});return}
          say(e.response.status===409?c.conflict:c.failure);await load()
        }else say(c.unknown)
      }
    }finally{writing.current=false;if(current(n))setBusy(false)}
  }
  const numbers=refs(sourceRefs),closed=(r:ManagementActionView)=>['verified','cancelled'].includes(r.status)
  return <section className="min-w-0 space-y-3 rounded-xl border bg-white p-4" data-testid="team-management-actions" aria-label={c.title}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{c.title}</h3><button type="button" className={button} disabled={busy} onClick={()=>void load(!!command)}>{command?c.check:c.refresh}</button></div>
    <p className="text-xs text-gray-600">{c.help}</p>
    {(state.resource!==resource||state.loading)&&<p role="status" className="text-sm text-gray-500">{c.loading}</p>}
    {feedbackHere.error&&<p role="alert" className="break-words text-sm text-red-700">{feedbackHere.error}</p>}{feedbackHere.notice&&<p role="status" className="text-sm text-green-800">{feedbackHere.notice}</p>}
    {command&&<p role="status" className="text-sm text-amber-800">{c.unknown}</p>}
    {state.resource===resource&&!state.loading&&!state.failed&&!items.length&&<p className="text-sm text-gray-500">{c.empty}</p>}
    {items.map(record=><article key={record.id} className="min-w-0 space-y-2 rounded-lg border p-3 text-sm" data-testid={`management-action-${record.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="whitespace-pre-wrap break-words font-medium">{record.title}</h4><span className="rounded-full bg-gray-100 px-2 py-1">{c[record.status]}</span></div>
      <p className="break-words">{c.owner}: {name(record.assignedStaffId)} · {c.reviewer}: {name(record.operatorStaffId)}</p>
      <p>{c.due}: {record.dueAt?new Date(record.dueAt).toLocaleString(language):c.missingDue}</p>
      <p className="whitespace-pre-wrap break-words">{c.next}: {record.nextStep}</p><p className="whitespace-pre-wrap break-words">{c.evidenceRequired}: {record.evidenceRequired||c.missingEvidence}</p>
      <p>{c.source}: <a className="underline" href={`#team-message-${record.sourceSeq}`}>#{record.sourceSeq}</a></p>
      {!!record.evidence.length&&<div className="space-y-1"><p>{c.evidence}</p>{record.evidence.map((e,i)=><p key={i}><a className="underline" href={`#team-message-${e.sourceSeq}`}>#{e.sourceSeq}</a>{e.attachmentIds?.length>0&&<span> · {c.attachments} ({e.attachmentIds.length})</span>}</p>)}</div>}
      {record.followup&&<p className="rounded-lg bg-amber-50 p-2 text-xs" data-testid="management-followup-state">{record.followup.deliveryState==='in_app'?c.inApp:record.followup.deliveryState==='accepted'?c.accepted:c.unknownDelivery}</p>}
      {!closed(record)&&<div className="flex flex-wrap gap-2">
        {record.assignedStaffId===staffId&&<button type="button" className={button} disabled={busy||!!command||feedbackHere.blocked||state.failed} onClick={()=>begin(record,'submit_evidence')}>{c.submit_evidence}</button>}
        {administration&&record.operatorStaffId===staffId&&<>{record.status==='awaiting_evidence'&&record.evidence.length>0&&!!record.evidenceRequired&&<button type="button" className={button} disabled={busy||!!command||feedbackHere.blocked||state.failed} onClick={()=>begin(record,'verify')}>{c.verify}</button>}<button type="button" className={button} disabled={busy||!!command||feedbackHere.blocked||state.failed} onClick={()=>begin(record,'cancel')}>{c.cancel}</button></>}
      </div>}
    </article>)}
    {form&&<form className="min-w-0 space-y-3 rounded-lg border border-red-200 p-3" data-testid="management-action-form" onSubmit={e=>{e.preventDefault();void apply()}}>
      <h4 className="break-words font-semibold">{c[form.action]} · {form.record.title}</h4>
      {changed&&<p role="alert" className="text-sm text-amber-800">{c.conflict}</p>}
      <label className="block text-sm">{c.note}<textarea className={field} value={note} maxLength={1000} required disabled={busy||!!command} onChange={e=>setNote(e.target.value)}/></label>
      <label className="block text-sm">{c.references}<input className={field} value={sourceRefs} maxLength={300} disabled={busy||!!command} onChange={e=>setSourceRefs(e.target.value)}/></label><p className="text-xs text-gray-600">{c.referenceHelp}</p>
      {form.action==='verify'&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy||!!command} onChange={e=>setConfirmed(e.target.checked)}/><span>{c.criteria}</span></label>}
      <div className="flex flex-wrap gap-2"><button className={button} disabled={busy||!!command||changed||feedbackHere.blocked||!note.trim()||!numbers||form.action!=='cancel'&&!numbers.length||form.action==='verify'&&!confirmed}>{c.confirm}</button><button type="button" className={button} disabled={busy||!!command} onClick={()=>setEditing(null)}>{c.close}</button></div>
    </form>}
  </section>
}
