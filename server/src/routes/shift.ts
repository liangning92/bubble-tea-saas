import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { prisma } from '../config/database'

const router = Router()

// 默认班次
const DEFAULT_SHIFTS = [
  { key: 'morning', name: 'Morning', nameZh: '早班', nameId: 'Pagi', startTime: '06:00', endTime: '14:00', color: '#F59E0B', sortOrder: 1 },
  { key: 'afternoon', name: 'Afternoon', nameZh: '午班', nameId: 'Siang', startTime: '14:00', endTime: '22:00', color: '#F97316', sortOrder: 2 },
  { key: 'evening', name: 'Evening', nameZh: '晚班', nameId: 'Sore', startTime: '22:00', endTime: '06:00', color: '#3B82F6', sortOrder: 3 },
]

// GET /api/shifts - 获取班次列表
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId

    let shifts = await prisma.shift.findMany({
      where: { storeId, isActive: true },
      orderBy: { sortOrder: 'asc' }
    })

    // 如果没有班次，创建默认班次
    if (shifts.length === 0) {
      shifts = await Promise.all(
        DEFAULT_SHIFTS.map(s =>
          prisma.shift.create({
            data: { ...s, storeId }
          })
        )
      )
    }

    res.json({
      code: 200,
      data: shifts,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get shifts error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get shifts' })
  }
})

// POST /api/shifts - 创建班次
router.post('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { key, name, nameZh, nameId, startTime, endTime, color, sortOrder } = req.body

    // 检查 key 是否已存在
    const existing = await prisma.shift.findFirst({
      where: { storeId, key }
    })
    if (existing) {
      return res.status(400).json({ code: 400, message: 'Shift key already exists' })
    }

    const shift = await prisma.shift.create({
      data: {
        storeId,
        key,
        name: name || key,
        nameZh,
        nameId,
        startTime,
        endTime,
        color: color || '#6B7280',
        sortOrder: sortOrder || 0
      }
    })

    res.status(201).json({
      code: 201,
      data: shift,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Create shift error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create shift' })
  }
})

// PUT /api/shifts/:id - 更新班次
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const storeId = req.user!.storeId
    const { name, nameZh, nameId, startTime, endTime, color, sortOrder, isActive } = req.body

    const shift = await prisma.shift.findFirst({
      where: { id, storeId }
    })
    if (!shift) {
      return res.status(404).json({ code: 404, message: 'Shift not found' })
    }

    const updated = await prisma.shift.update({
      where: { id },
      data: {
        name,
        nameZh,
        nameId,
        startTime,
        endTime,
        color,
        sortOrder,
        isActive
      }
    })

    res.json({
      code: 200,
      data: updated,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update shift error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update shift' })
  }
})

// DELETE /api/shifts/:id - 删除班次
router.delete('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const storeId = req.user!.storeId

    const shift = await prisma.shift.findFirst({
      where: { id, storeId }
    })
    if (!shift) {
      return res.status(404).json({ code: 404, message: 'Shift not found' })
    }

    // 软删除
    await prisma.shift.update({
      where: { id },
      data: { isActive: false }
    })

    res.json({
      code: 200,
      message: 'Shift deleted',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Delete shift error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete shift' })
  }
})

// POST /api/shifts/seed - 创建默认班次
router.post('/seed', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId

    // 删除现有班次
    await prisma.shift.deleteMany({ where: { storeId } })

    // 创建默认班次
    const shifts = await Promise.all(
      DEFAULT_SHIFTS.map(s =>
        prisma.shift.create({
          data: { ...s, storeId }
        })
      )
    )

    res.json({
      code: 200,
      data: shifts,
      message: 'Default shifts created',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Seed shifts error:', error)
    res.status(500).json({ code: 500, message: 'Failed to seed shifts' })
  }
})

export { router as shiftRouter }
