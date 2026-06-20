import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Loader2, MapPin, Phone, Store, Smartphone } from 'lucide-react'
import { configApi } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { POSSettingsPage } from './settings/POSSettingsPage'

type TabKey = 'store' | 'pos'

export function SettingsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<TabKey>('store')
  const [showSuccess, setShowSuccess] = useState(false)

  // 店铺信息状态
  const [storeInfo, setStoreInfo] = useState({
    storeName: '',
    storeCode: '',
    address: '',
    phone: '',
    email: '',
  })

  // 加载店铺信息
  const { data: configData, isLoading } = useQuery({
    queryKey: ['config', 'store', user?.storeId],
    queryFn: () => configApi.get(user?.storeId || '')
  })

  useEffect(() => {
    if (configData?.data?.storeInfo) {
      setStoreInfo(prev => ({ ...prev, ...configData.data.storeInfo }))
    }
  }, [configData])

  // 保存设置
  const saveMutation = useMutation({
    mutationFn: (data: { key: string; value: any }) =>
      configApi.set(user?.storeId || '', data.key, data.value, 'store'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 2000)
    }
  })

  const handleSave = (key: string, value: any) => {
    saveMutation.mutate({ key, value })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    )
  }

  return (
    <div className="p-6">
      {showSuccess && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50 animate-pulse">
          <CheckCircle size={18} />
          <span>{t('common.saved')}</span>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm inline-flex flex-wrap mb-6">
        <button
          onClick={() => setActiveTab('store')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'store'
              ? 'bg-primary text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Store size={18} />
          {t('settings.store')}
        </button>
        <button
          onClick={() => setActiveTab('pos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'pos'
              ? 'bg-primary text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Smartphone size={18} />
          {t('settings.pos')}
        </button>
      </div>

      {/* 店铺设置 Tab */}
      {activeTab === 'store' && (
        <div className="card max-w-4xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Store className="text-primary" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold">{t('settings.storeInfo')}</h3>
              <p className="text-sm text-gray-500">{t('settings.storeInfoHint')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 店铺名称 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.storeName')}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={storeInfo.storeName}
                  onChange={(e) => setStoreInfo({ ...storeInfo, storeName: e.target.value })}
                  onBlur={() => handleSave('storeInfo', storeInfo)}
                  className="input pl-10"
                  placeholder={t('settings.storeNamePlaceholder')}
                />
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              </div>
            </div>

            {/* 店铺编号 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.storeCode')}
              </label>
              <input
                type="text"
                value={storeInfo.storeCode}
                onChange={(e) => setStoreInfo({ ...storeInfo, storeCode: e.target.value })}
                onBlur={() => handleSave('storeInfo', storeInfo)}
                className="input"
                placeholder={t('settings.storeCodePlaceholder')}
              />
            </div>

            {/* 地址 */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.address')}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={storeInfo.address}
                  onChange={(e) => setStoreInfo({ ...storeInfo, address: e.target.value })}
                  onBlur={() => handleSave('storeInfo', storeInfo)}
                  className="input pl-10"
                  placeholder={t('settings.addressPlaceholder')}
                />
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              </div>
            </div>

            {/* 电话 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.phone')}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={storeInfo.phone}
                  onChange={(e) => setStoreInfo({ ...storeInfo, phone: e.target.value })}
                  onBlur={() => handleSave('storeInfo', storeInfo)}
                  className="input pl-10"
                  placeholder={t('settings.phonePlaceholder')}
                />
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              </div>
            </div>

            {/* 邮箱 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.email')}
              </label>
              <input
                type="email"
                value={storeInfo.email}
                onChange={(e) => setStoreInfo({ ...storeInfo, email: e.target.value })}
                onBlur={() => handleSave('storeInfo', storeInfo)}
                className="input"
                placeholder={t('settings.emailPlaceholder')}
              />
            </div>
          </div>
        </div>
      )}

      {/* POS设置 Tab */}
      {activeTab === 'pos' && (
        <POSSettingsPage />
      )}
    </div>
  )
}
