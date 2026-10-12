import React, { useState, useEffect } from 'react'
import { tvApi } from '../../services/api'
import { 
  Tv, Plus, RefreshCw, Edit2, Trash2, Send, ExternalLink, 
  Eye, Check, CheckSquare, Square, ArrowUp, ArrowDown, Sparkles, 
  Sliders, Film, AlertTriangle, Monitor, Smartphone, Volume2, Key
} from 'lucide-react'

interface ScreenConfig {
  id: string
  code: string
  name: string
  orientation: 'landscape' | 'portrait'
  layoutTemplate: 'menu_full' | 'split_media_menu' | 'media_loop' | 'portrait_promo_menu' | 'portrait_media_loop'
  themeStyle: 'international_dark' | 'creamy_morandi' | 'dynamic_vivid'
  safeAreaPadding: number
  mediaFitMode: 'cover' | 'contain_blur'
  mediaIntervalSeconds: number
  selectedMediaIds: string[]
  selectedCategoryIds: string[]
  showActivities: boolean
  activityDisplayType: 'all' | 'badges_only' | 'banner_only'
  marqueeText: string
  marqueeSpeed: number
  isActive: boolean
  lastHeartbeatAt?: string
  deviceInfo?: {
    resolution?: string
    orientation?: string
    isOnline?: boolean
    userAgent?: string
    appVersion?: string
  }
  lastUpdatedAt: string
}

interface MediaItem {
  id: string
  name: string
  url: string
  type: 'image' | 'video' | 'audio' | 'logo'
  category: string
  size: number
}

