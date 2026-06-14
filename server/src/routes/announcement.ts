import { Router } from 'express'
import prisma from '../config/database'

const router = Router()

// 获取公告列表 (Admin)
router.get('/', async (req, res) => {
  try {
    const { storeId } = req.query
    const where: any = { isActive: true }
    if (storeId) where.storeId = storeId as string

    const announcements = await prisma.announcement.findMany({
      where,
      orderBy: { priority: 'desc' }
    })
    res.json({ code: 200, data: announcements })
  } catch (error) {
    res.status(500).json({ code: 500, message: 'Failed to fetch announcements' })
  }
})

// 创建公告 (Admin)
router.post('/', async (req, res) => {
  try {
    const { storeId, title, content, type = 'info', priority = 0, startAt, endAt } = req.body
    if (!storeId || !title || !content) {
      return res.status(400).json({ code: 400, message: 'Missing required fields' })
    }
    const announcement = await prisma.announcement.create({
      data: { storeId, title, content, type, priority, startAt: startAt ? new Date(startAt) : undefined, endAt: endAt ? new Date(endAt) : undefined }
    })
    res.json({ code: 200, data: announcement })
  } catch (error) {
    res.status(500).json({ code: 500, message: 'Failed to create announcement' })
  }
})

// 删除公告 (Admin)
router.delete('/:id', async (req, res) => {
  try {
    await prisma.announcement.delete({ where: { id: req.params.id } })
    res.json({ code: 200, message: 'Deleted' })
  } catch (error) {
    res.status(500).json({ code: 500, message: 'Failed to delete' })
  }
})

// 更新公告 (Admin)
router.put('/:id', async (req, res) => {
  try {
    const { title, content, type, priority, isActive, startAt, endAt } = req.body
    const announcement = await prisma.announcement.update({
      where: { id: req.params.id },
      data: {
        title,
        content,
        type,
        priority,
        isActive,
        startAt: startAt ? new Date(startAt) : undefined,
        endAt: endAt ? new Date(endAt) : undefined
      }
    })
    res.json({ code: 200, data: announcement })
  } catch (error) {
    res.status(500).json({ code: 500, message: 'Failed to update announcement' })
  }
})

// 获取当前生效公告 (POS轮询)
router.get('/active', async (req, res) => {
  try {
    const { storeId } = req.query
    if (!storeId) {
      return res.status(400).json({ code: 400, message: 'storeId required' })
    }

    const now = new Date()
    const announcements = await prisma.announcement.findMany({
      where: {
        storeId: storeId as string,
        isActive: true,
        OR: [
          { startAt: null },
          { startAt: { lte: now } }
        ],
        AND: [
          {
            OR: [
              { endAt: null },
              { endAt: { gte: now } }
            ]
          }
        ]
      },
      orderBy: { priority: 'desc' }
    })
    res.json({ code: 200, data: announcements })
  } catch (error) {
    res.status(500).json({ code: 500, message: 'Failed to fetch active announcements' })
  }
})

// 获取卫生任务提醒 (推送到公告看板)
router.get('/hygiene/pending', async (req, res) => {
  try {
    const { storeId } = req.query
    if (!storeId) {
      return res.status(400).json({ code: 400, message: 'storeId required' })
    }

    const today = new Date().toISOString().split('T')[0]
    const now = new Date()
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

    // 获取今日待执行且未完成的卫生任务
    const tasks = await prisma.hygieneTask.findMany({
      where: {
        storeId: storeId as string,
        date: today,
        status: 'pending'
      },
      include: {
        template: true,
        staff: true
      },
      orderBy: { time: 'asc' }
    })

    // 转换为公告格式
    const hygieneAnnouncements = tasks.map(task => ({
      id: `hygiene-${task.id}`,
      title: `🧹 卫生任务提醒`,
      content: `${task.name}\n区域: ${task.areaCode}\n时间: ${task.time}\n负责人: ${task.staff?.name || '待分配'}`,
      type: 'warning',
      priority: 100,
      isActive: true,
      taskId: task.id,
      taskStatus: task.status
    }))

    res.json({ code: 200, data: hygieneAnnouncements })
  } catch (error) {
    res.status(500).json({ code: 500, message: 'Failed to fetch hygiene tasks' })
  }
})

export default router