import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { reimbursementApi } from '../../services/api'
import { Receipt, CheckCircle, XCircle, Clock, Filter, DollarSign } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  paid: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-gray-100 text-gray-500'
}

interface Reimbursement {
  id: string
  staffId: string
  type: string
  amount: number
  description: string
  receiptUrls?: string
  status: string
  staff?: {
    id: string
    name: string
    employeeNumber: string
  }
  createdAt: string
}

export function ReimbursementListPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()

  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [selectedItem, setSelectedItem] = useState<Reimbursement | null>(null)
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'paid' | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    loadData()
  }, [user, filterStatus])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const params: any = {}
      params.storeId = user?.storeId // Ensure data is filtered by store
      if (filterStatus) params.status = filterStatus
      const response = await reimbursementApi.list(params)
      setReimbursements(response.data?.data || [])
    } catch (error) {
      console.error('Failed to load reimbursements:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleApprove = async (id: string) => {
    try {
      await reimbursementApi.approve(id)
      loadData()
      setSelectedItem(null)
      setActionType(null)
    } catch (error) {
      console.error('Failed to approve:', error)
      alert(t('reimbursement.approveFailed'))
    }
  }

  const handleReject = async (id: string) => {
    if (!rejectReason) {
      alert(t('reimbursement.fillRejectReason'))
      return
    }
    try {
      await reimbursementApi.reject(id, rejectReason)
      loadData()
      setSelectedItem(null)
      setActionType(null)
      setRejectReason('')
    } catch (error) {
      console.error('Failed to reject:', error)
      alert(t('reimbursement.rejectFailed'))
    }
  }

  const handleMarkPaid = async (id: string) => {
    try {
      await reimbursementApi.markPaid(id)
      loadData()
      setSelectedItem(null)
      setActionType(null)
    } catch (error) {
      console.error('Failed to mark paid:', error)
      alert(t('reimbursement.markPaidFailed'))
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

  const pendingCount = reimbursements.filter(r => r.status === 'pending').length
  const approvedCount = reimbursements.filter(r => r.status === 'approved').length

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return t('reimbursement.statusPending')
      case 'approved': return t('reimbursement.statusApproved')
      case 'paid': return t('reimbursement.statusPaid')
      case 'rejected': return t('reimbursement.statusRejected')
      case 'cancelled': return t('reimbursement.statusCancelled')
      default: return status
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'transportation': return t('reimbursement.typeTransportation')
      case 'meals': return t('reimbursement.typeMeals')
      case 'communication': return t('reimbursement.typeCommunication')
      case 'medical': return t('reimbursement.typeMedical')
      case 'other': return t('reimbursement.typeOther')
      default: return type
    }
  }

  const getActionTitle = () => {
    switch (actionType) {
      case 'approve': return t('reimbursement.approveTitle')
      case 'reject': return t('reimbursement.rejectTitle')
      case 'paid': return t('reimbursement.markPaidTitle')
      default: return ''
    }
  }

  const getActionLabel = () => {
    switch (actionType) {
      case 'approve': return t('reimbursement.approve')
      case 'reject': return t('reimbursement.reject')
      case 'paid': return t('reimbursement.markPaid')
      default: return ''
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Receipt size={28} />
            <div />
          </div>
        </div>
      </header>

      {/* Filter */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Filter size={20} className="text-gray-500" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="flex-1 p-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">{t('reimbursement.allStatus')}</option>
            <option value="pending">{t('reimbursement.statusPending')}</option>
            <option value="approved">{t('reimbursement.statusApproved')}</option>
            <option value="paid">{t('reimbursement.statusPaid')}</option>
            <option value="rejected">{t('reimbursement.statusRejected')}</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      {(pendingCount > 0 || approvedCount > 0) && (
        <div className="p-4 flex gap-4">
          {pendingCount > 0 && (
            <div className="flex-1 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <p className="text-yellow-800 text-sm font-medium">{t('reimbursement.summaryPending')}</p>
              <p className="text-2xl font-bold text-yellow-900">{pendingCount}</p>
            </div>
          )}
          {approvedCount > 0 && (
            <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-green-800 text-sm font-medium">{t('reimbursement.summaryReadyToPay')}</p>
              <p className="text-2xl font-bold text-green-900">{approvedCount}</p>
            </div>
          )}
        </div>
      )}

      {/* List */}
      <div className="p-4 space-y-4">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">{t('reimbursement.loading')}</div>
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
                    <p className="font-bold text-gray-900">
                      {item.staff?.name || t('staff.name')}
                    </p>
                    <p className="text-sm text-gray-500">
                      {item.staff?.employeeNumber || '-'}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[item.status]}`}>
                    {getStatusLabel(item.status)}
                  </span>
                </div>

                <div className="mb-3">
                  <span className="inline-block px-2 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary">
                    {getTypeLabel(item.type)}
                  </span>
                </div>

                <div className="text-2xl font-bold text-gray-900 mb-2">
                  {formatCurrency(item.amount)}
                </div>

                <p className="text-gray-600 text-sm mb-3">{item.description}</p>

                {receipts.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                    <Clock size={16} />
                    <span>{receipts.length} {t('reimbursement.attachments')}</span>
                  </div>
                )}

                <div className="text-sm text-gray-500 mb-3">
                  {t('reimbursement.submittedOn', { date: formatDate(item.createdAt) })}
                </div>

                {item.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedItem(item)
                        setActionType('approve')
                      }}
                      className="flex-1 py-2 text-sm text-green-600 border border-green-200 rounded-lg hover:bg-green-50 flex items-center justify-center gap-1"
                    >
                      <CheckCircle size={16} />
                      {t('reimbursement.approve')}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedItem(item)
                        setActionType('reject')
                      }}
                      className="flex-1 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 flex items-center justify-center gap-1"
                    >
                      <XCircle size={16} />
                      {t('reimbursement.reject')}
                    </button>
                  </div>
                )}

                {item.status === 'approved' && (
                  <button
                    onClick={() => {
                      setSelectedItem(item)
                      setActionType('paid')
                    }}
                    className="w-full py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 flex items-center justify-center gap-1"
                  >
                    <DollarSign size={16} />
                    {t('reimbursement.markPaid')}
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Action Modal */}
      {selectedItem && actionType && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 mx-4 pointer-events-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">
              {getActionTitle()}
            </h2>

            <div className="mb-4 p-4 bg-gray-50 rounded-xl">
              <p className="font-medium">{selectedItem.staff?.name}</p>
              <p className="text-sm text-gray-500">
                {getTypeLabel(selectedItem.type)} - {formatCurrency(selectedItem.amount)}
              </p>
             <p className="text-sm text-gray-500">{selectedItem.description}</p>
            </div>

            {actionType === 'reject' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('reimbursement.rejectReason')}
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder={t('reimbursement.rejectReasonPlaceholder')}
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedItem(null)
                  setActionType(null)
                  setRejectReason('')
                }}
                className="flex-1 py-3 border border-gray-200 rounded-xl"
              >
                {t('reimbursement.cancel')}
              </button>
              <button
                onClick={() => {
                  if (actionType === 'approve') {
                    handleApprove(selectedItem.id)
                  } else if (actionType === 'reject') {
                    handleReject(selectedItem.id)
                  } else {
                    handleMarkPaid(selectedItem.id)
                  }
                }}
                className={`flex-1 py-3 rounded-xl text-white ${
                  actionType === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : actionType === 'reject'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {getActionLabel()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
