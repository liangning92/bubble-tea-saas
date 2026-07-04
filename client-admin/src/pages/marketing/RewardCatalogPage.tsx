import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { rewardApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Plus, Edit2, Trash2, X, Gift } from 'lucide-react'

interface Reward {
  id: string
  name: string
  description?: string
  type: string
  pointsCost: number
  value: number
  stock?: number
  validFrom: string
  validUntil: string
  isActive: boolean
}

const REWARD_TYPES = [
  { key: 'product', labelKey: 'marketing.product' },
  { key: 'addon', labelKey: 'marketing.addon' },
  { key: 'voucher', labelKey: 'marketing.voucher' },
  { key: 'gift', labelKey: 'marketing.gift' }
]

const DEFAULT_FORM = {
  name: '',
  description: '',
  type: 'product',
  pointsCost: 500,
  value: 0,
  stock: null as number | null,
  validFrom: new Date().toISOString().split('T')[0],
  validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  isActive: true
}

export function RewardCatalogPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const storeId = user?.storeId
  const queryClient = useQueryClient()

  const [showModal, setShowModal] = useState(false)
  const [editingReward, setEditingReward] = useState<Reward | null>(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: rewardsData, isLoading } = useQuery({
    queryKey: ['rewards'],
    queryFn: () => rewardApi.list({ active: true })
  })

  const createMutation = useMutation({
    mutationFn: (payload: typeof DEFAULT_FORM) => rewardApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rewards'] })
      closeModal()
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof DEFAULT_FORM }) => rewardApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rewards'] })
      closeModal()
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => rewardApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rewards'] })
      setDeleteId(null)
    }
  })

  const rewards: Reward[] = rewardsData?.data?.data?.list || []

  const closeModal = () => {
    setShowModal(false)
    setEditingReward(null)
    setForm(DEFAULT_FORM)
  }

  const openEdit = (reward: Reward) => {
    setEditingReward(reward)
    setForm({
      name: reward.name,
      description: reward.description || '',
      type: reward.type,
      pointsCost: reward.pointsCost,
      value: reward.value,
      stock: reward.stock ?? null,
      validFrom: reward.validFrom ? reward.validFrom.split('T')[0] : '',
      validUntil: reward.validUntil ? reward.validUntil.split('T')[0] : '',
      isActive: reward.isActive
    })
    setShowModal(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = { ...form, storeId }
    if (editingReward) {
      updateMutation.mutate({ id: editingReward.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const formatDate = (d: string) => {
    return d ? new Date(d).toLocaleDateString('id-ID') : '-'
  }

  const tl = (key: string, fallback: string) => {
    const translated = t(key)
    return translated === key ? fallback : translated
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={20} /> {t('marketing.addReward')}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
      ) : rewards.length === 0 ? (
        <div className="card text-center py-12">
          <Gift size={48} className="mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500 mb-4">{t('common.noData')}</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            {t('marketing.addReward')}
          </button>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3">{tl('marketing.rewardName', '奖励名称')}</th>
                <th className="pb-3">{tl('marketing.type', '类型')}</th>
                <th className="pb-3">{tl('marketing.pointsCost', '所需积分')}</th>
                <th className="pb-3">{tl('marketing.value', '价值')}</th>
                <th className="pb-3">{tl('marketing.stock', '库存')}</th>
                <th className="pb-3">{tl('marketing.validity', '有效期')}</th>
                <th className="pb-3">{tl('common.status', '状态')}</th>
                <th className="pb-3">{tl('common.actions', '操作')}</th>
              </tr>
            </thead>
            <tbody>
              {rewards.map(r => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-3">
                    <div className="font-medium">{r.name}</div>
                    {r.description && <div className="text-sm text-gray-500">{r.description}</div>}
                  </td>
                  <td className="py-3">
                    <span className="badge badge-gray">
                      {t(REWARD_TYPES.find(rewardType => rewardType.key === r.type)?.labelKey || 'marketing.' + r.type)}
                    </span>
                  </td>
                  <td className="py-3 font-medium text-primary">{r.pointsCost}</td>
                  <td className="py-3">Rp {r.value?.toLocaleString()}</td>
                  <td className="py-3">{r.stock ?? '∞'}</td>
                  <td className="py-3 text-sm text-gray-500">
                    {formatDate(r.validFrom)} - {formatDate(r.validUntil)}
                  </td>
                  <td className="py-3">
                    <span className={"badge " + (r.isActive ? 'badge-success' : 'badge-gray')}>
                      {r.isActive ? tl('common.active', '激活') : tl('common.inactive', '停用')}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(r)} className="btn-ghost text-sm"><Edit2 size={14} /></button>
                      <button onClick={() => setDeleteId(r.id)} className="btn-ghost text-red-500 text-sm"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {editingReward ? tl('marketing.editReward', '编辑奖励') : tl('marketing.addReward', '添加奖励')}
              </h3>
              <button onClick={closeModal} className="p-1 rounded hover:bg-gray-100"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{tl('marketing.rewardName', '奖励名称')} *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{tl('marketing.type', '类型')}</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="input"
                >
                  {REWARD_TYPES.map(rewardType => (
                    <option key={rewardType.key} value={rewardType.key}>{t(rewardType.labelKey)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{tl('marketing.pointsCost', '所需积分')} *</label>
                  <input
                    type="number"
                    value={form.pointsCost}
                    onChange={e => setForm(f => ({ ...f, pointsCost: Number(e.target.value) }))}
                    className="input"
                    min={1}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{tl('marketing.value', '价值 (Rp)')}</label>
                  <input
                    type="number"
                    value={form.value}
                    onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
                    className="input"
                    min={0}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{tl('marketing.stock', '库存')}</label>
                <input
                  type="number"
                  value={form.stock ?? ''}
                  onChange={e => setForm(f => ({ ...f, stock: e.target.value ? Number(e.target.value) : null }))}
                  className="input"
                  placeholder="∞"
                  min={0}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{tl('marketing.validFrom', '开始日期')}</label>
                  <input
                    type="date"
                    value={form.validFrom}
                    onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{tl('marketing.validUntil', '结束日期')}</label>
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))}
                    className="input"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={16} className="animate-spin" />}
                  {tl('common.save', '保存')}
                </button>
                <button type="button" onClick={closeModal} className="btn-secondary">{tl('common.cancel', '取消')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm pointer-events-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">{tl('common.delete', '删除')}</h3>
            <p className="text-gray-600 mb-6">{tl('marketing.deleteRewardConfirm', '确定删除此奖励？')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
                className="btn-danger flex-1 flex items-center justify-center gap-2"
              >
                {deleteMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                {tl('common.delete', '删除')}
              </button>
              <button onClick={() => setDeleteId(null)} className="btn-secondary flex-1">
                {tl('common.cancel', '取消')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
