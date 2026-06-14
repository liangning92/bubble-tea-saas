import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { assetApi } from '../../services/api'
import { formatCurrency, formatDate } from '../../utils/helpers'
import { TrendingDown, Plus, Edit2, Trash2, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react'

interface FixedAsset {
  id: string
  name: string
  description?: string
  purchaseDate: string
  originalValue: number
  usefulLife: number
  salvageValue: number
  depreciationMethod: string
  status: string
  createdAt: string
}

interface DepreciationInfo {
  id: string
  name: string
  originalValue: number
  purchaseDate: string
  monthlyDepreciation: number
  accumulatedDepreciation: number
  currentValue: number
  monthsElapsed: number
  remainingMonths: number
}

export function FixedAssetsPage() {
  const { t } = useTranslation()
  const [assets, setAssets] = useState<FixedAsset[]>([])
  const [schedule, setSchedule] = useState<DepreciationInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'list' | 'schedule'>('list')
  const [showForm, setShowForm] = useState(false)
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    purchaseDate: '',
    originalValue: 0,
    usefulLife: 60,
    salvageValue: 0,
    depreciationMethod: 'straight_line'
  })

  const fetchAssets = async () => {
    try {
      setIsLoading(true)
      const res = await assetApi.list()
      setAssets(res.data.data.list || [])
    } catch (error) {
      console.error('Failed to fetch assets:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchSchedule = async () => {
    try {
      setIsLoading(true)
      const res = await assetApi.schedule()
      setSchedule(res.data.data || [])
    } catch (error) {
      console.error('Failed to fetch schedule:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'list') {
      fetchAssets()
    } else {
      fetchSchedule()
    }
  }, [activeTab])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const data = {
        ...formData,
        purchaseDate: new Date(formData.purchaseDate),
        originalValue: Number(formData.originalValue),
        usefulLife: Number(formData.usefulLife),
        salvageValue: Number(formData.salvageValue)
      }

      if (editingAsset) {
        await assetApi.update(editingAsset.id, data)
      } else {
        await assetApi.create(data)
      }

      setShowForm(false)
      setEditingAsset(null)
      resetForm()
      fetchAssets()
    } catch (error) {
      console.error('Failed to save asset:', error)
    }
  }

  const handleEdit = (asset: FixedAsset) => {
    setEditingAsset(asset)
    setFormData({
      name: asset.name,
      description: asset.description || '',
      purchaseDate: asset.purchaseDate.slice(0, 10),
      originalValue: asset.originalValue,
      usefulLife: asset.usefulLife,
      salvageValue: asset.salvageValue,
      depreciationMethod: asset.depreciationMethod
    })
    setShowForm(true)
  }

  const LARGE_AMOUNT_THRESHOLD = 10000000

  const handleDelete = async (id: string) => {
    const asset = assets.find(a => a.id === id)
    if (!asset) return
    if (asset.originalValue >= LARGE_AMOUNT_THRESHOLD) {
      const confirmed = window.confirm(
        `${t('finance.confirmLargeDelete')}\n${t('finance.assetName')}: ${asset.name}\n${t('finance.originalValue')}: ${formatCurrency(asset.originalValue)}`
      )
      if (!confirmed) return
    } else if (!confirm(t('finance.confirmDelete'))) {
      return
    }
    try {
      await assetApi.delete(id)
      fetchAssets()
    } catch (error) {
      console.error('Failed to delete asset:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      purchaseDate: '',
      originalValue: 0,
      usefulLife: 60,
      salvageValue: 0,
      depreciationMethod: 'straight_line'
    })
  }

  const totalOriginalValue = assets.reduce((sum, a) => sum + a.originalValue, 0)
  const totalCurrentValue = schedule.reduce((sum, s) => sum + s.currentValue, 0)
  const totalMonthlyDepreciation = schedule.reduce((sum, s) => sum + s.monthlyDepreciation, 0)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div />
        <button
          onClick={() => { resetForm(); setEditingAsset(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus size={18} />
          {t('common.add')}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-sm text-gray-500">{t('finance.totalOriginalValue')}</div>
          <div className="text-xl font-semibold text-gray-900">{formatCurrency(totalOriginalValue)}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-sm text-gray-500">{t('finance.currentNetValue')}</div>
          <div className="text-xl font-semibold text-primary">{formatCurrency(totalCurrentValue)}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-sm text-gray-500">{t('finance.monthlyDepreciation')}</div>
          <div className="text-xl font-semibold text-red-600 flex items-center gap-1">
            <TrendingDown size={18} />
            {formatCurrency(totalMonthlyDepreciation)}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-4 border-b">
        <button
          onClick={() => setActiveTab('list')}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'list'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('finance.assetList')}
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'schedule'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('finance.depreciationSchedule')}
        </button>
      </div>

      {/* Content */}
      {activeTab === 'list' ? (
        <div className="bg-white rounded-lg shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <RefreshCw className="animate-spin text-gray-400" size={24} />
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-500">
              <AlertCircle size={48} className="mb-3 text-gray-300" />
              <p>{t('finance.noAssets')}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t('finance.assetName')}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t('finance.purchaseDate')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">{t('finance.originalValue')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">{t('finance.usefulLife')}</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">{t('finance.status')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {assets.map(asset => (
                  <tr key={asset.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{asset.name}</div>
                      {asset.description && (
                        <div className="text-sm text-gray-500">{asset.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(asset.purchaseDate)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      {formatCurrency(asset.originalValue)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">
                      {asset.usefulLife} {t('finance.months')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        asset.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : asset.status === 'disposed'
                          ? 'bg-gray-100 text-gray-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {asset.status === 'active' ? <CheckCircle size={12} /> : null}
                        {t(`finance.status_${asset.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(asset)}
                          className="p-2 text-gray-400 hover:text-primary rounded-lg hover:bg-gray-100"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(asset.id)}
                          className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <RefreshCw className="animate-spin text-gray-400" size={24} />
            </div>
          ) : schedule.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-500">
              <TrendingDown size={48} className="mb-3 text-gray-300" />
              <p>{t('finance.noDepreciation')}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t('finance.assetName')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">{t('finance.originalValue')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">{t('finance.monthlyDepreciation')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">{t('finance.accumulatedDepreciation')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">{t('finance.currentValue')}</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">{t('finance.remaining')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {schedule.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">
                      {formatCurrency(item.originalValue)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-red-600">
                      {formatCurrency(item.monthlyDepreciation)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-orange-600">
                      {formatCurrency(item.accumulatedDepreciation)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 font-medium">
                      {formatCurrency(item.currentValue)}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">
                      {item.remainingMonths} {t('finance.months')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">
                {editingAsset ? t('finance.editAsset') : t('finance.addAsset')}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('finance.assetName')} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('finance.description')}
                </label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('finance.purchaseDate')} *
                </label>
                <input
                  type="date"
                  value={formData.purchaseDate}
                  onChange={e => setFormData({ ...formData, purchaseDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('finance.originalValue')} *
                  </label>
                  <input
                    type="number"
                    value={formData.originalValue}
                    onChange={e => setFormData({ ...formData, originalValue: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    required
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('finance.salvageValue')}
                  </label>
                  <input
                    type="number"
                    value={formData.salvageValue}
                    onChange={e => setFormData({ ...formData, salvageValue: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    min={0}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('finance.usefulLife')} ({t('finance.months')}) *
                </label>
                <input
                  type="number"
                  value={formData.usefulLife}
                  onChange={e => setFormData({ ...formData, usefulLife: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                  min={1}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingAsset(null); resetForm() }}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                >
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
