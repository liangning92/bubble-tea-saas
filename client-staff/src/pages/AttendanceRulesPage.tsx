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
        <h1 className="text-xl font-bold">{t('attendanceRules.title') || '考勤规则'}</h1>
        <p className="text-white/80 text-sm mt-1">
          {t('attendanceRules.description') || '了解门店考勤制度'}
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
                  <h3 className="font-semibold">{t('attendanceRules.workHours') || '工作时间'}</h3>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">{t('attendanceRules.workStartTime') || '上班时间'}</span>
                  <span className="font-medium">{rule.workStartTime}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">{t('attendanceRules.workEndTime') || '下班时间'}</span>
                  <span className="font-medium">{rule.workEndTime}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">{t('attendanceRules.gracePeriod') || '宽限期'}</span>
                  <span className="font-medium">{rule.gracePeriod} {t('attendanceRules.minutes') || '分钟'}</span>
                </div>
              </div>
            </div>

            {/* Late Deduction */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold mb-4">{t('attendanceRules.lateDeduction') || '迟到扣款'}</h3>
              <div className="space-y-3">
                {rule.lateDeductionType === 'fixed' ? (
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">{t('attendanceRules.fixedDeduction') || '固定扣款'}</span>
                    <span className="font-medium text-red-600">
                      Rp {rule.lateDeductionFixed?.toLocaleString() || 0}
                    </span>
                  </div>
                ) : rule.lateDeductionType === 'daily_rate' ? (
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">{t('attendanceRules.dailyRateDeduction') || '按日薪比例扣'}</span>
                    <span className="font-medium text-red-600">
                      {((rule.lateDeductionDailyRate || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Absence Deduction */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold mb-4">{t('attendanceRules.absenceDeduction') || '缺勤扣款'}</h3>
              <div className="space-y-3">
                {rule.absenceDeductionType === 'fixed' ? (
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">{t('attendanceRules.fixedDeduction') || '固定扣款'}</span>
                    <span className="font-medium text-red-600">
                      Rp {rule.absenceDeductionFixed?.toLocaleString() || 0}
                    </span>
                  </div>
                ) : rule.absenceDeductionType === 'daily_rate' ? (
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">{t('attendanceRules.dailyRateDeduction') || '按日薪比例扣'}</span>
                    <span className="font-medium text-red-600">
                      {(rule.absenceDeductionFixed || 0) * 100}% 日薪
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Overtime */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold mb-4">{t('attendanceRules.overtimeSettings') || '加班设置'}</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">{t('attendanceRules.overtimeRate') || '加班费率'}</span>
                  <span className="font-medium text-green-600">
                    {rule.overtimeRate}x
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">{t('attendanceRules.minOvertimeHours') || '最小加班时长'}</span>
                  <span className="font-medium">{rule.overtimeMinHours} {t('attendanceRules.hours') || '小时'}</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-xl p-8 text-center">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">
              {t('attendanceRules.noRules') || '暂无考勤规则'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}