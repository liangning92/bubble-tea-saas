import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Loader2, MapPin, Phone, Store, Smartphone, Shield } from 'lucide-react'
import { configApi } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { POSSettingsPage } from './settings/POSSettingsPage'

const StaffPermissionsPage = lazy(() => import('./settings/StaffPermissionsPage').then(module => ({default: module.StaffPermissionsPage})))
const AiPermissionsPage = lazy(() => import('./settings/AiPermissionsPage').then(module => ({default: module.AiPermissionsPage})))

export function SettingsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const activeTab = location.pathname === '/settings/permissions' ? 'permissions' : location.pathname === '/settings/ai' ? 'ai' : location.pathname === '/settings/pos' ? 'pos' : 'store'
  const [showSuccess, setShowSuccess] = useState(false)

  // 店铺信息状态
  const [storeInfo, setStoreInfo] = useState({
    storeName: '',
    storeCode: '',
    address: '',
    phone: '',
    email: '',
    storeLogo: '',
  })

  // 加载店铺信息
  const { data: configData, isLoading } = useQuery({
    queryKey: ['config', 'store'],
    queryFn: () => configApi.get(),
    enabled: activeTab === 'store'
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
    // 当修改 storeInfo 时，同步将 storeLogo 写入 posReceipt 以保持 POS 端配置同步
    if (key === 'storeInfo' && value && value.storeLogo !== undefined) {
      configApi.get().then((res: any) => {
        const currentReceipt = res?.data?.posReceipt || {}
        if (currentReceipt.storeLogo !== value.storeLogo) {
          configApi.set(user?.storeId || '', 'posReceipt', { ...currentReceipt, storeLogo: value.storeLogo }, 'pos').catch(() => {})
        }
      }).catch(() => {})
    }
  }

  if (activeTab === 'store' && isLoading) {
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
          onClick={() => navigate('/settings')}
          aria-current={activeTab === 'store' ? 'page' : undefined}
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
          onClick={() => navigate('/settings/pos')}
          aria-current={activeTab === 'pos' ? 'page' : undefined}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'pos'
              ? 'bg-primary text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Smartphone size={18} />
          {t('settings.pos')}
        </button>
        {user?.role === 'admin' && <button
          onClick={() => navigate('/settings/permissions')}
          aria-current={activeTab === 'permissions' ? 'page' : undefined}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'permissions' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <Shield size={18} />
          {t('staffAccess.title')}
        </button>}
        {user?.role === 'admin' && <button
          onClick={() => navigate('/settings/ai')}
          aria-current={activeTab === 'ai' ? 'page' : undefined}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'ai' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <Shield size={18} />
          {t('aiPermissions.title')}
        </button>}
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

          {/* 保存按钮 */}
          <div className="mt-6 pt-6 border-t border-gray-200 flex justify-end">
            <button
              onClick={() => handleSave('storeInfo', storeInfo)}
              disabled={saveMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              {saveMutation.isPending && <Loader2 size={18} className="animate-spin" />}
              {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'permissions' && <Suspense fallback={<div className="flex justify-center py-8" role="status"><Loader2 className="animate-spin text-primary" size={28} /><span className="sr-only">{t('common.loading')}</span></div>}><StaffPermissionsPage /></Suspense>}

      {activeTab === 'ai' && <Suspense fallback={<div className="flex justify-center py-8" role="status"><Loader2 className="animate-spin text-primary" size={28} /><span className="sr-only">{t('common.loading')}</span></div>}><AiPermissionsPage /></Suspense>}

      {/* POS设置 Tab */}
      {activeTab === 'pos' && (
        <POSSettingsPage />
      )}
    </div>
  )
}
