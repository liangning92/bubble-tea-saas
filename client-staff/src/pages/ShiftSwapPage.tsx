import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { ArrowLeft, Calendar, Send, CheckCircle } from 'lucide-react'

interface ShiftSwapRequest {
  id: string
  originalDate: string
  originalShift: string
  targetDate: string
  targetShift: string
  reason?: string
  status: 'pending' | 'approved' | 'rejected'
  adminNote?: string
  createdAt: string
}

export function ShiftSwapPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [requests, setRequests] = useState<ShiftSwapRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    originalDate: '',
    originalShift: 'morning',
    targetDate: '',
    targetShift: 'morning',
    reason: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const response = await staffApi.getMyShiftSwaps()
      if (response.data) {
        setRequests(response.data)
      }
    } catch (error) {
      console.error('Failed to load shift swaps:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  const handleSubmit = async () => {
    if (!formData.originalDate || !formData.targetDate) return

    setIsSubmitting(true)
    try {
      const response = await staffApi.createShiftSwap(formData)
      if (response.code === 201 || response.code === 200) {
        setSubmitSuccess(true)
        setFormData({ originalDate: '', originalShift: 'morning', targetDate: '', targetShift: 'morning', reason: '' })
        setShowForm(false)
        loadData()
        setTimeout(() => setSubmitSuccess(false), 2000)
      } else {
        alert(response.message || 'Failed to submit shift swap')
      }
    } catch (error: any) {
      console.error('Failed to submit shift swap:', error)
      alert(error?.response?.data?.message || 'Failed to submit shift swap')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: t('attendance.pending') || 'Pending' },
      approved: { bg: 'bg-green-100', text: 'text-green-700', label: t('attendance.approved') || 'Approved' },
      rejected: { bg: 'bg-red-100', text: 'text-red-700', label: t('attendance.rejected') || 'Rejected' }
    }
    const badge = badges[status] || badges.pending
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    )
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold">{t('shiftSwap.title') || '调班申请'}</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="p-4">
        {/* New Request Button */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full py-4 bg-primary text-white rounded-xl font-medium mb-4 flex items-center justify-center gap-2"
          >
            <Calendar size={20} />
            {t('shiftSwap.newRequest') || '申请调班'}
          </button>
        )}

        {/* Request Form */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <h2 className="font-semibold mb-4">{t('shiftSwap.fillForm') || '填写调班申请'}</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('shiftSwap.originalDate') || '原排班日期'}
                  </label>
                  <input
                    type="date"
                    value={formData.originalDate}
                    onChange={(e) => setFormData({ ...formData, originalDate: e.target.value })}
                    className="w-full p-3 border border-gray-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('shiftSwap.originalShift') || '原班次'}
                  </label>
                  <select
                    value={formData.originalShift}
                    onChange={(e) => setFormData({ ...formData, originalShift: e.target.value })}
                    className="w-full p-3 border border-gray-200 rounded-xl"
                  >
                    <option value="morning">{t('schedule.morning') || '早班'}</option>
                    <option value="afternoon">{t('schedule.afternoon') || '中班'}</option>
                    <option value="evening">{t('schedule.evening') || '晚班'}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('shiftSwap.targetDate') || '目标日期'}
                  </label>
                  <input
                    type="date"
                    value={formData.targetDate}
                    onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                    className="w-full p-3 border border-gray-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('shiftSwap.targetShift') || '目标班次'}
                  </label>
                  <select
                    value={formData.targetShift}
                    onChange={(e) => setFormData({ ...formData, targetShift: e.target.value })}
                    className="w-full p-3 border border-gray-200 rounded-xl"
                  >
                    <option value="morning">{t('schedule.morning') || '早班'}</option>
                    <option value="afternoon">{t('schedule.afternoon') || '中班'}</option>
                    <option value="evening">{t('schedule.evening') || '晚班'}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('shiftSwap.reason') || '调班原因'}
                </label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder={t('shiftSwap.reasonPlaceholder') || '请说明调班原因...'}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  rows={3}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !formData.originalDate || !formData.targetDate}
                  className="flex-1 py-3 bg-primary text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span className="animate-spin">{t('common.loading')}</span>
                  ) : (
                    <>
                      <Send size={18} />
                      {t('shiftSwap.submit') || '提交'}
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
            <h2 className="font-semibold">{t('shiftSwap.history') || '申请记录'}</h2>
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
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium">{formatDate(req.originalDate)} → {formatDate(req.targetDate)}</p>
                      <p className="text-xs text-gray-500">
                        {req.originalShift} → {req.targetShift}
                      </p>
                    </div>
                    {getStatusBadge(req.status)}
                  </div>
                  {req.reason && <p className="text-sm text-gray-600 mb-1">{req.reason}</p>}
                  {req.adminNote && (
                    <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                      {t('shiftSwap.adminNote') || '管理员备注'}: {req.adminNote}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Success Toast */}
      {submitSuccess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 mx-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">{t('shiftSwap.submitSuccess') || '提交成功'}</h2>
            <p className="text-gray-500">{t('shiftSwap.submitSuccessDesc') || '管理员会尽快处理您的申请'}</p>
          </div>
        </div>
      )}
    </div>
  )
}