import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banknote, CreditCard, CheckCircle, AlertCircle, Loader2, Split } from 'lucide-react'
import { formatCurrency } from '../utils/helpers'
import { Modal } from './ui/Modal'

interface PaymentModalProps {
  isOpen: boolean
  total: number
  onClose: () => void
  onPayment: (method: string, amount?: number) => Promise<void>
}

type PaymentMethod = 'cash' | 'gopay' | 'ovo' | 'dana' | 'shopeepay'

const paymentIcons: Record<PaymentMethod, typeof Banknote> = {
  cash: Banknote,
  gopay: CreditCard,
  ovo: CreditCard,
  dana: CreditCard,
  shopeepay: CreditCard
}

const paymentColors: Record<PaymentMethod, string> = {
  cash: 'text-green-600 border-green-200 hover:border-green-500 hover:bg-green-50',
  gopay: 'text-blue-600 border-blue-200 hover:border-blue-500 hover:bg-blue-50',
  ovo: 'text-purple-600 border-purple-200 hover:border-purple-500 hover:bg-purple-50',
  dana: 'text-blue-500 border-blue-200 hover:border-blue-500 hover:bg-blue-50',
  shopeepay: 'text-orange-500 border-orange-200 hover:border-orange-500 hover:bg-orange-50'
}