export const TVScreensPage: React.FC = () => {
  const [screens, setScreens] = useState<ScreenConfig[]>([])
  const [allMedia, setAllMedia] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [editingScreen, setEditingScreen] = useState<ScreenConfig | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isMediaSelectorOpen, setIsMediaSelectorOpen] = useState(false)
  const [previewScreen, setPreviewScreen] = useState<ScreenConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [pushStatus, setPushStatus] = useState<string>('')

  // 激活配对码状态
  const [isPairModalOpen, setIsPairModalOpen] = useState(false)
  const [pairPin, setPairPin] = useState('')
  const [pairTargetScreenCode, setPairTargetScreenCode] = useState('')
  const [pairNewName, setPairNewName] = useState('')
  const [pairOrientation, setPairOrientation] = useState<'landscape' | 'portrait'>('landscape')
  const [pairSubmitting, setPairSubmitting] = useState(false)
  const [pairError, setPairError] = useState('')

  // 输入配对码一键认领激活电视
  const handleClaimPair = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pairPin || pairPin.trim().length < 4) {
      setPairError('请输入电视屏幕上显示的 6 位激活配对码')
      return
    }
    setPairSubmitting(true)
    setPairError('')
    try {
      const res = await tvApi.claimPairPin({
        pin: pairPin.trim(),
        screenCode: pairTargetScreenCode || undefined,
        screenName: pairNewName || undefined,
        orientation: pairOrientation
      })
      if (res.data?.success) {
        setPushStatus(`🎉 配对成功！已连接电视 [${res.data.data.screenCode}]`)
        setTimeout(() => setPushStatus(''), 4000)
        setIsPairModalOpen(false)
        setPairPin('')
        loadData()
      } else {
        setPairError(res.data?.message || '配对失败，请检查激活码')
      }
    } catch (err: any) {
      setPairError(err.response?.data?.message || '配对失败，激活码可能已过期')
    } finally {
      setPairSubmitting(false)
    }
  }

  // 获取屏幕列表与媒体库
  const loadData = async () => {
    setLoading(true)
    try {
      const [screenRes, mediaRes] = await Promise.all([
        tvApi.getScreens(),
        tvApi.getMedia()
      ])
      if (screenRes.data?.success) setScreens(screenRes.data.data)
      if (mediaRes.data?.success) setAllMedia(mediaRes.data.data)
    } catch (err) {
      console.error('Failed to load screen data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // 打开新增/编辑弹窗
  const handleOpenEdit = (screen?: ScreenConfig) => {
    if (screen) {
      setEditingScreen({ ...screen })
    } else {
      setEditingScreen({
        id: '',
        code: `TV-0${screens.length + 1}`,
        name: `${screens.length + 1}号大屏`,
        orientation: 'landscape',
        layoutTemplate: 'split_media_menu',
        themeStyle: 'international_dark',
        safeAreaPadding: 1.5,
        mediaFitMode: 'cover',
        mediaIntervalSeconds: 8,
        selectedMediaIds: [],
        selectedCategoryIds: [],
        showActivities: true,
        activityDisplayType: 'all',
        marqueeText: '',
        marqueeSpeed: 3,
        isActive: true,
        lastUpdatedAt: new Date().toISOString()
      })
    }
    setIsModalOpen(true)
  }

  // 保存屏幕设置
  const handleSaveScreen = async (andPush = false) => {
    if (!editingScreen) return
    setSaving(true)
    try {
      if (editingScreen.id) {
        await tvApi.updateScreen(editingScreen.id, editingScreen)
      } else {
        await tvApi.createScreen(editingScreen)
      }

      if (andPush && editingScreen.id) {
        await tvApi.pushScreen(editingScreen.id)
        setPushStatus(`✅ 屏幕 [${editingScreen.code}] 已同步更新`)
        setTimeout(() => setPushStatus(''), 3000)
      }

      setIsModalOpen(false)
      loadData()
    } catch (err: any) {
      alert(err.response?.data?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 触发推送到指定大屏
  const handlePushScreen = async (screen: ScreenConfig) => {
    try {
      await tvApi.pushScreen(screen.id)
      setPushStatus(`🚀 已向电视终端 [${screen.code}] 发送刷新广播！`)
      setTimeout(() => setPushStatus(''), 3000)
    } catch {
      alert('推送指令发送失败')
    }
  }

  // 删除屏幕
  const handleDeleteScreen = async (id: string, name: string) => {
    if (!window.confirm(`确定要移除电视屏幕配置 "${name}" 吗？`)) return
    try {
      await tvApi.deleteScreen(id)
      setScreens(prev => prev.filter(s => s.id !== id))
    } catch {
      alert('删除失败')
    }
  }

  // 媒体素材上下排序
  const moveMediaItem = (index: number, direction: 'up' | 'down') => {
    if (!editingScreen) return
    const ids = [...editingScreen.selectedMediaIds]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= ids.length) return
    const temp = ids[index]
    ids[index] = ids[targetIndex]
    ids[targetIndex] = temp
    setEditingScreen({ ...editingScreen, selectedMediaIds: ids })
  }

  // 切换素材勾选
  const toggleSelectMedia = (id: string) => {
    if (!editingScreen) return
    const current = editingScreen.selectedMediaIds || []
    if (current.includes(id)) {
      setEditingScreen({ ...editingScreen, selectedMediaIds: current.filter(x => x !== id) })
    } else {
      setEditingScreen({ ...editingScreen, selectedMediaIds: [...current, id] })
    }
  }

  // 获取当前大屏展示地址（自适应当前访问域名/IP与端口）
  const getTvUrl = (code: string) => {
    return `${window.location.origin}/tv?code=${code}`
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 顶部标题栏 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <Tv size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">电视大屏终端管理</h1>
              <p className="text-sm text-gray-500 mt-1">
                支持管理多台小米电视大屏。横竖屏智能自适应，按需从公共媒体库拉取素材，并深度联动系统促销活动。
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {pushStatus && (
            <span className="text-sm font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-pulse">
              {pushStatus}
            </span>
          )}
          <button
            onClick={() => {
              setPairPin('')
              setPairError('')
              setPairTargetScreenCode(screens.length > 0 ? screens[0].code : '')
              setIsPairModalOpen(true)
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-sm transition-all"
          >
            <Key size={18} />
            <span>输入激活码配对新电视</span>
          </button>
          <button
            onClick={() => handleOpenEdit()}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl font-medium shadow-sm transition-all"
          >
            <Plus size={18} />
            <span>手动添加屏幕</span>
          </button>
        </div>
      </div>

      {/* 电视列表 */}
      {loading ? (
        <div className="flex justify-center items-center py-20 text-gray-400">
          <RefreshCw size={28} className="animate-spin mb-2" />
          <span className="ml-3 text-sm">正在加载电视屏幕...</span>
        </div>
      ) : screens.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
          <Tv size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-600 font-medium">尚未添加任何电视大屏</p>
          <p className="text-sm text-gray-400 mt-1">点击右上角「添加电视屏幕」为门店的小米电视配置展示内容</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {screens.map(screen => {
            const isLandscape = screen.orientation === 'landscape'
            return (
              <div 
                key={screen.id} 
                className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between"
              >
                {/* 屏幕预览模拟框头 */}
                <div className="p-5 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 bg-red-50 text-red-600 text-xs font-bold rounded-lg uppercase">
                        {screen.code}
                      </span>
                      <h3 className="font-bold text-gray-900 text-base">{screen.name}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const isOnline = screen.lastHeartbeatAt && (Date.now() - new Date(screen.lastHeartbeatAt).getTime() < 90000)
                        if (isOnline) {
                          return (
                            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200" title={`心跳正常 | ${screen.deviceInfo?.resolution || '已连接'}`}>
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                              <span>在线</span>
                            </span>
                          )
                        } else if (screen.lastHeartbeatAt) {
                          return (
                            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200" title="终端断网中，正通过本地离线缓存持续播放">
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              <span>离线播放</span>
                            </span>
                          )
                        } else {
                          return (
                            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
                              <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                              <span>未连接</span>
                            </span>
                          )
                        }
                      })()}
                      <span className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        isLandscape ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                      }`}>
                        {isLandscape ? <Monitor size={12} /> : <Smartphone size={12} />}
                        {isLandscape ? '横屏' : '竖屏'}
                      </span>
                    </div>
                  </div>

                  {/* 屏幕特征参数 */}
                  <div className="grid grid-cols-2 gap-2 mt-4 text-xs text-gray-600 bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <div>
                      <span className="text-gray-400">模版样式:</span>{' '}
                      <span className="font-medium text-gray-800">
                        {screen.layoutTemplate === 'split_media_menu' ? '分屏海报+价目表' :
                         screen.layoutTemplate === 'menu_full' ? '全景分类价目表' :
                         screen.layoutTemplate === 'portrait_promo_menu' ? '竖屏促销+精选' : '全屏媒体轮播'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">画面模式:</span>{' '}
                      <span className="font-medium text-gray-800">
                        {screen.mediaFitMode === 'cover' ? '等比满铺 (Cover)' : '原比+毛玻璃'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">绑定媒体:</span>{' '}
                      <span className="font-medium text-gray-800">
                        {screen.selectedMediaIds?.length || 0} 个素材
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">识别活动:</span>{' '}
                      <span className={`font-medium ${screen.showActivities ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {screen.showActivities ? '✅ 已联动' : '❌ 未开启'}
                      </span>
                    </div>
                  </div>

                  {/* 跑马灯字幕预览 */}
                  {screen.marqueeText && (
                    <div className="mt-3 p-2 bg-amber-50 text-amber-900 text-xs rounded-lg truncate flex items-center gap-1.5">
                      <Sparkles size={13} className="text-amber-600 shrink-0" />
                      <span className="truncate">{screen.marqueeText}</span>
                    </div>
                  )}
                </div>

                {/* 底部操作与联动 */}
                <div className="p-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPreviewScreen(screen)}
                      className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium rounded-lg flex items-center gap-1.5 shadow-2xs"
                      title="实时模拟预览"
                    >
                      <Eye size={13} />
                      <span>模拟预览</span>
                    </button>
                    <button
                      onClick={() => handlePushScreen(screen)}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-medium rounded-lg flex items-center gap-1.5"
                      title="向电视发送即时刷新指令"
                    >
                      <Send size={13} />
                      <span>推送到大屏</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(screen)}
                      className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-white rounded-lg border border-transparent hover:border-gray-200"
                      title="编辑配置"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => handleDeleteScreen(screen.id, screen.name)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-white rounded-lg border border-transparent hover:border-gray-200"
                      title="移除"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 新增 / 编辑大屏配置弹窗 */}
      {isModalOpen && editingScreen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden my-auto">
            {/* 弹窗头部 */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-red-100 text-red-600 rounded-xl">
                  <Sliders size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {editingScreen.id ? `配置电视大屏 [${editingScreen.code}]` : '添加新电视大屏终端'}
                  </h2>
                  <p className="text-xs text-gray-500">自定义当前屏幕的展示方向、模版、媒体库素材与活动联动方式</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400"
              >
                ✕
              </button>
            </div>

            {/* 弹窗主体内容 */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
              {/* 1. 基础信息 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    屏幕代号 / 配对码 (电视端输入绑定)
                  </label>
                  <input
                    type="text"
                    value={editingScreen.code}
                    onChange={(e) => setEditingScreen({ ...editingScreen, code: e.target.value.toUpperCase() })}
                    placeholder="如 TV-01, BAR-MAIN"
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl font-mono font-bold text-gray-800 outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">在小米电视端启动程序时，选择或输入此代号即可绑定。</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    屏幕名称
                  </label>
                  <input
                    type="text"
                    value={editingScreen.name}
                    onChange={(e) => setEditingScreen({ ...editingScreen, name: e.target.value })}
                    placeholder="如 1号吧台主屏"
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-gray-800 outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              {/* 2. 屏幕方向与模版 */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-gray-700 uppercase">
                  屏幕方向 (横屏 / 竖屏自适应)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingScreen({ 
                      ...editingScreen, 
                      orientation: 'landscape',
                      layoutTemplate: editingScreen.layoutTemplate.startsWith('portrait') ? 'split_media_menu' : editingScreen.layoutTemplate
                    })}
                    className={`p-3.5 rounded-xl border flex items-center gap-3 text-left transition-all ${
                      editingScreen.orientation === 'landscape'
                        ? 'border-red-500 bg-red-50/40 text-red-900 ring-2 ring-red-500/20'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <Monitor size={24} className={editingScreen.orientation === 'landscape' ? 'text-red-600' : 'text-gray-400'} />
                    <div>
                      <div className="font-bold">横屏展示 (Landscape)</div>
                      <div className="text-xs text-gray-500">常规悬挂、吧台上方长屏、16:9/16:10/条屏</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingScreen({ 
                      ...editingScreen, 
                      orientation: 'portrait',
                      layoutTemplate: 'portrait_promo_menu'
                    })}
                    className={`p-3.5 rounded-xl border flex items-center gap-3 text-left transition-all ${
                      editingScreen.orientation === 'portrait'
                        ? 'border-red-500 bg-red-50/40 text-red-900 ring-2 ring-red-500/20'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <Smartphone size={24} className={editingScreen.orientation === 'portrait' ? 'text-red-600' : 'text-gray-400'} />
                    <div>
                      <div className="font-bold">竖屏立柱 (Portrait)</div>
                      <div className="text-xs text-gray-500">门头立牌、90度旋转电视、9:16/10:16海报屏</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* 3. 布局模版选择 */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-gray-700 uppercase">
                  布局展示模版
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {editingScreen.orientation === 'landscape' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditingScreen({ ...editingScreen, layoutTemplate: 'split_media_menu' })}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          editingScreen.layoutTemplate === 'split_media_menu'
                            ? 'border-red-500 bg-red-50/40 text-red-900 font-bold'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <div className="text-sm font-semibold">分屏海报 + 价目表</div>
                        <div className="text-xs text-gray-400 mt-1">左侧自选媒体轮播，右侧商品分类列表</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingScreen({ ...editingScreen, layoutTemplate: 'menu_full' })}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          editingScreen.layoutTemplate === 'menu_full'
                            ? 'border-red-500 bg-red-50/40 text-red-900 font-bold'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <div className="text-sm font-semibold">全景分类价目表</div>
                        <div className="text-xs text-gray-400 mt-1">弹性多栏展开，全部饮品一目了然</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingScreen({ ...editingScreen, layoutTemplate: 'media_loop' })}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          editingScreen.layoutTemplate === 'media_loop'
                            ? 'border-red-500 bg-red-50/40 text-red-900 font-bold'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <div className="text-sm font-semibold">全屏媒体轮播</div>
                        <div className="text-xs text-gray-400 mt-1">纯宣传海报/视频高清循环放映</div>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditingScreen({ ...editingScreen, layoutTemplate: 'portrait_promo_menu' })}
                        className={`p-3 rounded-xl border text-left transition-all col-span-2 ${
                          editingScreen.layoutTemplate === 'portrait_promo_menu'
                            ? 'border-red-500 bg-red-50/40 text-red-900 font-bold'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <div className="text-sm font-semibold">竖屏立柱促销 + 爆款推荐</div>
                        <div className="text-xs text-gray-400 mt-1">上半区大幅动态海报/视频，下半区热销榜单与活动价目</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingScreen({ ...editingScreen, layoutTemplate: 'portrait_media_loop' })}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          editingScreen.layoutTemplate === 'portrait_media_loop'
                            ? 'border-red-500 bg-red-50/40 text-red-900 font-bold'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <div className="text-sm font-semibold">全屏竖版轮播</div>
                        <div className="text-xs text-gray-400 mt-1">100% 满屏展示高清竖版海报</div>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* 4. 从媒体库勾选拉取哪些素材 (核心需求4) */}
              <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-gray-900 uppercase">
                      媒体素材拉取设置 (已勾选 {editingScreen.selectedMediaIds?.length || 0} 个素材)
                    </label>
                    <p className="text-xs text-gray-500">仅拉取被勾选的图片与视频，其它素材不会出现在这台电视上。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMediaSelectorOpen(true)}
                    className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
                  >
                    <Film size={14} />
                    <span>从公共媒体库中勾选</span>
                  </button>
                </div>

                {/* 已选素材横向排序托盘 */}
                {editingScreen.selectedMediaIds && editingScreen.selectedMediaIds.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto py-2">
                    {editingScreen.selectedMediaIds.map((mId, idx) => {
                      const media = allMedia.find(m => m.id === mId)
                      return (
                        <div key={mId} className="relative shrink-0 w-28 bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs group">
                          <div className="h-16 bg-gray-900 flex items-center justify-center overflow-hidden">
                            {media?.type === 'video' ? (
                              <video src={media.url} className="w-full h-full object-cover" muted />
                            ) : (
                              <img src={media?.url || ''} alt="" className="w-full h-full object-contain p-1" />
                            )}
                          </div>
                          <div className="p-1.5">
                            <div className="text-[11px] font-medium text-gray-800 truncate" title={media?.name}>
                              {idx + 1}. {media?.name || '未知素材'}
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => moveMediaItem(idx, 'up')}
                                className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20"
                                title="往前移动"
                              >
                                <ArrowUp size={12} />
                              </button>
                              <button
                                type="button"
                                disabled={idx === editingScreen.selectedMediaIds.length - 1}
                                onClick={() => moveMediaItem(idx, 'down')}
                                className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20"
                                title="往后移动"
                              >
                                <ArrowDown size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleSelectMedia(mId)}
                                className="p-1 hover:bg-red-50 rounded text-red-500"
                                title="移除"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 bg-white rounded-xl border border-dashed border-gray-200 text-gray-400 text-xs">
                    尚未勾选任何轮播海报/视频，点击右上角「从公共媒体库中勾选」
                  </div>
                )}

                {/* 媒体展现参数 */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      满屏显示模式 (绝不拉伸比例)
                    </label>
                    <select
                      value={editingScreen.mediaFitMode}
                      onChange={(e) => setEditingScreen({ ...editingScreen, mediaFitMode: e.target.value as any })}
                      className="w-full p-2 border border-gray-200 rounded-xl text-xs bg-white text-gray-800 outline-none"
                    >
                      <option value="cover">等比满铺 (Cover - 视觉饱满无黑边，边缘微溢出)</option>
                      <option value="contain_blur">完整呈现+毛玻璃柔光 (Contain+Blur - 100%保全文字与条款)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      轮播间隔时长
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={3}
                        max={60}
                        value={editingScreen.mediaIntervalSeconds}
                        onChange={(e) => setEditingScreen({ ...editingScreen, mediaIntervalSeconds: Number(e.target.value) })}
                        className="w-24 p-2 border border-gray-200 rounded-xl text-xs bg-white text-gray-800 outline-none"
                      />
                      <span className="text-xs text-gray-500">秒 / 张</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 5. 联动识别系统后台活动 (核心需求5) */}
              <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={18} className="text-emerald-600" />
                    <div>
                      <h3 className="font-bold text-gray-900 text-xs uppercase">
                        识别并展示系统后台营销活动
                      </h3>
                      <p className="text-xs text-gray-500">
                        自动提取当前生效的「折扣规则 DiscountRule」与「营销活动 Campaign」
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={editingScreen.showActivities}
                      onChange={(e) => setEditingScreen({ ...editingScreen, showActivities: e.target.checked })}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {editingScreen.showActivities && (
                  <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                    <div>
                      <label className="block text-gray-700 mb-1">活动展现形式</label>
                      <select
                        value={editingScreen.activityDisplayType}
                        onChange={(e) => setEditingScreen({ ...editingScreen, activityDisplayType: e.target.value as any })}
                        className="w-full p-2 border border-gray-200 rounded-xl text-xs bg-white text-gray-800 outline-none"
                      >
                        <option value="all">全部展示 (商品特惠角标 + 顶部活动横幅)</option>
                        <option value="badges_only">仅在对应商品上打出活动徽标 (如立减/特惠)</option>
                        <option value="banner_only">仅在顶部/侧边显示整体活动公告</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-700 mb-1">风格主题配色</label>
                      <select
                        value={editingScreen.themeStyle}
                        onChange={(e) => setEditingScreen({ ...editingScreen, themeStyle: e.target.value as any })}
                        className="w-full p-2 border border-gray-200 rounded-xl text-xs bg-white text-gray-800 outline-none"
                      >
                        <option value="international_dark">黑金现代国际风 (Dark Gold - 高端大气)</option>
                        <option value="creamy_morandi">温润奶油风 (Creamy - 治愈温润日韩系)</option>
                        <option value="dynamic_vivid">多巴胺潮酷风 (Vivid Dynamic - 年轻高饱和)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* 6. 解决小米电视过扫描 & 跑马灯字幕 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-gray-700 uppercase">
                      防电视过扫描安全边距: {editingScreen.safeAreaPadding}%
                    </label>
                    <span className="text-[11px] text-gray-400">解决小米电视边缘文字被裁切</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={0.5}
                    value={editingScreen.safeAreaPadding}
                    onChange={(e) => setEditingScreen({ ...editingScreen, safeAreaPadding: Number(e.target.value) })}
                    className="w-full accent-red-600"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                    <span>0% (无裁切时贴边)</span>
                    <span>1.5% (推荐值)</span>
                    <span>5% (大边框电视)</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    底部跑马灯滚动字幕
                  </label>
                  <input
                    type="text"
                    value={editingScreen.marqueeText}
                    onChange={(e) => setEditingScreen({ ...editingScreen, marqueeText: e.target.value })}
                    placeholder="输入滚动宣传语、Wifi密码或开业福利..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-800 outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>
            </div>

            {/* 弹窗底部操作按钮 */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl font-medium"
              >
                取消
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveScreen(false)}
                  className="px-5 py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-xl font-medium shadow-sm transition-all disabled:opacity-50"
                >
                  {saving ? '保存中...' : '仅保存配置'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveScreen(true)}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <Send size={16} />
                  <span>保存并立即推送到大屏</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 媒体库多选弹窗 (从公共媒体库勾选素材) */}
      {isMediaSelectorOpen && editingScreen && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h3 className="font-bold text-gray-900">从公共媒体库勾选素材</h3>
                <p className="text-xs text-gray-500">点击素材进行勾选或取消勾选</p>
              </div>
              <button 
                onClick={() => setIsMediaSelectorOpen(false)}
                className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg shadow-2xs"
              >
                完成选择 ({editingScreen.selectedMediaIds?.length || 0})
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {allMedia.map(item => {
                const isSelected = editingScreen.selectedMediaIds?.includes(item.id)
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSelectMedia(item.id)}
                    className={`relative rounded-xl border-2 overflow-hidden cursor-pointer transition-all ${
                      isSelected 
                        ? 'border-red-600 ring-2 ring-red-500/20 shadow-md' 
                        : 'border-gray-200 hover:border-gray-300 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className="aspect-video bg-gray-900 flex items-center justify-center">
                      {item.type === 'video' ? (
                        <video src={item.url} className="w-full h-full object-cover" muted />
                      ) : (
                        <img src={item.url} alt="" className="w-full h-full object-contain p-1" />
                      )}
                    </div>
                    <div className="p-2 bg-white flex items-center justify-between text-xs">
                      <span className="truncate font-medium text-gray-800" title={item.name}>{item.name}</span>
                      <span className={`p-0.5 rounded ${isSelected ? 'text-red-600' : 'text-gray-300'}`}>
                        {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 1:1 大屏实时模拟预览弹窗 */}
      {previewScreen && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-md"
          onClick={() => setPreviewScreen(null)}
        >
          <div className="w-full max-w-6xl flex items-center justify-between mb-3 text-white px-2">
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 bg-red-600 font-mono font-bold rounded-md text-xs">
                {previewScreen.code}
              </span>
              <span className="font-bold text-base">{previewScreen.name} - 实时大屏模拟</span>
              <span className="text-xs text-gray-400">
                ({previewScreen.orientation === 'landscape' ? '横屏 16:9 / 宽屏自适应' : '竖屏 9:16 自适应'})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={getTvUrl(previewScreen.code)}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-medium flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={13} />
                <span>单独窗口全屏查看</span>
              </a>
              <button 
                onClick={() => setPreviewScreen(null)}
                className="p-1 hover:bg-white/20 rounded-lg text-gray-300 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>

          {/* 模拟器外壳 */}
          <div 
            className={`bg-black rounded-2xl overflow-hidden shadow-2xl border-4 border-gray-800 flex items-center justify-center ${
              previewScreen.orientation === 'landscape' 
                ? 'w-full max-w-5xl aspect-video' 
                : 'w-[420px] aspect-[9/16]'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <iframe 
              src={`/tv?code=${previewScreen.code}`}
              title="TV Display Preview"
              className="w-full h-full border-0"
            />
          </div>
        </div>
      )}

      {/* 🔑 激活配对码弹窗 (输入电视上的 6 位数字一键连接) */}
      {isPairModalOpen && (
        <div className="fixed inset-0 z-70 bg-black/75 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* 弹窗头部 */}
            <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-sm">
                  <Key size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">激活配对新电视</h2>
                  <p className="text-xs text-gray-500">输入电视屏幕上显示的 6 位激活码</p>
                </div>
              </div>
              <button 
                onClick={() => setIsPairModalOpen(false)}
                className="p-1.5 hover:bg-gray-200/60 rounded-lg text-gray-400"
              >
                ✕
              </button>
            </div>

            {/* 弹窗表单 */}
            <form onSubmit={handleClaimPair} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  电视屏幕上的激活码 (6位数字)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={6}
                    value={pairPin}
                    onChange={(e) => setPairPin(e.target.value.replace(/[^0-9a-zA-Z]/g, '').toUpperCase())}
                    placeholder="如 749382"
                    autoFocus
                    className="w-full py-3.5 px-4 text-center font-mono text-3xl font-extrabold tracking-widest text-emerald-800 bg-emerald-50/50 border-2 border-emerald-300 rounded-2xl outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/20 placeholder:text-gray-300 placeholder:text-2xl placeholder:font-normal placeholder:tracking-normal"
                  />
                </div>
                {pairError ? (
                  <p className="text-xs text-red-600 font-medium mt-2 flex items-center gap-1">
                    <AlertTriangle size={13} />
                    <span>{pairError}</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-400 mt-2">
                    新电视开机后屏幕正中央会显示此 6 位激活码，有效时间 15 分钟。
                  </p>
                )}
              </div>

              {/* 选择配对方式 */}
              <div className="space-y-3 pt-1 border-t border-gray-100">
                <label className="block text-xs font-bold text-gray-700 uppercase">
                  分配展示内容 (屏幕角色)
                </label>
                
                {screens.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500">选择绑定到现有屏幕配置:</div>
                    <div className="grid grid-cols-1 gap-2 max-h-36 overflow-y-auto">
                      {screens.map(s => (
                        <label
                          key={s.code}
                          className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                            pairTargetScreenCode === s.code
                              ? 'border-emerald-500 bg-emerald-50/50 font-bold text-emerald-900 ring-2 ring-emerald-500/20'
                              : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="targetScreen"
                              checked={pairTargetScreenCode === s.code}
                              onChange={() => pairTargetScreenCode !== s.code && setPairTargetScreenCode(s.code)}
                              className="text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-xs">{s.code} - {s.name}</span>
                          </div>
                          <span className="text-[11px] text-gray-400">
                            {s.orientation === 'landscape' ? '横屏' : '竖屏'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* 或者新建屏幕代号 */}
                <div className="pt-2">
                  <div className="text-xs text-gray-500 mb-1.5">或新建一个屏幕代号:</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={`TV-0${screens.length + 1}`}
                      value={pairTargetScreenCode}
                      onChange={(e) => setPairTargetScreenCode(e.target.value.toUpperCase())}
                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-mono font-bold"
                    />
                    <select
                      value={pairOrientation}
                      onChange={(e) => setPairOrientation(e.target.value as any)}
                      className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50 text-gray-700"
                    >
                      <option value="landscape">横屏</option>
                      <option value="portrait">竖屏</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 提交按钮 */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsPairModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={pairSubmitting || !pairPin}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {pairSubmitting ? '配对激活中...' : '立即绑定激活电视'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
export default TVScreensPage
