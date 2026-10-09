import { normalizeTvConfig } from '../../../../shared/utils/tvScreenConfig'
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { marketingApi, productApi, uploadApi, receiptMediaUrl } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import {
  Tv,
  Save,
  Plus,
  Trash2,
  Upload,
  Sparkles,
  Gift,
  Tag,
  Sliders,
  CheckCircle,
  ExternalLink,
  Layers
} from 'lucide-react'

interface MediaBanner {
  url: string
  title?: string
  subtitle?: string
}

interface DailySpecialItem {
  productId?: string
  autoPrice?: boolean
  applicableChannels?: string[]
  dayOfWeek: number // 0=Sunday, 1=Monday...
  productName: string
  originalPrice: number
  specialPrice: number
  tag: string
  imageUrl: string
  description: string
}

interface LotteryPrize {
  id: string
  name: string
  code: string
  color: string
  weight: number
}

interface TvScreenConfig {
  enabled: boolean
  storeName: string
  welcomeText: string
  carouselIntervalSeconds: number
  layout: {
    columns: Array<{ width: number; content: string }>
  }
  mediaFiles: MediaBanner[]
  dailySpecials: DailySpecialItem[]
  lottery: {
    enabled: boolean
    triggerMinOrderAmount: number
    title: string
    subtitle: string
    prizes: LotteryPrize[]
  }
  ticker: {
    enabled: boolean
    text: string
  }
}

const DAYS_OF_WEEK = [
  { day: 1, labelZh: '周一 (Monday)', labelEn: 'Monday', labelId: 'Senin' },
  { day: 2, labelZh: '周二 (Tuesday)', labelEn: 'Tuesday', labelId: 'Selasa' },
  { day: 3, labelZh: '周三 (Wednesday)', labelEn: 'Wednesday', labelId: 'Rabu' },
  { day: 4, labelZh: '周四 (Thursday)', labelEn: 'Thursday', labelId: 'Kamis' },
  { day: 5, labelZh: '周五 (Friday)', labelEn: 'Friday', labelId: 'Jumat' },
  { day: 6, labelZh: '周六 (Saturday)', labelEn: 'Saturday', labelId: 'Sabtu' },
  { day: 0, labelZh: '周日 (Sunday)', labelEn: 'Sunday', labelId: 'Minggu' }
]

