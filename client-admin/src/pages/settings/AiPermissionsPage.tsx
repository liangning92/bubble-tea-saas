import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, CheckCircle, Loader2, Shield } from 'lucide-react'
import api from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { PageHelp } from '../../components/PageHelp'

type Decision = 'deny' | 'approval' | 'automatic'
interface Policy {
  executionEnabled: false
  read: { sales: boolean; inventory: boolean }
  actions: { refund: Decision; purchase: Decision; price: Decision }
}

export function AiPermissionsPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const allowed = user?.role === 'admin' && !!user.storeId

  const load = async () => {
    if (!allowed) return
    setBusy(true)
    setMessage(null)
    try {
      setPolicy((await api.get(`/ai/permissions/${user!.storeId}`)).data.data)
    } catch {
      setMessage({ error: true, text: t('common.error') })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    setPolicy(null)
    void load()
  }, [user?.id, user?.storeId, user?.role])

  const save = async () => {
    if (!allowed || !policy || busy) return
    setBusy(true)
    setMessage(null)
    try {
      await api.put(`/ai/permissions/${user!.storeId}`, policy)
      setPolicy((await api.get(`/ai/permissions/${user!.storeId}`)).data.data)
      setMessage({ error: false, text: t('aiPermissions.saved') })
    } catch {
      setMessage({ error: true, text: t('common.error') })
    } finally {
      setBusy(false)
    }
  }

  if (!allowed) return <div className="card max-w-4xl" role="alert">{t('aiPermissions.denied')}</div>

  return (
    <section className="card max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center"><Shield className="text-primary" size={20} /></div>
        <h2 className="text-lg font-semibold">{t('aiPermissions.title')}</h2>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6">
        <p className="flex items-start gap-2 text-sm text-amber-800"><AlertCircle size={18} className="shrink-0 mt-0.5" />{t('aiPermissions.disabled')}</p>
        <div className="mt-2"><PageHelp><p>{t('aiPermissions.draft')}</p></PageHelp></div>
      </div>
      {!policy && busy && <div className="flex justify-center py-8" role="status"><Loader2 className="animate-spin text-primary" /><span className="sr-only">{t('common.loading')}</span></div>}
      {policy && <div className="space-y-6">
        <fieldset disabled={busy} className="rounded-xl border border-gray-200 p-4">
          <legend className="px-2 text-sm font-semibold text-gray-900">{t('aiPermissions.readScope')}</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['sales', 'inventory'] as const).map(key => <label key={key} className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3 text-sm">
              <input type="checkbox" className="w-4 h-4 accent-primary" checked={policy.read[key]} onChange={e => setPolicy({ ...policy, read: { ...policy.read, [key]: e.target.checked } })} />
              {t(`aiPermissions.${key}`)}
            </label>)}
          </div>
        </fieldset>
        <fieldset disabled={busy} className="rounded-xl border border-gray-200 p-4">
          <legend className="px-2 text-sm font-semibold text-gray-900">{t('aiPermissions.actions')}</legend>
          <div className="space-y-4">
            {(['refund', 'purchase', 'price'] as const).map(key => <label key={key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
              <span className="font-medium text-gray-700">{t(`aiPermissions.${key}`)}</span>
              <select className="input sm:max-w-xs" value={policy.actions[key]} onChange={e => setPolicy({ ...policy, actions: { ...policy.actions, [key]: e.target.value as Decision } })}>
                {(['deny', 'approval', 'automatic'] as const).map(value => <option key={value} value={value}>{t(`aiPermissions.${value}`)}</option>)}
              </select>
            </label>)}
          </div>
        </fieldset>
      </div>}
      {message && <p role={message.error ? 'alert' : 'status'} className={`mt-4 flex items-start gap-2 text-sm ${message.error ? 'text-red-600' : 'text-green-700'}`}>
        {message.error ? <AlertCircle size={18} className="shrink-0" /> : <CheckCircle size={18} className="shrink-0" />}{message.text}
      </p>}
      <div className="mt-6 pt-6 border-t border-gray-200 flex justify-end">
        {policy ? <button className="btn-primary flex items-center gap-2" disabled={busy} onClick={() => void save()}>
          {busy && <Loader2 size={18} className="animate-spin" />}{t('common.save')}
        </button> : !busy && <button className="btn-primary" onClick={() => void load()}>{t('common.refresh')}</button>}
      </div>
    </section>
  )
}
