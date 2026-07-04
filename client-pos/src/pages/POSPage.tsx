import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { posApi, updateApiUrl, fetchApiUrlFromServer } from '../services/api'
import { getApiUrl, setApiUrl } from '../config'
import { useAuthStore } from '../stores/auth'
import { db, syncManager, productCache, LocalProduct } from '../db/offline'
import { connectionManager } from '../services/ConnectionManager'
import { formatCurrency, playSound, playSoundWithSettings } from '../utils/helpers'
import { showToast, ConfirmModal } from '../components/ui'
import { AnnouncementBanner } from '../components/AnnouncementBanner'
import { ChannelSelectModal } from '../components/ChannelSelectModal'
import { AttendanceQR } from '../components/ui/AttendanceQR'
import { UpdateNotification } from '../components/UpdateNotification'
import { useCartStore, useProductStore, useOrderStore, useUiStore } from '../stores'
import {
  Wifi, WifiOff, X, CheckCircle, Search, Loader2,
  ShoppingCart, Trash2, Minus, Plus, Tag, User, Clock,
  Globe, FileText, Users, Printer, ScanLine, Wallet, QrCode,
  CheckSquare, ClipboardList, Lock, Settings, RotateCcw
} from 'lucide-react'

// Electron API
const electronAPI = (window as any).electronAPI

// 语言选项
const LANGS = [
  { code: 'zh', nextCode: 'en', labelKey: 'lang.zh' },
  { code: 'en', nextCode: 'id', labelKey: 'lang.en' },
  { code: 'id', nextCode: 'zh', labelKey: 'lang.id' }
]

// 渠道 - 使用i18n key
const CHANNELS = [
  { id: 'dine_in', nameKey: 'dineIn', icon: '🍵', code: 'DINE_IN' },
  { id: 'gofood', nameKey: 'gofood', icon: '🟢', code: 'GOFOOD' },
  { id: 'grab', nameKey: 'grab', icon: '🟡', code: 'GRAB' },
  { id: 'shopee', nameKey: 'shopee', icon: '🟠', code: 'SHOPEE' }
]

// 渠道可用性检查函数
function isChannelAvailable(availableDays: string, availableHours: string): { available: boolean; message?: string } {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=周日, 1=周一...
  const dayStr = dayOfWeek.toString()

  // 检查日期
  const days = availableDays.split(',')
  if (!days.includes(dayStr)) {
    return { available: false, message: 'Today is not a available day for this channel' }
  }

  // 检查时间
  const hoursMatch = availableHours.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/)
  if (hoursMatch) {
    const [, startH, startM, endH, endM] = hoursMatch
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const startMinutes = parseInt(startH) * 60 + parseInt(startM)
    const endMinutes = parseInt(endH) * 60 + parseInt(endM)

    if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
      return {
        available: false,
        message: `Channel available ${startH}:${startM}-${endH}:${endM}`
      }
    }
  }

  return { available: true }
}

// 甜度选项 - 使用i18n key
const SUGAR_LEVELS = [
  { id: 'normal_sugar', nameKey: 'pos.normalSugar' },
  { id: 'less_sugar', nameKey: 'pos.lessSugar' },
  { id: 'half_sugar', nameKey: 'pos.halfSugar' },
  { id: 'quarter_sugar', nameKey: 'pos.quarterSugar' },
  { id: 'no_sugar', nameKey: 'pos.noSugar' },
]

// 冰度选项 - 使用i18n key
const ICE_LEVELS = [
  { id: 'normal_ice', nameKey: 'pos.normalIce' },
  { id: 'less_ice', nameKey: 'pos.lessIce' },
  { id: 'no_ice', nameKey: 'pos.noIce' },
  { id: 'warm', nameKey: 'pos.warm' },
]

interface CartItem {
  id: string
  productId: string
  productName: string
  specId: string
  specName: string
  sugarLevel?: string
  sugarLevelName?: string
  iceLevel?: string
  iceLevelName?: string
  unitPrice: number
  quantity: number
  addons: { id: string; name: string; price: number; qty: number }[]
}

interface Product {
  id: string
  name: string
  category?: { id: string; name: string }
  image?: string
  specs: { id: string; name: string; price: number }[]
  addons: { addonId: string; addon: { id: string; name: string; price: number } }[]
}

