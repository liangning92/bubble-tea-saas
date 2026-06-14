import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Plus, Loader2, Users, Gift, Edit2, Trash2, X, Star } from 'lucide-react'

interface Referral {
  id: string
  name: string
  referralCode: string
  inviterReward: string
  rewardeeReward: string
  minOrderAmount: number
  maxUsageCount: number
  currentUsage?: number
  startDate?: string
  endDate?: string
  status: string
  storeId?: string
}

const defaultForm = {
  name: '',
  referralCode: '',
  inviterRewardType: 'points' as 'points' | 'coupon',
  inviterRewardValue: 100,
  inviterRewardCouponId: '',
  rewardeeRewardType: 'points' as 'points' | 'coupon',
  rewardeeRewardValue: 50,
  rewardeeRewardCouponId: '',
  minOrderAmount: 0,
  maxUsageCount: 0,
  startDate: '',
  endDate: '',
  status: 'active' as 'active' | 'inactive'
}

export function ReferralListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const storeId = user?.storeId || undefined

  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editingReferral, setEditingReferral] = useState<Referral | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [form, setForm] = useState(defaultForm)

  // Query for coupons to use as rewards
  const { data: couponsData } = useQuery({
    queryKey: ['coupons'],
    queryFn: () => marketingApi.coupons(storeId)
  })
  const coupons = couponsData?.data?.data?.list || []

  const { data, isLoading } = useQuery({
    queryKey: ['referrals'],
    queryFn: () => marketingApi.referrals(storeId)
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => marketingApi.createReferral(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] })
      closeModal()
    },
    onError: (error: any) => {
      alert(error?.message || t('common.error'))
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => marketingApi.updateReferral(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] })
      closeModal()
    },
    onError: (error: any) => {
      alert(error?.message || t('common.error'))
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => marketingApi.deleteReferral(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] })
      setDeleteConfirm(null)
    },
    onError: (error: any) => {
      alert(error?.message || t('common.error'))
    }
  })

  const referrals: Referral[] = data?.data?.data?.list || []

  const closeModal = () => {
    setShowCreate(false)
    setShowEdit(false)
    setEditingReferral(null)
    setForm(defaultForm)
  }

  const openEditModal = (referral: Referral) => {
    const inviterReward = parseReward(referral.inviterReward)
    const rewardeeReward = parseReward(referral.rewardeeReward)
    setEditingReferral(referral)
    setForm({
      name: referral.name,
      referralCode: referral.referralCode,
      inviterRewardType: inviterReward.type || 'points',
      inviterRewardValue: inviterReward.value || 0,
      inviterRewardCouponId: inviterReward.couponId || '',
      rewardeeRewardType: rewardeeReward.type || 'points',
      rewardeeRewardValue: rewardeeReward.value || 0,
      rewardeeRewardCouponId: rewardeeReward.couponId || '',
      minOrderAmount: referral.minOrderAmount || 0,
      maxUsageCount: referral.maxUsageCount || 0,
      startDate: referral.startDate ? referral.startDate.split('T')[0] : '',
      endDate: referral.endDate ? referral.endDate.split('T')[0] : '',
      status: referral.status as 'active' | 'inactive'
    })
    setShowEdit(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const buildReward = (type: string, value: number, couponId: string) => {
      if (type === 'coupon') {
        return JSON.stringify({ type, couponId })
      }
      return JSON.stringify({ type, value })
    }
    const payload = {
      name: form.name,
      referralCode: form.referralCode,
      inviterReward: buildReward(form.inviterRewardType, form.inviterRewardValue, form.inviterRewardCouponId),
      rewardeeReward: buildReward(form.rewardeeRewardType, form.rewardeeRewardValue, form.rewardeeRewardCouponId),
      minOrderAmount: form.minOrderAmount,
      maxUsageCount: form.maxUsageCount,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
      endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
      status: form.status,
      storeId
    }
    if (showEdit && editingReferral) {
      updateMutation.mutate({ id: editingReferral.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const parseReward = (reward: string | object) => {
    if (typeof reward === 'string') {
      try {
        return JSON.parse(reward)
      } catch {
        return { type: 'points', value: 0 }
      }
    }
    return reward
  }

  const formatRewardDisplay = (reward: string | object) => {
    const r = parseReward(reward)
    if (r.type === 'coupon') return `🎟️ Coupon`
    return `${r.value} pts`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={20} /> {t('marketing.createReferral')}
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        ) : referrals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Users size={48} className="mb-4 opacity-50" />
            <p>{t('common.noData')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">{t('marketing.referralName')}</th>
                  <th className="pb-3 font-medium">{t('marketing.referralCode')}</th>
                  <th className="pb-3 font-medium">{t('marketing.reward')}</th>
                  <th className="pb-3 font-medium">{t('marketing.minOrder')}</th>
                  <th className="pb-3 font-medium">{t('marketing.usage')}</th>
                  <th className="pb-3 font-medium">{t('marketing.status')}</th>
                  <th className="pb-3 font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => {
                  return (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <Gift size={16} className="text-primary" />
                          <span className="font-medium">{r.name}</span>
                        </div>
                      </td>
                      <td className="py-3 font-mono font-medium">{r.referralCode}</td>
                      <td className="py-3 text-sm">
                        <div className="flex items-center gap-1">
                          <Star size={12} className="text-yellow-500" />
                          <span>Inviter: {formatRewardDisplay(r.inviterReward)}</span>
                        </div>
                        <div className="text-gray-500 flex items-center gap-1">
                          <Gift size={12} />
                          <span>Rewardee: {formatRewardDisplay(r.rewardeeReward)}</span>
                        </div>
                      </td>
                      <td className="py-3 text-sm">
                        {r.minOrderAmount > 0 ? `Rp ${r.minOrderAmount.toLocaleString()}` : '-'}
                      </td>
                      <td className="py-3">
                        <span className="text-gray-600">
                          {r.currentUsage || 0}{r.maxUsageCount ? `/${r.maxUsageCount}` : ''}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`badge ${r.status === 'active' ? 'badge-success' : 'badge-gray'}`}>{r.status}</span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/marketing/referrals/${r.id}`)}
                            className="text-primary hover:text-primary/80 text-sm font-medium"
                          >
                            {t('common.view')}
                          </button>
                          <button onClick={() => openEditModal(r)} className="text-gray-500 hover:text-gray-700">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => setDeleteConfirm(r.id)} className="text-red-500 hover:text-red-700">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreate || showEdit) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {showEdit ? t('marketing.editReferral') : t('marketing.createReferral')}
              </h3>
              <button onClick={closeModal} className="p-1 rounded-lg hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.referralName')} *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.referralCode')} *</label>
                <input type="text" value={form.referralCode} onChange={e => setForm({ ...form, referralCode: e.target.value.toUpperCase() })} className="input font-mono" placeholder="REFER2024" required />
              </div>

              {/* Inviter Reward */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <label className="block text-sm font-medium mb-2">{t('marketing.inviterReward')}</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <select
                    value={form.inviterRewardType}
                    onChange={e => setForm({ ...form, inviterRewardType: e.target.value as 'points' | 'coupon' })}
                    className="input text-sm"
                  >
                    <option value="points">{t('marketing.points')}</option>
                    <option value="coupon">{t('marketing.coupon')}</option>
                  </select>
                  {form.inviterRewardType === 'points' ? (
                    <input
                      type="number"
                      value={form.inviterRewardValue}
                      onChange={e => setForm({ ...form, inviterRewardValue: Number(e.target.value) })}
                      className="input"
                      min={0}
                    />
                  ) : (
                    <select
                      value={form.inviterRewardCouponId}
                      onChange={e => setForm({ ...form, inviterRewardCouponId: e.target.value })}
                      className="input"
                    >
                      <option value="">Select Coupon</option>
                      {coupons.map((c: any) => <option key={c.id} value={c.id}>{c.code}</option>)}
                    </select>
                  )}
                </div>
              </div>

              {/* Rewardee Reward */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <label className="block text-sm font-medium mb-2">{t('marketing.rewardeeReward')}</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <select
                    value={form.rewardeeRewardType}
                    onChange={e => setForm({ ...form, rewardeeRewardType: e.target.value as 'points' | 'coupon' })}
                    className="input text-sm"
                  >
                    <option value="points">{t('marketing.points')}</option>
                    <option value="coupon">{t('marketing.coupon')}</option>
                  </select>
                  {form.rewardeeRewardType === 'points' ? (
                    <input
                      type="number"
                      value={form.rewardeeRewardValue}
                      onChange={e => setForm({ ...form, rewardeeRewardValue: Number(e.target.value) })}
                      className="input"
                      min={0}
                    />
                  ) : (
                    <select
                      value={form.rewardeeRewardCouponId}
                      onChange={e => setForm({ ...form, rewardeeRewardCouponId: e.target.value })}
                      className="input"
                    >
                      <option value="">Select Coupon</option>
                      {coupons.map((c: any) => <option key={c.id} value={c.id}>{c.code}</option>)}
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.minOrder')}</label>
                  <input type="number" value={form.minOrderAmount} onChange={e => setForm({ ...form, minOrderAmount: Number(e.target.value) })} className="input" min={0} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.maxUsage')}</label>
                  <input type="number" value={form.maxUsageCount} onChange={e => setForm({ ...form, maxUsageCount: Number(e.target.value) })} className="input" min={0} placeholder="0 = unlimited" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.startDate')}</label>
                  <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.endDate')}</label>
                  <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className="input" />
                </div>
              </div>

              {showEdit && (
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.status')}</label>
                  <select
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}
                    className="input"
                  >
                    <option value="active">{t('common.active')}</option>
                    <option value="inactive">{t('common.inactive')}</option>
                  </select>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button type="submit" disabled={!form.name || !form.referralCode || createMutation.isPending || updateMutation.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={16} className="animate-spin" />}
                  {t('common.save')}
                </button>
                <button type="button" onClick={closeModal} className="btn-secondary">{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">{t('common.delete')}</h3>
            <p className="text-gray-600 mb-6">{t('marketing.deleteReferralConfirm')}</p>
            <div className="flex gap-3">
              <button onClick={() => deleteMutation.mutate(deleteConfirm)} disabled={deleteMutation.isPending} className="btn-danger flex-1 flex items-center justify-center gap-2">
                {deleteMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                {t('common.delete')}
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