export function PaymentModal({ isOpen, total, onClose, onPayment }: PaymentModalProps) {
  const { t } = useTranslation()
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'full' | 'split'>('full')
  const [splitAmounts, setSplitAmounts] = useState<Record<PaymentMethod, string>>({
    cash: '',
    gopay: '',
    ovo: '',
    dana: '',
    shopeepay: ''
  })

  const handlePayment = async (method: PaymentMethod) => {
    if (isProcessing) return

    setSelectedMethod(method)
    setIsProcessing(true)
    setError(null)

    try {
      await onPayment(method)
    } catch (err) {
      setError(t('pos.paymentError') || 'Payment failed. Please try again.')
      setIsProcessing(false)
      setSelectedMethod(null)
    }
  }

  const handleSplitPayment = async () => {
    const amounts = Object.entries(splitAmounts)
      .map(([method, val]) => ({ method, amount: parseInt(val) || 0 }))
      .filter(item => item.amount > 0)

    const totalSplit = amounts.reduce((sum, item) => sum + item.amount, 0)

    if (amounts.length === 0) {
      setError(t('pos.splitError') || 'Please enter at least one payment amount')
      return
    }

    if (totalSplit < total) {
      setError(t('pos.splitInsufficient') || 'Total split amount is less than the bill')
      return
    }

    setIsProcessing(true)
    setError(null)

    try {
      for (const { method, amount } of amounts) {
        await onPayment(method, amount)
      }
    } catch (err) {
      setError(t('pos.paymentError') || 'Payment failed. Please try again.')
      setIsProcessing(false)
    }
  }

  const handleClose = () => {
    if (isProcessing) return
    onClose()
    setSelectedMethod(null)
    setError(null)
    setMode('full')
    setSplitAmounts({ cash: '', gopay: '', ovo: '', dana: '', shopeepay: '' })
  }

  const getSplitTotal = () => {
    return Object.values(splitAmounts).reduce((sum, val) => sum + (parseInt(val) || 0), 0)
  }

  const getRemaining = () => {
    return Math.max(0, total - getSplitTotal())
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('pos.payment')}
      size="md"
      position="center"
    >
      {/* Mode Toggle */}
      <div className="flex border-b">
        <button
          onClick={() => setMode('full')}
          className={`flex-1 py-3 text-sm font-medium ${mode === 'full' ? 'border-b-2 border-primary text-primary' : 'text-gray-500'}`}
        >
          {t('pos.fullPayment') || 'Full Payment'}
        </button>
        <button
          onClick={() => setMode('split')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1 ${mode === 'split' ? 'border-b-2 border-primary text-primary' : 'text-gray-500'}`}
        >
          <Split size={16} />
          {t('pos.splitPayment') || 'Split Payment'}
        </button>
      </div>

      {/* Total Display */}
      <div className="p-6 text-center border-b">
        <p className="text-gray-500 text-sm">{t('pos.total')}</p>
        <p className="text-4xl font-bold text-primary">{formatCurrency(total)}</p>
        {mode === 'split' && (
          <p className="text-sm mt-2">
            {t('pos.remaining') || 'Remaining'}: <span className={getRemaining() > 0 ? 'text-orange-600' : 'text-green-600'}>{formatCurrency(getRemaining())}</span>
          </p>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle size={18} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {mode === 'full' ? (
        <>
          {/* Full Payment Methods */}
          <div className="p-4">
            <div className="grid grid-cols-2 gap-3">
              <PaymentButton
                method="cash"
                label={t('pos.cash')}
                icon={Banknote}
                color={paymentColors.cash}
                isSelected={selectedMethod === 'cash'}
                isProcessing={isProcessing && selectedMethod === 'cash'}
                onClick={() => handlePayment('cash')}
              />

              {(['gopay', 'ovo', 'dana', 'shopeepay'] as PaymentMethod[]).map((method) => (
                <PaymentButton
                  key={method}
                  method={method}
                  label={t(`pos.${method}`)}
                  icon={CreditCard}
                  color={paymentColors[method]}
                  isSelected={selectedMethod === method}
                  isProcessing={isProcessing && selectedMethod === method}
                  onClick={() => handlePayment(method)}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Split Payment */}
          <div className="p-4 space-y-3">
            <p className="text-sm text-gray-500">{t('pos.splitHint') || 'Enter amount for each payment method'}</p>

            {(['cash', 'gopay', 'ovo', 'dana', 'shopeepay'] as PaymentMethod[]).map((method) => (
              <div key={method} className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${paymentColors[method].replace('hover:', '')}`}>
                  {method === 'cash' ? <Banknote size={20} /> : <CreditCard size={20} />}
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    value={splitAmounts[method]}
                    onChange={(e) => setSplitAmounts(prev => ({ ...prev, [method]: e.target.value }))}
                    placeholder={formatCurrency(0)}
                    className="w-full p-3 border border-gray-200 rounded-xl"
                  />
                </div>
                <button
                  onClick={() => {
                    const remaining = getRemaining()
                    if (remaining > 0) {
                      setSplitAmounts(prev => ({ ...prev, [method]: String(remaining) }))
                    }
                  }}
                  className="px-3 py-2 text-sm text-primary border border-primary rounded-lg hover:bg-primary/5"
                >
                  {t('pos.fill') || 'Fill'}
                </button>
              </div>
            ))}

            <button
              onClick={handleSplitPayment}
              disabled={isProcessing || getRemaining() > 0}
              className="w-full py-4 bg-primary text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed mt-4"
            >
              {isProcessing ? (
                <Loader2 size={20} className="animate-spin mx-auto" />
              ) : (
                t('pos.confirmSplit') || 'Confirm Split'
              )}
            </button>
          </div>
        </>
      )}

      {/* Cancel Button */}
      <div className="p-4 pt-0">
        <button
          onClick={handleClose}
          disabled={isProcessing}
          className="w-full py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
      </div>
    </Modal>
  )
}

interface PaymentButtonProps {
  method: string
  label: string
  icon: typeof Banknote
  color: string
  isSelected: boolean
  isProcessing: boolean
  onClick: () => void
}

function PaymentButton({ method, label, icon: Icon, color, isSelected, isProcessing, onClick }: PaymentButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={isProcessing}
      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all disabled:opacity-50 ${color} ${
        isSelected ? 'border-current bg-current/5' : ''
      }`}
    >
      {isProcessing ? (
        <Loader2 size={32} className="animate-spin" />
      ) : (
        <Icon size={32} />
      )}
      <span className="font-medium capitalize">{label}</span>
    </button>
  )
}