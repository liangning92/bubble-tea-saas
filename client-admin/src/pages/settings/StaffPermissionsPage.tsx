import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, CheckCircle, History, Loader2, Plus, Save, Shield, Trash2, Users } from 'lucide-react'
import api from '../../services/api'
import { useAuthStore } from '../../stores/auth'

type BaseRole = 'manager' | 'cashier' | 'staff'
interface Role {id:string;name:string;description:string;baseRole:BaseRole;permissions:string[]}
interface Assignment {staffId:string;roleId:string;originalRole?:BaseRole}
interface Settings {
  revision:number;roles:Role[];assignments:Assignment[]
  catalog:Array<{key:string;group:string;roles:BaseRole[]}>
  templates:Array<{baseRole:BaseRole;permissions:string[]}>
  staff:Array<{id:string;name:string;employeeNumber:string;status:string;systemRole:string}>
  history:Array<{id:string;createdAt:string;actorName:string;revision:number;roleCount:number;assignmentCount:number}>
}
export function StaffPermissionsPage() {
  const {t,i18n}=useTranslation()
  const {user}=useAuthStore()
  const [data,setData]=useState<Settings|null>(null)
  const [selected,setSelected]=useState('')
  const [tab,setTab]=useState<'roles'|'employees'|'history'>('roles')
  const [busy,setBusy]=useState(false)
  const [dirty,setDirty]=useState(false)
  const [message,setMessage]=useState<{error:boolean;text:string}|null>(null)
  const [search,setSearch]=useState('')
  const allowed=user?.role==='admin'&&!!user.storeId

  const load=async()=>{
    if(!allowed)return
    setBusy(true);setMessage(null)
    try {
      const value=(await api.get('/staff-permissions')).data.data as Settings
      setData(value);setDirty(false);setSelected(current=>value.roles.some(r=>r.id===current)?current:value.roles[0]?.id||'')
    }catch{setMessage({error:true,text:t('staffAccess.loadFailed')})}
    finally{setBusy(false)}
  }
  useEffect(()=>{setData(null);void load()},[user?.id,user?.storeId,user?.role])
  const change=(value:Settings)=>{setData(value);setDirty(true);setMessage(null)}
  const updateRole=(patch:Partial<Role>)=>{if(data)change({...data,roles:data.roles.map(r=>r.id===selected?{...r,...patch}:r)})}
  const addRole=()=>{
    if(!data)return
    const id=crypto.randomUUID()
    change({...data,roles:[...data.roles,{id,name:'',description:'',baseRole:'cashier',permissions:[...(data.templates.find(p=>p.baseRole==='cashier')?.permissions||[])]}]})
    setSelected(id);setTab('roles')
  }
  const deleteRole=()=>{
    if(!data)return
    if(data.assignments.some(a=>a.roleId===selected)){setMessage({error:true,text:t('staffAccess.assignedDelete')});return}
    const roles=data.roles.filter(r=>r.id!==selected);change({...data,roles});setSelected(roles[0]?.id||'')
  }
  const save=async()=>{
    if(!data||busy||!allowed)return
    if(data.roles.some(r=>!r.name.trim())||new Set(data.roles.map(r=>r.name.trim().toLocaleLowerCase())).size!==data.roles.length){setMessage({error:true,text:t('staffAccess.nameInvalid')});return}
    setBusy(true);setMessage(null)
    try {
      await api.put('/staff-permissions',{revision:data.revision,roles:data.roles.map(r=>({...r,name:r.name.trim()})),assignments:data.assignments.map(({staffId,roleId})=>({staffId,roleId}))})
      const saved=(await api.get('/staff-permissions')).data.data as Settings
      setData(saved);setDirty(false);setMessage({error:false,text:t('staffAccess.saved')})
    }catch(error:any){setMessage({error:true,text:t(error?.response?.status===409?'staffAccess.conflict':'staffAccess.saveFailed')})}
    finally{setBusy(false)}
  }
  if(!allowed)return <div className="card max-w-6xl" role="alert">{t('staffAccess.adminOnly')}</div>
  if(!data)return <div className="card max-w-6xl">{busy?<p role="status" className="flex items-center gap-2"><Loader2 className="animate-spin text-primary"/>{t('common.loading')}</p>:<><p role="alert" className="text-red-600">{message?.text}</p><button className="btn-primary mt-4" onClick={()=>void load()}>{t('common.refresh')}</button></>}</div>
  const role=data.roles.find(r=>r.id===selected)
  const groups=[...new Set(data.catalog.map(p=>p.group))]
  return <section className="card max-w-6xl">
    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
      <div className="flex items-center gap-3"><div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center"><Shield className="text-primary" size={20}/></div><h2 className="text-lg font-semibold">{t('staffAccess.title')}</h2></div>
      <button className="btn-primary flex items-center gap-2" disabled={busy||!dirty} onClick={()=>void save()}>{busy?<Loader2 size={18} className="animate-spin"/>:<Save size={18}/>} {t('common.save')}</button>
    </div>
    <p className="text-sm text-gray-500 mb-5">{t('staffAccess.hint')}</p>
    {message&&<p role={message.error?'alert':'status'} className={`mb-4 rounded-lg px-3 py-2 flex items-start gap-2 text-sm ${message.error?'bg-red-50 text-red-700':'bg-green-50 text-green-700'}`}>{message.error?<AlertCircle size={18}/>:<CheckCircle size={18}/>} {message.text}</p>}
    <div className="flex flex-wrap gap-2 border-b pb-4 mb-5">
      {(['roles','employees','history'] as const).map(key=><button key={key} disabled={busy} onClick={()=>setTab(key)} aria-current={tab===key?'page':undefined} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${tab===key?'bg-primary text-white':'bg-gray-100 text-gray-600'}`}>{key==='roles'?<Shield size={16}/>:key==='employees'?<Users size={16}/>:<History size={16}/>} {t('staffAccess.'+key)}</button>)}
    </div>
    <fieldset disabled={busy}>
      {tab==='roles'&&<div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
        <div className="space-y-3">
          <button className="w-full py-2 border border-primary text-primary rounded-lg flex items-center justify-center gap-2" onClick={addRole}><Plus size={18}/>{t('staffAccess.addRole')}</button>
          {data.roles.map(item=><button key={item.id} onClick={()=>setSelected(item.id)} className={`w-full text-left p-3 rounded-xl border ${selected===item.id?'border-primary bg-primary/5':'border-gray-200'}`}><span className="block font-medium">{item.name||t('staffAccess.unnamed')}</span><span className="block text-xs text-gray-500 mt-1">{t('staffAccess.assignedCount',{count:data.assignments.filter(a=>a.roleId===item.id).length})}</span></button>)}
        </div>
        {role?<div className="space-y-5 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-sm font-medium text-gray-700">{t('staffAccess.roleName')} *<input className="input mt-2" maxLength={60} value={role.name} onChange={e=>updateRole({name:e.target.value})}/></label>
            <label className="text-sm font-medium text-gray-700">{t('staffAccess.template')}<select aria-label={t('staffAccess.template')} className="input mt-2" value={role.baseRole} onChange={e=>{const baseRole=e.target.value as BaseRole;updateRole({baseRole,permissions:[...(data.templates.find(p=>p.baseRole===baseRole)?.permissions||[])]})}}>{(['manager','cashier','staff'] as const).map(key=><option key={key} value={key}>{t('staffAccess.base.'+key)}</option>)}</select></label>
          </div>
          <label className="block text-sm font-medium text-gray-700">{t('staffAccess.description')}<textarea className="input mt-2" rows={2} maxLength={300} value={role.description} onChange={e=>updateRole({description:e.target.value})}/></label>
          <p className="text-sm text-gray-500">{t('staffAccess.ceiling')}</p>
          {groups.map(group=>{const permissions=data.catalog.filter(p=>p.group===group&&p.roles.includes(role.baseRole));if(!permissions.length)return null;return <fieldset key={group} className="rounded-xl border border-gray-200 px-4 pb-4"><legend className="px-2 text-sm font-semibold">{t('staffAccess.groups.'+group)}</legend><div className="flex justify-end mb-3"><button className="text-xs text-primary" onClick={()=>{const keys=permissions.map(p=>p.key),all=keys.every(p=>role.permissions.includes(p));updateRole({permissions:all?role.permissions.filter(p=>!keys.includes(p)):[...new Set([...role.permissions,...keys])]})}}>{t(permissions.every(p=>role.permissions.includes(p.key))?'staffAccess.clearGroup':'staffAccess.selectGroup')}</button></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{permissions.map(permission=><label key={permission.key} className="flex items-center gap-3 text-sm text-gray-700"><input className="w-4 h-4 accent-primary" type="checkbox" checked={role.permissions.includes(permission.key)} onChange={e=>updateRole({permissions:e.target.checked?[...role.permissions,permission.key]:role.permissions.filter(p=>p!==permission.key)})}/>{t('staffAccess.permissions.'+permission.key)}</label>)}</div></fieldset>})}
          <div className="flex justify-end"><button className="text-red-600 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2 text-sm" onClick={deleteRole}><Trash2 size={16}/>{t('common.delete')}</button></div>
        </div>:<p className="text-gray-500 py-12 text-center">{t('staffAccess.empty')}</p>}
      </div>}
      {tab==='employees'&&<div>
        <label className="sr-only" htmlFor="permissions-search">{t('staffAccess.search')}</label><input id="permissions-search" className="input mb-4" placeholder={t('staffAccess.search')} value={search} onChange={e=>setSearch(e.target.value)}/>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-gray-500"><th className="py-3">{t('staffAccess.employee')}</th><th className="py-3">{t('staffAccess.role')}</th></tr></thead><tbody>{data.staff.filter(s=>(s.name+' '+s.employeeNumber).toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(staff=><tr key={staff.id} className="border-b last:border-0"><td className="py-3 pr-4"><p className="font-medium">{staff.name}</p><p className="text-xs text-gray-500">{staff.employeeNumber}</p></td><td className="py-3">{staff.systemRole==='admin'?<span className="text-gray-500">{t('staffAccess.owner')}</span>:<select aria-label={t('staffAccess.employeeRole',{name:staff.name})} className="input max-w-sm" value={data.assignments.find(a=>a.staffId===staff.id)?.roleId||''} onChange={e=>change({...data,assignments:[...data.assignments.filter(a=>a.staffId!==staff.id),...(e.target.value?[{staffId:staff.id,roleId:e.target.value}]:[])]})}><option value="">{t('staffAccess.systemDefault')}</option>{data.roles.map(r=><option key={r.id} value={r.id} disabled={staff.status!=='active'}>{r.name||t('staffAccess.unnamed')}</option>)}</select>}</td></tr>)}</tbody></table></div>
      </div>}
      {tab==='history'&&<div className="space-y-3">{data.history.length?data.history.map(entry=><div key={entry.id} className="rounded-xl bg-gray-50 p-4 text-sm"><p className="font-medium">{t('staffAccess.revision',{revision:entry.revision})} · {entry.actorName||t('staffAccess.owner')}</p><p className="text-gray-500 mt-1">{new Date(entry.createdAt).toLocaleString(i18n.language,{timeZone:'Asia/Jakarta'})} · {t('staffAccess.historyCount',{roles:entry.roleCount,employees:entry.assignmentCount})}</p></div>):<p className="text-gray-500 py-8 text-center">{t('staffAccess.noHistory')}</p>}</div>}
    </fieldset>
  </section>
}
