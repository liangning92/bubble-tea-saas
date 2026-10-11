import { LoadFailure } from '../components/LoadFailure'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi, employeeApi } from '../services/api'
import { Clock, Loader2 } from 'lucide-react'

interface AttendanceRule {
  id: string
  isDefault: boolean
  name: string
  workStartTime: string
  workEndTime: string
  gracePeriod: number
  lateDeductionType: string
  lateDeductionFixed: number | null
  lateDeductionDailyRate: number | null
  absenceDeductionType: string
  absenceDeductionFixed: number | null
  overtimeRate: number
  overtimeMinHours: number
}

export function AttendanceRulesPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [lateRule,setLateRule] = useState<any>(null)
  const [rule, setRule] = useState<AttendanceRule | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRules()
  }, [user])

  const loadRules = async () => {
    setLoadError(false)
    setLoading(true)
    try {
      const [res, monthly] = await Promise.all([staffApi.getAttendanceRules(), employeeApi.get('/my/late-rule')])
      setLateRule(monthly)
      setRule(res.data?.find((item: AttendanceRule) => item.isDefault) || res.data?.[0] || null)
    } catch (error) {
      setLoadError(true)
      console.error('Failed to load rules:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loadError) return <LoadFailure retry={loadRules} />

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-primary text-white px-4 py-6 rounded-b-3xl">
        <h1 className="text-xl font-bold">{t('attendanceRules.title')}</h1>
        <p className="text-white/80 text-sm mt-1">
          {t('attendanceRules.description')}
        </p>
      </div>

      <div className="p-4 space-y-4"><p className="bg-white p-4 rounded-xl">{t('workspace.attendanceBasis')}</p>
        {rule ? (
          <>
            {/* Work Time */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Clock className="text-blue-600" size={20} />
                </div>
                <div>
                  <h3 className="font-semibold">{t('attendanceRules.workHours')}</h3>
                </div>
              </div>
              <p>{t('workspace.attendanceBasis')}</p>
            </div>

            {/* Late Deduction */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold mb-4">{t('attendanceRules.lateDeduction')}</h3>
              <div className="space-y-3">
                {lateRule ? (<div><p>{lateRule.month} · {lateRule.enabled ? t('workspace.recorded') : t('workspace.pendingReview')}</p>{lateRule.enabled && (lateRule.mode === 'tiers' ? lateRule.tiers.map((tier:any)=><p key={tier.minutes}>{tier.minutes} {t('workspace.minutes')} → Rp {tier.amount.toLocaleString('id-ID')}</p>) : <p>{lateRule.intervalMinutes} {t('workspace.minutes')} → Rp {lateRule.intervalAmount.toLocaleString('id-ID')}</p>)}</div>) : rule.lateDeductionType === 'fixed' ? (
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">{t('attendanceRules.fixedDeduction')}</span>
                    <span className="font-medium text-red-600">
                      Rp {((rule.lateDeductionFixed || 0) / 100).toLocaleString('id-ID')}
                    </span>
                  </div>
                ) : rule.lateDeductionType === 'daily_rate' ? (
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">{t('attendanceRules.dailyRateDeduction')}</span>
                    <span className="font-medium text-red-600">
                      {((rule.lateDeductionDailyRate || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Absence Deduction */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold mb-4">{t('attendanceRules.absenceDeduction')}</h3>
              <div className="space-y-3">
                {rule.absenceDeductionType === 'fixed' ? (
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">{t('attendanceRules.fixedDeduction')}</span>
                    <span className="font-medium text-red-600">
                      Rp {((rule.absenceDeductionFixed || 0) / 100).toLocaleString('id-ID')}
                    </span>
                  </div>
                ) : rule.absenceDeductionType === 'daily_rate' ? (
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">{t('attendanceRules.dailyRateDeduction')}</span>
                    <span className="font-medium text-red-600">
                      {(rule.absenceDeductionFixed || 0) * 100}% {t('attendanceRules.dailyRateUnit')}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Overtime */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold mb-4">{t('attendanceRules.overtimeSettings')}</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">{t('attendanceRules.overtimeRate')}</span>
                  <span className="font-medium text-green-600">
                    {rule.overtimeRate}x
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">{t('attendanceRules.minOvertimeHours')}</span>
                  <span className="font-medium">{rule.overtimeMinHours} {t('attendanceRules.hours')}</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-xl p-8 text-center">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">
              {t('attendanceRules.noRules')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}