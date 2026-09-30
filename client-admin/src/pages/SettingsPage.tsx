import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Loader2, MapPin, Phone, Store, Smartphone, Image as ImageIcon, Upload, X } from 'lucide-react'
import { configApi, uploadApi } from '../services/api'
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
    storeLogo: '',
  })

  // 店铺 Logo 上传
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const file = files[0]
    if (!file.type.startsWith('image/')) {
      alert(t('common.invalidImageType', '请上传有效的图片文件 (PNG, JPG, SVG 等)'))
      return
    }

    setUploadingLogo(true)
    try {
      const response = await uploadApi.uploadReceipt([file])
      const urls = response.data?.data?.urls || []
      if (urls.length > 0) {
        const newLogo = urls[0]
        const updated = { ...storeInfo, storeLogo: newLogo }
        setStoreInfo(updated)
        handleSave('storeInfo', updated)
      }
    } catch (error) {
      console.error('Failed to upload store logo:', error)
      alert(t('common.uploadFailed', '上传失败，请重试'))
    } finally {
      setUploadingLogo(false)
      if (logoInputRef.current) {
        logoInputRef.current.value = ''
      }
    }
  }

  // 加载店铺信息
  const { data: configData, isLoading } = useQuery({
    queryKey: ['config', 'store'],
    queryFn: () => configApi.get()
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

            {/* 店铺 Logo 上传与配置 */}
            <div className="md:col-span-2 p-4 bg-gray-50/70 border border-gray-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <span>{t('settings.storeLogo', '店铺品牌 Logo')}</span>
                    {storeInfo.storeLogo && (
                      <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                        <CheckCircle size={12} /> 已配置
                      </span>
                    )}
                  </label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t('settings.storeLogoHint', '用于 POS 顶栏、登录界面、客显副屏及打印小票的品牌 Logo 展示，建议白底或透明底高清 PNG')}
                  </p>
                </div>
                <div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  <button
                    type="button"
                    disabled={uploadingLogo}
                    onClick={() => logoInputRef.current?.click()}
                    className="px-3.5 py-1.5 bg-white border border-gray-300 hover:border-primary text-gray-700 hover:text-primary rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {uploadingLogo ? (
                      <>
                        <Loader2 size={14} className="animate-spin text-primary" />
                        <span>{t('common.uploading', '正在上传...')}</span>
                      </>
                    ) : (
                      <>
                        <Upload size={14} />
                        <span>{storeInfo.storeLogo ? t('common.changeImage', '更换 Logo 图片') : t('common.uploadImage', '上传 Logo 图片')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 预览与移除 */}
              {storeInfo.storeLogo && (
                <div className="flex items-center gap-3 p-2.5 bg-white border border-gray-200 rounded-lg">
                  <div className="w-16 h-12 rounded border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden p-1 shrink-0">
                    <img
                      src={storeInfo.storeLogo}
                      alt="Logo Preview"
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => { (e.target as any).style.display = 'none' }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-gray-600 truncate">{storeInfo.storeLogo}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">已与收银端及客显实时同步</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = { ...storeInfo, storeLogo: '' }
                      setStoreInfo(updated)
                      handleSave('storeInfo', updated)
                    }}
                    className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                    title="移除 Logo"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* 辅助 URL 输入框 */}
              <div className="relative">
                <input
                  type="text"
                  value={storeInfo.storeLogo}
                  onChange={(e) => setStoreInfo({ ...storeInfo, storeLogo: e.target.value })}
                  onBlur={() => handleSave('storeInfo', storeInfo)}
                  className="input pl-10 text-xs w-full"
                  placeholder="或直接输入图片 URL（例如: https://... 或 /youme-logo-white.png）"
                />
                <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              </div>
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

      {/* POS设置 Tab */}
      {activeTab === 'pos' && (
        <POSSettingsPage />
      )}
    </div>
  )
}
