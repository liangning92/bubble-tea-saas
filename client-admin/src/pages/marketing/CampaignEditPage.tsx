import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { messageApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { ArrowLeft, Loader2, Ticket, MessageSquare, Info } from 'lucide-react'

export function CampaignEditPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const storeId = user?.storeId || 'default'
  const isEdit = !!id

  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'welcome',
    triggerType: 'manual',
    startDate: '',
    endDate: '',
    status: 'active',
    actions: {
      couponId: '',
      messageTemplateId: '',
      channelType: 'sms'
    }
  })

  // Fetch campaign data
  const { data: campaignData, isLoading: campaignLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => marketingApi.getCampaign(id!),
    enabled: !!id
  })

  // Fetch coupons for selection
  const { data: couponsData } = useQuery({
    queryKey: ['coupons', storeId],
    queryFn: () => marketingApi.coupons(storeId)
  })

  // Fetch message templates
  const { data: templatesData } = useQuery({
    queryKey: ['message-templates', storeId],
    queryFn: () => messageApi.templates()
  })

  useEffect(() => {
    if (campaignData?.data) {
      const c = campaignData.data.data
      const actions = c.actions ? JSON.parse(c.actions) : {}
      setForm({
        name: c.name || '',
        description: c.description || '',
        type: c.type || 'welcome',
        triggerType: c.triggerType || 'manual',
        startDate: c.startDate ? c.startDate.split('T')[0] : '',
        endDate: c.endDate ? c.endDate.split('T')[0] : '',
        status: c.status || 'active',
        actions: {
          couponId: actions.couponId || '',
          messageTemplateId: actions.messageTemplateId || '',
          channelType: actions.channelType || 'sms'
        }
      })
    }
  }, [campaignData])

  const saveMutation = useMutation({
    mutationFn: (data: any) => {
      if (isEdit) return marketingApi.updateCampaign(id!, data)
      return marketingApi.createCampaign(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      navigate('/marketing/campaigns')
    }
  })

  const handleSubmit = () => {
    if (!form.name || !form.startDate) return
    // API expects actions as object, not string
    saveMutation.mutate({
      ...form,
      storeId,
      actions: form.actions
    })
  }

  const coupons = couponsData?.data?.data?.list || []
  const templates = templatesData?.data?.data?.list || []

  if (isEdit && campaignLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/marketing/campaigns')} className="btn-ghost">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold">{isEdit ? t('common.edit') : t('marketing.createCampaign')}</h1>
      </div>

      <div className="card max-w-2xl">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('marketing.campaignName')} *</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('marketing.description')}</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('marketing.type')}</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="input">
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
              <select value={form.triggerType} onChange={e => setForm({ ...form, triggerType: e.target.value })} className="input">
                <option value="manual">{t('marketing.triggerTypes.manual')}</option>
                <option value="automatic">{t('marketing.triggerTypes.automatic')}</option>
                <option value="scheduled">{t('marketing.triggerTypes.scheduled')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('marketing.startDate')} *</label>
              <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('marketing.endDate')}</label>
              <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className="input" />
            </div>
          </div>
          {isEdit && (
            <div>
              <label className="block text-sm font-medium mb-1">{t('marketing.status')}</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="input">
                <option value="active">{t('common.active')}</option>
                <option value="paused">{t('common.paused')}</option>
                <option value="completed">{t('common.completed')}</option>
              </select>
            </div>
          )}

          {/* Campaign Actions Configuration */}
          <div className="border-t pt-4 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Info size={16} className="text-blue-500" />
              <span className="text-sm font-medium text-gray-700">{t('marketing.campaignActions')}</span>
            </div>

            {/* Coupon Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                <Ticket size={14} className="inline mr-1" />
                {t('marketing.linkedCoupon')}
              </label>
              <select
                value={form.actions.couponId}
                onChange={e => setForm({ ...form, actions: { ...form.actions, couponId: e.target.value } })}
                className="input"
              >
                <option value="">{t('common.none')} ({t('marketing.noCouponSelected')})</option>
                {coupons.map((coupon: any) => (
                  <option key={coupon.id} value={coupon.id}>
                    {coupon.code} - {coupon.type} ({coupon.value})
                  </option>
                ))}
              </select>
             <p className="text-xs text-gray-500 mt-1">{t('marketing.couponHint')}</p>
            </div>

            {/* Message Template Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                <MessageSquare size={14} className="inline mr-1" />
                {t('marketing.notificationTemplate')}
              </label>
              <select
                value={form.actions.messageTemplateId}
                onChange={e => setForm({ ...form, actions: { ...form.actions, messageTemplateId: e.target.value } })}
                className="input"
              >
                <option value="">{t('common.none')} ({t('marketing.noTemplateSelected')})</option>
                {templates.filter((t: any) => t.type === form.type || t.type === 'custom').map((tmpl: any) => (
                  <option key={tmpl.id} value={tmpl.id}>
                    {tmpl.name} ({tmpl.channel})
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">{t('marketing.templateHint')}</p>
            </div>

            {/* Channel Type */}
            <div>
              <label className="block text-sm font-medium mb-1">{t('marketing.channelType')}</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    value="sms"
                    checked={form.actions.channelType === 'sms'}
                    onChange={() => setForm({ ...form, actions: { ...form.actions, channelType: 'sms' } })}
                  />
                  <span>SMS</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    value="whatsapp"
                    checked={form.actions.channelType === 'whatsapp'}
                    onChange={() => setForm({ ...form, actions: { ...form.actions, channelType: 'whatsapp' } })}
                  />
                  <span>WhatsApp</span>
                </label>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={handleSubmit} disabled={!form.name || !form.startDate || saveMutation.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {saveMutation.isPending && <Loader2 size={16} className="animate-spin" />}
            {t('common.save')}
          </button>
          <button onClick={() => navigate('/marketing/campaigns')} className="btn-secondary">{t('common.cancel')}</button>
        </div>
      </div>
    </div>
  )
}