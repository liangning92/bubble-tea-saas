import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'warning' | 'danger' | 'info'
  showCancel?: boolean
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  type = 'warning',
  showCancel = true
}: ConfirmModalProps) {
  const { t } = useTranslation()

  if (!isOpen) return null

  const iconColors = {
    warning: 'text-yellow-500',
    danger: 'text-red-500',
    info: 'text-blue-500'
  }

  const buttonColors = {
    warning: 'bg-yellow-500 hover:bg-yellow-600',
    danger: 'bg-red-500 hover:bg-red-600',
    info: 'bg-blue-500 hover:bg-blue-600'
  }

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-sm mx-4 overflow-hidden shadow-2xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Icon & Title */}
        <div className="flex flex-col items-center pt-6 px-6">
          <div className={`w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4 ${iconColors[type]}`}>
            <AlertTriangle size={32} />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
          <p className="text-gray-500 text-center mb-4">{message}</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 p-4 border-t bg-gray-50">
          {showCancel && (
            <button
              onClick={onClose}
              className="flex-1 py-4 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 active:scale-[0.98] transition-all text-lg"
            >
              {cancelText || t('common.cancel')}
            </button>
          )}
          <button
            onClick={handleConfirm}
            className={`flex-1 py-4 rounded-xl font-bold text-white active:scale-[0.98] transition-all text-lg ${buttonColors[type]}`}
          >
            {confirmText || t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal