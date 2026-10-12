import { Router, Request, Response } from 'express'
// @ts-ignore - multer types
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import prisma from '../config/database'

const router = Router()

// Paths
const MEDIA_DIR = path.join(process.cwd(), 'uploads/media')
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true })
}

const DATA_DIR = path.join(process.cwd(), 'data')
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const SCREENS_FILE = path.join(DATA_DIR, 'tv_screens.json')
const MEDIA_FILE = path.join(DATA_DIR, 'media_library.json')

// Interfaces
export interface MediaItem {
  id: string
  name: string
  url: string
  type: 'image' | 'video' | 'audio' | 'logo'
  category: 'product' | 'poster' | 'video' | 'audio' | 'logo' | 'general'
  size: number
  mimeType: string
  tags: string[]
  duration?: number // seconds for video/audio
  createdAt: string
  updatedAt: string
}

export interface ScreenConfig {
  id: string
  code: string // Pairing code / screen code e.g. "TV-01"
  name: string // Display name e.g. "1号吧台横屏"
  orientation: 'landscape' | 'portrait' // 横屏 / 竖屏
  layoutTemplate: 'menu_full' | 'split_media_menu' | 'media_loop' | 'portrait_promo_menu' | 'portrait_media_loop'
  themeStyle: 'international_dark' | 'creamy_morandi' | 'dynamic_vivid'
  safeAreaPadding: number // 0% ~ 5% 安全内边距防过扫描，默认 1.5
  mediaFitMode: 'cover' | 'contain_blur' // 等比满铺 vs 原比+毛玻璃氛围
  mediaIntervalSeconds: number // 轮播间隔秒数，默认 8
  selectedMediaIds: string[] // 从媒体库勾选的素材ID列表 (保持顺序)
  selectedCategoryIds: string[] // 勾选要展示的商品分类ID列表，为空则全部展示
  showActivities: boolean // 是否识别并展示系统后台活动
  activityDisplayType: 'all' | 'badges_only' | 'banner_only' // 活动展示方式
  marqueeText: string // 底部滚动跑马灯字幕
  marqueeSpeed: number // 跑马灯速度 1-5
  isActive: boolean
  lastHeartbeatAt?: string // 最后一次终端心跳汇报时间
  deviceInfo?: {
    resolution?: string
    orientation?: string
    isOnline?: boolean
    userAgent?: string
    appVersion?: string
  }
  lastUpdatedAt: string
  createdAt: string
}

// Helper: Read/Write JSON
function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(data) as T
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err)
  }
  return defaultValue
}

function writeJsonFile<T>(filePath: string, data: T) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err)
  }
}

// Initial seed
function initDefaultData() {
  if (!fs.existsSync(MEDIA_FILE)) {
    writeJsonFile(MEDIA_FILE, [])
  }

  let screens = readJsonFile<ScreenConfig[]>(SCREENS_FILE, [])
  if (screens.length === 0) {
    screens = [
      {
        id: 'screen_default_01',
        code: 'TV-01',
        name: '1号吧台横屏',
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
        lastUpdatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'screen_default_02',
        code: 'TV-02',
        name: '2号立柱竖屏',
        orientation: 'portrait',
        layoutTemplate: 'portrait_promo_menu',
        themeStyle: 'creamy_morandi',
        safeAreaPadding: 1.5,
        mediaFitMode: 'contain_blur',
        mediaIntervalSeconds: 6,
        selectedMediaIds: [],
        selectedCategoryIds: [],
        showActivities: true,
        activityDisplayType: 'all',
        marqueeText: '',
        marqueeSpeed: 3,
        isActive: true,
        lastUpdatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }
    ]
    writeJsonFile(SCREENS_FILE, screens)
  }
}

initDefaultData()

// Multer Storage Configuration
const mediaStorage = multer.diskStorage({
  destination: (req: any, file: any, cb: any) => {
    cb(null, MEDIA_DIR)
  },
  filename: (req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${uuidv4()}${ext}`)
  }
})

const mediaFilter = (req: any, file: any, cb: any) => {
  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/m4a'
  ]
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error(`不支持的文件格式: ${file.mimetype}`))
  }
}

const mediaUpload = multer({
  storage: mediaStorage,
  fileFilter: mediaFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for videos
  }
})

// ==========================================
// 1. 公共媒体库 API (Media Library)
// ==========================================

// GET /api/tv/media
router.get('/media', (req: Request, res: Response) => {
  try {
    const { type, category, search } = req.query
    let list = readJsonFile<MediaItem[]>(MEDIA_FILE, [])

    if (type && type !== 'all') {
      list = list.filter(item => item.type === type)
    }
    if (category && category !== 'all') {
      list = list.filter(item => item.category === category)
    }
    if (search && typeof search === 'string') {
      const q = search.toLowerCase()
      list = list.filter(item => item.name.toLowerCase().includes(q) || item.tags.some(t => t.toLowerCase().includes(q)))
    }

    res.json({ success: true, data: list })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/tv/media/upload
router.post('/media/upload', mediaUpload.array('files', 20), (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[]
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: '请选择要上传的文件' })
    }

    const { category = 'general', tags = '[]' } = req.body
    let parsedTags: string[] = []
    try {
      parsedTags = Array.isArray(tags) ? tags : JSON.parse(tags)
    } catch {
      parsedTags = []
    }

    const currentMedia = readJsonFile<MediaItem[]>(MEDIA_FILE, [])
    const newItems: MediaItem[] = files.map(file => {
      let type: MediaItem['type'] = 'image'
      if (file.mimetype.startsWith('video/')) type = 'video'
      else if (file.mimetype.startsWith('audio/')) type = 'audio'
      else if (category === 'logo') type = 'logo'

      return {
        id: `media_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        name: Buffer.from(file.originalname, 'latin1').toString('utf8'), // fix Chinese filename encoding
        url: `/uploads/media/${file.filename}`,
        type,
        category: (category as any) || 'general',
        size: file.size,
        mimeType: file.mimetype,
        tags: parsedTags,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    })

    const updated = [...newItems, ...currentMedia]
    writeJsonFile(MEDIA_FILE, updated)

    res.json({
      success: true,
      message: `成功上传 ${newItems.length} 个文件`,
      data: newItems
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// PUT /api/tv/media/:id
router.put('/media/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, category, tags } = req.body
    const currentMedia = readJsonFile<MediaItem[]>(MEDIA_FILE, [])
    const index = currentMedia.findIndex(m => m.id === id)

    if (index === -1) {
      return res.status(404).json({ success: false, message: '媒体素材不存在' })
    }

    currentMedia[index] = {
      ...currentMedia[index],
      name: name ?? currentMedia[index].name,
      category: category ?? currentMedia[index].category,
      tags: tags ?? currentMedia[index].tags,
      updatedAt: new Date().toISOString()
    }

    writeJsonFile(MEDIA_FILE, currentMedia)
    res.json({ success: true, data: currentMedia[index] })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// DELETE /api/tv/media/:id
router.delete('/media/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const currentMedia = readJsonFile<MediaItem[]>(MEDIA_FILE, [])
    const item = currentMedia.find(m => m.id === id)

    if (!item) {
      return res.status(404).json({ success: false, message: '媒体素材不存在' })
    }

    // Try deleting physical file if it starts with /uploads/media/
    if (item.url.startsWith('/uploads/media/')) {
      const filename = path.basename(item.url)
      const filepath = path.join(MEDIA_DIR, filename)
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath)
      }
    }

    const filtered = currentMedia.filter(m => m.id !== id)
    writeJsonFile(MEDIA_FILE, filtered)

    res.json({ success: true, message: '删除成功' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// ==========================================
// 2. 屏幕终端管理 API (Screen Management)
// ==========================================

// GET /api/tv/screens
router.get('/screens', (req: Request, res: Response) => {
  try {
    const screens = readJsonFile<ScreenConfig[]>(SCREENS_FILE, [])
    res.json({ success: true, data: screens })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/tv/screens
router.post('/screens', (req: Request, res: Response) => {
  try {
    const screens = readJsonFile<ScreenConfig[]>(SCREENS_FILE, [])
    const body = req.body

    const code = (body.code || `TV-${screens.length + 1}`).trim().toUpperCase()
    if (screens.some(s => s.code === code)) {
      return res.status(400).json({ success: false, message: `屏幕代号 ${code} 已存在，请更换` })
    }

    const newScreen: ScreenConfig = {
      id: `screen_${uuidv4().replace(/-/g, '').slice(0, 10)}`,
      code,
      name: body.name || `${code} 电视大屏`,
      orientation: body.orientation || 'landscape',
      layoutTemplate: body.layoutTemplate || 'split_media_menu',
      themeStyle: body.themeStyle || 'international_dark',
      safeAreaPadding: body.safeAreaPadding ?? 1.5,
      mediaFitMode: body.mediaFitMode || 'cover',
      mediaIntervalSeconds: body.mediaIntervalSeconds || 8,
      selectedMediaIds: body.selectedMediaIds || [],
      selectedCategoryIds: body.selectedCategoryIds || [],
      showActivities: body.showActivities ?? true,
      activityDisplayType: body.activityDisplayType || 'all',
      marqueeText: body.marqueeText || '',
      marqueeSpeed: body.marqueeSpeed || 3,
      isActive: body.isActive ?? true,
      lastUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }

    screens.push(newScreen)
    writeJsonFile(SCREENS_FILE, screens)

    res.json({ success: true, data: newScreen })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /api/tv/screens/:id
router.get('/screens/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const screens = readJsonFile<ScreenConfig[]>(SCREENS_FILE, [])
    const screen = screens.find(s => s.id === id || s.code.toUpperCase() === id.toUpperCase())

    if (!screen) {
      return res.status(404).json({ success: false, message: '未找到该屏幕配置' })
    }

    res.json({ success: true, data: screen })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// PUT /api/tv/screens/:id
router.put('/screens/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const screens = readJsonFile<ScreenConfig[]>(SCREENS_FILE, [])
    const index = screens.findIndex(s => s.id === id || s.code.toUpperCase() === id.toUpperCase())

    if (index === -1) {
      return res.status(404).json({ success: false, message: '未找到该屏幕配置' })
    }

    const updated: ScreenConfig = {
      ...screens[index],
      ...req.body,
      id: screens[index].id, // keep original id
      lastUpdatedAt: new Date().toISOString(),
    }

    screens[index] = updated
    writeJsonFile(SCREENS_FILE, screens)

    res.json({ success: true, data: updated })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// DELETE /api/tv/screens/:id
router.delete('/screens/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const screens = readJsonFile<ScreenConfig[]>(SCREENS_FILE, [])
    const filtered = screens.filter(s => s.id !== id && s.code.toUpperCase() !== id.toUpperCase())

    if (filtered.length === screens.length) {
      return res.status(404).json({ success: false, message: '未找到该屏幕配置' })
    }

    writeJsonFile(SCREENS_FILE, filtered)
    res.json({ success: true, message: '屏幕删除成功' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/tv/screens/:id/push - 触发推送刷新
router.post('/screens/:id/push', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const screens = readJsonFile<ScreenConfig[]>(SCREENS_FILE, [])
    const screen = screens.find(s => s.id === id || s.code.toUpperCase() === id.toUpperCase())

    if (!screen) {
      return res.status(404).json({ success: false, message: '屏幕不存在' })
    }

    screen.lastUpdatedAt = new Date().toISOString()
    writeJsonFile(SCREENS_FILE, screens)

    res.json({ success: true, message: '推送指令已广播，大屏即将自动无感刷新' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/tv/screens/:code/heartbeat (电视终端定时心跳与状态上报)
router.post('/screens/:code/heartbeat', (req: Request, res: Response) => {
  try {
    const { code } = req.params
    const screens = readJsonFile<ScreenConfig[]>(SCREENS_FILE, [])
    const screen = screens.find(s => s.code.toUpperCase() === code.toUpperCase())

    if (!screen) {
      return res.status(404).json({ success: false, message: '未找到对应屏幕代号' })
    }

    screen.lastHeartbeatAt = new Date().toISOString()
    screen.deviceInfo = {
      resolution: req.body.resolution || screen.deviceInfo?.resolution || '',
      orientation: req.body.orientation || screen.deviceInfo?.orientation || screen.orientation,
      isOnline: true,
      userAgent: req.body.userAgent || req.headers['user-agent'] || '',
      appVersion: req.body.appVersion || '1.0.0'
    }

    writeJsonFile(SCREENS_FILE, screens)
    res.json({ success: true, timestamp: Date.now() })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// ==========================================
// 2.5 激活配对码系统 (Random Activation PIN Pairing)
// ==========================================

interface PairingSession {
  pin: string
  createdAt: number
  expiresAt: number
  paired: boolean
  screenCode?: string
}

const activePairingSessions = new Map<string, PairingSession>()

function cleanExpiredPairings() {
  const now = Date.now()
  for (const [pin, session] of activePairingSessions.entries()) {
    if (now > session.expiresAt) {
      activePairingSessions.delete(pin)
    }
  }
}

// 电视端请求生成随机激活码：POST /api/tv/pair/request
router.post('/pair/request', async (req: Request, res: Response) => {
  try {
    cleanExpiredPairings()

    let pin = ''
    for (let i = 0; i < 10; i++) {
      pin = String(Math.floor(100000 + Math.random() * 900000))
      if (!activePairingSessions.has(pin)) break
    }

    const now = Date.now()
    const session: PairingSession = {
      pin,
      createdAt: now,
      expiresAt: now + 15 * 60 * 1000,
      paired: false
    }

    activePairingSessions.set(pin, session)

    const store = await prisma.store.findFirst()

    res.json({
      success: true,
      data: {
        pin,
        expiresInSeconds: 900,
        store: {
          name: store?.name || '',
          logo: (store as any)?.logoUrl || (store as any)?.logo || '',
          slogan: (store as any)?.slogan || (store as any)?.description || ''
        }
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// 电视端轮询配对状态：GET /api/tv/pair/check/:pin
router.get('/pair/check/:pin', (req: Request, res: Response) => {
  try {
    const { pin } = req.params
    cleanExpiredPairings()

    const session = activePairingSessions.get(pin)
    if (!session) {
      return res.json({
        success: true,
        data: {
          expired: true,
          paired: false
        }
      })
    }

    res.json({
      success: true,
      data: {
        expired: false,
        paired: session.paired,
        screenCode: session.screenCode || null
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// 后台输入激活码配对：POST /api/tv/pair/claim
router.post('/pair/claim', (req: Request, res: Response) => {
  try {
    const { pin, screenCode, screenName, orientation } = req.body

    if (!pin) {
      return res.status(400).json({ success: false, message: '请输入电视屏幕上显示的激活码' })
    }

    const cleanPin = pin.trim()
    const session = activePairingSessions.get(cleanPin)

    if (!session) {
      return res.status(400).json({ success: false, message: '激活码已过期或不存在，请查看电视屏幕上的最新激活码' })
    }

    const screens = readJsonFile<ScreenConfig[]>(SCREENS_FILE, [])
    let targetCode = (screenCode || '').trim().toUpperCase()

    if (!targetCode) {
      targetCode = `TV-0${screens.length + 1}`
    }

    let existingScreen = screens.find(s => s.code.toUpperCase() === targetCode)
    if (!existingScreen) {
      existingScreen = {
        id: `screen_${uuidv4().replace(/-/g, '').slice(0, 10)}`,
        code: targetCode,
        name: screenName || `${targetCode} 大屏`,
        orientation: orientation || 'landscape',
        layoutTemplate: orientation === 'portrait' ? 'portrait_promo_menu' : 'split_media_menu',
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
        lastUpdatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }
      screens.push(existingScreen)
      writeJsonFile(SCREENS_FILE, screens)
    }

    session.paired = true
    session.screenCode = existingScreen.code
    activePairingSessions.set(cleanPin, session)

    res.json({
      success: true,
      message: `配对成功！已连接至屏幕 [${existingScreen.code} - ${existingScreen.name}]`,
      data: {
        screenCode: existingScreen.code,
        screen: existingScreen
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// ==========================================
// 3. 电视大屏客户端公开聚合 API (Display Endpoint)
//    电视端无需登录，直接传入 code 获取完整结构
// ==========================================

// GET /api/tv/display/:code
router.get('/display/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params
    const screens = readJsonFile<ScreenConfig[]>(SCREENS_FILE, [])
    const screen = screens.find(s => s.code.toUpperCase() === code.toUpperCase() || s.id === code)

    if (!screen) {
      return res.status(404).json({
        success: false,
        message: `未找到屏幕 [${code}]。请在后台添加该屏幕或检查代号。`,
        availableCodes: screens.map(s => s.code)
      })
    }

    // 1. 提取该屏幕选中的媒体文件
    const allMedia = readJsonFile<MediaItem[]>(MEDIA_FILE, [])
    const selectedMediaMap = new Map(allMedia.map(m => [m.id, m]))
    const mediaItems: MediaItem[] = screen.selectedMediaIds
      .map(id => selectedMediaMap.get(id))
      .filter((m): m is MediaItem => !!m)

    // 2. 从数据库拉取产品与分类
    let categories: any[] = []
    let products: any[] = []

    try {
      categories = await prisma.category.findMany({
        where: { status: 'active' },
        orderBy: { sortOrder: 'asc' }
      })

      // Filter categories if screen has specific selection
      if (screen.selectedCategoryIds && screen.selectedCategoryIds.length > 0) {
        categories = categories.filter(c => screen.selectedCategoryIds.includes(c.id))
      }

      const categoryIds = categories.map(c => c.id)
      products = await prisma.product.findMany({
        where: {
          status: 'active',
          deletedAt: null,
          ...(categoryIds.length > 0 ? { categoryId: { in: categoryIds } } : {})
        },
        include: {
          specs: true,
          category: true,
        },
        orderBy: { sortOrder: 'asc' }
      })
    } catch (dbErr) {
      console.warn('Database query fallback, using sample menu:', dbErr)
    }

    // 0. 从数据库拉取真实门店品牌信息
    let storeInfo = {
      name: '',
      logo: null as string | null,
      description: ''
    }
    try {
      const store = await prisma.store.findFirst({
        where: { status: 'active' }
      })
      if (store) {
        storeInfo = {
          name: store.name || '',
          logo: (store as any).logo || null,
          description: store.description || ''
        }
      }
    } catch (storeErr) {
      console.warn('Failed to fetch store info:', storeErr)
    }

    // 3. 识别系统后台活动 (Campaigns & DiscountRules & TimedSpecials)
    const activePromotions: any[] = []
    const productActivityMap: Record<string, any> = {}

    if (screen.showActivities) {
      try {
        const now = new Date()

        // 3.1 识别 DiscountRule (满减 / 折扣)
        const discountRules = await prisma.discountRule.findMany({
          where: {
            status: 'active',
            OR: [
              { validFrom: null, validUntil: null },
              { validFrom: { lte: now }, validUntil: { gte: now } },
              { validFrom: { lte: now }, validUntil: null }
            ]
          }
        })

        discountRules.forEach(rule => {
          activePromotions.push({
            id: rule.id,
            title: rule.name,
            type: 'discount',
            badge: rule.discountType === 'percent' ? `${rule.discountValue}% OFF` : `立减${Math.round(rule.discountValue / 1000)}k`,
            description: `满 ${Math.round(rule.minOrderAmount / 1000)}k ${rule.discountType === 'percent' ? `享 ${rule.discountValue}% 折扣` : `减 ${Math.round(rule.discountValue / 1000)}k`}`,
            applicableProducts: rule.applicableProducts ? JSON.parse(rule.applicableProducts) : null
          })

          if (rule.applicableProducts) {
            try {
              const pIds = JSON.parse(rule.applicableProducts)
              if (Array.isArray(pIds)) {
                pIds.forEach(pId => {
                  productActivityMap[pId] = {
                    badge: rule.discountType === 'percent' ? `${rule.discountValue}% OFF` : `立减${Math.round(rule.discountValue / 1000)}k`,
                    ruleName: rule.name
                  }
                })
              }
            } catch {}
          }
        })

        // 3.2 识别 TimedSpecial (限时特惠特价)
        const timedSpecials = await prisma.timedSpecial.findMany({
          where: {
            status: 'active',
            startTime: { lte: now },
            endTime: { gte: now }
          }
        })

        timedSpecials.forEach(special => {
          activePromotions.push({
            id: special.id,
            title: special.name,
            type: 'timed_special',
            badge: '限时特价',
            description: `${special.name} 限时特价 ${Math.round(special.specialPrice / 1000)}k`,
            productId: special.productId,
            specialPrice: special.specialPrice,
            originalPrice: special.originalPrice
          })

          productActivityMap[special.productId] = {
            badge: '限时特价',
            specialPrice: special.specialPrice,
            originalPrice: special.originalPrice,
            ruleName: special.name
          }
        })

        // 3.3 识别 Campaign (营销活动)
        const campaigns = await prisma.campaign.findMany({
          where: {
            status: 'active',
            startDate: { lte: now },
            OR: [
              { endDate: null },
              { endDate: { gte: now } }
            ]
          }
        })

        campaigns.forEach(camp => {
          activePromotions.push({
            id: camp.id,
            title: camp.name,
            type: 'campaign',
            badge: '热门活动',
            description: camp.description || camp.name
          })
        })
      } catch (promoErr) {
        console.warn('Failed to fetch promotions from DB:', promoErr)
      }
    }

    // 格式化输出商品，附带活动标签与价格
    const formattedProducts = products.map((prod: any) => {
      let tags: string[] = []
      try {
        tags = typeof prod.tags === 'string' ? JSON.parse(prod.tags) : (prod.tags || [])
      } catch {
        tags = []
      }

      // Default price from specs
      const defaultSpec = (prod.specs && prod.specs.find((s: any) => s.isDefault)) || (prod.specs && prod.specs[0]) || { name: '标准', price: 15000 }
      const basePrice = defaultSpec.price

      // Attach activity if product is in promotion
      const activity = productActivityMap[prod.id]
      let displayPrice = basePrice
      let originalPrice: number | null = null
      let activityBadge: string | null = null

      if (activity) {
        activityBadge = activity.badge
        if (activity.specialPrice) {
          displayPrice = activity.specialPrice
          originalPrice = activity.originalPrice || basePrice
        }
      }

      return {
        id: prod.id,
        name: prod.name,
        description: prod.description || '',
        categoryId: prod.categoryId,
        image: prod.image || null,
        tags,
        specs: prod.specs || [],
        basePrice,
        displayPrice,
        originalPrice,
        activityBadge,
      }
    })

    // 组合分类与商品结构
    const menu = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      products: formattedProducts.filter((p: any) => p.categoryId === cat.id)
    })).filter(group => group.products.length > 0)

    res.json({
      success: true,
      data: {
        screen,
        store: storeInfo,
        mediaItems,
        menu,
        promotions: activePromotions,
        timestamp: Date.now()
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

export { router as tvRouter }
