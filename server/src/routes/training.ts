import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { prisma } from '../config/database'
import { socketManager } from '../socket'

const router = Router()

// 默认培训类别
const DEFAULT_TRAINING_TYPES = [
  { key: 'onboarding', label: 'Onboarding', labelZh: '入职培训', labelId: 'Orientasi' },
  { key: 'safety', label: 'Safety', labelZh: '安全培训', labelId: 'Keselamatan' },
  { key: 'product', label: 'Product', labelZh: '产品培训', labelId: 'Produk' },
  { key: 'service', label: 'Service', labelZh: '服务培训', labelId: 'Pelayanan' },
  { key: 'leadership', label: 'Leadership', labelZh: '领导力培训', labelId: 'Kepemimpinan' },
  { key: 'compliance', label: 'Compliance', labelZh: '合规培训', labelId: 'Kepatuhan' },
  { key: 'other', label: 'Other', labelZh: '其他', labelId: 'Lainnya' }
]

// ========== 培训类别管理 API ==========

// GET /api/training/categories - 获取培训类别列表
router.get('/categories', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId

    // 从 Config 表获取自定义类别
    const config = await prisma.config.findUnique({
      where: { storeId_key: { storeId, key: 'training_categories' } }
    })

    let categories = DEFAULT_TRAINING_TYPES
    if (config) {
      try {
        categories = JSON.parse(config.value)
      } catch (e) {
        console.error('Parse training categories error:', e)
      }
    }

    res.json({ code: 200, data: categories, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get training categories error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get training categories' })
  }
})

// POST /api/training/categories - 创建/更新培训类别
router.post('/categories', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { categories } = req.body

    if (!categories || !Array.isArray(categories)) {
      return res.status(400).json({ code: 400, message: 'Invalid categories format' })
    }

    await prisma.config.upsert({
      where: { storeId_key: { storeId, key: 'training_categories' } },
      create: {
        storeId,
        category: 'training',
        key: 'training_categories',
        value: JSON.stringify(categories)
      },
      update: {
        value: JSON.stringify(categories)
      }
    })

    res.json({ code: 200, message: 'Training categories updated', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Update training categories error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update training categories' })
  }
})

// POST /api/training/push - 推送培训通知给员工
router.post('/push', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { trainingId, staffId } = req.body
    const storeId = req.user!.storeId

    // 获取培训记录
    const training = await prisma.training.findFirst({
      where: { id: trainingId, storeId }
    })

    if (!training) {
      return res.status(404).json({ code: 404, message: 'Training not found' })
    }

    //推送通知给指定员工或所有员工
    if (staffId) {
      socketManager.emitToStaff(staffId, 'training:new', {
        id: training.id,
        title: training.title,
        trainingType: training.trainingType,
        startDate: training.startDate
      })
    } else {
      // 获取所有员工推送
      const staffList = await prisma.staff.findMany({
        where: { storeId, status: 'active' }
      })
      for (const staff of staffList) {
        socketManager.emitToStaff(staff.id, 'training:new', {
          id: training.id,
          title: training.title,
          trainingType: training.trainingType,
          startDate: training.startDate
        })
      }
    }

    res.json({ code: 200, message: 'Training notification sent', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Push training notification error:', error)
    res.status(500).json({ code: 500, message: 'Failed to push notification' })
  }
})

// ========== 员工端 API ==========

// GET /api/training/my - Get current staff's training records
router.get('/my', authenticate, async (req: AuthRequest, res) => {
  try {
    const trainings = await prisma.training.findMany({
      where: { staffId: req.user!.staffId },
      orderBy: { startDate: 'desc' }
    })
    res.json({ code: 200, data: trainings, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get training error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get training records' })
  }
})

// GET /api/training/my/:id - Get training detail
router.get('/my/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const training = await prisma.training.findFirst({
      where: {
        id: req.params.id,
        staffId: req.user!.staffId
      }
    })
    if (!training) {
      return res.status(404).json({ code: 404, message: 'Training not found' })
    }
    res.json({ code: 200, data: training, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get training detail error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get training detail' })
  }
})

export { router as trainingRouter }
