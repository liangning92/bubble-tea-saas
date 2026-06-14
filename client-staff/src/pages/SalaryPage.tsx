import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { Wallet, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'
import { formatCurrency } from '../utils/helpers'

export function SalaryPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [salary, setSalary] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (user?.staffId) {
      loadSalary()
    }
  }, [user, currentMonth])

  const loadSalary = async () => {
    setIsLoading(true)
    try {
      const response = await staffApi.getMySalary(
        user!.staffId,
        currentMonth.getMonth() + 1,
        currentMonth.getFullYear()
      )
      if (response.data) {
        setSalary(response.data)
      }
    } catch (error) {
      console.error('Failed to load salary:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const goToPrevMonth = () => {
    const prev = new Date(currentMonth)
    prev.setMonth(prev.getMonth() - 1)
    setCurrentMonth(prev)
  }

  const goToNextMonth = () => {
    const next = new Date(currentMonth)
    next.setMonth(next.getMonth() + 1)
    setCurrentMonth(next)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6">
        <div className="flex items-center gap-3">
          <Wallet size={28} />
          <div>
            <h1 className="text-xl font-bold">{t('salary.title')}</h1>
            <p className="text-white/80 text-sm">
              {currentMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      </header>

      {/* Month Navigation */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <button
          onClick={goToPrevMonth}
          className="p-2 rounded-full hover:bg-gray-100"
        >
          <ChevronLeft size={24} className="text-gray-600" />
        </button>
        <span className="font-bold text-gray-900">
          {currentMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
        </span>
        <button
          onClick={goToNextMonth}
          className="p-2 rounded-full hover:bg-gray-100"
        >
          <ChevronRight size={24} className="text-gray-600" />
        </button>
      </div>

      {/* Salary Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-primary" size={32} />
          </div>
        ) : salary ? (
          <>
            {/* Total Salary Card */}
            <div className="bg-gradient-to-br from-primary to-pink-600 rounded-2xl p-6 text-white mb-6">
              <p className="text-white/80 text-sm mb-1">{t('salary.totalSalary')}</p>
              <p className="text-4xl font-bold mb-4">
                {formatCurrency(salary.totalSalary)}
              </p>
              <div className="flex items-center gap-2 text-white/60 text-sm">
                <span>{salary.staffName}</span>
                <span>•</span>
                <span>{user?.position}</span>
              </div>
            </div>

            {/* Breakdown */}
            <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
              <h3 className="font-bold text-gray-900 mb-4">{t('salary.breakdown')}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('salary.baseSalary')}</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(salary.baseSalary)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('salary.workDays')}</span>
                  <span className="font-medium text-gray-900">{salary.workDays} {t('common.days')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('salary.overtime')}</span>
                  <span className="font-medium text-gray-900">
                    {salary.overtimeHours} {t('common.hours')} ({formatCurrency(salary.overtimePay)})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('salary.bonuses')}</span>
                  <span className="font-medium text-green-600">
                    +{formatCurrency(salary.bonuses)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('salary.deductions')}</span>
                  <span className="font-medium text-red-600">
                    -{formatCurrency(salary.deductions)}
                  </span>
                </div>
                <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                  <span className="font-bold text-gray-900">{t('salary.totalSalary')}</span>
                  <span className="font-bold text-primary text-xl">
                    {formatCurrency(salary.totalSalary)}
                  </span>
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
              <h3 className="font-bold text-gray-900 mb-4">{t('salary.details')}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('salary.lateDays')}</span>
                  <span className="font-medium text-gray-900">{salary.lateDays} {t('common.days')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('salary.latePenalty')}</span>
                  <span className="font-medium text-red-600">
                    {formatCurrency(salary.lateDays * 50000)}
                  </span>
                </div>
              </div>
            </div>

            {/* Download Button */}
            <button className="w-full py-4 bg-white border border-primary text-primary rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary hover:text-white transition-colors">
              <Download size={20} />
              {t('salary.downloadSlip')}
            </button>
          </>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <Wallet size={48} className="mx-auto mb-4 opacity-50" />
            <p>{t('salary.noData')}</p>
          </div>
        )}
      </div>
    </div>
  )
}