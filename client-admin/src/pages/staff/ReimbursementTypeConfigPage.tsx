import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { reimbursementTypeApi } from '../../services/api'
import { Plus, Edit2, Trash2, RefreshCw, X } from 'lucide-react'

interface ReimbursementType {
  id: string
  code: string
  name: string
  color: string
  icon?: string
  maxAmount?: number
  requiresReceipt: boolean
  isActive: boolean
  sortOrder: number
}

const DEFAULT_COLORS = ['#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280', '#EC6D88']

export function ReimbursementTypeConfigPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()

  const [types, setTypes] = useState<ReimbursementType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingType, setEditingType] = useState<ReimbursementType | null>(null)
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    color: '#EC6D88',
    maxAmount: '',
    requiresReceipt: true,
    sortOrder: 0
  })

  useEffect(() => {
    loadTypes()
  }, [user])

  const loadTypes = async () => {
    setIsLoading(true)
    try {
      const response = await reimbursementTypeApi.listAll()
      setTypes(response.data?.data || [])
    } catch (error) {
      console.error('Failed to load types:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSeed = async () => {
    try {
      await reimbursementTypeApi.seed()
      loadTypes()
    } catch (error) {
      console.error('Failed to seed types:', error)
    }
  }

  const handleOpenModal = (type?: ReimbursementType) => {
    if (type) {
      setEditingType(type)
      setFormData({
        code: type.code,
        name: type.name,
        color: type.color,
        maxAmount: type.maxAmount?.toString() || '',
        requiresReceipt: type.requiresReceipt,
        sortOrder: type.sortOrder
      })
    } else {
      setEditingType(null)
      setFormData({
        code: '',
        name: '',
        color: '#EC6D88',
        maxAmount: '',
        requiresReceipt: true,
        sortOrder: types.length + 1
      })
    }
    setShowModal(true)
  }

  const handleSave = async () => {
    try {
      const data = {
        ...formData,
        maxAmount: formData.maxAmount ? parseInt(formData.maxAmount) : null
      }

      if (editingType) {
        await reimbursementTypeApi.update(editingType.id, data)
      } else {
        await reimbursementTypeApi.create(data)
      }

      setShowModal(false)
      loadTypes()
    } catch (error) {
      console.error('Failed to save type:', error)
      alert(t('reimbTypes.saveFailed'))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('reimbTypes.deleteConfirm'))) return
    try {
      await reimbursementTypeApi.delete(id)
      loadTypes()
    } catch (error) {
      console.error('Failed to delete type:', error)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSeed}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1"
            >
              <RefreshCw size={16} />
              {t('reimbTypes.seedDefault')}
            </button>
            <button
              onClick={() => handleOpenModal()}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover text-sm font-medium flex items-center gap-1"
            >
              <Plus size={18} />
              {t('reimbTypes.addType')}
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">{t('reimbTypes.loading')}</div>
        ) : types.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl">
            <p className="text-gray-500 mb-4">{t('reimbTypes.noData')}</p>
            <button
              onClick={handleSeed}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover text-sm"
            >
              {t('reimbTypes.generateDefault')}
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {types.map((type) => (
              <div key={type.id} className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: type.color + '20' }}
                    >
                      <div
                        className="w-5 h-5 rounded"
                        style={{ backgroundColor: type.color }}
                      />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{type.name}</p>
                      <p className="text-xs text-gray-500">{type.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenModal(type)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                      <Edit2 size={16} className="text-gray-500" />
                    </button>
                    <button
                      onClick={() => handleDelete(type.id)}
                      className="p-2 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={16} className="text-red-500" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">{t('reimbTypes.requiresReceipt')}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      type.requiresReceipt ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {type.requiresReceipt ? t('common.yes') : t('common.no')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">{t('reimbTypes.maxSubmission')}</span>
                    <span className="font-medium">
                      {type.maxAmount ? formatCurrency(type.maxAmount) : t('reimbTypes.unlimited')}
                    </span>
                  </div>
                </div>

                {!type.isActive && (
                  <div className="mt-3 px-2 py-1 bg-red-100 text-red-700 rounded text-xs text-center">
                    {t('reimbTypes.inactive')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-xl p-6 mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">
                {editingType ? t('reimbTypes.editTitle') : t('reimbTypes.addTitle')}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('reimbTypes.code')}</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder={t('reimbTypes.codePlaceholder')}
                  disabled={!!editingType}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('reimbTypes.name')}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder={t('reimbTypes.namePlaceholder')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('reimbTypes.color')}</label>
                <div className="flex gap-2 flex-wrap">
                  {DEFAULT_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-10 h-10 rounded-lg ${formData.color === color ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('reimbTypes.maxAmountLabel')}</label>
                <input
                  type="number"
                  value={formData.maxAmount}
                  onChange={(e) => setFormData({ ...formData, maxAmount: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder={t('reimbTypes.maxAmountPlaceholder')}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="requiresReceipt"
                  checked={formData.requiresReceipt}
                  onChange={(e) => setFormData({ ...formData, requiresReceipt: e.target.checked })}
                  className="w-5 h-5"
                />
                <label htmlFor="requiresReceipt" className="text-sm">{t('reimbTypes.receiptRequired')}</label>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl"
                >
                  {t('reimbTypes.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-3 bg-primary text-white rounded-xl font-medium"
                >
                  {t('reimbTypes.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
