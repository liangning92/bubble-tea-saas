import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { Wallet, RefreshCw, Loader2, ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { formatDate, formatCurrency } from '../utils/helpers'

interface DeductionLog {
  id: string
  amount: number
  note?: string
  createdAt: string
  salaryId?: string
}

interface RefundLog {
  id: string
  amount: number
  reason: string
  note?: string
  processedBy: string
  createdAt: string
}

interface Deposit {
  id: string
  totalAmount: number
  deductedAmount: number
  refundedAmount: number
  status: string
  startDate: string
  endDate?: string
  deductionCount: number
  depositRule: {
    name: string
    deductionType: string
    refundType: string
  }
  deductionLogs: DeductionLog[]
  refundLogs: RefundLog[]
}

export function DepositPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [deposit, setDeposit] = useState<Deposit | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const response = await staffApi.getMyDeposit()
      setDeposit(response.data?.data || null)
    } catch (error) {
      console.error('Failed to load deposit:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  const getRemainingAmount = () => {
    if (!deposit) return 0
    return deposit.totalAmount - deposit.deductedAmount - deposit.refundedAmount
  }

  const getStatusLabel = () => {
    if (!deposit) return ''
    switch (deposit.status) {
      case 'active': return t('deposit.active')
      case 'completed': return t('deposit.completed')
      case 'refunded': return t('deposit.refunded')
      default: return deposit.status
    }
  }

  const getStatusColor = () => {
    if (!deposit) return 'bg-gray-100 text-gray-700'
    switch (deposit.status) {
      case 'active': return 'bg-blue-100 text-blue-700'
      case 'completed': return 'bg-green-100 text-green-700'
      case 'refunded': return 'bg-gray-100 text-gray-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  if (!deposit) {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <header className="bg-primary text-white px-4 py-6 rounded-b-3xl">
          <h1 className="text-xl font-bold">{t('deposit.title')}</h1>
        </header>
        <div className="p-4">
          <div className="text-center py-12 text-gray-500">
            <Wallet size={48} className="mx-auto mb-4 opacity-50" />
            <p>{t('deposit.noDeposit')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6 rounded-b-3xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">{t('deposit.title')}</h1>
          <button onClick={loadData} className="p-2 bg-white/20 rounded-lg">
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Deposit Summary Card */}
        <div className="bg-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white/80 text-sm">{deposit.depositRule?.name || t('deposit.deposit')}</p>
              <span className={`inline-block px-2 py-0.5 rounded text-xs mt-1 ${getStatusColor()}`}>
                {getStatusLabel()}
              </span>
            </div>
            <div className="text-right">
              <p className="text-white/80 text-sm">{t('deposit.startDate')}</p>
              <p className="font-medium">{formatDate(deposit.startDate)}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-white/60 text-xs">{t('deposit.total')}</p>
              <p className="font-bold">{formatCurrency(deposit.totalAmount)}</p>
            </div>
            <div>
              <p className="text-white/60 text-xs">{t('deposit.deducted')}</p>
              <p className="font-bold text-red-300">{formatCurrency(deposit.deductedAmount)}</p>
            </div>
            <div>
              <p className="text-white/60 text-xs">{t('deposit.remaining')}</p>
              <p className="font-bold text-green-300">{formatCurrency(getRemainingAmount())}</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-400 rounded-full"
                style={{ width: `${(deposit.deductedAmount / deposit.totalAmount) * 100}%` }}
              />
            </div>
            <p className="text-white/60 text-xs mt-1 text-center">
              {deposit.deductionCount} x {t('deposit.deductions')}
            </p>
          </div>
        </div>
      </header>

      {/* Deduction History */}
      <div className="p-4">
        <h2 className="font-bold text-gray-900 mb-3">{t('deposit.deductionHistory')}</h2>
        {deposit.deductionLogs.length === 0 ? (
          <div className="text-center py-8 text-gray-500 bg-white rounded-xl">
            <p>{t('deposit.noDeductions')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {deposit.deductionLogs.map(log => (
              <div key={log.id} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{log.note || t('deposit.monthlyDeduction')}</p>
                    <p className="text-sm text-gray-500">{formatDate(log.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1 text-red-600 font-bold">
                    <ArrowDownRight size={16} />
                    {formatCurrency(log.amount)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Refund History */}
        {deposit.refundLogs.length > 0 && (
          <>
            <h2 className="font-bold text-gray-900 mb-3 mt-6">{t('deposit.refundHistory')}</h2>
            <div className="space-y-3">
              {deposit.refundLogs.map(log => (
                <div key={log.id} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{log.reason}</p>
                      <p className="text-sm text-gray-500">{formatDate(log.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-1 text-green-600 font-bold">
                      <ArrowUpRight size={16} />
                      {formatCurrency(log.amount)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