export function TvScreenConfigPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuthStore()
  const storeId = user?.storeId || ''

  const [activeTab, setActiveTab] = useState<'layout' | 'specials' | 'lottery' | 'media' | 'preview'>('layout')
  const [catalogProducts, setCatalogProducts] = useState<any[]>([])
  useEffect(() => { productApi.list({storeId,status:'active'}).then(response => setCatalogProducts(response.data?.data?.list || [])).catch(() => {}) }, [storeId])
  const [displayToken, setDisplayToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [testLotteryLoading, setTestLotteryLoading] = useState(false)

  const [config, setConfig] = useState<TvScreenConfig>({
    enabled: false,
    storeName: 'YOUME Tea & Boba',
    welcomeText: 'Selamat Datang di YOUME',
    carouselIntervalSeconds: 6,
    layout: {
      columns: [
        { width: 60, content: 'media' },
        { width: 40, content: 'specials' }
      ]
    },
    mediaFiles: [],
    dailySpecials: [],
    lottery: {
      enabled: false,
      triggerMinOrderAmount: 50000,
      title: 'Putar Roda Hoki (Lucky Wheel)',
      subtitle: 'Belanja Min Rp 50.000 Berkesempatan Menang!',
      prizes: []
    },
    ticker: {
      enabled: false,
      text: 'Selamat Menikmati Minuman Anda di YOUME Tea! Follow Instagram @youmetea.id untuk info promo terbaru!'
    }
  })

  // Load configuration
  useEffect(() => {
    loadConfig()
  }, [storeId])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const res = await marketingApi.getTvScreenConfig(storeId)
      if (res.data?.data) {
        setConfig(normalizeTvConfig(res.data.data))
        setDisplayToken(res.data.data.displayToken || '')
      }
    } catch (error) {
      console.error('Failed to load TV screen config:', error)
      alert(t('common.loadFailed', '加载失败，请重试'))
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveSuccess(false)
    try {
      const saved = await marketingApi.saveTvScreenConfig(config)
      setConfig(normalizeTvConfig(saved.data.data))
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      console.error('Failed to save TV config:', error)
      alert(t('common.saveFailed', '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  // Handle uploading banner images
  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    try {
      const res = await uploadApi.uploadProduct(files)
      const uploadedUrls: string[] = (res.data?.data?.urls || []).map(receiptMediaUrl)
      const newBanners: MediaBanner[] = uploadedUrls.map(url => ({
        url,
        title: 'New Featured Tea',
        subtitle: 'Fresh & Delicious Boba'
      }))
      setConfig(prev => ({
        ...prev,
        mediaFiles: [...prev.mediaFiles, ...newBanners]
      }))
    } catch (err) {
      console.error('Failed to upload banner:', err)
      alert('Upload failed')
    }
  }

  // Handle upload daily special product image
  const handleProductImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const res = await uploadApi.uploadProduct([file])
      const uploadedUrl = res.data?.data?.urls?.[0]
      if (uploadedUrl) {
        updateDailySpecial(index, 'imageUrl', receiptMediaUrl(uploadedUrl))
      }
    } catch (err) {
      console.error('Failed to upload special image:', err)
      alert('Upload failed')
    }
  }

  // Update daily special item
  const updateDailySpecial = (index: number, field: keyof DailySpecialItem, value: any) => {
    setConfig(prev => {
      const updated = [...prev.dailySpecials]
      updated[index] = { ...updated[index], [field]: value }
      return { ...prev, dailySpecials: updated }
    })
  }

  const addDailySpecial = () => {
    const newItem: DailySpecialItem = {
      dayOfWeek: 1,
      productName: 'Brown Sugar Milk Tea',
      originalPrice: 28000,
      specialPrice: 19000,
      tag: 'Hemat Senin',
      imageUrl: 'https://images.unsplash.com/photo-1558857563-b37fe8466e39?w=600&q=80',
      description: 'Gula aren murni dan susu segar'
    }
    setConfig(prev => ({
      ...prev,
      dailySpecials: [...prev.dailySpecials, newItem]
    }))
  }

  const removeDailySpecial = (index: number) => {
    setConfig(prev => ({
      ...prev,
      dailySpecials: prev.dailySpecials.filter((_, i) => i !== index)
    }))
  }

  // Prize operations
  const updatePrize = (index: number, field: keyof LotteryPrize, value: any) => {
    setConfig(prev => {
      const updated = [...prev.lottery.prizes]
      updated[index] = { ...updated[index], [field]: value }
      return {
        ...prev,
        lottery: { ...prev.lottery, prizes: updated }
      }
    })
  }

  const addPrize = () => {
    const newPrize: LotteryPrize = {
      id: String(Date.now()),
      name: 'Gratis Boba Topping',
      code: 'free_topping',
      color: '#F59E0B',
      weight: 20
    }
    setConfig(prev => ({
      ...prev,
      lottery: {
        ...prev.lottery,
        prizes: [...prev.lottery.prizes, newPrize]
      }
    }))
  }

  const removePrize = (index: number) => {
    setConfig(prev => ({
      ...prev,
      lottery: {
        ...prev.lottery,
        prizes: prev.lottery.prizes.filter((_, i) => i !== index)
      }
    }))
  }

  // Trigger test lottery to connected TV
  const handleTestLottery = async () => {
    setTestLotteryLoading(true)
    try {
      const result = await marketingApi.triggerTvLottery({
        testMode: true
      })
      if (!result.data?.data) { alert(result.data?.message || 'Lottery is disabled'); return }
      alert(t('marketing.testLotterySent', '抽奖指令已成功发送至小米电视大屏！'))
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to trigger test lottery')
    } finally {
      setTestLotteryLoading(false)
    }
  }

  // TV display URL
  const tvDisplayUrl = `${window.location.hostname === 'admin.aicube.online' ? 'https://pos.aicube.online' : window.location.origin.replace(/:\d+$/, ':6063')}/#/tv-display?storeId=${encodeURIComponent(storeId)}&displayToken=${encodeURIComponent(displayToken)}`

  if (loading) {
    return <div className="p-8 text-center text-gray-500">{t('common.loading', '加载中...')}</div>
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 text-white flex items-center justify-center shadow-md shadow-pink-100">
            <Tv size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">
                {t('marketing.tvScreenTitle', '小米42寸电视多屏互动营销')}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                config.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {config.enabled ? t('common.enabled', '已开启') : t('common.disabled', '未开启')}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {t('marketing.tvScreenDesc', '自定义电视显示区域、每日特价产品与价格、消费满额大转盘抽奖及实时动效播报')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={displayToken ? tvDisplayUrl : undefined}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 flex items-center gap-1.5 transition-colors"
          >
            <ExternalLink size={16} />
            <span>{t('marketing.openTvDisplay', '打开电视大屏')}</span>
          </a>

          <button
            onClick={handleTestLottery}
            disabled={testLotteryLoading}
            className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Sparkles size={16} />
            <span>{testLotteryLoading ? t('common.testing', '触发中...') : t('marketing.testLottery', '大屏试抽奖')}</span>
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 flex items-center gap-1.5 shadow-sm transition-all"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
            <span>{saving ? t('common.saving', '保存中...') : t('common.save', '保存设置')}</span>
          </button>
        </div>
      </div>

      {/* Save Success Banner */}
      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center gap-2">
          <CheckCircle size={18} className="text-emerald-600" />
          <span className="text-sm font-medium">
            {t('marketing.tvConfigSavedSuccess', '设置已成功保存并实时广播至门店电视大屏！')}
          </span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 gap-2">
        <button
          onClick={() => setActiveTab('layout')}
          className={`pb-3 px-4 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'layout' ? 'border-primary text-primary font-bold' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Sliders size={18} />
          <span>{t('marketing.tabLayout', '大屏版式与基础')}</span>
        </button>

        <button
          onClick={() => setActiveTab('specials')}
          className={`pb-3 px-4 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'specials' ? 'border-primary text-primary font-bold' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Tag size={18} />
          <span>{t('marketing.tabDailySpecials', '每日特价管理')}</span>
          <span className="ml-1 px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded-full text-xs">
            {config.dailySpecials.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('lottery')}
          className={`pb-3 px-4 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'lottery' ? 'border-primary text-primary font-bold' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Gift size={18} />
          <span>{t('marketing.tabLottery', '满额大转盘设置')}</span>
          <span className="ml-1 px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded-full text-xs">
            {config.lottery.prizes.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('media')}
          className={`pb-3 px-4 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'media' ? 'border-primary text-primary font-bold' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Layers size={18} />
          <span>{t('marketing.tabMediaBanners', '轮播海报库')}</span>
          <span className="ml-1 px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded-full text-xs">
            {config.mediaFiles.length}
          </span>
        </button>
      </div>

      {/* TAB 1: 大屏版式与区域自定义 */}
      {activeTab === 'layout' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">{t('marketing.screenDivisionTitle', '42寸电视多区域分割设置')}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{t('marketing.screenDivisionDesc', '自由分配左侧主展示区与右侧活动区域的显示比例')}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('marketing.tvStoreName', '大屏顶部品牌名称')}</label>
              <input
                type="text"
                value={config.storeName}
                onChange={(e) => setConfig({ ...config, storeName: e.target.value })}
                className="w-full p-2.5 border border-gray-200 rounded-xl text-sm"
                placeholder="YOUME Tea & Boba"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('marketing.carouselInterval', '海报轮播间隔 (秒)')}</label>
              <input
                type="number"
                min="3"
                max="60"
                value={config.carouselIntervalSeconds}
                onChange={(e) => setConfig({ ...config, carouselIntervalSeconds: parseInt(e.target.value) || 6 })}
                className="w-full p-2.5 border border-gray-200 rounded-xl text-sm"
              />
            </div>
          </div>

          {/* 区域占比调整滑块 */}
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
            <h3 className="font-semibold text-sm text-gray-800">{t('marketing.columnSplit', '大屏左右栏目宽度调整')}</h3>
            <div className="flex items-center gap-4">
              <span className="text-xs font-semibold text-primary w-24">
                左栏 ({config.layout.columns[0]?.width || 60}%):
              </span>
              <input
                type="range"
                min="40"
                max="80"
                value={config.layout.columns[0]?.width || 60}
                onChange={(e) => {
                  const leftW = parseInt(e.target.value)
                  const rightW = 100 - leftW
                  setConfig(prev => ({
                    ...prev,
                    layout: {
                      columns: [
                        { width: leftW, content: 'media' },
                        { width: rightW, content: 'specials' }
                      ]
                    }
                  }))
                }}
                className="flex-1 accent-primary"
              />
              <span className="text-xs font-semibold text-orange-600 w-24 text-right">
                右栏 ({100 - (config.layout.columns[0]?.width || 60)}%)
              </span>
            </div>

            {/* 视觉预览条 */}
            <div className="h-14 rounded-xl overflow-hidden flex border border-gray-200 shadow-inner">
              <div
                style={{ width: `${config.layout.columns[0]?.width || 60}%` }}
                className="bg-primary/20 flex items-center justify-center font-bold text-xs text-primary border-r border-dashed border-primary/50"
              >
                主展示区 (轮播海报/新品) · {config.layout.columns[0]?.width || 60}%
              </div>
              <div
                style={{ width: `${100 - (config.layout.columns[0]?.width || 60)}%` }}
                className="bg-amber-100 flex items-center justify-center font-bold text-xs text-amber-800"
              >
                右侧活动区 (今日特价 + 扫码) · {100 - (config.layout.columns[0]?.width || 60)}%
              </div>
            </div>
          </div>

          {/* 跑马灯设置 */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">{t('marketing.tickerLabel', '底部滚动跑马灯字幕')}</label>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={config.ticker?.enabled !== false}
                  onChange={(e) => setConfig({
                    ...config,
                    ticker: { ...config.ticker, enabled: e.target.checked }
                  })}
                  className="rounded text-primary focus:ring-primary"
                />
                <span>{t('marketing.showTicker', '启用跑马灯')}</span>
              </label>
            </div>
            <textarea
              rows={2}
              value={config.ticker?.text || ''}
              onChange={(e) => setConfig({
                ...config,
                ticker: { ...config.ticker, text: e.target.value }
              })}
              className="w-full p-3 border border-gray-200 rounded-xl text-sm"
              placeholder="输入大屏底部滚动的宣传语、活动通告或问候语..."
            />
          </div>
        </div>
      )}

      {/* TAB 2: 每日特价产品与价格自定义 */}
      {activeTab === 'specials' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">{t('marketing.specialsConfigTitle', '每日特价 (Daily Deals) 排期')}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{t('marketing.specialsConfigDesc', '配置每一天的超值特价饮品、活动角标及高清照片，电视端到时间自动切换展示')}</p>
            </div>
            <button
              onClick={addDailySpecial}
              className="px-3.5 py-1.5 bg-primary/10 text-primary rounded-xl text-xs font-semibold hover:bg-primary/20 flex items-center gap-1"
            >
              <Plus size={16} />
              <span>{t('marketing.addSpecial', '新增特价项目')}</span>
            </button>
          </div>

          {/* 营销管理全链路联动提示 */}
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-start gap-2.5">
            <span className="text-base">💡</span>
            <div>
              <span className="font-semibold">{t('marketing.tvSpecialsLinkHintTitle', '已开启营销管理全链路自动联动：')}</span>
              <span className="text-blue-700">
                {t('marketing.tvSpecialsLinkHintDesc', '当您在【营销管理 -> 促销折扣 / 每日特价】中配置了定时特价活动时，电视大屏将优先自动拉取当前生效的特价商品并轮播展示，同时收银机将自动以特价进行结算；此处的排期列表可作为日常常驻特价备用。')}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {config.dailySpecials.map((item, idx) => (
              <div key={idx} className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 space-y-4">
                <div className="space-y-2">
                  <label className="flex gap-2 items-center"><input type="checkbox" checked={item.autoPrice === true} onChange={e => updateDailySpecial(idx, 'autoPrice', e.target.checked)} />{t('marketing.autoActivityPrice')}</label>
                  <select className="input" value={item.productId || ''} onChange={e => { const product = catalogProducts.find(p => p.id === e.target.value); updateDailySpecial(idx, 'productId', e.target.value); if (product) { updateDailySpecial(idx, 'productName', product.name); updateDailySpecial(idx, 'originalPrice', product.specs?.[0]?.price || 0) } }}>
                    <option value="">{t('marketing.selectActivityProduct')}</option>
                    {catalogProducts.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                  <p className="text-xs text-gray-500">{t('marketing.dailyPricingScope')}</p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">
                      {idx + 1}
                    </span>
                    <select
                      value={item.dayOfWeek}
                      onChange={(e) => updateDailySpecial(idx, 'dayOfWeek', parseInt(e.target.value))}
                      className="p-1.5 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-800"
                    >
                      {DAYS_OF_WEEK.map(d => (
                        <option key={d.day} value={d.day}>
                          {i18n.language === 'zh' ? d.labelZh : d.labelId}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={item.tag}
                      onChange={(e) => updateDailySpecial(idx, 'tag', e.target.value)}
                      placeholder="角标标签，如: Senin Hemat (周一特惠)"
                      className="px-2.5 py-1 text-xs bg-orange-100 text-orange-800 rounded-lg border border-orange-200 font-medium"
                    />
                  </div>

                  <button
                    onClick={() => removeDailySpecial(idx)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                  {/* 商品图片预览与上传 */}
                  <div className="flex items-center gap-3 md:col-span-1">
                    <img
                      src={item.imageUrl}
                      alt={item.productName}
                      className="w-16 h-16 rounded-xl object-cover border border-gray-200 shadow-xs"
                    />
                    <div>
                      <label className="cursor-pointer px-2.5 py-1 bg-white border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-100 flex items-center gap-1 shadow-2xs">
                        <Upload size={12} />
                        <span>换图片</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleProductImageUpload(idx, e)}
                        />
                      </label>
                    </div>
                  </div>

                  {/* 饮品名称 */}
                  <div className="md:col-span-1">
                    <label className="block text-xs text-gray-500 mb-1">饮品名称 (Product Name)</label>
                    <input
                      type="text"
                      value={item.productName}
                      onChange={(e) => updateDailySpecial(idx, 'productName', e.target.value)}
                      className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold"
                    />
                  </div>

                  {/* 价格配置 */}
                  <div className="md:col-span-1">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">原价 (Rp)</label>
                        <input
                          type="number"
                          value={item.originalPrice}
                          onChange={(e) => updateDailySpecial(idx, 'originalPrice', parseInt(e.target.value) || 0)}
                          className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs line-through text-gray-400"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-rose-600 mb-1">特价 (Rp)</label>
                        <input
                          type="number"
                          value={item.specialPrice}
                          onChange={(e) => updateDailySpecial(idx, 'specialPrice', parseInt(e.target.value) || 0)}
                          className="w-full p-2 bg-white border border-rose-200 rounded-lg text-xs font-bold text-rose-600"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 描述 */}
                  <div className="md:col-span-1">
                    <label className="block text-xs text-gray-500 mb-1">特色描述 (Description)</label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateDailySpecial(idx, 'description', e.target.value)}
                      className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-600"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: 满额幸运大转盘设置 */}
      {activeTab === 'lottery' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">{t('marketing.lotteryTitle', '满额大转盘动效与奖品池')}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{t('marketing.lotteryDesc', '当收银机结账满设定金额时，收银员一键触发小米电视全屏转盘开奖动效')}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.lottery.enabled}
                onChange={(e) => setConfig({
                  ...config,
                  lottery: { ...config.lottery, enabled: e.target.checked }
                })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('marketing.lotteryMinAmount', '满额触发门槛 (Rp)')}</label>
              <input
                type="number"
                value={config.lottery.triggerMinOrderAmount}
                onChange={(e) => setConfig({
                  ...config,
                  lottery: { ...config.lottery, triggerMinOrderAmount: parseInt(e.target.value) || 0 }
                })}
                className="w-full p-2.5 border border-gray-200 rounded-xl text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">例如设为 50000，当订单合计达到 Rp 50.000 即达标</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">转盘大标题</label>
              <input
                type="text"
                value={config.lottery.title}
                onChange={(e) => setConfig({
                  ...config,
                  lottery: { ...config.lottery, title: e.target.value }
                })}
                className="w-full p-2.5 border border-gray-200 rounded-xl text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">副标题宣传语</label>
              <input
                type="text"
                value={config.lottery.subtitle}
                onChange={(e) => setConfig({
                  ...config,
                  lottery: { ...config.lottery, subtitle: e.target.value }
                })}
                className="w-full p-2.5 border border-gray-200 rounded-xl text-sm"
              />
            </div>
          </div>

          {/* 奖项列表 */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-gray-800">转盘奖品扇形区配置 (Prizes)</h3>
              <button
                onClick={addPrize}
                className="px-3 py-1 bg-amber-100 text-amber-800 rounded-xl text-xs font-semibold hover:bg-amber-200 flex items-center gap-1"
              >
                <Plus size={14} />
                <span>添加奖项</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {config.lottery.prizes.map((prize, pIdx) => (
                <div key={prize.id || pIdx} className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-3">
                  <input
                    type="color"
                    value={prize.color || '#F59E0B'}
                    onChange={(e) => updatePrize(pIdx, 'color', e.target.value)}
                    className="w-9 h-9 rounded-lg cursor-pointer border-0 p-0"
                  />
                  <div className="flex-1 space-y-1">
                    <input
                      type="text"
                      value={prize.name}
                      onChange={(e) => updatePrize(pIdx, 'name', e.target.value)}
                      placeholder="奖品文案，如: Gratis Boba"
                      className="w-full p-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-400">中奖权重:</span>
                      <input
                        type="number"
                        value={prize.weight}
                        onChange={(e) => updatePrize(pIdx, 'weight', parseInt(e.target.value) || 1)}
                        className="w-16 p-1 bg-white border border-gray-200 rounded-md text-xs font-semibold text-center"
                      />
                      <span className="text-[11px] text-gray-400">代码: {prize.code}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => removePrize(pIdx)}
                    className="p-1.5 text-red-400 hover:text-red-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: 轮播海报管理 */}
      {activeTab === 'media' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">{t('marketing.bannersTitle', '主展示区轮播海报库')}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{t('marketing.bannersDesc', '支持上传 16:9 比例高清产品海报，展示在电视大屏左侧')}</p>
            </div>

            <label className="cursor-pointer px-4 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/90 flex items-center gap-1.5 shadow-sm">
              <Upload size={16} />
              <span>上传高清海报</span>
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleBannerUpload}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {config.mediaFiles.map((banner, bIdx) => (
              <div key={bIdx} className="bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden shadow-2xs group relative">
                <img
                  src={banner.url}
                  alt={banner.title || 'Banner'}
                  className="w-full h-44 object-cover"
                />
                <div className="p-3 space-y-2">
                  <input
                    type="text"
                    value={banner.title || ''}
                    onChange={(e) => {
                      const updated = [...config.mediaFiles]
                      updated[bIdx].title = e.target.value
                      setConfig({ ...config, mediaFiles: updated })
                    }}
                    placeholder="海报标题 (如: Fresh Strawberry Tea)"
                    className="w-full p-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold"
                  />
                  <input
                    type="text"
                    value={banner.subtitle || ''}
                    onChange={(e) => {
                      const updated = [...config.mediaFiles]
                      updated[bIdx].subtitle = e.target.value
                      setConfig({ ...config, mediaFiles: updated })
                    }}
                    placeholder="宣传标语"
                    className="w-full p-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-500"
                  />
                </div>

                <button
                  onClick={() => {
                    setConfig({
                      ...config,
                      mediaFiles: config.mediaFiles.filter((_, i) => i !== bIdx)
                    })
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-lg opacity-80 hover:opacity-100 shadow-md transition-opacity"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
