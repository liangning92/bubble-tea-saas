import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import prisma from '../config/database'
import { getStoreId } from '../utils/storeHelper'

const router = Router()

// GET /api/notifications
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = getStoreId(req)
    const { type, status, limit = 50 } = req.query
    const where: any = { storeId }
    if (type) where.type = type
    if (status) where.status = status
    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      include: { member: { select: { name: true, phone: true } } }
    })
    res.json({ code: 200, data: { list: notifications }, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get notifications error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get notifications' })
  }
})

// POST /api/notifications - Create a new notification
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { type, title, message, memberId, storeId } = req.body
    const userRole = req.user?.role || ''
    const finalStoreId = (['admin', 'super_admin'].includes(userRole) && storeId) ? storeId : (req.user?.storeId || '')

    const notification = await prisma.notification.create({
      data: {
        type: type || 'promotion',
        title,
        message,
        memberId,
        storeId: finalStoreId,
        status: 'unread'
      }
    })
    res.status(201).json({ code: 201, message: 'Notification created', data: notification, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Create notification error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create notification' })
  }
})

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticate, async (req: AuthRequest, res) => {
  try {
    const notification = await prisma.notification.update({
      where: { id: req.params.id },
      data: { status: 'read', readAt: new Date() }
    })
    res.json({ code: 200, message: 'Notification marked as read', data: notification, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Mark notification read error:', error)
    res.status(500).json({ code: 500, message: 'Failed to mark notification as read' })
  }
})

// PUT /api/notifications/mark-all-read - Mark all notifications as read
router.put('/mark-all-read', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = getStoreId(req)
    await prisma.notification.updateMany({
      where: { storeId, status: 'unread' },
      data: { status: 'read', readAt: new Date() }
    })
    res.json({ code: 200, message: 'All notifications marked as read', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Mark all notifications read error:', error)
    res.status(500).json({ code: 500, message: 'Failed to mark all notifications as read' })
  }
})

export { router as notificationRouter }