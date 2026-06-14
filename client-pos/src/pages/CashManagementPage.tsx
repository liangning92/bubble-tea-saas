import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { posApi } from '../services/api'
import { formatCurrency } from '../utils/helpers'
import { showToast } from '../components/ui'
import { ArrowLeft, DollarSign, CheckCircle, TrendingUp, TrendingDown, RefreshCw, Wallet, Clock, AlertCircle } from 'lucide-react'

interface CashEvent {
  id: string
  type: 'float' | 'cash_sale' | 'cash_in' | 'cash_out' | 'reconcile' | 'close_shift'
  amount: number
  note?: string
  paymentMethod?: string
  createdAt: string
}

interface ShiftInfo {
  id: string
  shift: string
  openFloat: number
  status: string
  openedAt: string
}

interface CashBalance {
  currentBalance: number
  todayCashSales: number
  todayCashIns: number
  todayCashOuts: number
  openFloat: number
  shift: ShiftInfo | null
}

const getEventIcon = (type: string) => {
  switch (type) {
    case 'float': return <DollarSign size={20} className="text-green-600" />
    case 'cash_sale': return <TrendingUp size={20} className="text-blue-600" />
    case 'cash_in': return <Wallet size={20} className="text-purple-600" />
    case 'cash_out': return <TrendingDown size={20} className="text-orange-600" />
    case 'reconcile': return <RefreshCw size={20} className="text-gray-600" />
    case 'close_shift': return <Clock size={20} className="text-red-600" />
    default: return <DollarSign size={20} className="text-gray-600" />
  }
}

const getEventColor = (type: string) => {
  switch (type) {
    case 'float': return 'bg-green-100'
    case 'cash_sale': return 'bg-blue-100'
    case 'cash_in': return 'bg-purple-100'
    case 'cash_out': return 'bg-orange-100'
    case 'reconcile': return 'bg-gray-100'
    case 'close_shift': return 'bg-red-100'
    default: return 'bg-gray-100'
  }
}

