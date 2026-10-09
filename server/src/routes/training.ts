import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { prisma } from '../config/database'
import { socketManager } from '../socket'
import { DEFAULT_TRAINING_MODULES, TrainingModule } from '../data/defaultTrainingCourses'

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

// ========== SOP 培训课程管理 API（用户完全可自定义与在线编辑） ==========

// GET /api/training/courses - 获取培训课程列表
router.get('/courses', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId

    const config = await prisma.config.findUnique({
      where: { storeId_key: { storeId, key: 'training_courses' } }
    })

    let courses: TrainingModule[] = DEFAULT_TRAINING_MODULES
    if (config && config.value) {
      try {
        const parsed = JSON.parse(config.value)
        if (Array.isArray(parsed) && parsed.length > 0) {
          courses = parsed
        }
      } catch (e) {
        console.error('Parse training courses error:', e)
      }
    }

    res.json({ code: 200, data: courses, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get training courses error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get training courses' })
  }
})

// POST /api/training/courses - 批量保存/更新全部课程
router.post('/courses', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { courses } = req.body

    if (!courses || !Array.isArray(courses)) {
      return res.status(400).json({ code: 400, message: 'Invalid courses format, array expected' })
    }

    await prisma.config.upsert({
      where: { storeId_key: { storeId, key: 'training_courses' } },
      create: {
        storeId,
        category: 'training',
        key: 'training_courses',
        value: JSON.stringify(courses)
      },
      update: {
        value: JSON.stringify(courses)
      }
    })

    socketManager.emitToStore(storeId, 'training:courses:updated', { count: courses.length })

    res.json({ code: 200, message: 'Training courses updated successfully', data: courses })
  } catch (error) {
    console.error('Update training courses error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update training courses' })
  }
})

// POST /api/training/courses/item - 新增单门课程
router.post('/courses/item', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const newCourse: TrainingModule = req.body

    if (!newCourse || !newCourse.key || !newCourse.title) {
      return res.status(400).json({ code: 400, message: 'Course key and title are required' })
    }

    const config = await prisma.config.findUnique({
      where: { storeId_key: { storeId, key: 'training_courses' } }
    })

    let courses: TrainingModule[] = DEFAULT_TRAINING_MODULES
    if (config && config.value) {
      try {
        const parsed = JSON.parse(config.value)
        if (Array.isArray(parsed) && parsed.length > 0) courses = parsed
      } catch (e) {}
    }

    // Check duplicate key
    const existingIndex = courses.findIndex(c => c.key === newCourse.key)
    if (existingIndex >= 0) {
      courses[existingIndex] = newCourse
    } else {
      courses.unshift(newCourse)
    }

    await prisma.config.upsert({
      where: { storeId_key: { storeId, key: 'training_courses' } },
      create: {
        storeId,
        category: 'training',
        key: 'training_courses',
        value: JSON.stringify(courses)
      },
      update: {
        value: JSON.stringify(courses)
      }
    })

    socketManager.emitToStore(storeId, 'training:courses:updated', { count: courses.length })

    res.json({ code: 200, message: 'Course created successfully', data: newCourse })
  } catch (error) {
    console.error('Create course error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create course' })
  }
})

// PUT /api/training/courses/:key - 更新指定课程
router.put('/courses/:key', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { key } = req.params
    const updatedData: Partial<TrainingModule> = req.body

    const config = await prisma.config.findUnique({
      where: { storeId_key: { storeId, key: 'training_courses' } }
    })

    let courses: TrainingModule[] = DEFAULT_TRAINING_MODULES
    if (config && config.value) {
      try {
        const parsed = JSON.parse(config.value)
        if (Array.isArray(parsed) && parsed.length > 0) courses = parsed
      } catch (e) {}
    }

    const idx = courses.findIndex(c => c.key === key)
    if (idx < 0) {
      return res.status(404).json({ code: 404, message: 'Course not found' })
    }

    courses[idx] = { ...courses[idx], ...updatedData, key: updatedData.key || key }

    await prisma.config.upsert({
      where: { storeId_key: { storeId, key: 'training_courses' } },
      create: {
        storeId,
        category: 'training',
        key: 'training_courses',
        value: JSON.stringify(courses)
      },
      update: {
        value: JSON.stringify(courses)
      }
    })

    socketManager.emitToStore(storeId, 'training:courses:updated', { count: courses.length })

    res.json({ code: 200, message: 'Course updated successfully', data: courses[idx] })
  } catch (error) {
    console.error('Update course error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update course' })
  }
})

// DELETE /api/training/courses/:key - 删除指定课程
router.delete('/courses/:key', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { key } = req.params

    const config = await prisma.config.findUnique({
      where: { storeId_key: { storeId, key: 'training_courses' } }
    })

    let courses: TrainingModule[] = DEFAULT_TRAINING_MODULES
    if (config && config.value) {
      try {
        const parsed = JSON.parse(config.value)
        if (Array.isArray(parsed) && parsed.length > 0) courses = parsed
      } catch (e) {}
    }

    const filtered = courses.filter(c => c.key !== key)

    await prisma.config.upsert({
      where: { storeId_key: { storeId, key: 'training_courses' } },
      create: {
        storeId,
        category: 'training',
        key: 'training_courses',
        value: JSON.stringify(filtered)
      },
      update: {
        value: JSON.stringify(filtered)
      }
    })

    socketManager.emitToStore(storeId, 'training:courses:updated', { count: filtered.length })

    res.json({ code: 200, message: 'Course deleted successfully' })
  } catch (error) {
    console.error('Delete course error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete course' })
  }
})

// POST /api/training/courses/reset - 重置为默认官方课程
router.post('/courses/reset', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId

    await prisma.config.upsert({
      where: { storeId_key: { storeId, key: 'training_courses' } },
      create: {
        storeId,
        category: 'training',
        key: 'training_courses',
        value: JSON.stringify(DEFAULT_TRAINING_MODULES)
      },
      update: {
        value: JSON.stringify(DEFAULT_TRAINING_MODULES)
      }
    })

    socketManager.emitToStore(storeId, 'training:courses:updated', { count: DEFAULT_TRAINING_MODULES.length })

    res.json({ code: 200, message: 'Training courses reset to official standard successfully', data: DEFAULT_TRAINING_MODULES })
  } catch (error) {
    console.error('Reset training courses error:', error)
    res.status(500).json({ code: 500, message: 'Failed to reset training courses' })
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
