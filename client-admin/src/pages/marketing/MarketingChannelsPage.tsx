import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import {
  Plus, Loader2, Globe, ShoppingBag, Store, Phone, Building2,
  Edit2, Trash2, Search,
  Users, DollarSign, BarChart3, X, Check
} from 'lucide-react'

// 预设渠道类型 - 奶茶店常用渠道
const PRESET_CHANNELS = [
  { name: 'GoFood', code: 'GFOOD', type: 'delivery_platform', commission: 0.20, icon: '🟢' },
  { name: 'GrabFood', code: 'GRAB', type: 'delivery_platform', commission: 0.20, icon: '🟡' },
  { name: 'ShopeeFood', code: 'SHOPEE', type: 'delivery_platform', commission: 0.18, icon: '🟠' },
  { name: 'Tokopedia', code: 'TOKOPEDIA', type: 'delivery_platform', commission: 0.15, icon: '🛒' },
  { name: 'TikTok Shop', code: 'TIKTOK', type: 'delivery_platform', commission: 0.12, icon: '🎵' },
  { name: 'Walk-in', code: 'WALKIN', type: 'offline', commission: 0, icon: '🚶' },
  { name: 'Call Order', code: 'CALL', type: 'call', commission: 0, icon: '📞' },
  { name: 'Corporate', code: 'CORPORATE', type: 'corporate', commission: 0.05, icon: '🏢' },
]

// 渠道类型配置
const CHANNEL_TYPES = [
  { key: 'offline', label: 'offline', icon: Store },
  { key: 'delivery_platform', label: 'deliveryPlatform', icon: ShoppingBag },
  { key: 'online', label: 'online', icon: Globe },
  { key: 'call', label: 'callOrder', icon: Phone },
  { key: 'corporate', label: 'corporate', icon: Building2 },
]

interface MarketingChannel {
  id: string
  name: string
  code: string
  type: string
  commission: number
  status: string
  sortOrder: number
  storeId?: string
  _count?: {
    members: number
    memberChannels: number
  }
  stats?: {
    orderCount: number
    totalRevenue: number
    totalCost: number
    netRevenue: number
  }
}

interface ChannelFormData {
  name: string
  code: string
  type: string
  commission: number
  status: 'active' | 'inactive'
  sortOrder: number
}

const defaultFormData: ChannelFormData = {
  name: '',
  code: '',
  type: 'offline',
  commission: 0,
  status: 'active',
  sortOrder: 0,
}

