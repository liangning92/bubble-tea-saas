import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Plus, Loader2, Gift, Calendar, Users, Zap, Edit2, Trash2 } from 'lucide-react'

interface Campaign {
  id: string
  name: string
  description?: string
  type: 'birthday' | 'reactivation' | 'loyalty' | 'seasonal' | 'welcome' | 'points_expiring'
  triggerType: 'automatic' | 'manual' | 'scheduled'
  startDate?: string
  endDate?: string
  status: 'active' | 'inactive' | 'paused' | 'completed'
  membersAffected?: number
  lastRun?: string
}

export function CampaignListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const storeId = user?.storeId || undefined

  const [showCreate, setShowCreate] = useState(false)
  const [showDelete, setShowDelete] = useState<string | null>(null)
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    type: 'welcome',
    triggerType: 'manual',
    startDate: '',
    endDate: ''
  })

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', storeId],
    queryFn: () => marketingApi.campaigns(storeId)
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => marketingApi.createCampaign(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setShowCreate(false)
      setNewCampaign({ name: '', description: '', type: 'welcome', triggerType: 'manual', startDate: '', endDate: '' })
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => marketingApi.deleteCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setShowDelete(null)
    }
  })

  const campaigns: Campaign[] = data?.data?.list || []

  const getTypeBadge = (type: string) => {
    const badges: Record<string, string> = {
      birthday: 'badge-warning',
      reactivation: 'badge-info',
      loyalty: 'badge-success',
      seasonal: 'badge-secondary',
      welcome: 'badge-primary',
      points_expiring: 'bg-purple-100 text-purple-800'
    }
    return badges[type] || 'badge-gray'
  }

  const getTypeLabel = (type: string) => {
    return t(`marketing.campaignTypes.${type}`)
  }

  const getTriggerLabel = (trigger: string) => {
    return t(`marketing.triggerTypes.${trigger}`)
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      active: 'badge-success',
      paused: 'badge-warning',
      completed: 'badge-info',
      inactive: 'badge-gray'
    }
    return badges[status] || 'badge-gray'
  }

  const formatDate = (date?: string) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('id-ID')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          {t('marketing.createCampaign')}
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Gift size={48} className="mb-4 opacity-50" />
            <p>{t('common.noData')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">{t('marketing.campaignName')}</th>
                  <th className="pb-3 font-medium">{t('marketing.type')}</th>
                  <th className="pb-3 font-medium">{t('marketing.triggerType')}</th>
                  <th className="pb-3 font-medium">{t('marketing.startDate')}</th>
                  <th className="pb-3 font-medium">{t('marketing.endDate')}</th>
                  <th className="pb-3 font-medium">{t('marketing.status')}</th>
                  <th className="pb-3 font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Gift size={16} className="text-primary" />
                        <span className="font-medium">{campaign.name}</span>
                      </div>
                      {campaign.description && (
                        <p className="text-sm text-gray-500 mt-1">{campaign.description}</p>
                      )}
                    </td>
                    <td className="py-3">
                      <span className={`badge ${getTypeBadge(campaign.type)}`}>
                        {getTypeLabel(campaign.type)}
                      </span>
                    </td>
                    <td className="py-3 text-gray-600">
                      <div className="flex items-center gap-1">
                        {campaign.triggerType === 'automatic' && <Zap size={14} />}
                        {campaign.triggerType === 'manual' && <Users size={14} />}
                        {campaign.triggerType === 'scheduled' && <Calendar size={14} />}
                        {getTriggerLabel(campaign.triggerType)}
                      </div>
                    </td>
                    <td className="py-3 text-sm text-gray-600">{formatDate(campaign.startDate)}</td>
                    <td className="py-3 text-sm text-gray-600">{formatDate(campaign.endDate)}</td>
                    <td className="py-3">
                      <span className={`badge ${getStatusBadge(campaign.status)}`}>
                        {campaign.status === 'active' ? t('common.active') :
                         campaign.status === 'paused' ? t('common.paused') :
                         campaign.status === 'completed' ? t('common.completed') :
                         t('common.inactive')}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/marketing/campaigns/${campaign.id}`)}
                          className="text-primary hover:text-primary/80 text-sm font-medium"
                        >
                          {t('common.view')}
                        </button>
                        <button
                          onClick={() => navigate(`/marketing/campaigns/${campaign.id}/edit`)}
                          className="text-gray-500 hover:text-gray-700 text-sm"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => setShowDelete(campaign.id)}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          <Trash2 size={14} />
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

      {/* Create Campaign Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">{t('marketing.createCampaign')}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.campaignName')} *</label>
                <input
                  type="text"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.description')}</label>
                <textarea
                  value={newCampaign.description}
                  onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
                  className="input"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.type')}</label>
                <select
                  value={newCampaign.type}
                  onChange={(e) => setNewCampaign({ ...newCampaign, type: e.target.value })}
                  className="input"
                >
                  <option value="birthday">{t('marketing.campaignTypes.birthday')}</option>
                  <option value="reactivation">{t('marketing.campaignTypes.reactivation')}</option>
                  <option value="loyalty">{t('marketing.campaignTypes.loyalty')}</option>
                  <option value="seasonal">{t('marketing.campaignTypes.seasonal')}</option>
                  <option value="welcome">{t('marketing.campaignTypes.welcome')}</option>
                  <option value="points_expiring">{t('marketing.campaignTypes.points_expiring')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.triggerType')}</label>
                <select
                  value={newCampaign.triggerType}
                  onChange={(e) => setNewCampaign({ ...newCampaign, triggerType: e.target.value })}
                  className="input"
                >
                  <option value="manual">{t('marketing.triggerTypes.manual')}</option>
                  <option value="automatic">{t('marketing.triggerTypes.automatic')}</option>
                  <option value="scheduled">{t('marketing.triggerTypes.scheduled')}</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.startDate')}</label>
                  <input
                    type="date"
                    value={newCampaign.startDate}
                    onChange={(e) => setNewCampaign({ ...newCampaign, startDate: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.endDate')}</label>
                  <input
                    type="date"
                    value={newCampaign.endDate}
                    onChange={(e) => setNewCampaign({ ...newCampaign, endDate: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => createMutation.mutate({ ...newCampaign, storeId })}
                disabled={!newCampaign.name || createMutation.isPending}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {createMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                {t('common.save')}
              </button>
              <button onClick={() => setShowCreate(false)} className="btn-secondary">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">{t('common.delete')}</h3>
            <p className="text-gray-600 mb-6">{t('marketing.deleteCampaignConfirm')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteMutation.mutate(showDelete)}
                disabled={deleteMutation.isPending}
                className="btn-danger flex-1 flex items-center justify-center gap-2"
              >
                {deleteMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                {t('common.delete')}
              </button>
              <button onClick={() => setShowDelete(null)} className="btn-secondary">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}