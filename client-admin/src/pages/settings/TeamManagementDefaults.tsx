import { useEffect, useRef, useState } from 'react'
import type { TeamClient } from '../../../../shared/TeamCommunication'

interface Defaults { version: number; enabled: boolean; ownerStaffId: string | null; lastRequestId?: string; aiConfigVersion?: number; aiCheckRevision?: number; requestReceipt?: {requestId:string;version:number;enabled:boolean;ownerStaffId:string} }
interface Command { requestId: string; expectedVersion: number; enabled: boolean; consent: true; ownerStaffId: string; expectedAiConfigVersion?: number; expectedAiCheckRevision?: number }
const zh = {
  title:'门店团队工作自动处理', description:'门店内现有及以后新建的团队工作会话自动继承，无需逐个频道开启。日常确认、追问和工作协调自动处理；频道暂停与人工接管作为例外保留。',
  scope:'只读取当前门店与会话真实成员有权访问的必要工作信息。缺少可访问负责人时形成门店负责人待办，不自动添加成员或转发无权查看的私聊。',
  boundary:'工资、证件、健康资料和私人聊天排除在模型处理范围外。付款、奖惩、权限变更和新增凭据不自动执行。',
  loading:'正在读取门店处理状态…', failed:'读取失败，无法确认门店处理状态。', off:'门店自动处理尚未开启', on:'门店默认自动处理已开启', version:'保存版本', owner:'门店负责人', current:'当前管理员', savedOwner:'已保存的负责人',
  consent:'我确认使用已保存的模型处理门店团队工作会话，由门店负责人处理需要决定的事项。', enable:'开启门店默认自动处理', disable:'暂停门店默认自动处理', refresh:'重新读取状态', saving:'正在保存…',
  verified:'请先在上方验证当前已保存的中国区模型连接。', unknown:'保存结果尚未确定，操作已锁定；请查询已保存状态，不要重复提交。', check:'查询保存回执', unresolved:'尚未查到匹配保存回执，继续保留原请求并锁定操作。', saved:'门店处理状态已保存', journal:'无法安全保存本次请求记录，已停止提交。', conflict:'门店设置已变化，请重新读取后确认。', noOwner:'当前账号尚未绑定有效员工，无法作为门店负责人。'
}
const en: typeof zh = {
  title:'Store work coordination', description:'Existing and future team work conversations inherit this store default. Routine confirmations, questions and coordination run automatically. Channel pauses and human takeovers remain explicit exceptions.',
  scope:'Only necessary work information visible to the current store and actual conversation members is used. If no accessible responsible person is available, a store-owner item is created without adding members or exposing private conversations.',
  boundary:'Salary, identity documents, health details and private chats are excluded from model processing. Payments, discipline, permissions and new credentials are not executed automatically.',
  loading:'Reading store status…', failed:'Could not read the store status; its mode is unconfirmed.', off:'Store automatic processing is off', on:'Store automatic processing is on', version:'Saved version', owner:'Responsible person', current:'Current administrator', savedOwner:'Saved responsible person',
  consent:'I confirm using the saved model for store team work conversations, with decisions referred to the responsible person.', enable:'Enable store automatic processing', disable:'Pause store automatic processing', refresh:'Reload status', saving:'Saving…',
  verified:'Verify the current saved China-region model connection above first.', unknown:'The save outcome is unresolved. Changes are locked; query the saved status without submitting again.', check:'Check save receipt', unresolved:'No matching save receipt is visible. The original request and lock are retained.', saved:'Store status saved', journal:'The request could not be recorded safely. Nothing was submitted.', conflict:'Store settings changed. Reload and review them.', noOwner:'This account has no bound staff identity to act as the responsible person.'
}
const id: typeof zh = {
  title:'Koordinasi kerja toko', description:'Percakapan kerja tim yang ada dan yang baru mengikuti pengaturan toko ini, tanpa mengaktifkan setiap kanal. Konfirmasi, pertanyaan dan koordinasi berjalan otomatis. Jeda kanal dan pengambilalihan manusia tetap menjadi pengecualian.',
  scope:'Hanya informasi kerja yang perlu dan dapat diakses oleh toko serta anggota percakapan yang sebenarnya yang digunakan. Jika penanggung jawab belum memiliki akses, dibuat tindak lanjut untuk penanggung jawab toko tanpa menambahkan anggota atau membuka percakapan pribadi.',
  boundary:'Gaji, dokumen identitas, informasi kesehatan dan percakapan pribadi tidak termasuk pemrosesan model. Pembayaran, sanksi, perubahan izin dan kredensial baru tidak dijalankan otomatis.',
  loading:'Membaca status toko…', failed:'Status toko tidak dapat dibaca; mode belum dapat dipastikan.', off:'Pemrosesan otomatis toko belum aktif', on:'Pemrosesan otomatis toko aktif', version:'Versi tersimpan', owner:'Penanggung jawab toko', current:'Administrator saat ini', savedOwner:'Penanggung jawab tersimpan',
  consent:'Saya mengonfirmasi penggunaan model tersimpan untuk percakapan kerja tim toko, dengan keputusan dirujuk kepada penanggung jawab.', enable:'Aktifkan pemrosesan otomatis toko', disable:'Jeda pemrosesan otomatis toko', refresh:'Muat ulang status', saving:'Menyimpan…',
  verified:'Verifikasi koneksi model wilayah Tiongkok yang tersimpan di atas terlebih dahulu.', unknown:'Hasil penyimpanan belum pasti. Perubahan dikunci; periksa status tersimpan tanpa mengirim ulang.', check:'Periksa bukti penyimpanan', unresolved:'Bukti penyimpanan yang cocok belum terlihat. Permintaan asli dan kunci tetap disimpan.', saved:'Status toko tersimpan', journal:'Permintaan tidak dapat dicatat dengan aman. Tidak ada yang dikirim.', conflict:'Pengaturan toko berubah. Muat ulang dan periksa.', noOwner:'Akun ini belum memiliki identitas pegawai untuk menjadi penanggung jawab.'
}
const valid = (v: any): v is Defaults => !!v && Number.isSafeInteger(v.version) && v.version >= 0 && typeof v.enabled === 'boolean' && (v.ownerStaffId == null || typeof v.ownerStaffId === 'string')
function proof(s: any) {
  const c = s?.connection
  return s?.enabled && s.region === 'cn' && s.keyConfigured && c?.status === 'ready' && c.region === s.region && c.model === s.model && c.configVersion === s.version &&
    Number.isSafeInteger(c.checkRevision) && c.checkRevision > 0 && c.checkRevision === s.checkRevision
    ? { expectedAiConfigVersion: s.version as number, expectedAiCheckRevision: c.checkRevision as number } : null
}
const button = 'rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-50'
export function TeamManagementDefaults({client, scope, staffId, language}: {client: Pick<TeamClient,'request'|'current'>; scope:string; staffId:string; language:string}) {
  const c = language.startsWith('zh') ? zh : language.startsWith('en') ? en : id
  const storage = `team-management-defaults:${scope}`, alive = useRef(true), epoch = useRef(0), writing = useRef(false)
  const [state,setState] = useState<'loading'|'ready'|'failed'>('loading'), [value,setValue] = useState<Defaults|null>(null)
  const [consent,setConsent] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState('')
  const [pending,setPending] = useState<Command|null>(null), [journalBlocked,setJournalBlocked] = useState(false)
  const current = (n:number) => alive.current && client.current() && epoch.current === n
  async function load(check=false) {
    const n = ++epoch.current; setState('loading'); setError(''); setConsent(false)
    try {
      const raw = sessionStorage.getItem(storage)
      let command:Command|null = raw ? JSON.parse(raw) : null
      if (command && (typeof command.requestId !== 'string' || !Number.isSafeInteger(command.expectedVersion) || typeof command.enabled !== 'boolean' || typeof command.ownerStaffId !== 'string')) throw Error('JOURNAL_INVALID')
      if(current(n))setPending(command)
      const result = await client.request('get','/team/workflow/defaults' + (command ? '?requestId=' + encodeURIComponent(command.requestId) : ''))
      if(!current(n))return
      if(!valid(result))throw Error('STATUS_INVALID')
      setValue({...result,ownerStaffId:result.ownerStaffId||null}); setState('ready')
      const receipt=result.requestReceipt
      const matchedReceipt=command && receipt?.requestId===command.requestId && receipt.version===command.expectedVersion+1 && receipt.enabled===command.enabled && receipt.ownerStaffId===command.ownerStaffId
      if(command && (matchedReceipt || result.lastRequestId === command.requestId)) {
        sessionStorage.removeItem(storage);setPending(null);setNotice(c.saved)
      } else if(command && check) setError(c.unresolved)
    } catch(e:any) { if(current(n)){setState('failed');setError(c.failed);if(e?.message==='JOURNAL_INVALID')setJournalBlocked(true)} }
  }
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;epoch.current++}},[client,storage])
  async function save(enabled:boolean) {
    if(!value||state!=='ready'||pending||journalBlocked||writing.current||!client.current()||enabled&&!consent)return
    const ownerStaffId=value.ownerStaffId||staffId
    if(!ownerStaffId){setError(c.noOwner);return}
    writing.current=true;setBusy(true);setError('');setNotice('');const n=epoch.current
    try {
      let verified:ReturnType<typeof proof>=null
      if(enabled){verified=proof(await client.request('get','/team/ai/settings'));if(!current(n))return;if(!verified){setError(c.verified);return}}
      const command:Command={requestId:crypto.randomUUID(),expectedVersion:value.version,enabled,consent:true,ownerStaffId,...(verified||{})}
      try {sessionStorage.setItem(storage,JSON.stringify(command));setPending(command)} catch {setJournalBlocked(true);setError(c.journal);return}
      try {
        const saved=await client.request('put','/team/workflow/defaults',command)
        if(!current(n))return
        if(!valid(saved)||saved.lastRequestId!==command.requestId)throw Error('SAVE_OUTCOME_UNCONFIRMED')
        sessionStorage.removeItem(storage);setPending(null);setValue({...saved,ownerStaffId:saved.ownerStaffId||null});setConsent(false);setNotice(c.saved)
      } catch(e:any) {
        if(!current(n))return
        if(e?.response?.status>=400&&e.response.status<500&&![408,429].includes(e.response.status)) {
          try{sessionStorage.removeItem(storage);setPending(null)}catch{setJournalBlocked(true)}
          setError(e.response.status===409?c.conflict:c.failed)
        } else setError(c.unknown)
      }
    } catch { if(current(n))setError(c.failed) } finally {writing.current=false;if(current(n))setBusy(false)}
  }
  return <section id="ai-management-defaults" data-testid="management-defaults" aria-labelledby="management-defaults-title" className="min-w-0 space-y-3 rounded-xl border bg-white p-4 sm:p-6">
    <h3 id="management-defaults-title" className="font-semibold">{c.title}</h3>
    <p className="text-sm text-gray-600">{c.description}</p>
    <p data-testid="management-defaults-state" role="status" className="text-sm font-medium">{state==='loading'?c.loading:state==='failed'?c.failed:value?.enabled?c.on:c.off}</p>
    {state==='ready'&&value&&<p className="text-sm text-gray-600">{c.version} {value.version} · {c.owner}: {value.ownerStaffId?(value.ownerStaffId===staffId?c.current:c.savedOwner):c.current}</p>}
    <p className="text-sm text-gray-600">{c.scope}</p><p className="text-xs text-gray-600">{c.boundary}</p>
    {error&&<p role="alert" className="break-words text-sm text-red-700">{error}</p>}{notice&&<p className="text-sm text-green-800">{notice}</p>}
    {pending&&<p className="text-sm text-amber-800">{c.unknown}</p>}
    <fieldset disabled={busy||!!pending||journalBlocked||state!=='ready'} className="min-w-0 space-y-3">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/><span>{c.consent}</span></label>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={!consent||!staffId||value?.enabled===true} onClick={()=>void save(true)}>{busy?c.saving:c.enable}</button><button type="button" className={button} disabled={!value?.enabled} onClick={()=>void save(false)}>{c.disable}</button></div>
    </fieldset>
    <button type="button" className={button} disabled={busy||state==='loading'} onClick={()=>void load(!!pending)}>{pending?c.check:c.refresh}</button>
  </section>
}
