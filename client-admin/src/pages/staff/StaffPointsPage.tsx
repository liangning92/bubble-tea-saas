import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { staffPointsApi } from '../../services/api'
import { Star, Plus, RefreshCw, Award, History } from 'lucide-react'

interface StaffPointData {
  staffId: string
  staffName: string
  balance: number
  totalEarned: number
  totalRedeemed: number
}

interface StaffPointLog {
  id: string
  type: string
  points: number
  reason: string
  note?: string
  createdAt: string
}

const REASON_LABELS: Record<string, string> = {
  perfect_attendance: 'staff.perfectAttendance',
  good_performance: 'staff.goodPerformance',
  training: 'staff.trainingCompleted',
  holiday_work: 'staff.holidayWork',
  overtime: 'staff.overtime',
  leave_redemption: 'staff.leaveRedemption',
  manual_adjust: 'staff.manualAdjust',
  expired: 'staff.expired'
}

export function StaffPointsPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [staffPoints, setStaffPoints] = useState<StaffPointData[]>([])
  const [selectedStaff, setSelectedStaff] = useState<string>('')
  const [history, setHistory] = useState<StaffPointLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [showEarnModal, setShowEarnModal] = useState(false)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [selectedStaffName, setSelectedStaffName] = useState('')
  const [formData, setFormData] = useState({ points: '', reason: 'good_performance', note: '' })

  const loadStaffPoints = async () => {
    setIsLoading(true)
    try {
      const response = await staffPointsApi.getStorePoints(user?.storeId || '')
      const pointsData: StaffPointData[] = response.data?.data || []
      setStaffPoints(pointsData)
    } catch (error) {
      console.error('Failed to load staff points:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadHistory = async (staffId: string, staffName: string) => {
    try {
      const response = await staffPointsApi.getHistory(staffId)
      setHistory(response.data?.data || [])
      setSelectedStaff(staffId)
      setSelectedStaffName(staffName)
      setShowHistory(true)
    } catch (error) {
      console.error('Failed to load history:', error)
    }
  }

  useEffect(() => {
    loadStaffPoints()
  }, [user])

  const handleEarnPoints = async () => {
    if (!selectedStaff || !formData.points) return

    setIsLoading(true)
    try {
      await staffPointsApi.earn({
        staffId: selectedStaff,
        points: parseInt(formData.points),
        reason: formData.reason,
        note: formData.note
      })
      await loadStaffPoints()
      setShowEarnModal(false)
      setFormData({ points: '', reason: 'good_performance', note: '' })
    } catch (error) {
      console.error('Failed to award points:', error)
      alert(t('staff.earnPointsFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleAdjustPoints = async () => {
    if (!selectedStaff || formData.points === '') return

    setIsLoading(true)
    try {
      await staffPointsApi.adjust({
        staffId: selectedStaff,
        points: parseInt(formData.points),
        reason: formData.reason,
        note: formData.note
      })
      await loadStaffPoints()
      setShowAdjustModal(false)
      setFormData({ points: '', reason: 'manual_adjust', note: '' })
    } catch (error) {
      console.error('Failed to adjust points:', error)
      alert(t('staff.adjustPointsFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  const openEarnModal = (staffId: string, staffName: string) => {
    setSelectedStaff(staffId)
    setSelectedStaffName(staffName)
    setShowEarnModal(true)
  }

  const openAdjustModal = (staffId: string, staffName: string) => {
    setSelectedStaff(staffId)
    setSelectedStaffName(staffName)
    setShowAdjustModal(true)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '-'
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Star size={28} className="text-primary" />
          <div />
        </div>
        <button onClick={loadStaffPoints} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50" disabled={isLoading}>
          <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Staff Points List */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{t('staff.name')}</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">{t('staff.balance')}</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">{t('staff.totalEarned')}</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">{t('staff.totalRedeemed')}</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {staffPoints.map((sp) => (
                  <tr key={sp.staffId} className="border-t">
                    <td className="px-4 py-3 font-medium">{sp.staffName}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xl font-bold text-primary">{sp.balance}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-green-600">+{sp.totalEarned}</td>
                    <td className="px-4 py-3 text-right text-red-600">-{sp.totalRedeemed}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEarnModal(sp.staffId, sp.staffName)}
                          className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100"
                          title={t('staff.earnPoints')}
                        >
                          <Award size={18} />
                        </button>
                        <button
                          onClick={() => openAdjustModal(sp.staffId, sp.staffName)}
                          className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
                          title={t('staff.adjustPoints')}
                        >
                          <Plus size={18} />
                        </button>
                        <button
                          onClick={() => loadHistory(sp.staffId, sp.staffName)}
                          className="p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100"
                          title={t('staff.pointsHistory')}
                        >
                          <History size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowHistory(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{selectedStaffName} - {t('staff.pointsHistory')}</h3>
            <div className="space-y-3">
              {history.length === 0 ? (
                <p className="text-gray-500 text-center py-4">{t('common.noData')}</p>
              ) : (
                history.map((log) => (
                  <div key={log.id} className={`p-3 rounded-lg border ${
                    log.points > 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                  }`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{t(REASON_LABELS[log.reason]) || log.reason}</p>
                        {log.note && <p className="text-sm text-gray-500">{log.note}</p>}
                        <p className="text-xs text-gray-400 mt-1">{formatDate(log.createdAt)}</p>
                      </div>
                      <span className={`text-xl font-bold ${log.points > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {log.points > 0 ? '+' : ''}{log.points}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <button onClick={() => setShowHistory(false)} className="w-full mt-4 py-2 border border-gray-200 rounded-lg">
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      {/* Earn Points Modal */}
      {showEarnModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowEarnModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{t('staff.earnPoints')} - {selectedStaffName}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.points')} *</label>
                <input
                  type="number"
                  value={formData.points}
                  onChange={(e) => setFormData({ ...formData, points: e.target.value })}
                  className="input"
                  min="1"
                  placeholder="Enter points"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.reason')} *</label>
                <select
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="input"
                >
                  <option value="perfect_attendance">{t('staff.perfectAttendance')}</option>
                  <option value="good_performance">{t('staff.goodPerformance')}</option>
                  <option value="training">{t('staff.trainingCompleted')}</option>
                  <option value="holiday_work">{t('staff.holidayWork')}</option>
                  <option value="overtime">{t('staff.overtime')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.notes')}</label>
                <textarea
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  className="input"
                  rows={2}
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowEarnModal(false)} className="flex-1 py-2 border border-gray-200 rounded-lg">
                  {t('common.cancel')}
                </button>
                <button onClick={handleEarnPoints} className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Points Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAdjustModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{t('staff.adjustPoints')} - {selectedStaffName}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.points')} ( +/- ) *</label>
                <input
                  type="number"
                  value={formData.points}
                  onChange={(e) => setFormData({ ...formData, points: e.target.value })}
                  className="input"
                  placeholder="Enter + or - points"
                />
                <p className="text-xs text-gray-500 mt-1">{t('staff.pointsHint')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.reason')} *</label>
                <select
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="input"
                >
                  <option value="manual_adjust">{t('staff.manualAdjust')}</option>
                  <option value="correction">{t('staff.correction')}</option>
                  <option value="reward">{t('staff.reward')}</option>
                  <option value="deduction">{t('staff.deduction')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.notes')}</label>
                <textarea
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  className="input"
                  rows={2}
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowAdjustModal(false)} className="flex-1 py-2 border border-gray-200 rounded-lg">
                  {t('common.cancel')}
                </button>
                <button onClick={handleAdjustPoints} className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}