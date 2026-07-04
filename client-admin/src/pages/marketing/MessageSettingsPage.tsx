import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { messageApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import {
  Loader2, MessageSquare, Settings, FileText, BarChart3,
  Plus, Edit2, Trash2, X, Check, Bell, Globe, Phone
} from 'lucide-react'

// Types
interface MessageChannel {
  id: string
  type: string
  name: string
  provider: string
  config: string
  enabled: boolean
  priority: number
  costPerSms: number
  dailyLimit: number
  monthlyLimit: number
  isDefault: boolean
}

// Message types for automation
const MESSAGE_TYPES = [
  { key: 'birthday', icon: '🎂' },
  { key: 'reactivation', icon: '🔄' },
  { key: 'points_expiring', icon: '⏰' },
  { key: 'seasonal', icon: '🎉' },
  { key: 'welcome', icon: '👋' },
  { key: 'referral', icon: '👥' },
  { key: 'custom', icon: '📝' }
]

// Channel types
const CHANNEL_TYPES = [
  { key: 'sms', icon: '💬', color: 'bg-blue-500' },
  { key: 'whatsapp', icon: '📱', color: 'bg-green-500' },
  { key: 'push', icon: '🔔', color: 'bg-purple-500' },
  { key: 'email', icon: '✉️', color: 'bg-gray-500' }
]

export function MessageSettingsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const storeId = user?.storeId

  const [activeTab, setActiveTab] = useState<'channels' | 'templates' | 'logs' | 'stats'>('channels')
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [showCreateTemplate, setShowCreateTemplate] = useState(false)
  const [editingChannel, setEditingChannel] = useState<any>(null)
  const [editingTemplate, setEditingTemplate] = useState<any>(null)

  // Fetch channels
  const { data: channelsData, isLoading: channelsLoading } = useQuery({
    queryKey: ['message-channels'],
    queryFn: () => messageApi.channels()
  })
  const channels = channelsData?.data?.data?.list || []

  // Fetch templates
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['message-templates'],
    queryFn: () => messageApi.templates()
  })
  const templates = templatesData?.data?.data?.list || []

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['message-stats'],
    queryFn: () => messageApi.stats()
  })
  const stats = statsData?.data

  // Fetch variables
  const { data: variablesData } = useQuery({
    queryKey: ['message-variables'],
    queryFn: () => messageApi.variables()
  })
  const variables = variablesData?.data?.variables || []

  // Create channel mutation
  const createChannelMutation = useMutation({
    mutationFn: (data: any) => messageApi.createChannel(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-channels'] })
      setShowCreateChannel(false)
    }
  })

  // Update channel mutation
  const updateChannelMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => messageApi.updateChannel(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-channels'] })
      setEditingChannel(null)
    }
  })

  // Delete channel mutation
  const deleteChannelMutation = useMutation({
    mutationFn: (id: string) => messageApi.deleteChannel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-channels'] })
    }
  })

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: (data: any) => messageApi.createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] })
      setShowCreateTemplate(false)
    }
  })

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => messageApi.updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] })
      setEditingTemplate(null)
    }
  })

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => messageApi.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] })
    }
  })

  // Init templates mutation
  const initTemplatesMutation = useMutation({
    mutationFn: () => messageApi.initTemplates(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] })
    }
  })

  const tabs = [
    { key: 'channels', label: t('marketing.channels'), icon: Settings },
    { key: 'templates', label: t('marketing.templates'), icon: FileText },
    { key: 'stats', label: t('marketing.stats'), icon: BarChart3 }
  ]

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Channels Tab */}
      {activeTab === 'channels' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-gray-600">{t('marketing.channelsDesc')}</p>
            <button
              onClick={() => setShowCreateChannel(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={18} />
              {t('marketing.addChannel')}
            </button>
          </div>

          {channelsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : channels.length === 0 ? (
            <div className="card text-center py-12">
              <MessageSquare size={48} className="mx-auto mb-4 text-gray-400" />
              <p className="text-gray-500 mb-4">{t('marketing.noChannels')}</p>
              <button onClick={() => setShowCreateChannel(true)} className="btn-primary">
                {t('marketing.addFirstChannel')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(channels as MessageChannel[]).map(channel => (
                <div key={channel.id} className="card">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-lg ${CHANNEL_TYPES.find(c => c.key === channel.type)?.color || 'bg-gray-500'}`}>
                        {channel.type === 'sms' && <Phone size={20} className="text-white" />}
                        {channel.type === 'whatsapp' && <MessageSquare size={20} className="text-white" />}
                        {channel.type === 'push' && <Bell size={20} className="text-white" />}
                        {channel.type === 'email' && <Globe size={20} className="text-white" />}
                      </div>
                      <div>
                        <h3 className="font-semibold">{channel.name}</h3>
                        <p className="text-sm text-gray-500">{channel.type === 'sms' ? t('marketing.channelSMS') : channel.type === 'whatsapp' ? t('marketing.channelWhatsApp') : channel.type === 'push' ? t('marketing.channelPush') : t('marketing.channelEmail')} - {channel.provider}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${channel.enabled ? 'badge-success' : 'badge-gray'}`}>
                        {channel.enabled ? t('marketing.active') : t('marketing.inactive')}
                      </span>
                      {channel.isDefault && <span className="badge badge-primary">{t('marketing.default')}</span>}
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t flex justify-between items-center">
                    <div className="text-sm text-gray-500">
                      <span>{t('marketing.costPerSms')}: Rp {channel.costPerSms?.toLocaleString() || 0}/SMS</span>
                      <span className="mx-2">|</span>
                      <span>{t('marketing.dailyLimit')}: {channel.dailyLimit || 1000}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingChannel(channel)}
                        className="btn-ghost text-sm"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => deleteChannelMutation.mutate(channel.id)}
                        className="btn-ghost text-red-500 text-sm"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
                       </div>
          )}
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-gray-600">{t('marketing.templatesDesc')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => initTemplatesMutation.mutate()}
                className="btn-secondary flex items-center gap-2"
              >
                <Check size={18} />
                {t('marketing.initDefaults')}
              </button>
              <button
                onClick={() => setShowCreateTemplate(true)}
                className="btn-primary flex items-center gap-2"
              >
                <Plus size={18} />
                {t('marketing.addTemplate')}
              </button>
            </div>
          </div>

          {templatesLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <div className="card text-center py-12">
              <FileText size={48} className="mx-auto mb-4 text-gray-400" />
              <p className="text-gray-500 mb-4">{t('marketing.noTemplates')}</p>
              <button
                onClick={() => initTemplatesMutation.mutate()}
                className="btn-primary"
              >
                {t('marketing.initDefaults')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {MESSAGE_TYPES.filter(type => type.key !== 'custom').map(type => {
                const typeTemplates = templates.filter((t: any) => t.type === type.key)
                return (
                  <div key={type.key} className="card">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-2xl">{type.icon}</span>
                      <h3 className="font-semibold">{t('marketing.msgType' + type.key.charAt(0).toUpperCase() + type.key.slice(1).replace('_', ''))}</h3>
                      <span className="badge badge-gray">{typeTemplates.length} {t('marketing.templates')}</span>
                    </div>
                    {typeTemplates.length === 0 ? (
                      <p className="text-sm text-gray-400 italic">{t('marketing.noTemplatesForType')}</p>
                    ) : (
                      <div className="space-y-3">
                        {typeTemplates.map((template: any) => (
                          <div key={template.id} className="p-3 bg-gray-50 rounded-lg">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium">{template.name}</span>
                                  <span className="badge badge-info">{template.channel === 'sms' ? t('marketing.channelSMS') : template.channel === 'whatsapp' ? t('marketing.channelWhatsApp') : template.channel === 'push' ? t('marketing.channelPush') : t('marketing.channelEmail')}</span>
                                  {template.isDefault && <span className="badge badge-primary">{t('marketing.default')}</span>}
                                  {!template.enabled && <span className="badge badge-gray">{t('marketing.disabled')}</span>}
                                </div>
                                <p className="text-sm text-gray-600 line-clamp-2">{template.body}</p>
                              </div>
                              <div className="flex gap-2 ml-4">
                                <button
                                  onClick={() => setEditingTemplate(template)}
                                  className="btn-ghost text-sm"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => deleteTemplateMutation.mutate(template.id)}
                                  className="btn-ghost text-red-500 text-sm"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="card text-center p-4">
              <div className="text-3xl font-bold text-primary">{stats?.today?.count || 0}</div>
              <div className="text-sm text-gray-500">{t('marketing.todaySent')}</div>
              <div className="text-xs text-gray-400 mt-1">Rp {(stats?.today?.cost || 0).toLocaleString()}</div>
            </div>
            <div className="card text-center p-4">
              <div className="text-3xl font-bold text-blue-600">{stats?.month?.count || 0}</div>
              <div className="text-sm text-gray-500">{t('marketing.monthSent')}</div>
              <div className="text-xs text-gray-400 mt-1">Rp {(stats?.month?.cost || 0).toLocaleString()}</div>
            </div>
            <div className="card text-center p-4">
              <div className="text-3xl font-bold text-yellow-600">{stats?.pending || 0}</div>
              <div className="text-sm text-gray-500">{t('marketing.pending')}</div>
            </div>
            <div className="card text-center p-4">
              <div className="text-3xl font-bold text-red-600">{stats?.failed || 0}</div>
              <div className="text-sm text-gray-500">{t('marketing.failed')}</div>
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-4">{t('marketing.availableVariables')}</h3>
            <div className="flex flex-wrap gap-2">
              {variables.map((v: string) => (
                <code key={v} className="px-2 py-1 bg-gray-100 rounded text-sm">
                  {'{' + v + '}'}
                </code>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Channel Modal */}
      {(showCreateChannel || editingChannel) && (
        <ChannelModal
          channel={editingChannel}
          onClose={() => {
            setShowCreateChannel(false)
            setEditingChannel(null)
          }}
          onSave={(data) => {
            // Ensure config is not empty object - add dummy key if empty
            if (!editingChannel) {
              const config = Object.keys(data.config || {}).length > 0 ? data.config : { enabled: 'true' }
              createChannelMutation.mutate({ ...data, config, storeId })
            } else {
              updateChannelMutation.mutate({ id: editingChannel.id, data })
            }
          }}
          isPending={createChannelMutation.isPending || updateChannelMutation.isPending}
        />
      )}

      {/* Create/Edit Template Modal */}
      {(showCreateTemplate || editingTemplate) && (
        <TemplateModal
          template={editingTemplate}
          onClose={() => {
            setShowCreateTemplate(false)
            setEditingTemplate(null)
          }}
          onSave={(data) => {
            if (editingTemplate) {
              updateTemplateMutation.mutate({ id: editingTemplate.id, data })
            } else {
              createTemplateMutation.mutate(data)
            }
          }}
          isPending={createTemplateMutation.isPending || updateTemplateMutation.isPending}
          variables={variables}
        />
      )}
    </div>
  )
}

// Channel Modal Component
function ChannelModal({ channel, onClose, onSave, isPending }: {
  channel: any
  onClose: () => void
  onSave: (data: any) => void
  isPending: boolean
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    type: channel?.type || 'sms',
    name: channel?.name || '',
    provider: channel?.provider || 'twilio',
    config: channel?.config ? JSON.parse(channel.config) : {},
    enabled: channel?.enabled ?? true,
    priority: channel?.priority ?? 0,
    costPerSms: channel?.costPerSms ?? 150,
    dailyLimit: channel?.dailyLimit ?? 1000,
    monthlyLimit: channel?.monthlyLimit ?? 10000,
    isDefault: channel?.isDefault ?? false
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(form)
  }

  return (
    <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto pointer-events-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            {channel ? t('marketing.editChannel') : t('marketing.addChannel')}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('marketing.channelType')}</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="input"
                required
              >
                {CHANNEL_TYPES.map(c => (
                  <option key={c.key} value={c.key}>{c.icon} {c.key === 'sms' ? t('marketing.channelSMS') : c.key === 'whatsapp' ? t('marketing.channelWhatsApp') : c.key === 'push' ? t('marketing.channelPush') : t('marketing.channelEmail')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('marketing.provider')}</label>
              <select
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                className="input"
                required
              >
                <option value="twilio">Twilio</option>
                <option value="nexmo">Nexmo (Vonage)</option>
                <option value="whatsapp">WhatsApp Business</option>
                <option value="fcm">Firebase Cloud Messaging</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('marketing.channelName')} *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
              placeholder="e.g., Main SMS Channel"
              required
            />
          </div>

          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <h4 className="font-medium text-sm">{t('marketing.config')}</h4>
            {form.provider === 'twilio' && (
              <>
                <input
                  type="text"
                  value={form.config.accountSid || ''}
                  onChange={(e) => setForm({ ...form, config: { ...form.config, accountSid: e.target.value } })}
                  className="input"
                  placeholder="Account SID"
                />
                <input
                  type="text"
                  value={form.config.authToken || ''}
                  onChange={(e) => setForm({ ...form, config: { ...form.config, authToken: e.target.value } })}
                  className="input"
                  placeholder="Auth Token"
                />
                <input
                  type="text"
                  value={form.config.fromNumber || ''}
                  onChange={(e) => setForm({ ...form, config: { ...form.config, fromNumber: e.target.value } })}
                  className="input"
                  placeholder="From Phone Number"
                />
              </>
            )}
            {form.provider === 'whatsapp' && (
              <>
                <input
                  type="text"
                  value={form.config.phoneNumberId || ''}
                  onChange={(e) => setForm({ ...form, config: { ...form.config, phoneNumberId: e.target.value } })}
                  className="input"
                  placeholder="Phone Number ID"
                />
                <input
                  type="text"
                  value={form.config.accessToken || ''}
                  onChange={(e) => setForm({ ...form, config: { ...form.config, accessToken: e.target.value } })}
                  className="input"
                  placeholder="Access Token"
                />
              </>
            )}
            {form.provider === 'nexmo' && (
              <>
                <input
                  type="text"
                  value={form.config.apiKey || ''}
                  onChange={(e) => setForm({ ...form, config: { ...form.config, apiKey: e.target.value } })}
                  className="input"
                  placeholder="API Key"
                />
                <input
                  type="text"
                  value={form.config.apiSecret || ''}
                  onChange={(e) => setForm({ ...form, config: { ...form.config, apiSecret: e.target.value } })}
                  className="input"
                  placeholder="API Secret"
                />
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Cost per SMS (IDR)</label>
              <input
                type="number"
                value={form.costPerSms}
                onChange={(e) => setForm({ ...form, costPerSms: Number(e.target.value) })}
                className="input"
                min={0}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Daily Limit</label>
              <input
                type="number"
                value={form.dailyLimit}
                onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) })}
                className="input"
                min={1}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">{t('common.active')}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">{t('marketing.setAsDefault')}</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="submit" disabled={isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {isPending && <Loader2 size={16} className="animate-spin" />}
              {t('common.save')}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">{t('common.cancel')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Template Modal Component
function TemplateModal({ template, onClose, onSave, isPending, variables }: {
  template: any
  onClose: () => void
  onSave: (data: any) => void
  isPending: boolean
  variables: string[]
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    type: template?.type || 'birthday',
    name: template?.name || '',
    channel: template?.channel || 'sms',
    subject: template?.subject || '',
    body: template?.body || '',
    enabled: template?.enabled ?? true,
    isDefault: template?.isDefault ?? false
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      ...form,
      variables: variables.filter(v => form.body.includes('{' + v + '}'))
    })
  }

  const insertVariable = (variable: string) => {
    setForm({ ...form, body: form.body + '{' + variable + '}' })
  }

  return (
    <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto pointer-events-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            {template ? t('marketing.editTemplate') : t('marketing.addTemplate')}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('marketing.type')}</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="input"
                required
              >
                {MESSAGE_TYPES.filter(t => t.key !== 'custom').map(t => (
                  <option key={t.key} value={t.key}>{t.icon} {t.key.charAt(0).toUpperCase() + t.key.slice(1).replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('marketing.channel')}</label>
              <select
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
                className="input"
                required
              >
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="push">Push</option>
                <option value="all">All Channels</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('marketing.templateName')}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
                placeholder="e.g., Birthday SMS"
                required
              />
            </div>
          </div>

          {form.channel !== 'sms' && (
            <div>
              <label className="block text-sm font-medium mb-1">{t('marketing.subject')}</label>
              <input
                type="text"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="input"
                placeholder="Email/WhatsApp subject (optional)"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">{t('marketing.messageBody')} *</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className="input"
              rows={5}
              placeholder="Enter your message template..."
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              {t('marketing.useVariables')} {'{variable_name}'} {t('marketing.forPlaceholders')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t('marketing.insertVariable')}</label>
            <div className="flex flex-wrap gap-2">
              {variables.map((v: string) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                >
                  {'{' + v + '}'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">{t('common.active')}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">{t('marketing.setAsDefault')}</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="submit" disabled={isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {isPending && <Loader2 size={16} className="animate-spin" />}
              {t('common.save')}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">{t('common.cancel')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
