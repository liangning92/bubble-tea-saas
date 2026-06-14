import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { Receipt, Plus, Clock, XCircle, Upload } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  paid: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-gray-100 text-gray-500'
}

interface Reimbursement {
  id: string
  type: string
  amount: number
  description: string
  receiptUrls?: string
  status: string
  createdAt: string
}

export function ReimbursementPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()

  const STATUS_LABELS: Record<string, string> = {
    pending: t('reimbursement.statusPending'),
    approved: t('reimbursement.statusApproved'),
    rejected: t('reimbursement.statusRejected'),
    paid: t('reimbursement.statusPaid'),
    cancelled: t('reimbursement.statusCancelled')
  }

  const TYPE_LABELS: Record<string, string> = {
    transportation: t('reimbursement.typeTransportation'),
    meals: t('reimbursement.typeMeals'),
    communication: t('reimbursement.typeCommunication'),
    medical: t('reimbursement.typeMedical'),
    other: t('reimbursement.typeOther')
  }

  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showApplyModal, setShowApplyModal] = useState(false)

  useEffect(() => {
    if (user?.staffId) {
      loadData()
    }
  }, [user])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const response = await staffApi.getMyReimbursements()
      setReimbursements(response.data || [])
    } catch (error) {
      console.error('Failed to load reimbursements:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelReimbursement = async (id: string) => {
    if (!confirm(t('reimbursement.cancelConfirm'))) return
    try {
      await staffApi.cancelReimbursement(id)
      loadData()
    } catch (error) {
      console.error('Failed to cancel reimbursement:', error)
      alert(t('reimbursement.cancelFailed'))
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount / 100)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  const parseReceiptUrls = (receiptUrls?: string) => {
    if (!receiptUrls) return []
    try {
      return JSON.parse(receiptUrls)
    } catch {
      return []
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Receipt size={28} />
            <div>
              <h1 className="text-xl font-bold">{t('reimbursement.title')}</h1>
              <p className="text-white/80 text-sm">{t('reimbursement.manageDescription')}</p>
            </div>
          </div>
          <button
            onClick={() => setShowApplyModal(true)}
            className="bg-white text-primary p-2 rounded-full"
          >
            <Plus size={24} />
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="p-4">
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
          ) : reimbursements.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Receipt size={48} className="mx-auto mb-3 text-gray-300" />
              <p>{t('reimbursement.noData')}</p>
            </div>
          ) : (
            reimbursements.map((item) => {
              const receipts = parseReceiptUrls(item.receiptUrls)
              return (
                <div key={item.id} className="bg-white rounded-2xl shadow-sm p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="inline-block px-2 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary">
                        {TYPE_LABELS[item.type] || item.type}
                      </span>
                    </div>
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[item.status]}`}>
                      {STATUS_LABELS[item.status] || item.status}
                    </span>
                  </div>

                  <div className="text-2xl font-bold text-gray-900 mb-2">
                    {formatCurrency(item.amount)}
                  </div>

                  <p className="text-gray-600 text-sm mb-3">{item.description}</p>

                  {receipts.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                      <Upload size={16} />
                      <span>{receipts.length} {t('reimbursement.attachments')}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock size={16} />
                    <span>{formatDate(item.createdAt)}</span>
                  </div>

                  {item.status === 'pending' && (
                    <button
                      onClick={() => handleCancelReimbursement(item.id)}
                      className="mt-3 w-full py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                    >
                      {t('reimbursement.cancel')}
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Apply Modal */}
      {showApplyModal && (
        <ApplyReimbursementModal
          onClose={() => setShowApplyModal(false)}
          onSuccess={() => {
            setShowApplyModal(false)
            loadData()
          }}
        />
      )}
    </div>
  )
}

interface ApplyReimbursementModalProps {
  onClose: () => void
  onSuccess: () => void
}

function ApplyReimbursementModal({ onClose, onSuccess }: ApplyReimbursementModalProps) {
  const { t } = useTranslation()
  const [reimbType, setReimbType] = useState('transportation')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    setFiles(selectedFiles)

    // Create preview URLs
    const urls = selectedFiles.map(file => URL.createObjectURL(file))
    setPreviewUrls(urls)
  }

  const handleSubmit = async () => {
    if (!amount || !description) {
      alert(t('reimbursement.fillAmountAndDescription'))
      return
    }

    setIsSubmitting(true)
    try {
      let receiptUrls: string[] = []

      // Upload files first if any
      if (files.length > 0) {
        const uploadRes = await staffApi.uploadReceipts(files)
        receiptUrls = uploadRes.data.receiptUrls
      }

      await staffApi.applyReimbursement({
        type: reimbType,
        amount: Math.round(parseFloat(amount) * 100), // Convert to cents
        description,
        receiptUrls
      })
      onSuccess()
    } catch (error: any) {
      alert(error.response?.data?.message || t('reimbursement.submitFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatCurrency = (value: string) => {
    const num = parseFloat(value) || 0
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(num)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
      <div className="bg-white w-full max-w-md rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">{t('reimbursement.applyTitle')}</h2>
          <button onClick={onClose} className="p-2">
            <XCircle size={24} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('reimbursement.typeLabel')}</label>
            <select
              value={reimbType}
              onChange={(e) => setReimbType(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl"
            >
              <option value="transportation">{t('reimbursement.typeTransportation')}</option>
              <option value="meals">{t('reimbursement.typeMeals')}</option>
              <option value="communication">{t('reimbursement.typeCommunication')}</option>
              <option value="medical">{t('reimbursement.typeMedical')}</option>
              <option value="other">{t('reimbursement.typeOther')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('reimbursement.amountLabel')}</label>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl"
              placeholder="0"
            />
            {amount && (
              <p className="text-sm text-gray-500 mt-1">{formatCurrency(amount)}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('reimbursement.descriptionLabel')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full p-3 border border-gray-200 rounded-xl"
              placeholder={t('reimbursement.descriptionPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('reimbursement.attachmentLabel')}</label>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
              <input
                type="file"
                id="receipts"
                multiple
                accept="image/*,.pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              <label htmlFor="receipts" className="cursor-pointer">
                <Upload size={32} className="mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">
                  {t('reimbursement.uploadHint')}
                </p>
               <p className="text-xs text-gray-400 mt-1">
                  {t('reimbursement.uploadFormat')}
                </p>
              </label>
            </div>

            {previewUrls.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                {previewUrls.map((url, idx) => (
                  <img
                    key={idx}
                    src={url}
                    alt={`Preview ${idx + 1}`}
                    className="w-20 h-20 object-cover rounded-lg"
                  />
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full py-3 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
          >
            {isSubmitting ? t('reimbursement.submitting') : t('reimbursement.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}