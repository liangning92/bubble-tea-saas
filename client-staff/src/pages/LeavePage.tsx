import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { Calendar, Plus, Clock, XCircle, Paperclip, Trash2, Upload, Loader2, ChevronLeft, Check } from 'lucide-react'
import { formatDate } from '../utils/helpers'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500'
}

const STATUS_LABELS_KEYS: Record<string, string> = {
  pending: 'leave.statusPending',
  approved: 'leave.statusApproved',
  rejected: 'leave.statusRejected',
  cancelled: 'leave.statusCancelled'
}

const LEAVE_TYPE_LABELS_KEYS: Record<string, string> = {
  annual: 'leave.annualLeave',
  sick: 'leave.sickLeave',
  unpaid: 'leave.unpaidLeave',
  maternity: 'leave.maternityLeave',
  paternity: 'leave.paternityLeave',
  bereavement: 'leave.bereavementLeave',
  other: 'leave.otherLeave'
}

export const DEFAULT_LEAVE_TYPES = [
  { code: 'annual', name: 'Cuti Tahunan (年假)', key: 'leave.annualLeave', color: '#10B981', deductBalance: true, requiresProof: false },
  { code: 'sick', name: 'Cuti Sakit (病假)', key: 'leave.sickLeave', color: '#F59E0B', deductBalance: true, requiresProof: true },
  { code: 'unpaid', name: 'Cuti Tanpa Gaji (事假/无薪假)', key: 'leave.unpaidLeave', color: '#6B7280', deductBalance: false, requiresProof: false },
  { code: 'maternity', name: 'Cuti Melahirkan (产假)', key: 'leave.maternityLeave', color: '#EC4899', deductBalance: false, requiresProof: true },
  { code: 'paternity', name: 'Cuti Ayah (陪产假)', key: 'leave.paternityLeave', color: '#8B5CF6', deductBalance: false, requiresProof: true },
  { code: 'bereavement', name: 'Cuti Duka (丧假)', key: 'leave.bereavementLeave', color: '#374151', deductBalance: false, requiresProof: false },
  { code: 'other', name: 'Lainnya (其他)', key: 'leave.otherLeave', color: '#3B82F6', deductBalance: false, requiresProof: false }
]

interface Leave {
  id: string
  leaveType: string
  startDate: string
  endDate: string
  totalDays: number
  reason?: string
  status: string
  halfDay: boolean
  attachmentUrl?: string
}

interface LeaveBalance {
  annualLeave: number
  sickLeave: number
  unpaidLeave: number
  usedLeave: number
  usedSick: number
  broughtForward: number
}

export function LeavePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [leaves, setLeaves] = useState<Leave[]>([])
  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'history' | 'balance'>('history')

  useEffect(() => {
    if (user?.staffId) {
      loadData()
    }
  }, [user])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [leavesRes, balanceRes] = await Promise.all([
        staffApi.getMyLeaves(),
        staffApi.getMyLeaveBalance()
      ])
      setLeaves(leavesRes.data || [])
      setBalance(balanceRes.data)
    } catch (error) {
      console.error('Failed to load leave data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelLeave = async (leaveId: string) => {
    if (!confirm(t('leave.cancelLeaveConfirm'))) return
    try {
      await staffApi.cancelLeave(leaveId)
      loadData()
    } catch (error) {
      console.error('Failed to cancel leave:', error)
      alert(t('leave.cancelLeaveSuccess'))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white active:scale-95 transition-transform"
            >
              <ChevronLeft size={22} />
            </button>
            <Calendar size={26} />
            <div>
              <h1 className="text-xl font-bold">{t('leave.title')}</h1>
              <p className="text-white/80 text-xs">{t('leave.manageLeave')}</p>
            </div>
          </div>
          <button
            onClick={() => setShowApplyModal(true)}
            className="bg-white text-primary px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
          >
            <Plus size={18} />
            {t('leave.applyLeave', '申请请假')}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex">
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 text-center font-medium ${
              activeTab === 'history'
                ? 'text-primary border-b-2 border-primary'
                : 'text-gray-500'
            }`}
          >
            {t('leave.history')}
          </button>
          <button
            onClick={() => setActiveTab('balance')}
            className={`flex-1 py-3 text-center font-medium ${
              activeTab === 'balance'
                ? 'text-primary border-b-2 border-primary'
                : 'text-gray-500'
            }`}
          >
            {t('leave.leaveBalance')}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {activeTab === 'history' ? (
          <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
            ) : leaves.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar size={48} className="mx-auto mb-3 text-gray-300" />
                <p>{t('leave.noData')}</p>
              </div>
            ) : (
              leaves.map((leave) => (
                <div key={leave.id} className="bg-white rounded-2xl shadow-sm p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="inline-block px-2 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary">
                        {t(LEAVE_TYPE_LABELS_KEYS[leave.leaveType] || leave.leaveType)}
                      </span>
                      {leave.halfDay && (
                        <span className="inline-block ml-2 px-2 py-1 rounded-lg text-xs font-medium bg-blue-100 text-blue-700">
                          {t('leave.halfDay')}
                        </span>
                      )}
                    </div>
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[leave.status]}`}>
                      {t(STATUS_LABELS_KEYS[leave.status] || leave.status)}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar size={16} />
                      <span>
                        {formatDate(leave.startDate, 'long')} - {formatDate(leave.endDate, 'long')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock size={16} />
                      <span>{leave.totalDays} {t('leave.days')}</span>
                    </div>
                    {leave.reason && (
                      <p className="text-gray-500 mt-2">{t('leave.reason')}: {leave.reason}</p>
                    )}
                    {leave.attachmentUrl && (
                      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1.5 text-xs text-primary font-medium">
                        <Paperclip size={14} />
                        <a
                          href={leave.attachmentUrl.startsWith('http') ? leave.attachmentUrl : `${window.location.origin}${leave.attachmentUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {t('leave.viewAttachment', '查看附件凭证')}
                        </a>
                      </div>
                    )}
                  </div>

                  {leave.status === 'pending' && (
                    <button
                      onClick={() => handleCancelLeave(leave.id)}
                      className="mt-3 w-full py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                    >
                      {t('leave.cancel')}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {balance && (
              <>
                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <h3 className="font-bold text-gray-900 mb-4">{t('leave.annualLeaveBalance')}</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('leave.quota')}</span>
                      <span className="font-medium">{balance.annualLeave} {t('leave.days')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('leave.broughtForward')}</span>
                      <span className="font-medium">{balance.broughtForward} {t('leave.days')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('leave.used')}</span>
                      <span className="font-medium text-red-600">-{balance.usedLeave} {t('leave.days')}</span>
                    </div>
                    <div className="border-t pt-3 flex justify-between">
                      <span className="font-bold">{t('leave.remaining')}</span>
                      <span className="font-bold text-green-600">
                        {balance.annualLeave + balance.broughtForward - balance.usedLeave} {t('leave.days')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <h3 className="font-bold text-gray-900 mb-4">{t('leave.sickLeaveBalance')}</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('leave.quota')}</span>
                      <span className="font-medium">{balance.sickLeave} {t('leave.days')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('leave.used')}</span>
                      <span className="font-medium text-red-600">-{balance.usedSick} {t('leave.days')}</span>
                    </div>
                    <div className="border-t pt-3 flex justify-between">
                      <span className="font-bold">{t('leave.remaining')}</span>
                      <span className="font-bold text-green-600">
                        {balance.sickLeave - balance.usedSick} {t('leave.days')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <h3 className="font-bold text-gray-900 mb-4">{t('leave.unpaidLeaveBalance')}</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('leave.quota')}</span>
                      <span className="font-medium">{balance.unpaidLeave} {t('leave.days')}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Apply Modal */}
      {showApplyModal && (
        <ApplyLeaveModal
          onClose={() => setShowApplyModal(false)}
          onSuccess={() => {
            setShowApplyModal(false)
            loadData()
          }}
        />
      )}
    </div>
  )
}

interface ApplyLeaveModalProps {
  onClose: () => void
  onSuccess: () => void
}

function ApplyLeaveModal({ onClose, onSuccess }: ApplyLeaveModalProps) {
  const { t } = useTranslation()
  const [leaveType, setLeaveType] = useState('annual')
  const [leaveTypes, setLeaveTypes] = useState<any[]>(DEFAULT_LEAVE_TYPES)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [totalDays, setTotalDays] = useState(1)
  const [reason, setReason] = useState('')
  const [halfDay, setHalfDay] = useState(false)
  const [attachmentUrl, setAttachmentUrl] = useState('')
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [, setLoadingTypes] = useState(true)

  // Fetch leave types from API with guaranteed fallback
  useEffect(() => {
    const fetchLeaveTypes = async () => {
      try {
        const response = await staffApi.getLeaveTypes()
        if (response.data && response.data.length > 0) {
          setLeaveTypes(response.data)
          if (!leaveType || !response.data.some((item: any) => item.code === leaveType)) {
            setLeaveType(response.data[0].code)
          }
        }
      } catch (error) {
        console.warn('Failed to load leave types, using standard defaults:', error)
      } finally {
        setLoadingTypes(false)
      }
    }
    fetchLeaveTypes()
  }, [])

  useEffect(() => {
    if (startDate && endDate) {
      const days = (new Date(endDate + 'T00:00:00+07:00').getTime() - new Date(startDate + 'T00:00:00+07:00').getTime()) / 86400000 + 1
      if (Number.isInteger(days) && days > 0) setTotalDays(halfDay && days === 1 ? 0.5 : days)
    }
  }, [startDate, endDate, halfDay])

  const selectedTypeObj = leaveTypes.find(item => item.code === leaveType) || DEFAULT_LEAVE_TYPES.find(item => item.code === leaveType)

  const getLeaveTypeLabel = (type: any): string => {
    const key = LEAVE_TYPE_LABELS_KEYS[type.code] || `leave.${type.code}Leave`
    const res = t(key, { defaultValue: type.name })
    return typeof res === 'string' ? res : type.name
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAttachment(true)
    try {
      const res = await staffApi.uploadAttachment(file)
      const url = res?.data?.urls?.[0] || res?.data?.url
      if (url) {
        setAttachmentUrl(url)
      }
    } catch (err: any) {
      alert(err?.response?.data?.message || t('common.uploadFailed', '上传失败'))
    } finally {
      setUploadingAttachment(false)
    }
  }

  const handleSubmit = async () => {
    if (!leaveType) {
      alert(t('leave.selectLeaveType', '请选择请假类型'))
      return
    }
    if (!startDate || !endDate) {
      alert(t('leave.selectDateRange'))
      return
    }

    setIsSubmitting(true)
    try {
      await staffApi.applyLeave({
        leaveType,
        startDate,
        endDate,
        totalDays: halfDay ? 0.5 : totalDays,
        reason,
        halfDay,
        attachmentUrl: attachmentUrl || undefined
      })
      onSuccess()
    } catch (error: any) {
      alert(error.response?.data?.message || t('leave.submitError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold">{t('leave.applyLeave')}</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <XCircle size={24} />
          </button>
        </div>

        <div className="space-y-4">
          {/* 请假类型选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('leave.leaveTypes', '请假类型')}
            </label>

            {/* 快捷点击药丸按钮 */}
            <div className="flex flex-wrap gap-2 mb-2">
              {leaveTypes.map((type) => {
                const isSelected = leaveType === type.code
                const label = getLeaveTypeLabel(type)
                return (
                  <button
                    key={type.code}
                    type="button"
                    onClick={() => setLeaveType(type.code)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                      isSelected
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {isSelected && <Check size={12} />}
                    {label}
                  </button>
                )
              })}
            </div>

            {/* 标准下拉选择框 */}
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl bg-white text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              {leaveTypes.map((type) => (
                <option key={type.code} value={type.code}>
                  {getLeaveTypeLabel(type)}
                </option>
              ))}
            </select>

            {/* 假期属性贴心提示 */}
            {selectedTypeObj && (
              <div className="mt-2 text-xs flex items-center gap-2 flex-wrap">
                {selectedTypeObj.requiresProof ? (
                  <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-medium border border-amber-200/60">
                    ⚠️ {t('leave.proofRequired', '需上传证明文件或假条')}
                  </span>
                ) : null}
                {selectedTypeObj.deductBalance ? (
                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-medium border border-emerald-200/60">
                    💡 {t('leave.deductsQuota', '扣除对应假期额度')}
                  </span>
                ) : (
                  <span className="text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md font-medium">
                    💡 {t('leave.noQuotaDeduct', '不扣除年假额度')}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('leave.startDate')}</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full p-3 border border-gray-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('leave.endDate')}</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full p-3 border border-gray-200 rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('leave.numberOfDays')}</label>
            <input
              type="number"
              min="0.5"
              step="0.5"
              readOnly
              value={totalDays}
              onChange={(e) => setTotalDays(parseInt(e.target.value) || 1)}
              className="w-full p-3 border border-gray-200 rounded-xl"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="halfDay"
              checked={halfDay}
              onChange={(e) => setHalfDay(e.target.checked)}
              className="w-5 h-5"
            />
            <label htmlFor="halfDay" className="text-sm text-gray-700">
              {t('leave.halfDay')}
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('leave.reasonOptional')}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full p-3 border border-gray-200 rounded-xl"
              placeholder={t('leave.explainReason')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Paperclip size={15} className="text-gray-500" />
                {t('leave.attachment', '证明/附件 (可选)')}
              </span>
              {attachmentUrl && (
                <button
                  type="button"
                  onClick={() => setAttachmentUrl('')}
                  className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                >
                  <Trash2 size={12} />
                  {t('common.remove', '移除')}
                </button>
              )}
            </label>
            {attachmentUrl ? (
              <div className="flex items-center gap-2 p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700">
                <Paperclip size={14} className="text-primary flex-shrink-0" />
                <span className="truncate flex-1 font-mono">{attachmentUrl.split('/').pop()}</span>
                <a
                  href={attachmentUrl.startsWith('http') ? attachmentUrl : `${window.location.origin}${attachmentUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline px-1.5 py-0.5"
                >
                  {t('common.view', '查看')}
                </a>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 p-3 border border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                {uploadingAttachment ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 className="animate-spin" size={16} />
                    <span>{t('common.uploading', '正在上传...')}</span>
                  </div>
                ) : (
                  <>
                    <Upload size={16} className="text-gray-400" />
                    <span className="text-xs text-gray-600 font-medium">
                      {t('leave.uploadAttachmentHint', '上传病假条/证明文件 (JPG, PNG, PDF)')}
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  disabled={uploadingAttachment}
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full py-3 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
          >
            {isSubmitting ? t('leave.submitting') : t('leave.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
