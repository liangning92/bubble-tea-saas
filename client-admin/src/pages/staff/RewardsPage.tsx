import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { staffPointsApi } from '../../services/api'
import { Gift, Plus, RefreshCw, Edit, Trash2, CheckCircle, XCircle, Clock } from 'lucide-react'

interface Reward {
  id: string
  name: string
  description: string
  pointsCost: number
  stock: number
  isActive: boolean
  createdAt: string
}

interface Redemption {
  id: string
  staffId: string
  staffName: string
  rewardId: string
  rewardName: string
  pointsCost: number
  status: 'pending' | 'fulfilled' | 'cancelled'
  createdAt: string
}

export function RewardsPage() {
  const { t } = useTranslation()
  const { token, user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'catalog' | 'redemptions'>('catalog')
  const [rewards, setRewards] = useState<Reward[]>([])
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingReward, setEditingReward] = useState<Reward | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    pointsCost: 100,
    stock: 10,
    isActive: true
  })

  const loadRewards = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/staff-point-rewards?storeId=${user?.storeId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.code === 200) {
        setRewards(data.data || [])
      }
    } catch (error) {
      console.error('Failed to load rewards:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadRedemptions = async () => {
    setIsLoading(true)
    try {
      const res = await staffPointsApi.getPendingRedemptions()
      if (res.data?.code === 200) {
        setRedemptions(res.data.data || [])
      }
    } catch (error) {
      console.error('Failed to load redemptions:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'catalog') {
      loadRewards()
    } else {
      loadRedemptions()
    }
  }, [user, activeTab])

  const handleSave = async () => {
    setIsLoading(true)
    try {
      const method = editingReward ? 'PUT' : 'POST'
      const url = editingReward ? `/api/staff-point-rewards/${editingReward.id}` : '/api/staff-point-rewards'
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          storeId: user?.storeId
        })
      })
      const data = await res.json()
      if (data.code === 200) {
        await loadRewards()
        setShowForm(false)
        setEditingReward(null)
        setFormData({ name: '', description: '', pointsCost: 100, stock: 10, isActive: true })
      } else {
        alert(data.message || 'Failed to save')
      }
    } catch (error) {
      console.error('Failed to save:', error)
      alert(t('common.error'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = (reward: Reward) => {
    setEditingReward(reward)
    setFormData({
      name: reward.name,
      description: reward.description,
      pointsCost: reward.pointsCost,
      stock: reward.stock,
      isActive: reward.isActive
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirm') + '?')) return
    try {
      const res = await fetch(`/api/staff-point-rewards/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.code === 200) {
        await loadRewards()
      }
    } catch (error) {
      console.error('Failed to delete:', error)
    }
  }

  const handleToggleActive = async (reward: Reward) => {
    try {
      await fetch(`/api/staff-point-rewards/${reward.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ...reward, isActive: !reward.isActive })
      })
      await loadRewards()
    } catch (error) {
      console.error('Failed to toggle:', error)
    }
  }

  const handleFulfillRedemption = async (id: string) => {
    try {
      await staffPointsApi.fulfillRedemption(id)
      await loadRedemptions()
    } catch (error) {
      console.error('Failed to fulfill:', error)
      alert(t('common.error'))
    }
  }

  const handleCancelRedemption = async (id: string) => {
    try {
      await staffPointsApi.cancelRedemption(id)
      await loadRedemptions()
    } catch (error) {
      console.error('Failed to cancel:', error)
      alert(t('common.error'))
    }
  }

  const pendingCount = redemptions.filter(r => r.status === 'pending').length

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Gift size={28} className="text-primary" />
          <h1 className="text-xl font-bold">{t('staff.rewardCatalog')}</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => activeTab === 'catalog' ? loadRewards() : loadRedemptions()} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
          {activeTab === 'catalog' && (
            <button onClick={() => { setShowForm(true); setEditingReward(null); setFormData({ name: '', description: '', pointsCost: 100, stock: 10, isActive: true }) }} className="btn-primary flex items-center gap-2">
              <Plus size={18} />
              {t('common.add')}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`pb-2 px-1 font-medium ${activeTab === 'catalog' ? 'border-b-2 border-primary text-primary' : 'text-gray-500'}`}
        >
          {t('staff.rewardCatalog')}
        </button>
        <button
          onClick={() => setActiveTab('redemptions')}
          className={`pb-2 px-1 font-medium flex items-center gap-2 ${activeTab === 'redemptions' ? 'border-b-2 border-primary text-primary' : 'text-gray-500'}`}
        >
          {t('staff.redemptionRequests')}
          {pendingCount > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">{pendingCount}</span>
          )}
        </button>
      </div>

      {activeTab === 'catalog' ? (
        /* Rewards Catalog */
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw size={24} className="animate-spin text-gray-400" />
            </div>
          ) : rewards.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {t('common.noData')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{t('staff.name')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{t('staff.description')}</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">{t('staff.pointsCost')}</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">{t('staff.stock')}</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">{t('staff.status')}</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rewards.map((reward) => (
                    <tr key={reward.id} className="border-t">
                      <td className="px-4 py-3 font-medium">{reward.name}</td>
                      <td className="px-4 py-3 text-gray-500">{reward.description}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-lg font-bold text-primary">{reward.pointsCost}</span>
                      </td>
                      <td className="px-4 py-3 text-right">{reward.stock}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggleActive(reward)}
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            reward.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {reward.isActive ? t('common.active') : t('common.inactive')}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleEdit(reward)}
                            className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(reward.id)}
                            className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                          >
                            <Trash2 size={16} />
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
      ) : (
        /* Redemptions */
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw size={24} className="animate-spin text-gray-400" />
            </div>
          ) : redemptions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Clock size={48} className="mx-auto mb-3 text-gray-300" />
              <p>{t('common.noData')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{t('staff.name')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{t('staff.reward')}</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">{t('staff.pointsCost')}</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">{t('staff.status')}</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-4 py-3 font-medium">{r.staffName}</td>
                      <td className="px-4 py-3">{r.rewardName}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-lg font-bold text-primary">{r.pointsCost}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          r.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          r.status === 'fulfilled' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {r.status === 'pending' ? t('staff.pending') :
                           r.status === 'fulfilled' ? t('staff.fulfilled') :
                           t('staff.cancelled')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.status === 'pending' && (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleFulfillRedemption(r.id)}
                              className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100"
                              title={t('common.approve')}
                            >
                              <CheckCircle size={16} />
                            </button>
                            <button
                              onClick={() => handleCancelRedemption(r.id)}
                              className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                              title={t('common.reject')}
                            >
                              <XCircle size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">
              {editingReward ? t('common.edit') : t('common.add')} {t('staff.reward')}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.name')} *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.description')}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input w-full"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.pointsCost')} *</label>
                <input
                  type="number"
                  value={formData.pointsCost}
                  onChange={(e) => setFormData({ ...formData, pointsCost: parseInt(e.target.value) || 0 })}
                  className="input w-full"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.stock')} *</label>
                <input
                  type="number"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                  className="input w-full"
                  min="0"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowForm(false)} className="flex-1 py-2 border border-gray-200 rounded-lg">
                  {t('common.cancel')}
                </button>
                <button onClick={handleSave} className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}