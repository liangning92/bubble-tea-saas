import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../services/api'

type Session = {status:string;updatedAt:string;openFloat:number;actualCash:number|null}
type Receipts = {cash:number;qris:number;shopeefood:number;gofood:number}
export function ShiftCorrection({id,session,receipts,refresh}:{id:string;session:Session;receipts:Receipts|null;refresh:()=>Promise<unknown>}) {
  const {t} = useTranslation()
  const [editing,setEditing] = useState(false)
  const [values,setValues] = useState({actualCash:'',qris:'',shopeefood:'',gofood:'',reason:''})
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const fields = ['actualCash','qris','shopeefood','gofood'] as const
  const labels = {actualCash:'shiftReview.counted',qris:'manualReceipts.qris',shopeefood:'manualReceipts.shopeefood',gofood:'manualReceipts.gofood'}
  return <section className="rounded-xl border bg-white p-4" data-testid="shift-correction">
    <button className="btn-secondary" disabled={saving} onClick={()=>{setEditing(!editing);setError('');setValues({actualCash:session.actualCash === null ? '' : String(session.actualCash),qris:receipts ? String(receipts.qris) : '',shopeefood:receipts ? String(receipts.shopeefood) : '',gofood:receipts ? String(receipts.gofood) : '',reason:''})}}>{t('shiftCorrection.title')}</button>
    {editing && <form className="mt-3 space-y-3" onSubmit={async e=>{
      e.preventDefault()
      if(saving)return
      if(!values.reason.trim() || fields.some(key=>!/^\d+$/.test(values[key]) || Number(values[key])>2147483647)){setError(t('shiftCorrection.invalid'));return}
      setSaving(true);setError('')
      try {await api.put('/finance/shift-sessions/'+id+'/correction',{updatedAt:session.updatedAt,reason:values.reason.trim(),manualReceipts:{cash:Number(values.actualCash),qris:Number(values.qris),shopeefood:Number(values.shopeefood),gofood:Number(values.gofood)}});await refresh();setEditing(false)}
      catch{setError(t('shiftCorrection.failed'))}finally{setSaving(false)}
    }}>
      <p className="text-sm text-gray-500">{t('shiftCorrection.hint')}</p>
      <div className="grid grid-cols-2 gap-3">{fields.map(key=><label key={key} className="text-sm">{t(labels[key])}<input required type="text" inputMode="numeric" value={values[key]} onChange={e=>setValues({...values,[key]:e.target.value})} className="input mt-1 block w-full" /></label>)}</div>
      <label className="block text-sm">{t('shiftCorrection.reason')}<textarea required maxLength={2000} value={values.reason} onChange={e=>setValues({...values,reason:e.target.value})} className="input mt-1 block w-full" /></label>
      <button disabled={saving} className="btn-primary" type="submit">{t('common.save')}</button>
    </form>}
    {error && <p role="alert" className="mt-2 text-red-600">{error}</p>}
  </section>
}
