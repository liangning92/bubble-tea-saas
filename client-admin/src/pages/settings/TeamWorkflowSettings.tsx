import { useEffect, useRef, useState } from 'react'
import type { TeamClient } from '../../../../shared/TeamCommunication'
import { workflowBase, workflowError } from '../staff/teamWorkflowUi'

interface Policy { version: number; enabled: boolean; paused: boolean; employeeIds?: string[]; automaticSend: false; operatorStaffId?: string }
interface Channel { id: string; title: string; member: boolean; archived: boolean; members: { staffId: string }[] }
const zh = { title:'员工来信处理许可',channel:'许可频道',choose:'选择一个已加入的频道',people:'允许处理其新文字来信的员工',save:'保存并允许生成草稿',pause:'暂停此频道',disable:'禁用此频道',refresh:'重新读取许可',confirm:'我允许选定员工此后在该频道发送的新工作文字交给当前模型处理，回复和任务仍须人工批准',off:'未启用',paused:'已暂停',enabled:'允许生成草稿',version:'许可版本',owner:'负责管理员',failure:'读取许可失败，请重试。',saved:'许可已保存',unknown:'保存结果待核对，已锁定表单。重新读取许可确认状态后再操作。',journal:'无法安全记录保存请求，已停止提交。',verified:'请先在上方验证已保存的模型连接，再开启频道处理。',members:'改变频道成员、管理员或模型配置后，旧任务会阻断，须重新确认许可。',consumer:'许可只允许生成私有草稿；实际处理仍需另行获批的单门店消费者。',discard:'放弃本地表单并读取已保存状态',dirty:'有未保存的许可更改',auto:'每条回复、每个任务都由人工确认',none:'暂无本人已加入的频道',self:'当前管理员',conflict:'许可已变化，已保留表单。请重新读取当前版本。' }
const en: typeof zh = {title:'Incoming employee-message permissions',channel:'Authorized channel',choose:'Choose a channel you joined',people:'Employees whose new text may be processed',save:'Save and allow private drafts',pause:'Pause this channel',disable:'Disable this channel',refresh:'Reload permissions',confirm:'I allow new work text from the selected employees in this channel to reach the current model; replies and tasks still require human approval',off:'Disabled',paused:'Paused',enabled:'Private drafts allowed',version:'Policy version',owner:'Responsible administrator',failure:'Could not load permissions. Try again.',saved:'Permissions saved',unknown:'Save outcome unresolved. The form is locked; reload the saved policy before continuing.',journal:'Could not safely record the save request. Submission stopped.',verified:'Verify the saved model connection above before enabling processing.',members:'Channel membership, administrator or model changes block old jobs and require renewed permission.',consumer:'This permission only allows private drafts. Processing requires a separately authorized single-store consumer.',discard:'Discard local form and read saved state',dirty:'Unsaved permission changes',auto:'Every reply and task requires human approval',none:'You have not joined any channels',self:'Current administrator',conflict:'Permissions changed. Your form is retained; reload the current version.'}
const id: typeof zh = {title:'Izin pemrosesan pesan pegawai',channel:'Kanal diizinkan',choose:'Pilih kanal yang Anda ikuti',people:'Pegawai yang teks barunya boleh diproses',save:'Simpan dan izinkan draf pribadi',pause:'Jeda kanal ini',disable:'Nonaktifkan kanal ini',refresh:'Muat ulang izin',confirm:'Saya mengizinkan teks kerja baru pegawai terpilih di kanal ini dikirim ke model saat ini; balasan dan tugas tetap disetujui manusia',off:'Nonaktif',paused:'Dijeda',enabled:'Draf pribadi diizinkan',version:'Versi izin',owner:'Administrator penanggung jawab',failure:'Gagal memuat izin. Coba lagi.',saved:'Izin tersimpan',unknown:'Hasil penyimpanan belum pasti. Formulir dikunci; muat izin tersimpan sebelum melanjutkan.',journal:'Permintaan tidak dapat dicatat dengan aman. Pengiriman dihentikan.',verified:'Verifikasi koneksi model tersimpan di atas sebelum mengaktifkan pemrosesan.',members:'Perubahan anggota, administrator atau model memblokir tugas lama dan memerlukan izin baru.',consumer:'Izin ini hanya untuk draf pribadi. Pemrosesan memerlukan konsumen satu toko yang diizinkan terpisah.',discard:'Buang formulir lokal dan baca izin tersimpan',dirty:'Perubahan izin belum disimpan',auto:'Setiap balasan dan tugas disetujui manusia',none:'Belum ada kanal yang Anda ikuti',self:'Administrator saat ini',conflict:'Izin berubah. Formulir dipertahankan; muat versi terkini.'}
const button = 'rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-50'
function verifiedProof(settings: any): { expectedAiConfigVersion: number; expectedAiCheckRevision: number } | null {
  const connection = settings?.connection
  return settings?.enabled && settings.keyConfigured && connection?.status === 'ready' && connection.configVersion === settings.version &&
    connection.region === settings.region && connection.model === settings.model && Number.isSafeInteger(connection.checkRevision) &&
    connection.checkRevision > 0 && connection.checkRevision === settings.checkRevision
    ? { expectedAiConfigVersion: settings.version, expectedAiCheckRevision: connection.checkRevision } : null
}
export function TeamWorkflowSettings({ client, scope, staffId, language }: { client: Pick<TeamClient, 'request' | 'current'>; scope: string; staffId: string; language: string }) {
  const c = language.startsWith('zh') ? zh : language.startsWith('en') ? en : id
  const [channels,setChannels] = useState<Channel[]>([]), [people,setPeople] = useState<{ id: string; name: string }[]>([]), [selected,setSelected] = useState('')
  const [policy,setPolicy] = useState<Policy|null>(null), [employees,setEmployees] = useState<string[]>([]), [consent,setConsent] = useState(false)
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState(''), [uncertain,setUncertain] = useState(false), [ready,setReady] = useState(false)
  const [proof,setProof] = useState<ReturnType<typeof verifiedProof>>(null)
  const alive = useRef(true), epoch = useRef(0), sending = useRef(false), channel = channels.find(item => item.id === selected)
  const key = `team-workflow-policy:${scope}:${selected}`
  const name = (value: string) => people.find(person => person.id === value)?.name || value
  useEffect(() => {
    alive.current=true
    void Promise.all([client.request('get','/team/admin/channels'),client.request('get','/team/directory')]).then(([list,directory]) => {
      if(alive.current&&client.current()){setChannels(list.filter((item:Channel)=>item.member));setPeople(directory)}
    }).catch(()=>{if(alive.current&&client.current())setError(c.failure)})
    return()=>{alive.current=false;epoch.current++}
  },[client])
  const current = (token: number) => alive.current && client.current() && token === epoch.current
  async function load(discard = false) {
    const token=++epoch.current;setPolicy(null);setConsent(false);setError('');setNotice('');setReady(false)
    if(!selected)return
    setBusy(true)
    try {
      const [permission,model]=await Promise.allSettled([client.request('get',workflowBase(selected)+'/policy'),client.request('get','/team/ai/settings')])
      if(!current(token))return
      if(permission.status!=='fulfilled')throw Error('POLICY_READ_FAILED')
      const value=permission.value,settings=model.status==='fulfilled'?model.value:null
      if(discard) sessionStorage.removeItem(key)
      setPolicy(value);setEmployees(value.employeeIds||[])
      const verified=verifiedProof(settings);setProof(verified);setReady(!!verified)
      const raw=sessionStorage.getItem(key)
      setUncertain(!!raw)
      if(raw) setError(c.unknown)
    }catch{if(current(token))setError(c.failure)}finally{if(current(token))setBusy(false)}
  }
  useEffect(()=>{void load()},[client,selected])
  async function save(enabled: boolean, paused: boolean, ids: string[]) {
    if(!policy||!selected||sending.current||uncertain||!client.current())return
    if(enabled&&!paused&&(!consent||!ready||!ids.length))return
    sending.current=true;setBusy(true);setError('');setNotice('');const token=epoch.current
    let verified: ReturnType<typeof verifiedProof> = null
    if(enabled&&!paused){
      try {
        const latest=await client.request('get','/team/ai/settings')
        if(!current(token)){sending.current=false;return}
        verified=verifiedProof(latest)
        if(!verified||JSON.stringify(verified)!==JSON.stringify(proof)){
          setReady(false);setProof(null);setConsent(false);setError(c.verified);setBusy(false);sending.current=false;return
        }
      }catch{if(current(token)){setError(c.failure);setBusy(false)}sending.current=false;return}
    }
    const body={expectedVersion:policy.version,enabled,paused,employeeIds:ids,automaticSend:false,consent:true,...(verified||{})}
    try { sessionStorage.setItem(key,JSON.stringify(body)) }catch{setError(c.journal);setBusy(false);sending.current=false;return}
    try {
      const value=await client.request('put',workflowBase(selected)+'/policy',body)
      if(!current(token))return
      sessionStorage.removeItem(key);setPolicy(value);setEmployees(value.employeeIds||[]);setConsent(false);setNotice(c.saved)
    }catch(e:any){
      if(!current(token))return
      if(e?.response?.status>=400&&e.response.status<500&&![408,429].includes(e.response.status)){
        try{sessionStorage.removeItem(key)}catch{setUncertain(true)}
        const code=e?.response?.data?.message
        if(code==='TEAM_WORKFLOW_CONNECTION_REQUIRED'){setReady(false);setProof(null);setConsent(false)}
        setError(code==='TEAM_VERSION_CONFLICT'?c.conflict:code==='TEAM_WORKFLOW_CONNECTION_REQUIRED'?c.verified:workflowError(language,e))
      }else{setUncertain(true);setError(c.unknown)}
    }finally{sending.current=false;if(current(token))setBusy(false)}
  }
  return <details id="ai-workflow-permissions" className="min-w-0 space-y-3 rounded-xl border bg-white p-4 sm:p-6" data-testid="workflow-settings">
    <summary className="cursor-pointer font-semibold">{c.title}</summary>
    <p className="text-sm text-gray-600">{c.auto}</p>
    <label className="block text-sm">{c.channel}<select disabled={busy} className="mt-1 w-full min-w-0 rounded-lg border bg-white p-2.5" value={selected} onChange={event=>setSelected(event.target.value)}><option value="">{channels.length?c.choose:c.none}</option>{channels.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    {error&&<p role="alert" className="break-words text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}
    {selected&&!policy&&<button type="button" className={button} disabled={busy} onClick={()=>void load()}>{c.refresh}</button>}
    {policy&&<><p role="status" className="text-sm">{policy.enabled?policy.paused?c.paused:c.enabled:c.off} · {c.version} {policy.version} · {c.owner}: {policy.operatorStaffId?name(policy.operatorStaffId):c.self}</p>
      <fieldset disabled={busy||uncertain} className="space-y-2"><legend className="text-sm font-medium">{c.people}</legend>{channel?.members.filter(member=>member.staffId!==staffId).map(member=><label className="flex gap-2 text-sm" key={member.staffId}><input type="checkbox" checked={employees.includes(member.staffId)} onChange={event=>{setEmployees(event.target.checked?[...employees,member.staffId]:employees.filter(value=>value!==member.staffId));setConsent(false)}}/>{name(member.staffId)}</label>)}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/>{c.confirm}</label>
        {!ready&&<p className="text-sm text-amber-800">{c.verified}</p>}<button type="button" className={button} disabled={!ready||!consent||!employees.length||channel?.archived} onClick={()=>void save(true,false,employees)}>{c.save}</button>
      </fieldset><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy||uncertain||!policy.enabled||policy.paused} onClick={()=>void save(policy.enabled,true,policy.employeeIds||[])}>{c.pause}</button><button type="button" className={button} disabled={busy||uncertain||!policy.enabled} onClick={()=>void save(false,true,policy.employeeIds||[])}>{c.disable}</button><button type="button" className={button} disabled={busy} onClick={()=>void load(true)}>{uncertain?c.discard:c.refresh}</button></div>
      <p className="text-xs text-gray-600">{c.members}</p><p className="text-xs text-gray-600">{c.consumer}</p>
    </>}
  </details>
}
