import { useEffect, useState } from 'react'
import type { TeamClient } from '../../../../shared/TeamCommunication'

/** Optional workbench transport to the SAME Hermes, not another business role. */
export function StoreOperationsDelegation({client,language}:{client:Pick<TeamClient,'request'|'current'>;language:string}) {
 const l=(zh:string,id:string,en:string)=>language.startsWith('zh')?zh:language.startsWith('id')?id:en
 const [state,setState]=useState<any>(null),[confirmed,setConfirmed]=useState(false),[credential,setCredential]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const load=async()=>{
  try{
   const next=await client.request('get','/team/ai/operations-delegations')
   if(!next||!Array.isArray(next.delegations)||typeof next.canDelegate!=='boolean')throw Error('CONNECTION_STATE_INVALID')
   if(client.current()){setState(next);setError('')}
  }catch{
   if(client.current()){setState(null);setError(l('连接状态读取失败，请刷新；不会沿用旧状态创建凭据。','Gagal membaca status koneksi. Muat ulang; status lama tidak dipakai untuk membuat kredensial.','Could not read connection status. Refresh; stale state cannot create a credential.'))}
  }
 }
 useEffect(()=>{void load()},[client])
 const create=async()=>{
  if(!state?.canDelegate||!confirmed)return
  setBusy(true);setError('')
  try{
   const result:any=await client.request('post','/team/ai/operations-delegations',{activityIds:[],expiresAt:null,confirm:'full_store_operations_role'})
   if(client.current()){setCredential(result.credential);setConfirmed(false);await load()}
  }catch{setError(l('连接未保存，请刷新检查当前账户和 Hermes 状态。','Koneksi belum tersimpan. Muat ulang untuk memeriksa akun dan Hermes.','Connection was not saved. Refresh and check the current account and Hermes.'))}
  finally{setBusy(false)}
 }
 const revoke=async(id:string)=>{
  setBusy(true)
  try{await client.request('post','/team/ai/operations-delegations/'+id+'/revoke',{});await load()}
  catch{setError(l('撤销失败，请刷新核对。','Gagal mencabut. Muat ulang dan periksa.','Could not revoke. Refresh and check.'))}
  finally{setBusy(false)}
 }
 return <section className="card space-y-4" data-testid="hermes-workbench-connection" aria-label={l('同一 Hermes 的工作台连接','Koneksi workbench ke Hermes yang sama','Workbench connection to the same Hermes')}>
  <h3 className="font-semibold">{l('工作台连接 · 同一个 Hermes','Koneksi workbench · Hermes yang sama','Workbench connection · Same Hermes')}</h3>
  <p className="text-sm text-gray-600">{l('门店内置聊天直接使用上方 Hermes。此处仅供外部工作台连接同一个 Hermes、派发任务和读取执行回执，不再选择活动或逐项开通业务工具。执行权限来自当前真实账户，员工不会获得管理员权限。','Percakapan toko langsung memakai Hermes di atas. Koneksi ini hanya untuk workbench eksternal yang mengirim tugas dan membaca bukti eksekusi dari Hermes yang sama. Tidak perlu memilih promo atau mengaktifkan alat satu per satu. Izin mengikuti akun sebenarnya; pegawai tidak memperoleh izin admin.','Store chat uses Hermes above directly. This optional connection lets an external workbench assign tasks and read receipts from the same Hermes. No activity selection or per-tool activation. Real account permissions apply; employees do not gain administrator rights.')}</p>
  <button type="button" className="rounded border px-3 py-2 text-sm" onClick={()=>void load()}>{l('刷新连接状态','Muat ulang status koneksi','Refresh connection status')}</button>
  {error&&<p role="alert" className="text-sm text-amber-700">{error}</p>}
  {state&&<>
   {!state.canDelegate&&<p className="text-sm text-amber-700">{l('Hermes 尚未启用；已有连接仍可撤销。','Hermes belum diaktifkan. Koneksi lama tetap dapat dicabut.','Hermes is not enabled. Existing connections can still be revoked.')}</p>}
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>{l('允许工作台以我的账户向同一个 Hermes 派工，连接持续有效、可随时撤销。付款、超预算和员工处罚仍需店主批准。','Izinkan workbench mengirim tugas ke Hermes yang sama melalui akun saya. Koneksi berlaku sampai dicabut. Pembayaran, biaya di luar anggaran, dan sanksi tetap memerlukan persetujuan pemilik.','Allow the workbench to assign tasks to the same Hermes through my account until revoked. Payments, over-budget spending and penalties still require owner approval.')}</span></label>
   <button type="button" className="rounded bg-primary px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy||!confirmed||!state.canDelegate} onClick={()=>void create()}>{l('创建工作台连接凭据','Buat kredensial koneksi workbench','Create workbench connection credential')}</button>
   {credential&&<div className="space-y-2 rounded border p-3">
    <p className="text-sm">{l('仅本次显示。安全保存在工作台连接处，不发送给员工或公开渠道。','Hanya ditampilkan sekali. Simpan di koneksi workbench; jangan kirim ke pegawai atau kanal publik.','Shown once. Save securely in the workbench connection; do not send to staff or public channels.')}</p>
    <textarea readOnly aria-label={l('工作台连接凭据','Kredensial workbench','Workbench credential')} value={credential} className="w-full break-all rounded border p-2 font-mono text-xs" rows={3}/>
    <button type="button" className="rounded border px-3 py-2 text-sm" onClick={()=>setCredential('')}>{l('隐藏凭据','Sembunyikan','Hide credential')}</button>
   </div>}
   {state.delegations.map((d:any)=><div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm"><span>{d.id.slice(0,8)} · {d.revoked?l('已撤销','dicabut','revoked'):d.expiresAt?new Date(d.expiresAt).toLocaleString():l('持续有效，可撤销','berlaku sampai dicabut','until revoked')}</span><button type="button" disabled={busy||d.revoked} onClick={()=>void revoke(d.id)} className="rounded border px-3 py-2 disabled:opacity-50">{l('撤销','Cabut','Revoke')}</button></div>)}
  </>}
 </section>
}
