import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { Clock, Loader2 } from 'lucide-react'

interface AttendanceRule {
  id: string
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
  const [rule, setRule] = useState<AttendanceRule | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRules()
  }, [user])

  const loadRules = async () => {
    try {
      const res = await staffApi.getAttendanceRules()
      if (res.data?.data?.[0]) {
        setRule(res.data.data[0])
      }
    } catch (error) {
      console.error('Failed to load rules:', error)
    } finally {
      setLoading(false)
    }
  }

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

      <div className="p-4 space-y-4">
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
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">{t('attendanceRules.workStartTime')}</span>
                  <span className="font-medium">{rule.workStartTime}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">{t('attendanceRules.workEndTime')}</span>
                  <span className="font-medium">{rule.workEndTime}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">{t('attendanceRules.gracePeriod')}</span>
                  <span className="font-medium">{rule.gracePeriod} {t('attendanceRules.minutes')}</span>
                </div>
              </div>
            </div>

            {/* Late Deduction */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold mb-4">{t('attendanceRules.lateDeduction')}</h3>
              <div className="space-y-3">
                {rule.lateDeductionType === 'fixed' ? (
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">{t('attendanceRules.fixedDeduction')}</span>
                    <span className="font-medium text-red-600">
                      Rp {rule.lateDeductionFixed?.toLocaleString() || 0}
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
                      Rp {rule.absenceDeductionFixed?.toLocaleString() || 0}
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