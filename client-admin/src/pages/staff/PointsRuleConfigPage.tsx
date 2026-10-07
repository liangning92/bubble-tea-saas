import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, Save } from 'lucide-react'
import { staffPointsApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { DashboardReadFailure } from '../../components/DashboardReadState'

interface StaffPointRule {
  perfectAttendancePoints: number
  goodPerformancePoints: number
  completedTrainingPoints: number
  holidayWorkPoints: number
  overtimePerHourPoints: number
  isActive: boolean
}
const fields = [
  ['perfectAttendancePoints', 'staff.perfectAttendance'],
  ['goodPerformancePoints', 'staff.goodPerformance'],
  ['completedTrainingPoints', 'staff.trainingCompleted'],
  ['holidayWorkPoints', 'staff.holidayWork'],
  ['overtimePerHourPoints', 'staffPointSettings.overtimePerHour'],
] as const

export function PointsRuleConfigPage() {
  const { t } = useTranslation()
  const storeId = useAuthStore(state => state.user?.storeId)
  const [rule, setRule] = useState<StaffPointRule | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const loadRule = async () => {
    setBusy(true)
    try {
      const response = await staffPointsApi.getRules()
      setRule(response.data.data)
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => { void loadRule() }, [storeId])
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!rule || busy || fields.some(([key]) => !Number.isSafeInteger(rule[key]) || rule[key] < 0)) return
    setBusy(true)
    setMessage('')
    try {
      await staffPointsApi.saveRules(rule)
      setMessage(t('common.success'))
    } catch {
      setMessage(t('common.saveFailed'))
    } finally {
      setBusy(false)
    }
  }
  if (failed) return <DashboardReadFailure retry={loadRule} />
  if (!rule) return <p>{t('common.loading')}</p>
  return <section className="p-6 max-w-2xl">
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold">{t('staff.pointsRuleConfig')}</h1>
      <button type="button" onClick={() => void loadRule()} disabled={busy} className="btn-secondary flex items-center gap-2"><RefreshCw size={18} />{t('common.reload')}</button>
    </div>
    <form onSubmit={save} className="card p-6 space-y-4">
      {fields.map(([key, label]) => <div key={key}>
        <label htmlFor={key} className="block font-medium mb-1">{t(label)}</label>
        <input id={key} type="number" min={0} step={1} required disabled={busy} value={rule[key]} onChange={event => setRule({ ...rule, [key]: Number(event.target.value) })} className="input w-full" />
      </div>)}
      <label className="flex items-center gap-2"><input type="checkbox" checked={rule.isActive} disabled={busy} onChange={event => setRule({ ...rule, isActive: event.target.checked })} />{t('common.active')}</label>
      {message && <p role="status">{message}</p>}
      <button type="submit" disabled={busy} className="btn-primary flex items-center gap-2"><Save size={18} />{t('common.save')}</button>
    </form>
  </section>
}