export function CashManagementPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [balance, setBalance] = useState<CashBalance | null>(null)
  const [events, setEvents] = useState<CashEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showFloatModal, setShowFloatModal] = useState(false)
  const [showCashOutModal, setShowCashOutModal] = useState(false)
  const [showCashInModal, setShowCashInModal] = useState(false)
  const [showShiftCloseModal, setShowShiftCloseModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const [floatAmount, setFloatAmount] = useState('')
  const [cashOutAmount, setCashOutAmount] = useState('')
  const [cashOutNote, setCashOutNote] = useState('')
  const [cashInAmount, setCashInAmount] = useState('')
  const [cashInNote, setCashInNote] = useState('')
  const [closeAmount, setCloseAmount] = useState('')
  const [closeNote, setCloseNote] = useState('')
  const [selectedShift, setSelectedShift] = useState('morning')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [balanceRes, eventsRes] = await Promise.all([
        posApi.getCashBalance(),
        posApi.getCashEvents()
      ])

      if (balanceRes.data?.code === 200) {
        setBalance(balanceRes.data.data)
      }
      if (eventsRes.data?.code === 200) {
        setEvents(eventsRes.data.data?.list || [])
      }
    } catch (error) {
      console.error('Failed to load cash data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const showSuccess = (message: string) => {
    setSuccessMessage(message)
    setShowSuccessModal(true)
    setTimeout(() => {
      setShowSuccessModal(false)
      setSuccessMessage('')
    }, 2000)
  }

  const handleOpenFloat = async () => {
    if (!floatAmount || parseInt(floatAmount) <= 0) {
      showToast(t('cash.floatAmountRequired') || 'Please enter a valid amount', 'error')
      return
    }
    try {
      await posApi.createCashEvent({
        type: 'float',
        amount: Math.round(parseFloat(floatAmount)),
        shift: selectedShift,
        note: '开班零钱'
      })
      setShowFloatModal(false)
      setFloatAmount('')
      showSuccess(t('cash.floatSuccess'))
      loadData()
    } catch (error) {
      console.error('Failed to open float:', error)
      showToast(t('common.error') || 'Operation failed', 'error')
    }
  }

  const handleCashIn = async () => {
    if (!cashInAmount || parseInt(cashInAmount) <= 0) {
      showToast(t('cash.amountRequired') || 'Please enter a valid amount', 'error')
      return
    }
    try {
      await posApi.createCashEvent({
        type: 'cash_in',
        amount: Math.round(parseFloat(cashInAmount)),
        note: cashInNote || '现金存入'
      })
      setShowCashInModal(false)
      setCashInAmount('')
      setCashInNote('')
      showSuccess(t('cash.cashInSuccess'))
      loadData()
    } catch (error) {
      console.error('Failed to record cash in:', error)
      showToast(t('common.error') || 'Operation failed', 'error')
    }
  }

  const handleCashOut = async () => {
    if (!cashOutAmount || parseInt(cashOutAmount) <= 0) {
      showToast(t('cash.amountRequired') || 'Please enter a valid amount', 'error')
      return
    }
    try {
      await posApi.createCashEvent({
        type: 'cash_out',
        amount: Math.round(parseFloat(cashOutAmount)),
        note: cashOutNote || '现金支出'
      })
      setShowCashOutModal(false)
      setCashOutAmount('')
      setCashOutNote('')
      showSuccess(t('cash.cashOutSuccess'))
      loadData()
    } catch (error) {
      console.error('Failed to record cash out:', error)
      showToast(t('common.error') || 'Operation failed', 'error')
    }
  }

  const handleCloseShift = async () => {
    try {
      await posApi.closeShift({
        actualCash: Math.round(parseFloat(closeAmount || '0')),
        closeNote: closeNote
      })
      setShowShiftCloseModal(false)
      setCloseAmount('')
      setCloseNote('')
      showSuccess(t('cash.shiftClosed'))
      loadData()
    } catch (error) {
      console.error('Failed to close shift:', error)
      showToast(t('common.error') || 'Operation failed', 'error')
    }
  }

  const getEventLabel = (type: string) => {
    const labels: Record<string, string> = {
      float: t('cash.float'),
      cash_sale: t('cash.sale'),
      cash_in: t('cash.cashIn'),
      cash_out: t('cash.cashOut'),
      reconcile: t('cash.reconcile'),
      close_shift: t('cash.closeShift')
    }
    return labels[type] || type
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  }

  const getShiftName = (shift: string) => {
    const names: Record<string, string> = {
      morning: t('cash.morningShift'),
      afternoon: t('cash.afternoonShift'),
      evening: t('cash.eveningShift')
    }
    return names[shift] || shift
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-lg font-bold">{t('cash.title')}</h1>
              {balance?.shift && (
                <p className="text-xs text-gray-500">{getShiftName(balance.shift.shift)} - {balance.shift.status === 'open' ? t('cash.shiftOpen') : t('cash.shiftClosed')}</p>
              )}
            </div>
          </div>
          <button onClick={loadData} className="p-2 hover:bg-gray-100 rounded-lg" disabled={isLoading}>
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {isLoading && !balance ? (
        <div className="flex justify-center items-center h-64">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <>
          {/* Current Cash Balance */}
          <div className="p-4">
            <div className="bg-gradient-to-r from-primary to-pink-500 rounded-2xl shadow-lg p-6 mb-4 text-white">
              <div className="text-center">
                <p className="text-sm opacity-80 mb-1">{t('cash.currentCash')}</p>
                <p className="text-4xl font-bold">{formatCurrency(balance?.currentBalance || 0)}</p>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-white/20">
                <div className="text-center">
                  <p className="text-xs opacity-70">{t('cash.todaySales')}</p>
                  <p className="font-semibold">{formatCurrency(balance?.todayCashSales || 0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs opacity-70">{t('cash.cashIn')}</p>
                  <p className="font-semibold text-purple-200">{formatCurrency(balance?.todayCashIns || 0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs opacity-70">{t('cash.cashOut')}</p>
                  <p className="font-semibold text-orange-200">{formatCurrency(balance?.todayCashOuts || 0)}</p>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <button
                onClick={() => setShowFloatModal(true)}
                className="bg-white rounded-xl shadow-sm p-3 flex flex-col items-center gap-1"
              >
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <DollarSign size={20} className="text-green-600" />
                </div>
                <span className="text-xs font-medium">{t('cash.openFloat')}</span>
              </button>

              <button
                onClick={() => setShowCashInModal(true)}
                className="bg-white rounded-xl shadow-sm p-3 flex flex-col items-center gap-1"
              >
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <TrendingUp size={20} className="text-purple-600" />
                </div>
                <span className="text-xs font-medium">{t('cash.cashIn')}</span>
              </button>

              <button
                onClick={() => setShowCashOutModal(true)}
                className="bg-white rounded-xl shadow-sm p-3 flex flex-col items-center gap-1"
              >
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                  <TrendingDown size={20} className="text-orange-600" />
                </div>
                <span className="text-xs font-medium">{t('cash.cashOut')}</span>
              </button>

              <button
                onClick={() => setShowShiftCloseModal(true)}
                className="bg-white rounded-xl shadow-sm p-3 flex flex-col items-center gap-1"
              >
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Clock size={20} className="text-red-600" />
                </div>
                <span className="text-xs font-medium">{t('cash.closeShift')}</span>
              </button>
            </div>

            {/* Open Float Info */}
            {balance?.openFloat != null && balance.openFloat > 0 && (
              <div className="bg-green-50 rounded-xl p-3 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet size={18} className="text-green-600" />
                  <span className="text-sm text-green-700">{t('cash.openFloat')}</span>
                </div>
                <span className="font-semibold text-green-700">{formatCurrency(balance.openFloat)}</span>
              </div>
            )}

            {/* Cash History */}
            <div className="bg-white rounded-xl shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-semibold">{t('cash.history')}</h2>
              </div>
              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                {events.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-500">
                    <AlertCircle size={32} className="mx-auto mb-2 text-gray-300" />
                    <p>{t('cash.noHistory')}</p>
                  </div>
                ) : (
                  events.map((event) => (
                    <div key={event.id} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getEventColor(event.type)}`}>
                          {getEventIcon(event.type)}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{getEventLabel(event.type)}</p>
                          <p className="text-xs text-gray-500">{formatTime(event.createdAt)}</p>
                          {event.note && <p className="text-xs text-gray-400">{event.note}</p>}
                        </div>
                      </div>
                      <p className={`font-semibold ${
                        event.type === 'cash_out' ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {event.type === 'cash_out' ? '-' : '+'}{formatCurrency(event.amount)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Float Modal */}
      {showFloatModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-white w-full rounded-t-3xl p-6">
            <h2 className="text-lg font-bold mb-4">{t('cash.openFloat')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('cash.shift')}</label>
                <select
                  value={selectedShift}
                  onChange={(e) => setSelectedShift(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                >
                  <option value="morning">{t('cash.morningShift')}</option>
                  <option value="afternoon">{t('cash.afternoonShift')}</option>
                  <option value="evening">{t('cash.eveningShift')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('cash.floatAmount')}</label>
                <input
                  type="number"
                  value={floatAmount}
                  onChange={(e) => setFloatAmount(e.target.value)}
                  placeholder="0"
                  className="w-full p-3 border border-gray-200 rounded-xl text-lg"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowFloatModal(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleOpenFloat}
                  className="flex-1 py-3 bg-green-600 text-white rounded-xl font-medium"
                >
                  {t('cash.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cash In Modal */}
      {showCashInModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-white w-full rounded-t-3xl p-6">
            <h2 className="text-lg font-bold mb-4">{t('cash.cashIn')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('cash.amount')}</label>
                <input
                  type="number"
                  value={cashInAmount}
                  onChange={(e) => setCashInAmount(e.target.value)}
                  placeholder="0"
                  className="w-full p-3 border border-gray-200 rounded-xl text-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('cash.note')}</label>
                <textarea
                  value={cashInNote}
                  onChange={(e) => setCashInNote(e.target.value)}
                  placeholder={t('cash.notePlaceholder')}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  rows={2}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCashInModal(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCashIn}
                  className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-medium"
                >
                  {t('cash.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cash Out Modal */}
      {showCashOutModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-white w-full rounded-t-3xl p-6">
            <h2 className="text-lg font-bold mb-4">{t('cash.cashOut')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('cash.amount')}</label>
                <input
                  type="number"
                  value={cashOutAmount}
                  onChange={(e) => setCashOutAmount(e.target.value)}
                  placeholder="0"
                  className="w-full p-3 border border-gray-200 rounded-xl text-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('cash.note')}</label>
                <textarea
                  value={cashOutNote}
                  onChange={(e) => setCashOutNote(e.target.value)}
                  placeholder={t('cash.notePlaceholder')}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  rows={2}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCashOutModal(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCashOut}
                  className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-medium"
                >
                  {t('cash.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Close Shift Modal */}
      {showShiftCloseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-white w-full rounded-t-3xl p-6">
            <h2 className="text-lg font-bold mb-4">{t('cash.closeShift')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('cash.actualCash')}
                </label>
                <input
                  type="number"
                  value={closeAmount}
                  onChange={(e) => setCloseAmount(e.target.value)}
                  placeholder="0"
                  className="w-full p-3 border border-gray-200 rounded-xl text-lg"
                />
                {balance && (
                  <p className="text-xs text-gray-500 mt-1">
                    {t('cash.expected')}: {formatCurrency(balance.currentBalance)}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('cash.note')}</label>
                <textarea
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                  placeholder={t('cash.closeNotePlaceholder')}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  rows={2}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowShiftCloseModal(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCloseShift}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-medium"
                >
                  {t('cash.closeShift')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 mx-8 text-center animate-fade-in">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">{successMessage}</h2>
          </div>
        </div>
      )}
    </div>
  )
}