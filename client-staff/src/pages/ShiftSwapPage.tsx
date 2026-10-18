import { ShiftSwapProgress } from '../../../shared/ShiftSwapProgress'
import { useDialogs } from '../components/Dialogs'
import { LocalizedDateTimeInput } from '../../../shared/components/LocalizedDateTimeInput'
import { useSessionDraft } from '../utils/useSessionDraft'
import { businessDate, businessWeekStart } from '../utils/businessDate'
import { LoadFailure } from '../components/LoadFailure'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { Calendar, Send } from 'lucide-react'
import { formatDate } from '../utils/helpers'

interface ShiftSwapRequest {
  id: string
  staffId: string
  targetStaffId?: string
  targetConfirmed: boolean
  staff?: { name: string }
  targetStaff?: { name: string }
  originalDate: string
  originalShift: string
  targetDate: string
  targetShift: string
  reason?: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'peer_rejected'
  adminNote?: string
  updatedAt: string
  createdAt: string
}

export function ShiftSwapPage() {
  const dialogs = useDialogs()

  const { t } = useTranslation()
  const { user } = useAuthStore()

  const [pending, setPending] = useState<ShiftSwapRequest[]>([])
  const [confirming, setConfirming] = useState<string | null>(null)
  const [requests, setRequests] = useState<ShiftSwapRequest[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId,setEditingId]=useState<string|null>(null)
  const [editingVersion,setEditingVersion]=useState<string>('')
  const [formData, setFormData] = useSessionDraft('ShiftSwapPage.tsx', {
    originalDate: '',
    originalShift: '',
    targetStaffId: '',
    targetDate: '',
    targetShift: '',
    reason: ''
  })
  const [colleagues, setColleagues] = useState<Array<{ id: string; name: string; employeeNumber: string }>>([])
  const [shifts, setShifts] = useState<Array<{ key: string; name: string; startTime: string; endTime: string }>>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const loadData = async (quiet = false) => {
    if (!quiet) setIsLoading(true)
    if (!quiet) setLoadFailed(false)
    try {
      const [response, invitations, schedule, people] = await Promise.all([staffApi.getMyShiftSwaps(), staffApi.getPendingShiftSwaps(), staffApi.getMySchedule(user!.staffId, businessDate(businessWeekStart(new Date()))), staffApi.getSwapColleagues()])
      setColleagues(people.data || [])
      setPending(invitations.data || [])
      setShifts(schedule.data?.shiftDetails || [])
      if (response.data) {
        setRequests(response.data)
      }
    } catch (error) {
      if (!quiet) setLoadFailed(true)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    const refresh = () => { if (document.visibilityState === 'visible') void loadData(true) }
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    window.addEventListener('shift-swap-updated', refresh)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('shift-swap-updated', refresh) }
  }, [user])

  const handleSubmit = async () => {
    if (isSubmitting) return
    if (!formData.targetStaffId || !formData.originalDate || !formData.targetDate || !formData.originalShift || !formData.targetShift) { await dialogs.alert(t('ui.completeFields')); return }

    setIsSubmitting(true)
    try {
      const response = editingId?await staffApi.editRequest('shift-swap',editingId,{...formData,expectedVersion:editingVersion}):await staffApi.createShiftSwap(formData)
      if (response.code === 201 || response.code === 200) {
        setSubmitSuccess(true)
        setFormData({ targetStaffId: '', originalDate: '', originalShift: '', targetDate: '', targetShift: '', reason: '' })
        setShowForm(false)
        setEditingId(null)
        loadData()
        setTimeout(() => setSubmitSuccess(false), 2000)
      } else {
        await dialogs.alert(response.message || t('shiftSwap.submitFailed'))
      }
    } catch (error: any) {
      console.error('Failed to submit shift swap:', error)
      await dialogs.alert(error?.response?.data?.message || t('shiftSwap.submitFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      peer_rejected: { bg: 'bg-red-100', text: 'text-red-700', label: t('swapFlow.peer_rejected') },
      cancelled:{bg:'bg-gray-100',text:'text-gray-500',label:t('entryFix.cancelled')},
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: t('attendance.pending') },
      approved: { bg: 'bg-green-100', text: 'text-green-700', label: t('attendance.approved') },
      rejected: { bg: 'bg-red-100', text: 'text-red-700', label: t('attendance.rejected') }
    }
    const badge = badges[status] || badges.pending
    return (
      <span className={`px-2 py-1 rounded-full text-sm font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    )
  }

  if (loadFailed) return <LoadFailure retry={loadData} />

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-bold">{t('shiftSwap.title')}</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="p-4 max-w-3xl mx-auto">
        {!!pending.length && <section className="bg-white border rounded-xl p-4 mb-4 space-y-3">
          <h2 className="font-semibold">{t('workspace.swapConfirm')}</h2>
          <p className="text-sm text-gray-500">{t('audit.swapHint')}</p>
          {pending.map(req => <div key={req.id} className="border-t pt-3 space-y-2">
            <p>{formatDate(req.originalDate)} · {shifts.find(s => s.key === req.originalShift)?.name || req.originalShift} → {formatDate(req.targetDate)} · {shifts.find(s => s.key === req.targetShift)?.name || req.targetShift}</p>
            {req.reason && <p>{req.reason}</p>}
            <p className="text-sm text-gray-600">{req.staff?.name}</p>
            <div className="flex flex-wrap gap-3">{[true, false].map(agree => <button key={String(agree)} disabled={!!confirming} className="bg-primary text-white p-3 rounded-lg disabled:opacity-50" onClick={async () => {
              if (confirming || !await dialogs.confirm(t('audit.swapHint'))) return
              setConfirming(req.id)
              try { await staffApi.confirmShiftSwap(req.id, agree, req.updatedAt); await loadData() }
              catch { await dialogs.alert(t('common.error')) }
              finally { setConfirming(null) }
            }}>{confirming === req.id ? t('common.submitting') : t(agree ? 'swapFlow.agree' : 'swapFlow.disagree')}</button>)}</div>
          </div>)}
        </section>}
        {/* New Request Button */}
        {!showForm && (
          <button
            onClick={() => {setEditingId(null);setShowForm(true)}}
            className="w-full py-4 bg-primary text-white rounded-xl font-medium mb-4 flex items-center justify-center gap-2"
          >
            <Calendar size={20} />
            {t('shiftSwap.newRequest')}
          </button>
        )}

        {/* Request Form */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <h2 className="font-semibold mb-4">{t('shiftSwap.fillForm')}</h2>

            <p className="text-sm text-gray-500 mb-4">{t('swapFlow.adminHint')}</p>
            <div className="space-y-4">
              <label className="block font-medium">{t('swapFlow.colleague')}
                <select aria-label={t('swapFlow.colleague')} value={formData.targetStaffId || ''} onChange={e => setFormData({ ...formData, targetStaffId: e.target.value })} className="w-full p-3 mt-1 border border-gray-200 rounded-xl">
                  <option value="">{t('swapFlow.chooseColleague')}</option>
                  {colleagues.map(person => <option key={person.id} value={person.id}>{person.name} · #{person.employeeNumber}</option>)}
                </select>
                {!colleagues.length && <span className="block text-sm text-gray-500 mt-1">{t('swapFlow.noColleagues')}</span>}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">
                    {t('shiftSwap.originalDate')}
                  </label>
                  <LocalizedDateTimeInput
                    type="date"
                    value={formData.originalDate}
                    onChange={(e) => setFormData({ ...formData, originalDate: e.target.value })}
                    className="w-full p-3 border border-gray-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">
                    {t('shiftSwap.originalShift')}
                  </label>
                  <select
                    value={formData.originalShift}
                    onChange={(e) => setFormData({ ...formData, originalShift: e.target.value })}
                    className="w-full p-3 border border-gray-200 rounded-xl"
                  >
                    <option value="">{t('shiftSwap.chooseShift')}</option>
                    {shifts.map(shift => <option key={shift.key} value={shift.key}>{shift.name} · {shift.startTime}–{shift.endTime}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">
                    {t('shiftSwap.targetDate')}
                  </label>
                  <LocalizedDateTimeInput
                    type="date"
                    value={formData.targetDate}
                    onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                    className="w-full p-3 border border-gray-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">
                    {t('shiftSwap.targetShift')}
                  </label>
                  <select
                    value={formData.targetShift}
                    onChange={(e) => setFormData({ ...formData, targetShift: e.target.value })}
                    className="w-full p-3 border border-gray-200 rounded-xl"
                  >
                    <option value="">{t('shiftSwap.chooseShift')}</option>
                    {shifts.map(shift => <option key={shift.key} value={shift.key}>{shift.name} · {shift.startTime}–{shift.endTime}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 mb-1">
                  {t('shiftSwap.reason')}
                </label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder={t('shiftSwap.reasonPlaceholder')}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  rows={3}
                />
              </div>

              <div className="flex gap-3">
                <button
                  disabled={isSubmitting} onClick={() => setShowForm(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !formData.targetStaffId || !formData.originalDate || !formData.targetDate || !formData.originalShift || !formData.targetShift}
                  className="flex-1 py-3 bg-primary text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span className="animate-spin">{t('common.loading')}</span>
                  ) : (
                    <>
                      <Send size={18} />
                      {t('shiftSwap.submit')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Request History */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold">{t('shiftSwap.history')}</h2>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-gray-500">
              <Calendar size={32} className="mx-auto mb-2 opacity-50 animate-spin" />
            </div>
          ) : requests.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Calendar size={32} className="mx-auto mb-2 opacity-50" />
              <p>{t('common.noData')}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {requests.map((req) => (
                <div key={req.id} className="p-4">
                  {req.status==='pending'&&req.staffId===user?.staffId&&<div className="flex justify-end gap-4 text-sm mb-2"><button disabled={isSubmitting} onClick={()=>{setEditingId(req.id);setEditingVersion(req.updatedAt);setFormData({targetStaffId:req.targetStaffId||'',originalDate:req.originalDate.slice(0,10),originalShift:req.originalShift,targetDate:req.targetDate.slice(0,10),targetShift:req.targetShift,reason:req.reason||''});setShowForm(true)}}>{t('entryFix.edit')}</button><button disabled={isSubmitting} onClick={async()=>{if(!await dialogs.confirm(t('entryFix.withdrawHint')))return;setIsSubmitting(true);try{await staffApi.withdrawRequest('shift-swap',req.id);await loadData()}catch(e:any){await dialogs.alert(e.response?.data?.message||t('entryFix.error'))}finally{setIsSubmitting(false)}}}>{t('entryFix.withdraw')}</button></div>}

                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-medium">{formatDate(req.originalDate)} → {formatDate(req.targetDate)}</p>
                      <p className="text-sm text-gray-500">
                        {shifts.find(s => s.key === req.originalShift)?.name || req.originalShift} → {shifts.find(s => s.key === req.targetShift)?.name || req.targetShift}
                      </p>
                    </div>
                    {getStatusBadge(req.status)}
                  </div>
                  <p className="text-sm text-gray-500">{t(req.staffId === user?.staffId ? 'swapFlow.mine' : 'swapFlow.incoming')} · {req.staff?.name} ↔ {req.targetStaff?.name || '—'}</p>
                  <ShiftSwapProgress request={req} />
                  {!req.targetStaffId && req.status === 'pending' && <p className="text-sm text-amber-700">{t('swapFlow.legacy')}</p>}
                  {req.reason && <p className="text-base text-gray-600 mb-1">{req.reason}</p>}
                  {req.adminNote && (
                    <p className="text-sm text-gray-500 bg-gray-50 p-2 rounded">
                      {t('shiftSwap.adminNote')}: {req.adminNote}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {submitSuccess && <div role="status" className="employee-success-toast">{t('shiftSwap.submitSuccess')} · {t('swapFlow.success')}</div>}
    </div>
  )
}