export function MarketingChannelsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const storeId = user?.storeId || 'default'

  // 状态
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editingChannel, setEditingChannel] = useState<MarketingChannel | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [formData, setFormData] = useState<ChannelFormData>(defaultFormData)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // 获取渠道列表
  const { data, isLoading, isError } = useQuery({
    queryKey: ['marketing-channels', storeId],
    queryFn: () => marketingApi.marketingChannels(storeId),
  })

  const channels: MarketingChannel[] = data?.data?.data?.list || []

  // 计算哪些预设渠道还未添加
  const availablePresets = useMemo(() => {
    return PRESET_CHANNELS.filter(
      p => !channels.some(c => c.code === p.code)
    )
  }, [channels])

  // 过滤后的渠道
  const filteredChannels = useMemo(() => {
    return channels.filter(ch => {
      const matchKeyword = searchKeyword
        ? ch.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
          ch.code.toLowerCase().includes(searchKeyword.toLowerCase())
        : true
      const matchType = filterType !== 'all' ? ch.type === filterType : true
      const matchStatus = filterStatus !== 'all' ? ch.status === filterStatus : true
      return matchKeyword && matchType && matchStatus
    })
  }, [channels, searchKeyword, filterType, filterStatus])

  // 创建渠道
  const createMutation = useMutation({
    mutationFn: (data: ChannelFormData) =>
      marketingApi.createMarketingChannel({ ...data, storeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-channels'] })
      closeModal()
    },
    onError: (error: any) => {
      setErrorMessage(error?.message || t('common.error') || 'Failed to create channel')
      setTimeout(() => setErrorMessage(null), 3000)
    }
  })

  // 更新渠道
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ChannelFormData }) =>
      marketingApi.updateMarketingChannel(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-channels'] })
      closeModal()
    },
    onError: (error: any) => {
      setErrorMessage(error?.message || t('common.error') || 'Failed to update channel')
      setTimeout(() => setErrorMessage(null), 3000)
    }
  })

  // 删除渠道
  const deleteMutation = useMutation({
    mutationFn: (id: string) => marketingApi.deleteMarketingChannel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-channels'] })
      setDeleteConfirm(null)
    },
    onError: (error: any) => {
      setErrorMessage(error?.message || t('common.error') || 'Failed to delete channel')
      setTimeout(() => setErrorMessage(null), 3000)
    }
  })

  const closeModal = () => {
    setShowCreate(false)
    setShowEdit(false)
    setEditingChannel(null)
    setFormData(defaultFormData)
  }

  const openEditModal = (channel: MarketingChannel) => {
    setEditingChannel(channel)
    setFormData({
      name: channel.name,
      code: channel.code,
      type: channel.type,
      commission: channel.commission,
      status: channel.status as 'active' | 'inactive',
      sortOrder: channel.sortOrder || 0,
    })
    setShowEdit(true)
  }

  const openCreateModal = (preset?: typeof PRESET_CHANNELS[0]) => {
    if (preset) {
      setFormData({
        name: preset.name,
        code: preset.code,
        type: preset.type,
        commission: preset.commission,
        status: 'active',
        sortOrder: channels.length,
      })
    } else {
      setFormData({ ...defaultFormData, sortOrder: channels.length })
    }
    setShowCreate(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (showEdit && editingChannel) {
      updateMutation.mutate({ id: editingChannel.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id)
  }

  const getChannelIcon = (type: string) => {
    const typeConfig = CHANNEL_TYPES.find(t => t.key === type)
    const IconComponent = typeConfig?.icon || Globe
    return <IconComponent size={20} className="text-gray-500" />
  }

  const getChannelTypeLabel = (type: string) => {
    const typeConfig = CHANNEL_TYPES.find(t => t.key === type)
    return typeConfig ? t(`marketing.${typeConfig.label}`) : type
  }

  // 统计计算
  const stats = useMemo(() => {
    const totalChannels = channels.length
    const activeChannels = channels.filter(c => c.status === 'active').length
    const totalMembers = channels.reduce((sum, c) => sum + (c._count?.members || 0), 0)
    const totalRevenue = channels.reduce((sum, c) => sum + (c.stats?.totalRevenue || 0), 0)
    const totalCommission = channels.reduce(
      (sum, c) => sum + (c.stats?.totalRevenue || 0) * c.commission, 0
    )
    return { totalChannels, activeChannels, totalMembers, totalRevenue, totalCommission }
  }, [channels])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div />
        <button onClick={() => openCreateModal()} className="btn-primary flex items-center gap-2">
          <Plus size={20} /> {t('marketing.addChannel')}
        </button>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {errorMessage}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <BarChart3 size={20} className="text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{stats.totalChannels}</div>
              <div className="text-xs text-gray-500">{t('marketing.totalChannels')}</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Check size={20} className="text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{stats.activeChannels}</div>
              <div className="text-xs text-gray-500">{t('common.active')}</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Users size={20} className="text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{stats.totalMembers}</div>
              <div className="text-xs text-gray-500">{t('marketing.totalMembers')}</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <DollarSign size={20} className="text-orange-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalRevenue)}</div>
              <div className="text-xs text-gray-500">{t('marketing.totalRevenue')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Add Presets */}
      {availablePresets.length > 0 && (
        <div className="mb-6">
          <p className="text-sm text-gray-500 mb-2">{t('marketing.quickAdd')}</p>
          <div className="flex flex-wrap gap-2">
            {availablePresets.map((preset) => (
              <button
                key={preset.code}
                onClick={() => openCreateModal(preset)}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-sm flex items-center gap-1.5 transition-colors"
              >
                <span>{preset.icon}</span>
                <span>{preset.name}</span>
                <span className="text-xs text-gray-400">({preset.commission * 100}%)</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder={t('marketing.searchChannel')}
            className="input pl-10 w-full"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="input w-auto"
        >
          <option value="all">{t('marketing.allTypes')}</option>
          {CHANNEL_TYPES.map(type => (
            <option key={type.key} value={type.key}>{t(`marketing.${type.label}`)}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input w-auto"
        >
          <option value="all">{t('marketing.allStatuses')}</option>
          <option value="active">{t('common.active')}</option>
          <option value="inactive">{t('common.inactive')}</option>
        </select>
      </div>

      {/* Channel List */}
      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-12 text-red-500">
            <Globe size={48} className="mb-4 opacity-50" />
            <p>{t('common.error')}</p>
            <button onClick={() => queryClient.invalidateQueries({ queryKey: ['marketing-channels'] })} className="btn-primary mt-4">
              {t('common.reload')}
            </button>
          </div>
        ) : filteredChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Globe size={48} className="mb-4 opacity-50" />
            <p>{t('common.noData')}</p>
            <button onClick={() => openCreateModal()} className="btn-primary mt-4">
              {t('marketing.addChannel')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {filteredChannels.map((ch) => (
              <div
                key={ch.id}
                className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg">
                      {getChannelIcon(ch.type)}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{ch.name}</div>
                      <div className="text-xs text-gray-500 font-mono">{ch.code}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`badge ${ch.status === 'active' ? 'badge-success' : 'badge-gray'}`}>
                      {ch.status === 'active' ? t('common.active') : t('common.inactive')}
                    </span>
                    <button
                      onClick={() => openEditModal(ch)}
                      className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600"
                      title={t('common.edit')}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(ch.id)}
                      className="p-1.5 rounded-lg hover:bg-gray-200 text-red-500"
                      title={t('common.delete')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Type & Commission */}
                <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                  <span className="flex items-center gap-1">
                    {getChannelIcon(ch.type)}
                    <span>{getChannelTypeLabel(ch.type)}</span>
                  </span>
                  {ch.commission > 0 && (
                    <span className="text-orange-600 font-medium">
                      {(ch.commission * 100).toFixed(0)}% {t('marketing.commission')}
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-200">
                  <div className="text-center">
                    <div className="text-lg font-bold text-gray-900">
                      {ch._count?.members || 0}
                    </div>
                    <div className="text-xs text-gray-500">{t('marketing.members')}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-gray-900">
                      {ch.stats?.orderCount || 0}
                    </div>
                    <div className="text-xs text-gray-500">{t('marketing.orders')}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-600">
                      {formatCurrency(ch.stats?.totalRevenue || 0).replace('Rp', '')}
                    </div>
                    <div className="text-xs text-gray-500">Revenue</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t('marketing.addChannel')}</h3>
              <button onClick={closeModal} className="p-1 rounded-lg hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('marketing.channelName')} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  placeholder={t('marketing.channelNamePlaceholder')}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('marketing.channelCode')} *
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="input font-mono"
                  placeholder="GFOOD"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('marketing.channelType')}
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="input"
                >
                  {CHANNEL_TYPES.map(type => (
                    <option key={type.key} value={type.key}>
                      {t(`marketing.${type.label}`)}
                    </option>
                  ))}
                 </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('marketing.commission')} (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={(formData.commission * 100).toFixed(0)}
                  onChange={(e) => setFormData({ ...formData, commission: (parseFloat(e.target.value) || 0) / 100 })}
                  className="input w-32"
                  min="0"
                  max="100"
                />
                <p className="text-xs text-gray-500 mt-1">{t('marketing.commissionHint')}</p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                  {t('common.save')}
                </button>
                <button type="button" onClick={closeModal} className="btn-secondary">
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && editingChannel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t('marketing.editChannel')}</h3>
              <button onClick={closeModal} className="p-1 rounded-lg hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('marketing.channelName')} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('marketing.channelCode')} *
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="input font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('marketing.channelType')}
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="input"
                >
                  {CHANNEL_TYPES.map(type => (
                    <option key={type.key} value={type.key}>
                      {t(`marketing.${type.label}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('marketing.commission')} (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={(formData.commission * 100).toFixed(0)}
                  onChange={(e) => setFormData({ ...formData, commission: (parseFloat(e.target.value) || 0) / 100 })}
                  className="input w-32"
                  min="0"
                  max="100"
                />
                <p className="text-xs text-gray-500 mt-1">{t('marketing.commissionHint')}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, status: prev.status === 'active' ? 'inactive' : 'active' }))}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    formData.status === 'active'
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {formData.status === 'active' ? t('common.active') : t('common.inactive')}
                </button>
                <span className="text-sm text-gray-500">{t('marketing.channelStatus')}</span>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                  {t('common.save')}
                </button>
                <button type="button" onClick={closeModal} className="btn-secondary">
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">{t('common.confirm')}</h2>
            <p className="text-gray-600 mb-4">
              {t('marketing.deleteConfirm')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="btn-danger flex-1 flex items-center justify-center gap-2"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                {t('common.delete')}
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}