export function POSPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  // 状态 - 使用Zustand stores
  const [cart, setCart] = useState<CartItem[]>([])
  const { filter, setFilter, products, setProducts, searchQuery, setSearchQuery } = useProductStore()
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'offline'>('connected')
  // 渠道状态 - 动态加载
  const [posChannels, setPosChannels] = useState<Array<{id: string; nameKey: string; icon: string; code: string; color?: string}>>([])
  const [selectedChannel, setSelectedChannel] = useState<{id: string; nameKey: string; icon: string; code: string; color?: string} | null>(null)
  const [dineInCount, setDineInCount] = useState(1) // 堂食人数
  // 订单扩展信息
  const [tableNumber, setTableNumber] = useState('')
  const [callerPhone, setCallerPhone] = useState('')
  const [platformOrderId, setPlatformOrderId] = useState('')
  const [purchaseOrderNo, setPurchaseOrderNo] = useState('')
  const [socialRef, setSocialRef] = useState('')
  const [driverPickupTime, setDriverPickupTime] = useState('')
  const [orderNote, setOrderNote] = useState('')
  const [lang, setLang] = useState(() => localStorage.getItem('pos_lang') || i18n.language || 'zh')
  const [pendingTaskCount, setPendingTaskCount] = useState(0)
  // 历史订单数据
  const [orders, setOrders] = useState<any[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  // 卫生任务数据
  const [tasks, setTasks] = useState<any[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  // 现金数据
  const [cashSummary, setCashSummary] = useState<any>(null)
  // 交接班数据
  const [shiftData, setShiftData] = useState<any>(null)
  const [selectedShiftType, setSelectedShiftType] = useState<string>('morning')
  // 锁屏状态
  const [isLocked, setIsLocked] = useState(false)
  const [lockPin, setLockPin] = useState('')
  const [lockError, setLockError] = useState(false)

  // 弹窗 - 使用uiStore
  const {
    showAddonModal, setShowAddonModal,
    showPaymentModal, setShowPaymentModal,
    showMemberModal, setShowMemberModal,
    showDiscountModal, setShowDiscountModal,
    showSuspendModal, setShowSuspendModal,
    showShiftModal, setShowShiftModal,
    showChannelModal, setShowChannelModal,
    showScanModal, setShowScanModal,
    showHistoryModal, setShowHistoryModal,
    showCashModal, setShowCashModal,
    showTasksModal, setShowTasksModal,
    showLogoutModal, setShowLogoutModal,
    selectedProduct, setSelectedProduct,
    selectedSpec, setSelectedSpec,
    selectedAddonIds, setSelectedAddonIds,
    addonQty, setAddonQty,
    selectedSugar, setSelectedSugar,
    selectedIce, setSelectedIce
  } = useUiStore()

  // 支付方式配置 - 默认现金优先
  const [paymentMethods, setPaymentMethods] = useState([
    { id: 'cash', labelKey: 'pos.paymentCash', icon: '💵' },
    { id: 'qris', labelKey: 'pos.paymentQris', icon: '📱' },
    { id: 'gopay', labelKey: 'pos.paymentGoPay', icon: '🟢' },
    { id: 'ovo', labelKey: 'pos.paymentOvo', icon: '🟣' },
    { id: 'dana', labelKey: 'pos.paymentDana', icon: '🔵' },
    { id: 'shopeepay', labelKey: 'pos.paymentShopeePay', icon: '🟠' }
  ])

  // 挂单 - 使用orderStore
  const { suspendedOrders, setSuspendedOrders } = useOrderStore()

  // 考勤二维码弹窗
  const [showAttendanceQR, setShowAttendanceQR] = useState(false)

  // 退款弹窗
  const [showRefundModal, setShowRefundModal] = useState(false)
  const [refundOrders, setRefundOrders] = useState<any[]>([])
  const [selectedRefundOrder, setSelectedRefundOrder] = useState<any>(null)
  const [refundReason, setRefundReason] = useState('')
  const [isProcessingRefund, setIsProcessingRefund] = useState(false)

  // 支付 - 使用orderStore
  const {
    paymentMethod, setPaymentMethod,
    paidAmount, setPaidAmount,
    member, setMember,
    memberPhone, setMemberPhone,
    pointsToRedeem, setPointsToRedeem,
    orderSuccess, setOrderSuccess,
    paymentModalOrderNum, setPaymentModalOrderNum,
    isCheckingOut, setIsCheckingOut,
    isSearchingMember, setIsSearchingMember
  } = useOrderStore()

  // 本地状态
  const [discountAmount, setDiscountAmount] = useState(0)
  const [tempDiscount, setTempDiscount] = useState('')
  // 优惠券状态
  const [memberCoupons, setMemberCoupons] = useState<any[]>([])
  const [selectedCoupon, setSelectedCoupon] = useState<any>(null)
  const [isLoadingCoupons, setIsLoadingCoupons] = useState(false)

  // Confirm Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    type?: 'warning' | 'danger' | 'info'
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  // QRIS Payment State
  const [qrisData, setQrisData] = useState<{
    qrImage?: string
    qrString?: string
    externalId?: string
    status: 'idle' | 'waiting' | 'paid' | 'expired' | 'failed'
  }>({ status: 'idle' })

  // Refs for keyboard handler to avoid stale closure (initialized to undefined, synced via useEffect)
  const cartRef = useRef(cart)
  const paymentMethodRef = useRef(paymentMethod)
  const paidAmountRef = useRef(paidAmount)
  const totalRef = useRef<number | undefined>(undefined)

  // Keep refs in sync
  useEffect(() => { cartRef.current = cart }, [cart])
  useEffect(() => { paymentMethodRef.current = paymentMethod }, [paymentMethod])
  useEffect(() => { paidAmountRef.current = paidAmount }, [paidAmount])


  // POS布局设置
  const [posLayout, setPosLayout] = useState({
    gridCols: '4',
    cardSize: 'medium',
    showCategory: true,
    showPrice: true,
    calculateTax: true,
    showTax: true,
    taxRate: 11,
    showSuspend: true,
    showHistory: true,
    showScan: true,
    showShift: true,
    showRefund: true,
    showCash: false,
    channelDineIn: true,
    channelGoFood: true,
    channelGrab: true,
    channelShopee: true,
    // 快捷键配置
    hotkeys: {
      newOrder: 'F1',
      suspendOrder: 'F2',
      recallOrder: 'F3',
      quickPay: 'F4',
      barcodeScan: 'F5',
      cashDrawer: 'F6',
      receiptPrint: 'F7',
      cancelOrder: 'F8',
    },
    // 工具栏按钮自定义标签
    toolbarLabels: {
      suspend: 'toolbar.suspend',
      history: 'toolbar.history',
      refund: 'toolbar.refund',
      scan: 'toolbar.scan',
      shift: 'toolbar.shift',
      cash: 'toolbar.cash',
      tasks: 'toolbar.tasks',
      logout: 'toolbar.logout'
    }
  })

  // 店铺信息
  const [storeInfo, setStoreInfo] = useState({
    storeName: 'Bubble Tea Shop',
    address: '',
    phone: '',
    openingHours: ''
  })

  // 小票设置
  const [posReceipt, setPosReceipt] = useState({
    header: 'Bubble Tea Shop',
    footer: 'Thank you!',
    taxRate: 11,
    showLogo: true,
    paperSize: '80mm',
    printCopies: 1,
    showQR: false,
    showBarcode: true,
    showKitchenNote: true,
    storePhone: '',
    storeAddress: '',
    itemDetailFormat: 'standard',
    showStaffName: true,
    showCustomerName: false,
    autoPrint: true,
  })

  // 税费设置（包含免税商品ID列表）
  const [taxSettings, setTaxSettings] = useState({
    enabled: true,
    rate: 11,
    showOnReceipt: true,
    exemptItems: [] as string[], // product IDs that are tax-exempt
  })

  // 显示设置
  const [displaySettings, setDisplaySettings] = useState({
    autoLogoutMinutes: 30,
    language: 'id',
    fontSize: 'medium',
    showOfflineIndicator: true,
    autoLockMinutes: 5, // 锁屏时间（分钟），0 = 禁用
    lockScreenPin: '', // 锁屏密码
  })

  // 硬件设置
  const [hardwareSettings, setHardwareSettings] = useState({
    printerConnectionType: 'usb',  // usb / network
    printerType: 'escpos',         // escpos / pcl
    printerName: '',              // Windows printer name (USB)
    printerIp: '192.168.1.100',   // Network printer IP
    printerPort: 9100,             // Network printer port
    cashDrawerPulse: 100,         // 钱箱脉冲(ms)
    autoOpenCashDrawer: true,
    scannerEnabled: true,          // 扫码枪启用
    scannerType: 'usb',            // usb / serial
    displayBrightness: 80,         // 屏幕亮度
    dualScreenEnabled: false,       // 双屏异显
    adScreenImageUrl: '',          // 广告屏图片
    testPrint: null as number | null,
    testCashDrawer: null as number | null,
  })

  // 声音设置
  const [soundSettings, setSoundSettings] = useState({
    keypress: { enabled: true, volume: 80 },
    orderComplete: { enabled: true, volume: 100 },
    error: { enabled: true, volume: 100 },
    newOrder: { enabled: true, volume: 100 },
  })

  const taxRate = posReceipt.taxRate / 100

  // 快捷金额设置
  const [quickAmounts, setQuickAmounts] = useState({
    enabled: true,
    amounts: [5000, 10000, 20000, 50000]
  })

  // 支付设置
  const [paymentSettings, setPaymentSettings] = useState({
    defaultMethod: 'cash',
    minAmount: 0,
    maxCashAmount: 0,
    changeEnabled: true
  })

  // 交接班设置
  const [shiftSettings, setShiftSettings] = useState({
    requireReconciliation: false,
    requireSupervisorConfirm: false,
    showSummary: true,
    cashDifferenceLimit: 0,
    summaryItems: {
      orderCount: true,
      customerCount: true,
      cashSales: true,
      qrisSales: true,
      cashIn: true,
      cashOut: true,
      openFloat: true,
      closeCash: true,
      dineInCount: true,
      gofoodCount: true,
      grabCount: true,
      shopeeCount: true,
      suspendedOrders: true,
      pendingSync: true,
    }
  })

  // 获取产品 (支持离线缓存)
  useEffect(() => {
    const storeId = user?.storeId || 'default'
    const token = useAuthStore.getState().token
    let cancelled = false

    const loadProducts = async () => {
      if (navigator.onLine) {
        try {
          const res = await fetch(`/api/products?storeId=${storeId}&status=active`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          })
          const data = await res.json()
          if (cancelled) return
          if (data?.data?.list) {
            // 在线时缓存产品到IndexedDB
            const localProducts: LocalProduct[] = data.data.list.map((p: any) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              image: p.image,
              categoryId: p.category?.id || '',
              categoryName: p.category?.name || '',
              specs: p.specs || [],
              addons: p.addons?.map((a: any) => ({
                id: a.addon?.id || '',
                name: a.addon?.name || '',
                price: a.addon?.price || 0
              })) || []
            }))
            await productCache.saveProducts(localProducts)

            if (!cancelled) {
              setProducts(data.data.list)
              const firstCat = data.data.list[0]?.category?.name
              if (firstCat) setFilter(firstCat)
              setLoading(false)
            }
          } else {
            // data.data.list 为空
            if (!cancelled) setLoading(false)
          }
        } catch (e) {
          if (cancelled) return
          // 在线读取失败，尝试从缓存加载
          const cached = await productCache.getProducts()
          if (cached.length > 0) {
            setProducts(cached.map(p => ({
              id: p.id,
              name: p.name,
              description: p.description,
              image: p.image,
              category: { id: p.categoryId, name: p.categoryName },
              specs: p.specs || [],
              addons: (p.addons || []).map(a => ({ addonId: a.id, addon: a }))
            })))
            showToast(t('pos.offlineMode') + ' - ' + t('pos.loadingFromCache'), 'info')
          } else {
            // 无缓存，加载示例产品
            const demoProducts = productCache.getDemoProducts()
            setProducts(demoProducts.map(p => ({
              id: p.id,
              name: p.name,
              description: p.description,
              image: p.image,
              category: { id: p.categoryId, name: p.categoryName },
              specs: p.specs,
              addons: p.addons.map(a => ({ addonId: a.id, addon: a }))
            })))
            showToast(t('pos.demoMode') || 'Demo Mode - Sample Products', 'info')
          }
          if (!cancelled) setLoading(false)
        }
      } else {
        // 离线模式，从缓存读取
        const cached = await productCache.getProducts()
        if (cancelled) return
        if (cached.length > 0) {
          setProducts(cached.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            image: p.image,
            category: { id: p.categoryId, name: p.categoryName },
            specs: p.specs || [],
            addons: (p.addons || []).map(a => ({ addonId: a.id, addon: a }))
          })))
          if (!cancelled) setLoading(false)
        } else {
          // 无缓存，加载示例产品
          const demoProducts = productCache.getDemoProducts()
          setProducts(demoProducts.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            image: p.image,
            category: { id: p.categoryId, name: p.categoryName },
            specs: p.specs,
            addons: p.addons.map(a => ({ addonId: a.id, addon: a }))
          })))
          showToast(t('pos.demoMode') || 'Demo Mode - Sample Products', 'info')
          if (!cancelled) setLoading(false)
        }
      }
    }

    loadProducts()
    return () => { cancelled = true }
  }, [user?.storeId])

  // 定期同步产品 (每5分钟检查一次)
  useEffect(() => {
    const storeId = user?.storeId || 'default'
    const token = useAuthStore.getState().token

    const syncProducts = async () => {
      if (!navigator.onLine) return

      try {
        // Check if server has newer products
        const versionRes = await fetch(`/api/products/pos/version?storeId=${storeId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })

        if (versionRes.ok) {
          const versionData = await versionRes.json()
          const serverTimestamp = versionData.data?.latestUpdate

          // Check if we need to sync
          const hasNewer = await productCache.hasNewerProducts(serverTimestamp)

          if (hasNewer) {
            console.log('[ProductSync] New products available, syncing...')
            // Fetch all products
            const res = await fetch(`/api/products?storeId=${storeId}&status=active`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {}
            })
            const data = await res.json()

            if (data?.data?.list) {
              const localProducts: LocalProduct[] = data.data.list.map((p: any) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                image: p.image,
                categoryId: p.category?.id || '',
                categoryName: p.category?.name || '',
                specs: p.specs || [],
                addons: p.addons?.map((a: any) => ({
                  id: a.addon?.id || '',
                  name: a.addon?.name || '',
                  price: a.addon?.price || 0
                })) || []
              }))

              await productCache.saveProducts(localProducts)
              if (serverTimestamp) {
                await productCache.saveProductsVersion(serverTimestamp)
              }
              console.log('[ProductSync] Products synced successfully')
            }
          }
        }
      } catch (e) {
        console.error('[ProductSync] Sync failed:', e)
        // Note: Don't call setLoading(false) here - it's handled by loadProducts
      }
    }

    // Initial sync check after 30 seconds
    const initialTimeout = setTimeout(syncProducts, 30000)

    // Then sync every 5 minutes
    const interval = setInterval(syncProducts, 5 * 60 * 1000)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(interval)
    }
  }, [user?.storeId])

  // 初始化语言（从localStorage恢复）
  useEffect(() => {
    const savedLang = localStorage.getItem('pos_lang')
    if (savedLang && savedLang !== i18n.language) {
      i18n.changeLanguage(savedLang)
      setLang(savedLang)
    }
  }, [])

  // 获取所有配置 (店铺信息、布局、支付方式、小票设置)
  useEffect(() => {
    const storeId = user?.storeId || 'default'
    const token = useAuthStore.getState().token
    fetch(`/api/config?storeId=${storeId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(r => r.json())
      .then(data => {
        const configs = data?.data || {}

        // 店铺信息 - Admin保存为storeInfo对象
        const storeInfoData = configs.storeInfo || {}
        if (storeInfoData.storeName || storeInfoData.address || storeInfoData.phone) {
          setStoreInfo({
            storeName: storeInfoData.storeName || 'Bubble Tea Shop',
            address: storeInfoData.address || '',
            phone: storeInfoData.phone || '',
            openingHours: storeInfoData.openingHours || ''
          })
        }

        // POS布局设置 - Admin保存为posLayout对象，包含快捷键、渠道开关等
        const posLayoutData = configs.posLayout || {}
        if (Object.keys(posLayoutData).length > 0) {
          setPosLayout(prev => ({
            ...prev,
            // 基础布局
            gridCols: posLayoutData.gridCols || prev.gridCols,
            cardSize: posLayoutData.cardSize || prev.cardSize,
            showCategory: posLayoutData.showCategory ?? prev.showCategory,
            showPrice: posLayoutData.showPrice ?? prev.showPrice,
            calculateTax: posLayoutData.calculateTax ?? prev.calculateTax,
            showTax: posLayoutData.showTax ?? prev.showTax,
            taxRate: posLayoutData.taxRate ?? prev.taxRate,
            // 工具栏按钮
            showSuspend: posLayoutData.showSuspend ?? prev.showSuspend,
            showHistory: posLayoutData.showHistory ?? prev.showHistory,
            showScan: posLayoutData.showScan ?? prev.showScan,
            showShift: posLayoutData.showShift ?? prev.showShift,
            showCash: posLayoutData.showCash ?? prev.showCash,
            // 渠道开关
            channelDineIn: posLayoutData.channelDineIn ?? prev.channelDineIn,
            channelGoFood: posLayoutData.channelGoFood ?? prev.channelGoFood,
            channelGrab: posLayoutData.channelGrab ?? prev.channelGrab,
            channelShopee: posLayoutData.channelShopee ?? prev.channelShopee,
            // 快捷键
            hotkeys: posLayoutData.hotkeys || prev.hotkeys,
          }))
        }

        // 工具栏设置 (包含按钮标签)
        if (configs.toolbarSettings) {
          setPosLayout(prev => ({
            ...prev,
            showSuspend: configs.toolbarSettings.showSuspend ?? prev.showSuspend,
            showHistory: configs.toolbarSettings.showHistory ?? prev.showHistory,
            showScan: configs.toolbarSettings.showScan ?? prev.showScan,
            showShift: configs.toolbarSettings.showShift ?? prev.showShift,
            showCash: configs.toolbarSettings.showCash ?? prev.showCash,
            toolbarLabels: configs.toolbarSettings.labels || prev.toolbarLabels,
          }))
        }

        // 小票设置 - Admin保存完整posReceipt对象
        const receiptConfig = configs.posReceipt || configs.receiptSettings
        if (receiptConfig) {
          setPosReceipt({
            header: receiptConfig.header || receiptConfig.headerCustomText || 'Bubble Tea Shop',
            footer: receiptConfig.footer || receiptConfig.footerMessage || 'Thank you!',
            taxRate: receiptConfig.taxRate || 11,
            showLogo: receiptConfig.showLogo ?? true,
            paperSize: receiptConfig.paperSize || '80mm',
            printCopies: receiptConfig.printCopies || 1,
            showQR: receiptConfig.showQR ?? false,
            showBarcode: receiptConfig.showBarcode ?? true,
            showKitchenNote: receiptConfig.showKitchenNote ?? true,
            storePhone: receiptConfig.storePhone || '',
            storeAddress: receiptConfig.storeAddress || '',
            itemDetailFormat: receiptConfig.itemDetailFormat || 'standard',
            showStaffName: receiptConfig.showStaffName ?? true,
            showCustomerName: receiptConfig.showCustomerName ?? false,
            autoPrint: receiptConfig.autoPrint ?? true,
          })
        }

        // 税费设置（包含免税商品）
        if (configs.taxSettings) {
          setTaxSettings(configs.taxSettings)
        }

        // 硬件设置（打印机、钱箱）- Admin保存完整结构
        if (configs.hardwareSettings) {
          const hw = configs.hardwareSettings
          setHardwareSettings({
            printerConnectionType: hw.printerConnectionType || 'usb',
            printerType: hw.printerType || 'escpos',
            printerName: hw.printerName || '',
            printerIp: hw.printerIp || '192.168.1.100',
            printerPort: hw.printerPort || 9100,
            cashDrawerPulse: hw.cashDrawerPulse || 100,
            autoOpenCashDrawer: hw.autoOpenCashDrawer ?? true,
            scannerEnabled: hw.scannerEnabled ?? true,
            scannerType: hw.scannerType || 'usb',
            displayBrightness: hw.displayBrightness || 80,
            dualScreenEnabled: hw.dualScreenEnabled || false,
            adScreenImageUrl: hw.adScreenImageUrl || '',
            testPrint: null,
            testCashDrawer: null,
          })
        }

        // 支付方式配置
        if (configs.paymentMethods) {
          const methods = configs.paymentMethods
          const enabledMethods = Object.entries(methods)
            .filter(([_, enabled]) => enabled)
            .map(([id]) => {
              const methodMap: Record<string, any> = {
                cash: { id: 'cash', labelKey: 'pos.paymentCash', icon: '💵' },
                qris: { id: 'qris', labelKey: 'pos.paymentQris', icon: '📱' },
                gopay: { id: 'gopay', labelKey: 'pos.paymentGoPay', icon: '🟢' },
                ovo: { id: 'ovo', labelKey: 'pos.paymentOvo', icon: '🟣' },
                dana: { id: 'dana', labelKey: 'pos.paymentDana', icon: '🔵' },
                shopeepay: { id: 'shopeepay', labelKey: 'pos.paymentShopeePay', icon: '🟠' }
              }
              return methodMap[id] || { id, labelKey: `pos.payment${id.charAt(0).toUpperCase() + id.slice(1)}`, icon: '💰' }
            })
            // Sort to prioritize cash first
            .sort((a, b) => {
              if (a.id === 'cash') return -1
              if (b.id === 'cash') return 1
              return 0
            })
          if (enabledMethods.length > 0) {
            setPaymentMethods(enabledMethods)
            setPaymentMethod(enabledMethods[0].id)
          }
        }

        // 快捷金额设置
        if (configs.quickAmounts) {
          setQuickAmounts(configs.quickAmounts)
        }

        // 支付设置 (限额/默认方式)
        if (configs.paymentSettings) {
          setPaymentSettings(configs.paymentSettings)
          if (configs.paymentSettings.defaultMethod) {
            setPaymentMethod(configs.paymentSettings.defaultMethod)
          }
        }

        // 交接班设置
        if (configs.shiftSettings) {
          setShiftSettings(configs.shiftSettings)
        }

        // 渠道颜色配置
        if (configs.channelSettings) {
          setPosChannels(prev => prev.map(ch => {
            // Admin 保存的 key 格式: dineIn, gofood, grab, shopee
            // POS 使用的 code 格式: DINE_IN, GOFOOD, GRAB, SHOPEE
            // 建立直接映射表
            const codeToKeyMap: Record<string, string> = {
              'DINE_IN': 'dineIn',
              'GOFOOD': 'gofood',
              'GRAB': 'grab',
              'SHOPEE': 'shopee',
            }
            const adminKey = codeToKeyMap[ch.code]
            const channelConfig = adminKey ? configs.channelSettings[adminKey] : null
            if (channelConfig) {
              return {
                ...ch,
                color: channelConfig.color || ch.color,
                icon: channelConfig.icon || ch.icon,
              }
            }
            return ch
          }))
        }

        // 显示设置 (autoLogout, language, etc)
        if (configs.displaySettings) {
          setDisplaySettings(prev => ({
            ...prev,
            ...configs.displaySettings
          }))
        }

        // 声音设置
        if (configs.soundSettings) {
          setSoundSettings(configs.soundSettings)
        }
      })
      .catch(() => {
        showToast(t('common.error') + ' - Config', 'error')
      })
  }, [user?.storeId])

  // 硬件配置轮询 - 检测 Admin 测试命令
  useEffect(() => {
    const pollHardwareConfig = async () => {
      if (!user?.storeId) return
      try {
        const token = useAuthStore.getState().token
        const res = await fetch(`/api/config?storeId=${user.storeId}&category=pos`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        const data = await res.json()
        const configs = data?.data || {}
        const hs = configs.hardwareSettings
        if (!hs) return

        // 检测测试打印机标志
        if (hs.testPrint && hs.testPrint !== hardwareSettings.testPrint) {
          console.log('[HARDWARE TEST] Test print triggered')
          electronAPI?.sendPrintReceipt?.({
            orderNum: 'TEST-' + Date.now(),
            header: posReceipt.header || 'Bubble Tea Shop',
            footer: posReceipt.footer || 'Test Print',
            printerName: hs.printerName || undefined,
            items: [{ productName: 'Test Item', specName: '', quantity: 1, unitPrice: 1000, addons: [] }],
            subtotal: 1000, tax: 0, total: 1000, paymentMethod: 'Test'
          })
          // 清除测试标志
          posApi.setConfig(user.storeId, 'hardwareSettings', { ...hs, testPrint: null }, 'pos')
        }

        // 检测测试钱箱标志
        if (hs.testCashDrawer && hs.testCashDrawer !== hardwareSettings.testCashDrawer) {
          console.log('[HARDWARE TEST] Test cash drawer triggered')
          electronAPI?.openCashDrawer?.({ printerName: hs.printerName || undefined })
          // 清除测试标志
          posApi.setConfig(user.storeId, 'hardwareSettings', { ...hs, testCashDrawer: null }, 'pos')
        }
      } catch (err) {
        // 静默失败，不影响主流程
      }
    }

    // 每5秒轮询硬件配置
    const interval = setInterval(pollHardwareConfig, 5000)
    return () => clearInterval(interval)
  }, [user?.storeId, hardwareSettings.testPrint, hardwareSettings.testCashDrawer])

  // 加载渠道列表 (从API加载，支持Admin配置)
  useEffect(() => {
    const storeId = user?.storeId || 'default'
    const token = useAuthStore.getState().token

    fetch(`/api/channels?storeId=${storeId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(r => r.json())
      .then(data => {
        const apiChannels = data?.data?.list || []
        if (apiChannels.length > 0) {
          // 将API渠道转换为POS格式
          const loadedChannels = apiChannels
            .filter((ch: any) => ch.status === 'active')
            .map((ch: any) => ({
              id: ch.code.toLowerCase().replace(/_/g, '_'),
              nameKey: `pos.channel${ch.code}` as string,
              icon: ch.icon || '📦',
              code: ch.code
            }))
          setPosChannels(loadedChannels)
          // 如果当前没有选择渠道，默认选中第一个
          if (!selectedChannel && loadedChannels.length > 0) {
            setSelectedChannel(loadedChannels[0])
          }
        } else {
          // API没有渠道，使用默认值
          setPosChannels(CHANNELS)
          if (!selectedChannel) setSelectedChannel(posChannels[0] || null)
        }
      })
      .catch(() => {
        // 失败时使用默认渠道
        setPosChannels(CHANNELS)
        if (!selectedChannel) setSelectedChannel(posChannels[0] || null)
      })
  }, [user?.storeId])

  // 挂单从localStorage恢复
  useEffect(() => {
    try {
      const saved = localStorage.getItem('suspended_orders')
      if (saved) setSuspendedOrders(JSON.parse(saved))
    } catch (e) {
      console.error('Failed to load suspended orders:', e)
      localStorage.removeItem('suspended_orders')
    }
  }, [])

  // 一键复购 - 从历史订单恢复商品
  useEffect(() => {
    const rebuyData = localStorage.getItem('rebuy_items')
    if (rebuyData) {
      try {
        const rebuyItems = JSON.parse(rebuyData)
        if (rebuyItems.length > 0) {
          setConfirmModal({
            isOpen: true,
            title: t('pos.rebuyConfirmTitle', 'Confirm Rebuy'),
            message: t('pos.addRebuyConfirm', { count: rebuyItems.length }),
            type: 'info',
            onConfirm: () => {
              const newItems: CartItem[] = rebuyItems.map((item: any) => ({
                id: `REBUY-${Date.now()}-${Math.random()}`,
                productId: item.productId || '',
                productName: item.productName,
                specId: '',
                specName: item.specName || item.productName,
                unitPrice: item.unitPrice || 0,
                quantity: item.quantity || 1,
                addons: item.addons || []
              }))
              setCart(newItems)
              // 恢复渠道
              const savedChannel = localStorage.getItem('rebuy_channel')
              if (savedChannel) {
                const ch = CHANNELS.find(c => c.id === savedChannel)
                if (ch) setSelectedChannel(ch)
              }
              localStorage.removeItem('rebuy_items')
              localStorage.removeItem('rebuy_channel')
            }
          })
        }
      } catch (e) {
        console.error('Failed to parse rebuy items', e)
        localStorage.removeItem('rebuy_items')
        localStorage.removeItem('rebuy_channel')
      }
    }
  }, [])

  // 条码扫描 - 从扫码页面添加商品
  useEffect(() => {
    const scanData = localStorage.getItem('scan_to_cart')
    if (scanData) {
      try {
        const item = JSON.parse(scanData)
        setConfirmModal({
          isOpen: true,
          title: t('pos.scanConfirmTitle', 'Add Scanned Item'),
          message: t('pos.addScanConfirm', { product: item.productName }),
          type: 'info',
          onConfirm: () => {
            const newItem: CartItem = {
              id: `SCAN-${Date.now()}`,
              productId: item.productId || '',
              productName: item.productName,
              specId: '',
              specName: item.specName || item.productName,
              unitPrice: item.unitPrice || 0,
              quantity: item.quantity || 1,
              addons: item.addons || []
            }
            setCart(prev => {
              const existIdx = prev.findIndex(i => i.productName === newItem.productName && i.specName === newItem.specName)
              if (existIdx >= 0) {
                return prev.map((it, i) => i === existIdx ? { ...it, quantity: it.quantity + newItem.quantity } : it)
              }
              return [...prev, newItem]
            })
            localStorage.removeItem('scan_to_cart')
          }
        })
      } catch (e) {
        console.error('Failed to parse scan data', e)
        localStorage.removeItem('scan_to_cart')
      }
    }
  }, [])

  // 同步状态
  useEffect(() => {
    syncManager.startSync(30000)
    return () => syncManager.destroy()
  }, [])

  // 检查服务器API配置 (Admin可在后台修改，POS自动获取)
  useEffect(() => {
    const checkServerApiUrl = async () => {
      const serverUrl = await fetchApiUrlFromServer()
      if (serverUrl && serverUrl !== getApiUrl()) {
        updateApiUrl(serverUrl)
        setApiUrl(serverUrl)
      }
    }

    // 启动时检查
    checkServerApiUrl()

    // 每5分钟检查一次
    const interval = setInterval(checkServerApiUrl, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // 网络状态监听
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Connection Manager 状态监听
  useEffect(() => {
    const updateConnectionStatus = (event: any) => {
      if (event.type === 'connected') {
        setConnectionStatus('connected')
        setIsOnline(true)
      } else if (event.type === 'connecting' || event.type === 'degraded') {
        setConnectionStatus('connecting')
      } else if (event.type === 'offline') {
        setConnectionStatus('offline')
        setIsOnline(false)
      }
    }
    const unsubscribe = connectionManager.addListener(updateConnectionStatus)
    // 初始化状态
    setConnectionStatus(connectionManager.getState() === 'offline' ? 'offline' : connectionManager.getState() === 'connecting' ? 'connecting' : 'connected')
    return unsubscribe
  }, [])

  // 自动登出 - 使用配置的分钟数 (默认30分钟)
  useEffect(() => {
    const timeoutMinutes = displaySettings.autoLogoutMinutes || 30
    if (timeoutMinutes <= 0) return // 0 = 禁用

    const TIMEOUT = timeoutMinutes * 60 * 1000
    let lastActivity = Date.now()

    const updateActivity = () => {
      lastActivity = Date.now()
    }

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, updateActivity))

    const checkInterval = setInterval(() => {
      if (Date.now() - lastActivity > TIMEOUT) {
        logout()
      }
    }, 60000) // 每分钟检查一次

    return () => {
      events.forEach(e => window.removeEventListener(e, updateActivity))
      clearInterval(checkInterval)
    }
  }, [logout, displaySettings.autoLogoutMinutes])

  // 自动锁屏计时器
  useEffect(() => {
    const lockMinutes = displaySettings.autoLockMinutes || 0
    if (lockMinutes <= 0) return // 0 = 禁用

    const TIMEOUT = lockMinutes * 60 * 1000
    let lastActivity = Date.now()

    const updateActivity = () => {
      lastActivity = Date.now()
    }

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, updateActivity))

    const checkInterval = setInterval(() => {
      if (Date.now() - lastActivity > TIMEOUT) {
        setIsLocked(true)
      }
    }, 30000) // 每30秒检查一次

    return () => {
      events.forEach(e => window.removeEventListener(e, updateActivity))
      clearInterval(checkInterval)
    }
  }, [displaySettings.autoLockMinutes])

  // 解锁处理
  const handleUnlock = () => {
    if (displaySettings.lockScreenPin && lockPin !== displaySettings.lockScreenPin) {
      setLockError(true)
      setLockPin('')
      return
    }
    setIsLocked(false)
    setLockPin('')
    setLockError(false)
  }

  // 获取待处理卫生任务数量
  useEffect(() => {
    const fetchPendingTasks = async () => {
      if (!user?.storeId) return
      try {
        const res = await posApi.getPendingTasks()
        const tasks = res?.data?.data || []
        setPendingTaskCount(tasks.length)
      } catch (e) {
        // ignore
      }
    }
    fetchPendingTasks()
    const interval = setInterval(fetchPendingTasks, 60000) // 每分钟刷新
    return () => clearInterval(interval)
  }, [user?.storeId])

  // 加载历史订单
  const fetchOrders = async () => {
    if (!user?.storeId) return
    setOrdersLoading(true)
    try {
      const res = await posApi.getOrders({ storeId: user.storeId, limit: 20 })
      setOrders(res.data?.data?.list || [])
    } catch (e) {
      console.error('Failed to fetch orders:', e)
    } finally {
      setOrdersLoading(false)
    }
  }

  // 加载卫生任务
  const fetchTasks = async () => {
    if (!user?.storeId) return
    setTasksLoading(true)
    try {
      const res = await posApi.getMyTasks()
      setTasks(res.data?.data?.list || [])
    } catch (e) {
      console.error('Failed to fetch tasks:', e)
    } finally {
      setTasksLoading(false)
    }
  }

  // 加载可退款订单
  const fetchRefundOrders = async () => {
    if (!user?.storeId) return
    try {
      const res = await posApi.getOrders({ storeId: user.storeId, limit: 50, status: 'completed' })
      const refundable = (res.data?.data?.list || []).filter((o: any) => o.status === 'completed')
      setRefundOrders(refundable)
    } catch (e) {
      console.error('Failed to fetch refund orders:', e)
    }
  }

  // 处理退款
  const processRefund = async () => {
    if (!selectedRefundOrder) return
    setIsProcessingRefund(true)
    try {
      await posApi.requestRefund({ orderId: selectedRefundOrder.id, reason: refundReason, staffId: user?.id })
      showToast(t('pos.refundSuccess') || 'Refund request submitted')
      setShowRefundModal(false)
      setSelectedRefundOrder(null)
      setRefundReason('')
    } catch (e: any) {
      showToast(e?.response?.data?.message || t('pos.refundFailed') || 'Refund failed')
    } finally {
      setIsProcessingRefund(false)
    }
  }

  // 加载现金摘要
  const fetchCashSummary = async () => {
    try {
      const res = await posApi.getCashSummary({ storeId: user?.storeId })
      setCashSummary(res.data?.data)
    } catch (e) {
      console.error('Failed to fetch cash summary:', e)
    }
  }

  // 加载交接班数据
  const fetchShiftData = async () => {
    try {
      const res = await posApi.getCurrentShift()
      setShiftData(res.data?.data)
    } catch (e) {
      console.error('Failed to fetch shift data:', e)
    }
  }

  // 打开历史订单弹窗时加载数据
  useEffect(() => {
    if (showHistoryModal) fetchOrders()
  }, [showHistoryModal])

  // 打开任务弹窗时加载数据
  useEffect(() => {
    if (showTasksModal) fetchTasks()
  }, [showTasksModal])

  // 打开现金弹窗时加载数据
  useEffect(() => {
    if (showCashModal) fetchCashSummary()
  }, [showCashModal])

  // 打开交接班弹窗时加载汇总数据
  useEffect(() => {
    if (showShiftModal) fetchShiftData()
  }, [showShiftModal])

  // 快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F1-F4: 渠道快捷切换
      if (e.key === 'F1') { e.preventDefault(); setSelectedChannel(posChannels[0] || null) }
      if (e.key === 'F2') { e.preventDefault(); setSelectedChannel(posChannels[1] || posChannels[0] || null) }
      if (e.key === 'F3') { e.preventDefault(); setSelectedChannel(posChannels[2] || posChannels[0] || null) }
      if (e.key === 'F4') { e.preventDefault(); setSelectedChannel(posChannels[3] || posChannels[0] || null) }
      // F5-F8: 常用金额
      if (e.key === 'F5' && cartRef.current.length > 0) { e.preventDefault(); setPaymentModalOrderNum(Date.now().toString().slice(-6)); setShowPaymentModal(true) }
      // F6: 扫码
      if (e.key === 'F6') { e.preventDefault(); navigate('/scan') }
      // ESC: 关闭弹窗
      if (e.key === 'Escape') {
        if (showAddonModal) setShowAddonModal(false)
        if (showPaymentModal) setShowPaymentModal(false)
        if (showMemberModal) setShowMemberModal(false)
        if (showDiscountModal) setShowDiscountModal(false)
        if (showSuspendModal) setShowSuspendModal(false)
        if (showShiftModal) setShowShiftModal(false)
      }
      // Enter: 确认支付 (在支付弹窗中)
      if (e.key === 'Enter' && showPaymentModal) {
        e.preventDefault()
        const currentPayment = paymentMethodRef.current
        const currentPaid = paidAmountRef.current
        const currentTotal = totalRef.current ?? 0
        const isValid = currentPayment !== 'cash' || (currentPaid && parseInt(currentPaid) >= currentTotal)
        if (isValid) handleCheckout()
      }
      // 数字键快速选产品 (1-9)
      if (!showAddonModal && !showPaymentModal && !e.ctrlKey && !e.metaKey) {
        const num = parseInt(e.key)
        if (num >= 1 && num <= 9) {
          const filtered = products.filter(p => filter === 'all' || p.category?.name === filter)
          if (filtered[num - 1]) {
            const p = filtered[num - 1]
            if (p.specs?.[0]) handleSpecClick(p, p.specs[0])
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [products, filter, showAddonModal, showPaymentModal, showMemberModal, showDiscountModal, showSuspendModal, showShiftModal])

  const productStore = useProductStore()
  const categories = productStore.categories()
  const filtered = productStore.filtered()

  // 动态grid class
  const gridColsClass = {
    '3': 'grid-cols-3',
    '4': 'grid-cols-4',
    '5': 'grid-cols-5',
    '6': 'grid-cols-6',
    '8': 'grid-cols-8'
  }[posLayout.gridCols] || 'grid-cols-4'

  const cardHeightClass = posLayout.cardSize === 'large' ? 'h-24' : posLayout.cardSize === 'small' ? 'h-16' : 'h-20'

  const subtotal = cart.reduce((sum, item) => {
    const addonsTotal = item.addons.reduce((a, addon) => a + addon.price * addon.qty, 0)
    return sum + (item.unitPrice + addonsTotal) * item.quantity
  }, 0)
  // 税费：根据Admin设置决定是否计算和显示，排除免税商品
  const taxableSubtotal = cart
    .filter(item => !taxSettings.exemptItems?.includes(item.productId))
    .reduce((sum, item) => {
      const addonsTotal = item.addons.reduce((a, addon) => a + addon.price * addon.qty, 0)
      return sum + (item.unitPrice + addonsTotal) * item.quantity
    }, 0)
  const tax = posLayout.calculateTax && posLayout.showTax !== false ? Math.round(taxableSubtotal * taxRate) : 0
  // 积分抵扣：每100积分抵扣1印尼盾
  const pointsDiscount = pointsToRedeem / 100
  const total = Math.max(0, subtotal + tax - discountAmount - pointsDiscount)
  const change = paidAmount ? Math.max(0, parseInt(paidAmount) - total) : 0

  // Sync totalRef after total is calculated
  useEffect(() => { totalRef.current = total }, [total])

  // Auto-apply coupon discount when selected coupon changes
  useEffect(() => {
    if (selectedCoupon?.coupon) {
      const coupon = selectedCoupon.coupon
      if (coupon.type === 'discount_fixed') {
        setDiscountAmount(Math.min(coupon.value, subtotal + tax))
      } else if (coupon.type === 'discount_percent') {
        const discount = Math.round((subtotal + tax) * (coupon.value / 100))
        const maxDiscount = coupon.maxDiscount || Infinity
        setDiscountAmount(Math.min(discount, maxDiscount, subtotal + tax))
      }
    }
  }, [selectedCoupon, subtotal, tax])

  // 最大可用积分（不能超过总价）
  const maxRedeemablePoints = member ? Math.min(member.points || 0, Math.floor(total * 100)) : 0

  // 添加到购物车
  const handleAddToCartWithAddons = () => {
    if (!selectedProduct || !selectedSpec) return
    const addons = selectedAddonIds.map(id => {
      const addon = selectedProduct.addons.find(a => a.addonId === id)?.addon
      return { id, name: addon?.name || '', price: addon?.price || 0, qty: 1 }
    })

    const sugarObj = SUGAR_LEVELS.find(s => s.id === selectedSugar)
    const iceObj = ICE_LEVELS.find(i => i.id === selectedIce)

    const newItem: CartItem = {
      id: `${selectedProduct.id}-${selectedSpec.id}-${Date.now()}`,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      specId: selectedSpec.id,
      specName: selectedSpec.name,
      sugarLevel: selectedSugar,
      sugarLevelName: sugarObj ? t(sugarObj.nameKey) : t('pos.normalSugar'),
      iceLevel: selectedIce,
      iceLevelName: iceObj ? t(iceObj.nameKey) : t('pos.normalIce'),
      unitPrice: selectedSpec.price,
      quantity: addonQty,
      addons
    }

    setCart(prev => {
      const existIdx = prev.findIndex(
        i => i.productId === newItem.productId && i.specId === newItem.specId &&
        i.sugarLevel === newItem.sugarLevel && i.iceLevel === newItem.iceLevel &&
        JSON.stringify(i.addons.map(a => a.id).sort()) === JSON.stringify(addons.map(a => a.id).sort())
      )
      if (existIdx >= 0) {
        return prev.map((item, i) => i === existIdx ? { ...item, quantity: item.quantity + addonQty } : item)
      }
      return [...prev, newItem]
    })
    setShowAddonModal(false)
    setSelectedProduct(null)
    setSelectedSpec(null)
    setAddonQty(1)
    setSelectedSugar('normal_sugar')
    setSelectedIce('normal_ice')
  }

  // 点击规格 - 打开选择弹窗
  const handleSpecClick = (product: Product, spec: { id: string; name: string; price: number }) => {
    setSelectedProduct(product)
    setSelectedSpec(spec)
    setSelectedAddonIds([])
    setAddonQty(1)
    setSelectedSugar('normal_sugar')
    setSelectedIce('normal_ice')
    setShowAddonModal(true)
  }

  const addItemDirectly = (newItem: CartItem) => {
    setCart(prev => {
      const existIdx = prev.findIndex(
        i => i.productId === newItem.productId && i.specId === newItem.specId &&
        i.sugarLevel === newItem.sugarLevel && i.iceLevel === newItem.iceLevel &&
        JSON.stringify(i.addons.map(a => a.id).sort()) === JSON.stringify(newItem.addons.map(a => a.id).sort())
      )
      if (existIdx >= 0) {
        return prev.map((item, i) => i === existIdx ? { ...item, quantity: item.quantity + newItem.quantity } : item)
      }
      return [...prev, newItem]
    })
  }

  const changeQty = (idx: number, delta: number) => {
    setCart(prev => {
      const updated = prev.map((item, i) =>
        i === idx ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
      ).filter(item => item.quantity > 0)
      return updated
    })
  }

  const removeItem = (idx: number) => {
    setCart(prev => prev.filter((_, i) => i !== idx))
  }

  const clearCart = () => {
    setCart([])
    setDiscountAmount(0)
    setMember(null)
  }

  // 挂单
  const suspendOrder = () => {
    if (cart.length === 0) {
      showToast(t('pos.emptyCart'), 'warning')
      return
    }
    const order = { id: `SUSP-${Date.now()}`, cart: [...cart], channel: selectedChannel, time: new Date().toLocaleTimeString() }
    const updated = [...suspendedOrders, order]
    setSuspendedOrders(updated)
    localStorage.setItem('suspended_orders', JSON.stringify(updated))
    clearCart()
    showToast(`${t('pos.orderSuspended')} (${updated.length})`, 'success')
  }

  const resumeOrder = (order: typeof suspendedOrders[0]) => {
    // 如果当前购物车有内容，需要确认覆盖
    if (cart.length > 0) {
      setConfirmModal({
        isOpen: true,
        title: t('pos.resumeConfirmTitle', 'Resume Order'),
        message: t('pos.resumeConfirm'),
        type: 'warning',
        onConfirm: () => {
          setCart(order.cart)
          setSelectedChannel(order.channel)
          setSuspendedOrders((prev: any[]) => {
            const updated = prev.filter((o: any) => o.id !== order.id)
            localStorage.setItem('suspended_orders', JSON.stringify(updated))
            return updated
          })
          showToast(t('pos.orderResumed'), 'success')
        }
      })
      return
    }
    setCart(order.cart)
    setSelectedChannel(order.channel)
    setSuspendedOrders(prev => {
      const updated = prev.filter(o => o.id !== order.id)
      localStorage.setItem('suspended_orders', JSON.stringify(updated))
      return updated
    })
    showToast(t('pos.orderResumed'), 'success')
  }

  // 查找会员
  const searchMember = async () => {
    if (!memberPhone || isSearchingMember) return
    setIsSearchingMember(true)
    setMemberCoupons([])
    setSelectedCoupon(null)
    setDiscountAmount(0)
    try {
      const res = await posApi.getMembers({ phone: memberPhone })
      if (res.data?.data?.list?.[0]) {
        const found = res.data.data.list[0]
        setMember(found)
        // 获取会员优惠券
        try {
          const couponsRes = await posApi.getMemberCoupons(found.id)
          if (couponsRes.data?.data?.list) {
            const unusedCoupons = couponsRes.data.data.list.filter((c: any) => c.status === 'unused')
            setMemberCoupons(unusedCoupons)
          }
        } catch {
          // 优惠券获取失败不影响主流程
        }
      } else {
        setMember(null)
        showToast(t('pos.noMemberFound'), 'info')
      }
    } catch {
      setMember(null)
      showToast(t('pos.memberSearchError'), 'error')
    } finally {
      setIsSearchingMember(false)
    }
  }

  // 结账
  const handleCheckout = async () => {
    if (cart.length === 0 || isCheckingOut) return

    // QRIS: Generate QR code first
    if (paymentMethod === 'qris' && qrisData.status === 'idle') {
      // Check if online - QRIS requires internet connection
      if (!navigator.onLine) {
        showToast(t('pos.qrisOfflineNotice') || 'QRIS需要网络连接，请使用现金支付', 'warning')
        setIsCheckingOut(false)
        return
      }
      setIsCheckingOut(true)
      try {
        const res = await posApi.createQrisPayment(user?.storeId || 'default', `ORDER-${Date.now()}`, total)
        if (res.data?.success) {
          setQrisData({
            qrImage: res.data.data.qrImage,
            qrString: res.data.data.qrString,
            externalId: res.data.data.externalId,
            status: 'waiting'
          })
          setIsCheckingOut(false)
          return // Wait for webhook or manual confirmation
        } else {
          showToast(res.data?.error || t('pos.qrisCreateFailed') || '生成二维码失败', 'error')
          setIsCheckingOut(false)
          return
        }
      } catch (error: any) {
        showToast(t('pos.qrisOfflineNotice') || 'QRIS暂时不可用，请使用现金支付', 'warning')
        setIsCheckingOut(false)
        return
      }
    }

    // QRIS: If already waiting, confirm payment manually
    if (paymentMethod === 'qris' && qrisData.status === 'waiting') {
      // For now, allow manual confirmation after payment is received
      showToast(t('pos.confirmPaymentManual') || '请确认顾客已付款后再点击', 'info')
      return
    }

    // QRIS: If paid, proceed to create order
    if (paymentMethod === 'qris' && qrisData.status !== 'paid') {
      return // Wait for payment
    }

    // 现金限额检查
    if (paymentMethod === 'cash' && paymentSettings.maxCashAmount > 0 && parseInt(paidAmount) > paymentSettings.maxCashAmount) {
      showToast(`${t('pos.cashOverLimit')} ${formatCurrency(paymentSettings.maxCashAmount)}`, 'error')
      setIsCheckingOut(false)
      return
    }

    setIsCheckingOut(true)
    const localId = `LOCAL-${Date.now()}`
    const orderChannel = selectedChannel || { id: 'POS', nameKey: 'pos.counter' as const, code: 'POS' }
    const orderData: any = {
      storeId: user?.storeId || 'default',
      staffId: user?.staff?.id || 'default',
      channelId: orderChannel.id,
      channelName: t(orderChannel.nameKey),
      memberId: member?.id,
      items: cart.map(item => ({
        productId: item.productId,
        productName: item.productName,
        specId: item.specId,
        specName: item.specName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        addons: item.addons.map(a => ({ name: a.name, price: a.price }))
      })),
      paymentMethod,
      discountAmount,
      pointsRedeemed: pointsToRedeem,
      finalAmount: total,
      orderNumber: paymentModalOrderNum // 使用弹窗中生成的订单号
    }
    // 堂食时添加用餐人数和桌号
    if (orderChannel.id === 'dine_in') {
      orderData.customerCount = dineInCount
      orderData.tableNumber = tableNumber
    }
    // 外卖平台订单号
    if (orderChannel.id === 'gofood' || orderChannel.id === 'grab' || orderChannel.id === 'shopee') {
      orderData.platformOrderId = platformOrderId
    }
    // 订单备注
    if (orderNote) {
      orderData.note = orderNote
    }

    try {
      const res = await posApi.createOrder(orderData)
      const orderNum = res.data?.data?.orderNumber || localId.replace('LOCAL-', '')
      setOrderSuccess(orderNum)
      playSoundWithSettings('orderComplete', soundSettings.orderComplete)

      // 核销会员优惠券
      if (selectedCoupon?.id) {
        try {
          await posApi.redeemCoupon(selectedCoupon.id, orderNum)
        } catch (couponErr) {
          console.error('Failed to redeem coupon:', couponErr)
        }
      }

      // 清空已使用的优惠券
      setSelectedCoupon(null)
      setMemberCoupons(prev => prev.filter(c => c.id !== selectedCoupon?.id))

      // 现金支付：自动开钱箱
      if (paymentMethod === 'cash' && hardwareSettings.autoOpenCashDrawer) {
        electronAPI?.openCashDrawer?.({ printerName: hardwareSettings.printerName || undefined })
      }

      electronAPI?.sendOrderComplete(orderNum)
      // 打印小票
      printReceipt(orderNum, orderData)
      // 记录现金销售事件（仅现金支付）
      if (paymentMethod === 'cash') {
        try {
          await posApi.createCashEvent({
            type: 'cash_sale',
            amount: Math.round(total),
            paymentMethod: 'cash',
            orderId: orderNum,
            note: `订单 #${orderNum}`
          })
        } catch (cashError) {
          console.error('Failed to record cash sale event:', cashError)
        }
      }
      showToast(`${t('pos.orderSuccess')} #${orderNum}`, 'success')
      setTimeout(() => { setOrderSuccess(''); clearCart(); setIsCheckingOut(false) }, 5000)
    } catch (error: any) {
      playSoundWithSettings('error', soundSettings.error)
      // 显示服务器返回的具体错误消息（如"库存不足: 生珍珠"）
      const errorMsg = error?.response?.data?.message || error?.message || t('pos.paymentError')
      showToast(errorMsg + ' - ' + t('pos.orderSavedOffline') || 'Order saved for retry', 'warning')
      await db.orders.add({
        localId, storeId: orderData.storeId, staffId: orderData.staffId,
        items: orderData.items, subtotal, ppn: tax, totalAmount: total,
        finalAmount: total, discountAmount, paymentMethod,
        status: 'pending', syncAttempts: 0, createdAt: new Date()
      })
      // Don't show success banner - order is pending sync
      setIsCheckingOut(false)
    }
    setShowPaymentModal(false)
  }

  // Keep handleCheckoutRef in sync - called after handleCheckout is defined
  // This is called via ref callback at the end of handleCheckout definition

  // 打印小票
  const printReceipt = (orderNum: string, orderData: any) => {
    if (!electronAPI?.sendPrintReceipt) {
      // 无打印API，静默跳过
      return
    }
    try {
      electronAPI.sendPrintReceipt({
        orderNum,
        header: posReceipt.header,
        footer: posReceipt.footer,
        printerName: hardwareSettings.printerName || undefined,
        items: cart.map(item => ({
          productName: item.productName,
          specName: item.specName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          sugarLevelName: item.sugarLevelName,
          iceLevelName: item.iceLevelName,
          addons: item.addons
        })),
        subtotal,
        tax,
        discount: discountAmount,
        total,
        paymentMethod: t(paymentMethods.find(m => m.id === paymentMethod)?.labelKey || 'pos.paymentCash') || paymentMethod,
        paidAmount: paidAmount ? parseInt(paidAmount) : 0,
        change,
        memberName: member?.name,
        pointsRedeemed: pointsToRedeem
      }, (result: any) => {
        if (result?.success) {
          // 打印成功，无需提示
        } else {
          // 打印失败，轻微提示不阻塞流程
          console.warn('Print failed:', result?.error)
        }
      })
    } catch (err) {
      console.warn('Print error:', err)
    }
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    )
  }
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header + Toolbar 合并 - 品牌底色 */}
      <header className="bg-primary px-4 py-4 flex items-center justify-between">
        {/* 左侧：店铺信息 */}
        <div className="flex items-center gap-4">
          <span className="text-4xl">🧋</span>
          <div className="flex flex-col">
            <span className="text-white font-bold text-lg">{'Bubble Tea'}</span>
            <span className="text-white/70 text-base">{user?.staff?.name || t('pos.cashier')}</span>
          </div>
          {selectedChannel && (
            <span
              className="ml-3 px-4 py-2 text-white rounded-xl text-base font-medium"
              style={{ backgroundColor: selectedChannel.color ? `${selectedChannel.color}40` : 'rgba(255,255,255,0.2)' }}
            >
              {selectedChannel.icon} {t(selectedChannel.nameKey)}
            </span>
          )}
          <span className={`px-4 py-2 rounded-xl text-base font-medium ${
            connectionStatus === 'connected' ? 'bg-green-100 text-green-700' :
            connectionStatus === 'connecting' ? 'bg-yellow-100 text-yellow-700 animate-pulse' :
            'bg-red-500 text-white animate-pulse'
          }`}>
            {connectionStatus === 'connected' ? t('pos.online') :
             connectionStatus === 'connecting' ? t('pos.connecting') || '连接中...' :
             t('pos.offline')}
          </span>
        </div>

        {/* 中间：语言切换 */}
        <div className="flex items-center gap-2">
          {LANGS.map(l => (
            <button
              key={l.code}
              onClick={() => {
                i18n.changeLanguage(l.code)
                localStorage.setItem('pos_lang', l.code)
                setLang(l.code)
              }}
              className={`px-4 py-2 rounded-xl text-base font-medium touch-feedback ${
                lang === l.code ? 'bg-white text-primary' : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              {l.code.toUpperCase()}
            </button>
          ))}
        </div>

        {/* 右侧：工具栏 - 自动平均分配宽度 */}
        {selectedChannel && (() => {
          // 构建工具栏按钮数组
          const toolbarButtons: Array<{
            id: string
            icon: JSX.Element
            labelKey: string
            onClick: () => void
            badge?: number
          }> = []

          if (posLayout.showShift !== false) {
            toolbarButtons.push({
              id: 'shift',
              icon: <Users size={32} />,
              labelKey: posLayout.toolbarLabels?.shift || 'toolbar.shift',
              onClick: () => setShowShiftModal(true)
            })
          }
          if (posLayout.showSuspend !== false) {
            toolbarButtons.push({
              id: 'suspend',
              icon: <Clock size={32} />,
              labelKey: posLayout.toolbarLabels?.suspend || 'toolbar.suspend',
              onClick: () => setShowSuspendModal(true),
              badge: suspendedOrders.length
            })
          }
          if (posLayout.showScan !== false) {
            toolbarButtons.push({
              id: 'scan',
              icon: <ScanLine size={32} />,
              labelKey: posLayout.toolbarLabels?.scan || 'toolbar.scan',
              onClick: () => setShowScanModal(true)
            })
          }
          if (posLayout.showHistory !== false) {
            toolbarButtons.push({
              id: 'history',
              icon: <FileText size={32} />,
              labelKey: posLayout.toolbarLabels?.history || 'toolbar.history',
              onClick: () => setShowHistoryModal(true)
            })
          }
          if (posLayout.showRefund !== false) {
            toolbarButtons.push({
              id: 'refund',
              icon: <RotateCcw size={32} />,
              labelKey: posLayout.toolbarLabels?.refund || 'toolbar.refund',
              onClick: () => {
                fetchRefundOrders()
                setShowRefundModal(true)
              }
            })
          }
          if (posLayout.showCash === true) {
            toolbarButtons.push({
              id: 'cash',
              icon: <Wallet size={32} />,
              labelKey: posLayout.toolbarLabels?.cash || 'toolbar.cash',
              onClick: () => setShowCashModal(true)
            })
          }
          toolbarButtons.push({
            id: 'tasks',
            icon: <ClipboardList size={32} />,
            labelKey: posLayout.toolbarLabels?.tasks || 'toolbar.tasks',
            onClick: () => setShowTasksModal(true),
            badge: pendingTaskCount
          })
          toolbarButtons.push({
            id: 'hardware',
            icon: <Settings size={32} />,
            labelKey: 'Hardware',
            onClick: () => navigate('/hardware-settings')
          })
          toolbarButtons.push({
            id: 'logout',
            icon: <X size={32} />,
            labelKey: posLayout.toolbarLabels?.logout || 'toolbar.logout',
            onClick: () => setShowLogoutModal(true)
          })

          return (
            <div className="flex items-stretch gap-3">
              {toolbarButtons.map(btn => (
                <button
                  key={btn.id}
                  onClick={btn.onClick}
                  className="flex-1 flex flex-col items-center justify-center py-4 px-3 text-white/90 hover:bg-white/20 rounded-2xl touch-feedback min-h-[80px] relative"
                >
                  <div className="relative">
                    {btn.icon}
                    {btn.badge !== undefined && btn.badge > 0 && (
                      <span className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-500 text-white text-xs rounded-full flex items-center justify-center">
                        {btn.badge > 9 ? '9+' : btn.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-sm mt-2 font-medium">{t(btn.labelKey)}</span>
                </button>
              ))}
            </div>
          )
        })()}
      </header>

      {/* 渠道选择弹窗 */}
      {showChannelModal && !selectedChannel && (
        <ChannelSelectModal
          channels={posChannels}
          posLayout={posLayout}
          selectedChannel={selectedChannel}
          onSelectChannel={setSelectedChannel}
          dineInCount={dineInCount}
          onDineInCountChange={setDineInCount}
          tableNumber={tableNumber}
          onTableNumberChange={setTableNumber}
          platformOrderId={platformOrderId}
          onPlatformOrderIdChange={setPlatformOrderId}
          onConfirm={() => {
            if (selectedChannel) {
              setShowChannelModal(false)
              const cats = productStore.categories()
              if (cats.length > 0 && !filter) {
                setFilter(cats[0])
              }
            }
          }}
          t={t}
        />
      )}

      {/* 订单成功 */}
      {orderSuccess && (
        <div className="bg-primary text-white py-2 px-4 flex items-center justify-center gap-2">
          <CheckCircle size={18} />
          <span className="font-bold">{t('pos.orderSuccessNo')}{orderSuccess}</span>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：分类栏 + 产品区 */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* 分类区域 - 白色背景 */}
          {selectedChannel && (
            <div className="bg-white px-4 py-2 border-b flex-shrink-0">
              <div className="flex gap-3 overflow-x-auto pb-2">
                {categories.map(cat => {
                  const count = products.filter(p => p.category?.name === cat).length
                  return (
                    <button
                      key={cat}
                      onClick={() => setFilter(cat)}
                      className={`min-h-14 px-5 rounded-xl text-base font-medium whitespace-nowrap flex items-center gap-2 transition-all touch-feedback ${
                        filter === cat
                          ? 'bg-primary text-white shadow-md'
                          : 'bg-gray-100 text-gray-600 hover:bg-primary-light'
                      }`}
                    >
                      <span>{cat}</span>
                      <span className={`text-sm ${filter === cat ? 'text-white/70' : 'text-gray-400'}`}>{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 产品网格 */}
          <div className="flex-1 overflow-y-auto p-3 bg-gray-100 min-h-0">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <p className="text-lg font-medium">{t('pos.noProductInCategory') || '此分类暂无产品'}</p>
              </div>
            ) : (
            <div className={`grid ${gridColsClass} gap-2`}>
              {filtered.map(product => (
                <button
                  key={product.id}
                  onClick={() => {
                    if (product.specs?.length) handleSpecClick(product, product.specs[0])
                  }}
                  className={`${cardHeightClass} bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-primary active:scale-95 transition-all overflow-hidden flex flex-col items-center justify-center ${!product.specs?.length ? 'opacity-50' : ''}`}
                  style={{ minHeight: '80px' }}
                >
                  {product.image ? (
                    <div className="w-full h-full flex items-center justify-center bg-gray-50 p-1">
                      <img src={product.image} alt={product.name} className="max-w-full max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full px-2">
                      <span className="font-bold text-lg text-gray-900 text-center leading-tight truncate w-full">{product.name}</span>
                      {posLayout.showPrice && (
                        <span className="text-primary font-bold text-xl mt-1">{formatCurrency(product.specs[0]?.price || 0)}</span>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
            )}
          </div>

          {/* 公告看板 - 只覆盖产品区域 */}
          <AnnouncementBanner />
        </div>

        {/* 购物车 - 大屏设计 */}
        <div className="w-80 bg-white border-l flex flex-col">
          <div className="p-3 border-b flex items-center justify-between bg-gray-50">
            <h2 className="font-bold text-base flex items-center gap-2">
              <ShoppingCart size={20} />
              {t('pos.cart')}
              <span className="bg-primary text-white text-xs px-2 py-0.5 rounded-full">{cart.length}</span>
            </h2>
            <div className="flex gap-1">
              {cart.length > 0 && (
                <button
                  onClick={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: t('pos.clearCartConfirmTitle', 'Clear Cart'),
                      message: t('pos.clearCartConfirm'),
                      type: 'danger',
                      onConfirm: () => clearCart()
                    })
                  }}
                  className="w-10 h-10 flex items-center justify-center text-red-500 bg-red-50 rounded-lg hover:bg-red-100"
                  title={t('pos.clearCart')}
                >
                  <Trash2 size={18} />
                </button>
              )}
              <button onClick={() => setShowSuspendModal(true)} className="w-10 h-10 flex items-center justify-center text-yellow-600 bg-yellow-50 rounded-lg hover:bg-yellow-100">
                <Clock size={20} />
              </button>
              <button onClick={() => setShowMemberModal(true)} className="w-10 h-10 flex items-center justify-center text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">
                <User size={20} />
              </button>
            </div>
          </div>

          {/* 商品列表 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.length === 0 ? (
              <div className="text-center text-gray-400 py-12 text-lg">{t('pos.emptyCart')}</div>
            ) : (
              cart.map((item, idx) => (
                <div key={item.id} className="bg-gray-50 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex-1">
                      <p className="font-bold text-base">{item.productName}</p>
                      <p className="text-xs text-gray-400">{item.specName}</p>
                    </div>
                    <button onClick={() => removeItem(idx)} className="min-w-12 min-h-12 flex items-center justify-center text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 touch-feedback">
                      <Trash2 size={18} />
                    </button>
                  </div>
                  {/* 甜度冰度标签 */}
                  <div className="flex gap-1 mb-2">
                    {item.sugarLevelName && (
                      <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded">{item.sugarLevelName}</span>
                    )}
                    {item.iceLevelName && (
                      <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">{item.iceLevelName}</span>
                    )}
                  </div>
                  {/* 加料列表 */}
                  {item.addons.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {item.addons.map((a, ai) => (
                        <div key={ai} className="flex justify-between text-xs text-primary">
                          <span>{t('pos.add')} {a.name} × {a.qty}</span>
                          <span>{formatCurrency(a.price * a.qty)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                                           <button onClick={() => changeQty(idx, -1)} className="min-w-10 min-h-10 rounded-full bg-gray-200 font-bold flex items-center justify-center active:scale-95 touch-feedback text-lg">-</button>
                      <span className="w-8 text-center text-lg font-bold">{item.quantity}</span>
                      <button onClick={() => changeQty(idx, 1)} className="min-w-10 min-h-10 rounded-full bg-primary text-white font-bold flex items-center justify-center active:scale-95 touch-feedback text-lg">+</button>
                    </div>
                    <span className="text-primary font-bold text-lg">{formatCurrency((item.unitPrice + item.addons.reduce((s, a) => s + a.price * a.qty, 0)) * item.quantity)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 金额 */}
          <div className="p-4 border-t space-y-2 text-base bg-gray-50">
            {(posLayout.showTax !== false) && (
              <div className="flex justify-between text-gray-500">
                <span>{t('pos.tax')}</span>
                <span>{formatCurrency(tax)}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="flex justify-between text-green-500">
                <span>{t('pos.discount')}</span>
                <span>-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-xl pt-2 border-t">
              <span>{t('pos.total')}</span>
              <span className="text-primary text-2xl">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="p-4 border-t space-y-3 bg-white">
            {cart.length > 0 && (
              <>
                <button onClick={() => { playSoundWithSettings('keypress', soundSettings.keypress); setShowDiscountModal(true) }} className="w-full py-3 border-2 border-dashed border-primary/30 rounded-xl text-primary font-bold text-base touch-feedback">
                  + {t('pos.discount')}
                </button>
                <button onClick={() => {
                  playSoundWithSettings('keypress', soundSettings.keypress)
                  // 生成不规则订单号（防顾客推断销量）
                  const date = new Date()
                  const dateStr = date.toISOString().slice(0,10).replace(/-/g,'')
                  const random = Math.floor(1000 + Math.random() * 9000) // 4位随机数
                  const orderNum = `${dateStr}${random}`
                  setPaymentModalOrderNum(orderNum)
                  setShowPaymentModal(true)
                }} className="w-full py-5 bg-primary text-white rounded-xl font-bold text-xl active:scale-95 transition-transform touch-feedback">
                  💰 {t('pos.checkout')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ============ 弹窗 ============ */}

      {/* 加料弹窗 */}
      {showAddonModal && selectedProduct && selectedSpec && (
  <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 pointer-events-none flex items-center justify-center p-4" onClick={() => setShowAddonModal(false)}>
    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
      <div className="bg-primary text-white px-5 py-4 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold">{selectedProduct.name}</h2>
          <p className="text-sm opacity-90">{selectedSpec.name} - {formatCurrency(selectedSpec.price)}</p>
        </div>
        <button onClick={() => setShowAddonModal(false)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30">
          <X size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <p className="text-lg font-bold mb-3">{t('pos.sugarLevel')}</p>
          <div className="grid grid-cols-5 gap-2">
            {SUGAR_LEVELS.map(sugar => (
              <button
                key={sugar.id}
                onClick={() => setSelectedSugar(sugar.id)}
                className={`min-h-[64px] rounded-xl border-2 font-bold text-sm ${selectedSugar === sugar.id ? 'border-primary bg-primary-light text-primary' : 'border-gray-200 text-gray-700'}`}
              >
                {t(sugar.nameKey)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-lg font-bold mb-3">{t('pos.iceLevel')}</p>
          <div className="grid grid-cols-4 gap-2">
            {ICE_LEVELS.map(ice => (
              <button
                key={ice.id}
                onClick={() => setSelectedIce(ice.id)}
                className={`min-h-[64px] rounded-xl border-2 font-bold text-sm ${selectedIce === ice.id ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-700'}`}
              >
                {t(ice.nameKey)}
              </button>
            ))}
          </div>
        </div>
        {selectedProduct.addons?.length > 0 && (
          <div>
            <p className="text-lg font-bold mb-3">{t('pos.addonsSelect')}</p>
            <div className="grid grid-cols-2 gap-2">
              {selectedProduct.addons.map(pa => {
                const addon = pa.addon
                const selected = selectedAddonIds.includes(pa.addonId)
                return (
                  <button
                    key={pa.addonId}
                    onClick={() => setSelectedAddonIds(prev =>
                      selected ? prev.filter(id => id !== pa.addonId) : [...prev, pa.addonId]
                    )}
                    className={`min-h-[72px] rounded-xl border-2 text-left p-3 ${selected ? 'border-primary bg-primary-light' : 'border-gray-200'}`}
                  >
                    <p className="font-bold text-sm">{addon?.name}</p>
                    <p className="text-primary text-xs">+{formatCurrency(addon?.price || 0)}</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <div className="px-5 py-4 bg-gray-50 border-t space-y-3">
        <div className="flex items-center justify-center gap-4">
          <span className="text-sm font-medium">{t('pos.quantity')}</span>
                   <button onClick={() => setAddonQty(Math.max(1, addonQty - 1))} className="w-12 h-12 rounded-full bg-white border-2 border-gray-200 font-bold text-xl flex items-center justify-center active:scale-95 touch-feedback">-</button>
          <span className="w-10 text-center text-xl font-bold">{addonQty}</span>
          <button onClick={() => setAddonQty(addonQty + 1)} className="w-12 h-12 rounded-full bg-primary text-white font-bold text-xl flex items-center justify-center active:scale-95 touch-feedback">+</button>
        </div>
        <button onClick={handleAddToCartWithAddons} className="w-full py-3 bg-primary text-white rounded-xl text-base font-bold active:scale-95 transition-transform touch-feedback">
          {t('pos.addToCartConfirm')} ({addonQty})
        </button>
      </div>
    </div>
  </div>
)}

{showPaymentModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 pointer-events-none flex items-center justify-center p-4" onClick={() => setShowPaymentModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-primary text-white px-5 py-4 flex justify-between items-center flex-shrink-0">
              <h2 className="font-bold">{t('pos.confirmPayment')}</h2>
              <button onClick={async () => {
                // 记录关闭弹窗日志
                try {
                  await posApi.createCashEvent({
                    type: 'payment_modal_closed',
                    amount: 0,
                    paymentMethod: paymentMethod,
                    orderId: paymentModalOrderNum || `CLOSED-${Date.now()}`,
                    note: `关闭支付弹窗 #${paymentModalOrderNum || 'unknown'}`
                  })
                } catch (e) {
                  console.error('Failed to log modal close:', e)
                }
                setShowPaymentModal(false)
                setQrisData({ status: 'idle' })
              }} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/20"><X size={20} /></button>
            </div>
            <div className="p-4 border-b flex items-center justify-between bg-green-50 flex-shrink-0">
              <div>
                <p className="text-xs text-gray-500">{t('pos.orderNo')}</p>
                <p className="text-lg font-bold text-green-600">#{paymentModalOrderNum}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">{t('pos.receivable')}</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(total)}</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <p className="text-sm font-medium mb-2">{t('pos.payment')}</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {paymentMethods.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setPaymentMethod(m.id)}
                    className={`p-2 rounded-xl border-2 flex flex-col items-center gap-1 min-h-[56px] ${
                      paymentMethod === m.id ? 'border-primary bg-primary-light' : 'border-gray-200'
                    }`}
                  >
                    <span className="text-xl">{m.icon}</span>
                    <span className="text-xs font-medium truncate w-full text-center">{t(m.labelKey)}</span>
                  </button>
                ))}
              </div>
              {paymentMethod === 'cash' && (
                <div className="mb-3">
                  {/* 金额显示 */}
                  <div className="bg-gray-100 rounded-xl p-2 mb-2 text-right">
                    <span className="text-xl font-bold text-gray-700">{formatCurrency(parseInt(paidAmount) || 0)}</span>
                  </div>
                  {/* 数字键盘 */}
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                      <button
                        key={n}
                        onClick={() => setPaidAmount(prev => {
                          if (prev.length >= 6) return prev // 最多6位
                          if (prev === '0') return String(n)
                          return prev + String(n)
                        })}
                        className="min-h-12 bg-white border-2 rounded-xl text-lg font-bold hover:bg-primary-light active:bg-primary-light touch-feedback"
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      onClick={() => setPaidAmount('')}
                      className="min-h-12 bg-red-50 border-2 rounded-xl text-base font-bold text-red-500 hover:bg-red-100 touch-feedback"
                    >
                      C
                    </button>
                    <button
                      onClick={() => setPaidAmount(prev => {
                        if (prev.length >= 6) return prev
                        if (prev === '0') return '0'
                        return prev + '0'
                      })}
                      className="min-h-12 bg-white border-2 rounded-xl text-lg font-bold hover:bg-primary-light active:bg-primary-light touch-feedback"
                    >
                      0
                    </button>
                    <button
                      onClick={() => setPaidAmount(prev => prev.slice(0, -1))}
                      className="min-h-12 bg-gray-100 border-2 rounded-xl text-base font-bold hover:bg-gray-200 touch-feedback"
                    >
                      ←
                    </button>
                  </div>
                  {/* 快捷金额按钮 */}
                  {quickAmounts.enabled && (
                    <div className="grid grid-cols-4 gap-1">
                      {quickAmounts.amounts.map(amount => (
                        <button
                          key={amount}
                          onClick={() => setPaidAmount(String(amount))}
                          className="py-2 border rounded-lg text-xs font-bold hover:bg-primary-light touch-feedback"
                        >
                          {formatCurrency(amount)}
                        </button>
                      ))}
                    </div>
                  )}
                  {change > 0 && (
                    <div className="p-2 bg-green-50 rounded-xl text-right mt-2">
                      <p className="text-xs text-green-600">{t('pos.change')}</p>
                      <p className="text-base font-bold text-green-600">{formatCurrency(change)}</p>
                    </div>
                  )}
                </div>
              )}
              {paymentMethod === 'qris' && (
                <div className="mb-3">
                  {qrisData.status === 'idle' && (
                    <div className="text-center text-sm text-gray-500 py-4">
                      {t('pos.qrisInstruction') || '点击下方按钮生成二维码'}
                    </div>
                  )}
                  {qrisData.status === 'waiting' && qrisData.qrImage && (
                    <div className="flex flex-col items-center">
                      <img src={qrisData.qrImage} alt="QRIS" className="w-48 h-48 mx-auto" />
                      <p className="text-sm text-gray-500 mt-2">{t('pos.scanToPay') || '请顾客扫描二维码支付'}</p>
                      <div className="flex items-center gap-2 mt-2 text-yellow-600">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-sm">{t('pos.waitingPayment') || '等待支付中...'}</span>
                      </div>
                    </div>
                  )}
                  {qrisData.status === 'paid' && (
                    <div className="text-center py-4">
                      <p className="text-green-600 font-bold">{t('pos.paymentReceived') || '已收到付款！'}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* 确认支付按钮 - 固定在底部 */}
            <div className="flex-shrink-0 p-4 bg-white border-t space-y-2">
              <button
                onClick={handleCheckout}
                disabled={
                  isCheckingOut ||
                  (paymentMethod === 'cash' && (!paidAmount || parseInt(paidAmount) < total)) ||
                  (paymentSettings.minAmount > 0 && total < paymentSettings.minAmount) ||
                  (paymentMethod === 'qris' && qrisData.status === 'waiting')
                }
                className="w-full py-4 bg-primary text-white rounded-xl font-bold text-lg disabled:bg-gray-300 touch-feedback"
              >
                {isCheckingOut ? t('common.loading') : (paymentMethod === 'qris' && qrisData.status === 'waiting' ? t('pos.waitingPayment') || '等待支付中...' : t('pos.confirmPayment'))}
              </button>
              {paymentSettings.minAmount > 0 && total < paymentSettings.minAmount && (
                <p className="text-xs text-red-500 mt-1 text-center">
                  {t('pos.minAmountRequired')} {formatCurrency(paymentSettings.minAmount)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 折扣弹窗 */}
      {showDiscountModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 pointer-events-none flex items-center justify-center p-4" onClick={() => setShowDiscountModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b">
              <h3 className="font-bold">{t('pos.discount')}</h3>
              <button onClick={() => setShowDiscountModal(false)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              {/* 金额显示 */}
              <div className="bg-gray-100 rounded-xl p-4 mb-4 text-right">
                <span className="text-3xl font-bold text-primary">{formatCurrency(parseInt(tempDiscount) || 0)}</span>
              </div>
              {/* 数字键盘 */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <button
                  key={n}
                  onClick={() => setTempDiscount(prev => {
                    if (prev === '0') return String(n)
                    return prev + String(n)
                  })}
                  className="h-14 bg-white border rounded-xl text-xl font-bold hover:bg-primary-light active:bg-primary-light"
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setTempDiscount('')}
                className="h-14 bg-red-50 border rounded-xl text-lg font-bold text-red-500 hover:bg-red-100"
              >
                C
              </button>
              <button
                onClick={() => setTempDiscount(prev => {
                  if (prev === '0') return '0'
                  return prev + '0'
                })}
                className="h-14 bg-white border rounded-xl text-xl font-bold hover:bg-primary-light active:bg-primary-light"
              >
                0
              </button>
              <button
                onClick={() => setTempDiscount(prev => prev.slice(0, -1))}
                className="h-14 bg-gray-100 border rounded-xl text-lg font-bold hover:bg-gray-200"
              >
                ←
              </button>
            </div>
            {/* 快捷金额 */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[1000, 3000, 5000].map(amount => (
                <button key={amount} onClick={() => setTempDiscount(String(amount))} className="py-2 border rounded-lg text-xs hover:bg-primary-light touch-feedback">
                  {formatCurrency(amount)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowDiscountModal(false)} className="flex-1 py-3 border rounded-xl touch-feedback">{t('common.cancel')}</button>
              <button onClick={() => { setDiscountAmount(Math.min(parseInt(tempDiscount) || 0, total)); setShowDiscountModal(false) }} className="flex-1 py-3 bg-primary text-white rounded-xl touch-feedback">{t('common.confirm')}</button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* 会员弹窗 */}

      {/* 会员弹窗 */}
      {showMemberModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 pointer-events-none flex items-center justify-center p-4" onClick={() => setShowMemberModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b">
              <h3 className="font-bold">{t('pos.member')}</h3>
              <button onClick={() => setShowMemberModal(false)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              {/* 手机号显示 */}
              <div className="bg-gray-100 rounded-xl p-3 mb-3 text-center">
                <span className="text-2xl font-bold text-gray-700">{memberPhone || '-'}</span>
              </div>
              {/* 数字键盘 */}
              <div className="grid grid-cols-3 gap-2 mb-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <button
                  key={n}
                  onClick={() => setMemberPhone(prev => prev + String(n))}
                  className="min-h-14 bg-white border rounded-xl text-xl font-bold hover:bg-primary-light active:bg-primary-light touch-feedback"
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setMemberPhone('')}
                className="min-h-14 bg-red-50 border rounded-xl text-base font-bold text-red-500 hover:bg-red-100 touch-feedback"
              >
                C
              </button>
              <button
                onClick={() => setMemberPhone(prev => prev + '0')}
                className="min-h-14 bg-white border rounded-xl text-xl font-bold hover:bg-primary-light active:bg-primary-light touch-feedback"
              >
                0
              </button>
              <button
                onClick={() => setMemberPhone(prev => prev.slice(0, -1))}
                className="min-h-14 bg-gray-100 border rounded-xl text-base font-bold hover:bg-gray-200 touch-feedback"
              >
                ←
              </button>
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={searchMember} disabled={isSearchingMember} className="flex-1 py-3 bg-primary text-white rounded-xl disabled:bg-pink-300">
                {isSearchingMember ? t('common.loading') : t('pos.search')}
              </button>
              <button onClick={() => navigate('/register-member')} className="flex-1 py-3 bg-blue-500 text-white rounded-xl">{t('pos.register')}</button>
            </div>
            {member ? (
              <div className="p-3 bg-green-50 rounded-xl mb-4">
                <p className="font-medium">{member.name}</p>
                <p className="text-sm text-gray-500">{member.phone}</p>
                <p className="text-sm text-green-600">{t('pos.points')}: {member.points || 0}</p>
                {maxRedeemablePoints > 0 && (
                  <div className="mt-2 pt-2 border-t border-green-200">
                    <p className="text-xs text-gray-600 mb-1">{t('pos.redeemPoints')}: {pointsToRedeem}</p>
                    <input
                      type="range"
                      min="0"
                      max={maxRedeemablePoints}
                      value={pointsToRedeem}
                      onChange={e => setPointsToRedeem(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <p className="text-xs text-right text-green-600">-{formatCurrency(pointsDiscount)}</p>
                  </div>
                )}
              </div>
            ) : memberPhone && !isSearchingMember ? (
              <div className="p-3 bg-red-50 rounded-xl mb-4 text-center text-red-500 text-sm">
                {t('pos.noMemberFound')}
              </div>
            ) : null}
            <button onClick={() => setShowMemberModal(false)} className="w-full py-2 border rounded-xl">{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* 挂单弹窗 */}
      {showSuspendModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 pointer-events-none" onClick={() => setShowSuspendModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b">
              <h3 className="font-bold">{t('pos.suspendOrderTitle')}</h3>
              <button onClick={() => setShowSuspendModal(false)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            {cart.length > 0 && (
              <button onClick={suspendOrder} className="w-full py-3 bg-yellow-500 text-white rounded-xl font-bold mb-4">
                {t('pos.suspendCurrent')}
              </button>
            )}
            {suspendedOrders.length > 0 && (
              <div className="space-y-2">
                <p className="font-medium text-sm text-gray-600">{t('pos.pendingOrders')}</p>
                {suspendedOrders.map(order => (
                  <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="font-medium">{order.channel.icon} {t(order.channel.nameKey)}</p>
                      <p className="text-xs text-gray-500">{order.time} - {order.cart.length} {t('pos.items')}</p>
                    </div>
                    <button onClick={() => resumeOrder(order)} className="px-3 py-1 bg-primary text-white rounded-lg text-sm">{t('pos.takeOrder')}</button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setShowSuspendModal(false)} className="w-full mt-4 py-2 border rounded-xl">{t('common.close')}</button>
          </div>
        </div>
      )}

      {/* 交接班弹窗 */}
      {showShiftModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 pointer-events-none flex items-center justify-center p-4" onClick={() => setShowShiftModal(false)}>
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b bg-primary text-white rounded-t-2xl">
              <h3 className="font-bold">{shiftData?.hasOpenShift ? t('pos.shiftChange') : t('pos.shiftOpen')}</h3>
              <button onClick={() => setShowShiftModal(false)} className="w-10 h-10 flex items-center justify-center hover:bg-white/20 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              {/* 无开班记录 - 显示开班界面 */}
              {!shiftData?.hasOpenShift ? (
                <>
                  <div className="p-4 bg-blue-50 rounded-xl mb-4">
                    <p className="text-center text-gray-600 mb-2">{t('pos.noOpenShift') || '尚未开班，请设置开班金额'}</p>
                  </div>

                  {/* 班次选择 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('pos.selectShift') || '选择班次'}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['morning', 'afternoon', 'evening'].map((shift) => (
                        <button
                          key={shift}
                          onClick={() => setSelectedShiftType(shift)}
                          className={`py-3 rounded-xl font-medium touch-feedback ${
                            selectedShiftType === shift
                              ? 'bg-primary text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {shift === 'morning' ? t('pos.morningShift') : shift === 'afternoon' ? t('pos.afternoonShift') : t('pos.eveningShift')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 开班金额输入 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('pos.openFloatAmount') || '开班金额'}</label>
                    <input
                      type="number"
                      id="openFloatInput"
                      placeholder={t('pos.enterOpenFloat') || '输入开班金额'}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl touch-feedback text-lg"
                      defaultValue="50000"
                    />
                  </div>

                  {/* 开班按钮 */}
                  <button
                    onClick={async () => {
                      const floatInput = document.getElementById('openFloatInput') as HTMLInputElement
                      const floatAmount = parseInt(floatInput?.value) || 0
                      if (floatAmount <= 0) {
                        showToast(t('pos.openFloatRequired') || '请输入开班金额', 'error')
                        return
                      }
                      try {
                        await posApi.openShift({
                          openFloat: floatAmount,
                          shift: selectedShiftType || 'morning'
                        })
                        showToast(t('pos.shiftOpened') || '开班成功', 'success')
                        fetchShiftData()
                      } catch (e) {
                        showToast(t('pos.shiftOpenFailed') || '开班失败', 'error')
                      }
                    }}
                    className="w-full py-4 bg-green-500 text-white rounded-xl font-bold touch-feedback text-lg"
                  >
                    {t('pos.confirmOpenShift') || '确认开班'}
                  </button>
                </>
              ) : (
                <>
                  {/* 班次信息 */}
                  <div className="p-3 bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl mb-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-gray-500">{t('pos.currentCashier')}</p>
                        <p className="font-bold text-lg">{user?.staff?.name || t('pos.cashier')}</p>
                      </div>
                      {shiftData?.shift && (
                        <div className="text-right">
                          <p className="text-sm text-gray-500">{shiftData.shift.shift === 'morning' ? t('pos.morningShift') : shiftData.shift.shift === 'afternoon' ? t('pos.afternoonShift') : t('pos.eveningShift')}</p>
                          <p className="font-bold text-primary">{new Date(shiftData.shift.openedAt).toLocaleTimeString()}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 开班金额和应收现金 */}
                  {shiftSettings.showSummary && (
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {shiftSettings.summaryItems.openFloat && (
                        <div className="p-3 bg-blue-50 rounded-xl">
                          <p className="text-xs text-gray-500">{t('pos.openFloat')}</p>
                          <p className="font-bold text-blue-600">{formatCurrency(shiftData?.openFloat || 0)}</p>
                        </div>
                      )}
                      {shiftSettings.summaryItems.closeCash && (
                        <div className="p-3 bg-green-50 rounded-xl">
                          <p className="text-xs text-gray-500">{t('pos.expectedCash')}</p>
                          <p className="font-bold text-green-600">{formatCurrency(shiftData?.expectedCash || 0)}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 今日汇总 */}
                  {shiftSettings.showSummary && (
                    <div className="p-3 bg-gray-50 rounded-xl mb-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">{t('pos.todaySummary')}</p>
                      <div className="space-y-1">
                        {shiftSettings.summaryItems.cashSales && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">{t('pos.cashSales')}</span>
                            <span className="font-medium">{formatCurrency(shiftData?.todayCashSales || 0)}</span>
                          </div>
                        )}
                        {shiftSettings.summaryItems.cashIn && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">{t('pos.cashIn')}</span>
                            <span className="font-medium text-green-600">+{formatCurrency(shiftData?.todayCashIns || 0)}</span>
                          </div>
                        )}
                        {shiftSettings.summaryItems.cashOut && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">{t('pos.cashOut')}</span>
                            <span className="font-medium text-red-600">-{formatCurrency(shiftData?.todayCashOuts || 0)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 订单统计 */}
                  {shiftSettings.showSummary && (
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {shiftSettings.summaryItems.orderCount && (
                        <div className="p-3 bg-orange-50 rounded-xl">
                          <p className="text-xs text-gray-500">{t('pos.todayOrders')}</p>
                          <p className="font-bold text-orange-600">{shiftData?.todayOrderCount || 0}</p>
                        </div>
                      )}
                      {shiftSettings.summaryItems.suspendedOrders && (
                        <div className="p-3 bg-purple-50 rounded-xl">
                          <p className="text-xs text-gray-500">{t('pos.suspendedOrders')}</p>
                          <p className="font-bold text-purple-600">{shiftData?.suspendedOrderCount || 0}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 状态信息 */}
                  {shiftSettings.showSummary && shiftSettings.summaryItems.pendingSync && (
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t('pos.pendingSync')}</span>
                        <span className="font-medium">{suspendedOrders.length}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t('pos.offlineMode')}</span>
                        <span className={isOnline ? 'text-green-600' : 'text-red-600'}>
                          {isOnline ? t('common.yes') : t('common.no')}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 实际现金输入 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('pos.actualCash') || '实际现金'}</label>
                    <input
                      type="number"
                      id="actualCashInput"
                      placeholder={t('pos.enterActualCash') || '输入实际现金金额'}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl touch-feedback text-lg"
                      defaultValue={shiftData?.expectedCash || 0}
                    />
                    {shiftData?.expectedCash && (
                      <p className="text-xs text-gray-500 mt-1">
                        {t('pos.expectedHint') || '应收'} {formatCurrency(shiftData.expectedCash)}
                      </p>
                    )}
                  </div>

                  {/* 主管确认 */}
                  {shiftSettings.requireSupervisorConfirm && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('pos.supervisorPin')}</label>
                      <input
                        type="password"
                        placeholder={t('pos.enterSupervisorPin')}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl touch-feedback"
                        id="supervisorPin"
                      />
                    </div>
                  )}

                  {/* 交班按钮 */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowShiftModal(false)}
                      className="flex-1 py-3 border border-gray-300 rounded-xl font-medium touch-feedback"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={async () => {
                        if (shiftSettings.requireSupervisorConfirm) {
                          const pinInput = document.getElementById('supervisorPin') as HTMLInputElement
                          const pin = pinInput?.value
                          if (!pin || pin.length < 4) {
                            showToast(t('pos.supervisorPinRequired'), 'error')
                            return
                          }
                        }
                        const actualCashInput = document.getElementById('actualCashInput') as HTMLInputElement
                        const actualCash = parseInt(actualCashInput?.value) || 0
                        try {
                          await posApi.closeShift({
                            actualCash,
                            closeNote: ''
                          })
                          clearCart()
                          setSuspendedOrders([])
                          localStorage.removeItem('suspended_orders')
                          setShowShiftModal(false)
                          logout()
                        } catch (e) {
                          showToast(t('pos.shiftCloseFailed'), 'error')
                        }
                      }}
                      className="flex-1 py-3 bg-primary text-white rounded-xl font-bold touch-feedback"
                    >
                      {t('pos.shiftConfirm')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
      />

      {/* 考勤二维码弹窗 */}
      {showAttendanceQR && (
        <AttendanceQR
          posId={user?.storeId || 'default'}
          onClose={() => setShowAttendanceQR(false)}
        />
      )}

      {/* 扫描弹窗 */}
      {showScanModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 pointer-events-none flex items-center justify-center p-4" onClick={() => setShowScanModal(false)}>
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b">
              <h3 className="font-bold">{t('toolbar.scan')}</h3>
              <button onClick={() => setShowScanModal(false)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              <p className="text-gray-500 text-center py-8">{t('toolbar.scanPlaceholder')}</p>
            </div>
          </div>
        </div>
      )}

      {/* 历史记录弹窗 */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 pointer-events-none flex items-center justify-center p-4" onClick={() => setShowHistoryModal(false)}>
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b">
              <h3 className="font-bold">{t('toolbar.history')}</h3>
              <button onClick={() => setShowHistoryModal(false)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              {ordersLoading ? (
                <p className="text-gray-500 text-center py-8">Loading...</p>
              ) : orders.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No orders found</p>
              ) : (
                <div className="space-y-2">
                  {orders.map(order => (
                    <div key={order.id} className="p-3 bg-gray-50 rounded-xl">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold">#{order.orderNumber || order.id}</p>
                          <p className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-primary">{formatCurrency(order.finalAmount || order.totalAmount)}</p>
                          <p className="text-xs text-gray-500">{order.channelName || order.channelId}</p>
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-gray-600">
                        {order.items?.map((item: any, idx: number) => (
                          <span key={idx}>{item.quantity}x {item.productName}{idx < order.items.length - 1 ? ', ' : ''}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 退款弹窗 */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 pointer-events-none flex items-center justify-center p-4" onClick={() => setShowRefundModal(false)}>
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b">
              <h3 className="font-bold">{t('toolbar.refund')}</h3>
              <button onClick={() => setShowRefundModal(false)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {refundOrders.length === 0 ? (
                <p className="text-gray-500 text-center py-8">{t('pos.noRefundableOrders') || 'No completed orders to refund'}</p>
              ) : (
                <>
                  <p className="text-sm text-gray-500">{t('pos.selectOrderToRefund') || 'Select an order to refund'}</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {refundOrders.map(order => (
                      <div
                        key={order.id}
                        className={`p-3 rounded-xl cursor-pointer transition-colors ${
                          selectedRefundOrder?.id === order.id ? 'bg-primary/10 border-2 border-primary' : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                        onClick={() => setSelectedRefundOrder(order)}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold">#{order.orderNumber || order.id}</p>
                            <p className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-primary">{formatCurrency(order.finalAmount || order.totalAmount)}</p>
                            <p className="text-xs text-gray-500">{order.channelName || order.channelId}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {selectedRefundOrder && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                      <label className="block text-sm font-medium mb-2">{t('pos.refundReason') || 'Refund Reason'}</label>
                      <textarea
                        value={refundReason}
                        onChange={e => setRefundReason(e.target.value)}
                        className="w-full p-3 border rounded-lg"
                        rows={2}
                        placeholder={t('pos.enterRefundReason') || 'Enter reason for refund'}
                      />
                    </div>
                  )}
                  <button
                    onClick={processRefund}
                    disabled={!selectedRefundOrder || isProcessingRefund}
                    className="w-full py-3 bg-red-500 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isProcessingRefund ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <RotateCcw size={20} />
                    )}
                    {t('pos.processRefund') || 'Process Refund'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 现金管理弹窗 */}
      {showCashModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 pointer-events-none flex items-center justify-center p-4" onClick={() => setShowCashModal(false)}>
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b">
              <h3 className="font-bold">{t('toolbar.cash')}</h3>
              <button onClick={() => setShowCashModal(false)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              <p className="text-gray-500 text-center py-8">{t('toolbar.cashComingSoon')}</p>
            </div>
          </div>
        </div>
      )}

      {/* 任务弹窗 */}
      {showTasksModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 pointer-events-none flex items-center justify-center p-4" onClick={() => setShowTasksModal(false)}>
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b bg-primary text-white rounded-t-2xl">
              <h3 className="font-bold">{t('toolbar.tasks')}</h3>
              <button onClick={() => setShowTasksModal(false)} className="w-10 h-10 flex items-center justify-center hover:bg-white/20 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              {tasksLoading ? (
                <p className="text-gray-500 text-center py-8">{t('common.loading') || 'Loading...'}</p>
              ) : tasks.length === 0 ? (
                <p className="text-gray-500 text-center py-8">{t('tasks.noPending') || 'No pending tasks'}</p>
              ) : (
                <div className="space-y-2">
                  {tasks.map(task => (
                    <div key={task.id} className="p-3 bg-gray-50 rounded-xl">
                      <p className="font-bold">{task.title || task.templateName}</p>
                      <p className="text-sm text-gray-500">{task.areaName || task.location}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={async () => {
                            try {
                              await posApi.completeTask(task.id, {})
                              showToast(t('tasks.completed') || 'Task completed', 'success')
                              fetchTasks()
                            } catch (e) {
                              showToast(t('tasks.completeFailed') || 'Failed to complete task', 'error')
                            }
                          }}
                          className="px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium touch-feedback hover:bg-green-200"
                        >
                          {t('tasks.complete') || 'Complete'}
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await posApi.skipTask(task.id, '')
                              showToast(t('tasks.skipped') || 'Task skipped', 'success')
                              fetchTasks()
                            } catch (e) {
                              showToast(t('tasks.skipFailed') || 'Failed to skip task', 'error')
                            }
                          }}
                          className="px-3 py-2 bg-yellow-100 text-yellow-700 rounded-lg text-sm font-medium touch-feedback hover:bg-yellow-200"
                        >
                          {t('tasks.skip') || 'Skip'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 退出确认弹窗 */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 pointer-events-none flex items-center justify-center p-4" onClick={() => setShowLogoutModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b">
              <h3 className="font-bold">{t('toolbar.logout')}</h3>
              <button onClick={() => setShowLogoutModal(false)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-center text-gray-600">{t('pos.logoutConfirm') || 'Are you sure you want to logout?'}</p>
              <div className="flex gap-2">
                <button onClick={() => setShowLogoutModal(false)} className="flex-1 py-3 border rounded-xl touch-feedback">{t('common.cancel')}</button>
                <button onClick={() => { setShowLogoutModal(false); logout() }} className="flex-1 py-3 bg-primary text-white rounded-xl touch-feedback">{t('toolbar.logout')}</button>
                           </div>
            </div>
          </div>
        </div>
      )}

      {/* 锁屏界面 */}
      {isLocked && (
        <div className="fixed inset-0 bg-primary z-[100] flex items-center justify-center">
          <div className="bg-white w-full max-w-sm mx-4 rounded-2xl shadow-2xl p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock size={32} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t('pos.locked') || 'Screen Locked'}</h2>
              <p className="text-sm text-gray-500 mt-1">{t('pos.enterPinToUnlock') || 'Enter PIN to unlock'}</p>
            </div>
            {displaySettings.lockScreenPin ? (
              <div className="space-y-4">
                <input
                  type="password"
                  value={lockPin}
                  onChange={(e) => { setLockPin(e.target.value); setLockError(false) }}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                  placeholder="****"
                  className={`w-full px-4 py-3 text-center text-2xl tracking-widest border rounded-xl ${lockError ? 'border-red-500' : 'border-gray-300'}`}
                  maxLength={6}
                  autoFocus
                />
                {lockError && <p className="text-red-500 text-sm text-center">{t('pos.wrongPin') || 'Wrong PIN'}</p>}
                <button
                  onClick={handleUnlock}
                  className="w-full py-3 bg-primary text-white rounded-xl font-bold touch-feedback"
                >
                  {t('pos.unlock') || 'Unlock'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsLocked(false)}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold touch-feedback"
              >
                {t('pos.tapToUnlock') || 'Tap to Unlock'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 自动更新通知 */}
      <UpdateNotification />
    </div>
  )
}

