import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { Coins, Loader2 } from 'lucide-react'

interface DepositRule {
  id: string
  name: string
  depositAmount: number
  monthlyDeduction: number
  maxDeductions: number
  deductionType: string
  refundType: string
  prorataPercent: number | null
  status: string
}

export function DepositRulesPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [rules, setRules] = useState<DepositRule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRules()
  }, [user])

  const loadRules = async () => {
    try {
      const res = await staffApi.getDepositRules()
      if (res.data?.data) {
        setRules(res.data.data)
      }
    } catch (error) {
      console.error('Failed to load deposit rules:', error)
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
        <h1 className="text-xl font-bold">{t('deposit.rules')}</h1>
        <p className="text-white/80 text-sm mt-1">
          {t('deposit.rulesDescription')}
        </p>
      </div>

      <div className="p-4 space-y-4">
        {rules.length > 0 ? (
          rules.map((rule) => (
            <div key={rule.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                  <Coins className="text-orange-600" size={20} />
                </div>
                <div>
                  <h3 className="font-semibold">{rule.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${rule.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {rule.status === 'active' ? t('common.active') : t('common.inactive')}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {/* Deposit Amount */}
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">{t('deposit.totalAmount')}</span>
                  <span className="font-semibold text-orange-600">
                    Rp {rule.depositAmount.toLocaleString()}
                  </span>
                </div>

                {/* Monthly Deduction */}
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">{t('deposit.monthlyDeduction')}</span>
                  <span className="font-medium">
                    Rp {rule.monthlyDeduction.toLocaleString()}
                  </span>
                </div>

                {/* Max Deductions */}
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">{t('deposit.maxDeductions')}</span>
                  <span className="font-medium">
                    {rule.maxDeductions} {t('deposit.times')}
                  </span>
                </div>

                {/* Deduction Type */}
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">{t('deposit.deductionType')}</span>
                  <span className="font-medium">
                    {rule.deductionType === 'monthly' ? t('deposit.monthly') : t('deposit.oneTime')}
                  </span>
                </div>

                {/* Refund Type */}
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">{t('deposit.refundType')}</span>
                  <span className="font-medium">
                    {rule.refundType === 'full' ? t('deposit.fullRefund') :
                     rule.refundType === 'prorata' ? t('deposit.prorata') :
                     rule.refundType === 'no_refund' ? t('deposit.noRefund') :
                     rule.refundType}
                  </span>
                </div>

                {/* Prorata Percent */}
                {rule.refundType === 'prorata' && rule.prorataPercent && (
                  <div className="flex justify-between py-2 bg-blue-50 px-3 rounded-lg">
                    <span className="text-blue-600">{t('deposit.prorataPercent')}</span>
                    <span className="font-medium text-blue-600">
                      {(rule.prorataPercent * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-xl p-8 text-center">
            <Coins className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">
              {t('deposit.noRules')}
            </p>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-blue-50 rounded-xl p-4">
          <h4 className="font-medium text-blue-800 mb-2">{t('deposit.info')}</h4>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• {t('deposit.info1')}</li>
            <li>• {t('deposit.info2')}</li>
            <li>• {t('deposit.info3')}</li>
          </ul>
        </div>
      </div>
    </div>
  )
}