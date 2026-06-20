import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { channelApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Link2, Plus, Edit2, Trash2, Loader2 } from 'lucide-react'

// 预置渠道类型
const PRESET_CHANNELS = [
  { name: '堂食', code: 'DINE_IN', commission: 0, icon: '🍵' },
  { name: 'POS收银', code: 'POS', commission: 0, icon: '💳' },
  { name: 'GoFood', code: 'GOFOOD', commission: 0.2, icon: '🟢' },
  { name: 'GrabFood', code: 'GRAB', commission: 0.2, icon: '🟡' },
  { name: 'ShopeeFood', code: 'SHOPEE', commission: 0.18, icon: '🟠' },
  { name: 'Tokopedia', code: 'TOKOPEDIA', commission: 0.15, icon: '🛒' },
  { name: 'TikTok Shop', code: 'TIKTOK', commission: 0.12, icon: '🎵' },
]

interface Channel {
  id: string
  name: string
  code: string
  status: 'active' | 'inactive'
  commission: number
  icon?: string
  sortOrder: number
  storeId?: string
}

interface ChannelFormData {
  name: string
  code: string
  commission: number
  status: 'active' | 'inactive'
  icon?: string
  sortOrder: number
}

export function ChannelListPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [formData, setFormData] = useState<ChannelFormData>({
    name: '',
    code: '',
    commission: 0,
    status: 'active',
    sortOrder: 0
  })

  // 获取渠道列表
  const { data, isLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: () => channelApi.list()
  })

  const channels: Channel[] = data?.data?.data?.list || []

  // 创建渠道
  const createMutation = useMutation({
    mutationFn: (data: ChannelFormData) =>
      channelApi.create({ ...data, storeId: user?.storeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      closeModal()
    }
  })

  // 更新渠道
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ChannelFormData }) =>
      channelApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      closeModal()
    }
  })

  // 删除渠道
  const deleteMutation = useMutation({
    mutationFn: (id: string) => channelApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      setDeleteConfirm(null)
    }
  })

  // 切换状态
  const toggleStatus = (channel: Channel) => {
    updateMutation.mutate({
      id: channel.id,
      data: { ...channel, status: channel.status === 'active' ? 'inactive' : 'active' }
    })
  }

  const openModal = (channel?: Channel) => {
    if (channel) {
      setEditingChannel(channel)
      setFormData({
        name: channel.name,
        code: channel.code,
        commission: channel.commission,
        status: channel.status,
        icon: channel.icon,
        sortOrder: channel.sortOrder || 0
      })
    } else {
      setEditingChannel(null)
      setFormData({ name: '', code: '', commission: 0, status: 'active', sortOrder: channels.length })
    }
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingChannel(null)
    setFormData({ name: '', code: '', commission: 0, status: 'active', sortOrder: 0 })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingChannel) {
      updateMutation.mutate({ id: editingChannel.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id)
  }

  const quickAddChannel = (preset: typeof PRESET_CHANNELS[0]) => {
    setFormData({
      name: preset.name,
      code: preset.code,
      commission: preset.commission,
      status: 'active',
      icon: preset.icon,
      sortOrder: channels.length
    })
    setIsModalOpen(true)
  }

  // 计算哪些预设渠道还未添加
  const availablePresets = PRESET_CHANNELS.filter(
    p => !channels.some(c => c.code === p.code)
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
          <Plus size={20} />
          {t('channels.addChannel')}
        </button>
      </div>

      {/* 快速添加预设渠道 */}
      {availablePresets.length > 0 && (
        <div className="mb-6">
          <p className="text-sm text-gray-500 mb-2">{t('channels.quickAdd') || 'Quick Add:'}</p>
          <div className="flex flex-wrap gap-2">
            {availablePresets.map((preset) => (
              <button
                key={preset.code}
                onClick={() => quickAddChannel(preset)}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-sm flex items-center gap-1 transition-colors"
              >
                <span>{preset.icon}</span>
                <span>{preset.name}</span>
                <span className="text-xs text-gray-400">({preset.commission * 100}%)</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-12">
            <Link2 size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">{t('common.noData')}</p>
            <button onClick={() => openModal()} className="btn-primary mt-4">
              {t('channels.addFirst')}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">{t('channels.name')}</th>
                  <th className="pb-3 font-medium">{t('channels.code')}</th>
                  <th className="pb-3 font-medium">{t('channels.commission')}</th>
                  <th className="pb-3 font-medium">{t('channels.status')}</th>
                  <th className="pb-3 font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((channel) => (
                  <tr key={channel.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{channel.icon || '📦'}</span>
                        <span className="font-medium text-gray-900">{channel.name}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">{channel.code}</code>
                    </td>
                    <td className="py-3">
                      {channel.commission > 0 ? (
                        <span className="text-orange-600">{(channel.commission * 100).toFixed(0)}%</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => toggleStatus(channel)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          channel.status === 'active'
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {channel.status === 'active' ? t('common.active') : t('common.inactive')}
                      </button>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openModal(channel)}
                          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(channel.id)}
                          className="p-2 rounded-lg hover:bg-gray-100 text-red-500"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 创建/编辑弹窗 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingChannel ? t('channels.editChannel') : t('channels.addChannel')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('channels.name')} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  placeholder="如：GoFood"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('channels.code')} *
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="input"
                  placeholder="如：GOFOOD"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  图标 (emoji)
                </label>
                <input
                  type="text"
                  value={formData.icon || ''}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  className="input w-24"
                  placeholder="🟢"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('channels.commission')} (%)
                </label>
                <input
                  type="number"
                  value={(formData.commission * 100).toFixed(0)}
                  onChange={(e) => setFormData({ ...formData, commission: (parseFloat(e.target.value) || 0) / 100 })}
                  className="input w-32"
                  min="0"
                  max="100"
                />
                <p className="text-xs text-gray-500 mt-1">外卖平台佣金比例，如GoFood通常为20%</p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin mx-auto" />
                  ) : (
                    t('common.save')
                  )}
                </button>
                <button type="button" onClick={closeModal} className="btn-secondary">
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">{t('common.confirm')}</h2>
            <p className="text-gray-600 mb-4">
              确定要删除此渠道吗？删除后，该渠道的订单将无法接收。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="btn-danger flex-1"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 size={16} className="animate-spin mx-auto" /> : t('common.delete')}
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