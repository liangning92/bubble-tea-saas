import { Router } from 'express'
import { z } from 'zod'
import prisma from '../config/database'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import * as LeaveService from '../services/LeaveService'

const router = Router()

// Validation schemas
const applyLeaveSchema = z.object({
  leaveType: z.enum(['annual', 'sick', 'unpaid', 'maternity', 'paternity', 'bereavement', 'other']),
  startDate: z.string(),
  endDate: z.string(),
  totalDays: z.number().min(1),
  reason: z.string().optional(),
  halfDay: z.boolean().optional(),
  contactPhone: z.string().optional(),
  attachmentUrl: z.string().optional()
})

const setBalanceSchema = z.object({
  year: z.number(),
  annualLeave: z.number().optional(),
  sickLeave: z.number().optional(),
  unpaidLeave: z.number().optional(),
  broughtForward: z.number().optional()
})

// ============================================
// Staff/Cashier APIs
// ============================================

// POST /api/leave/apply - Apply for leave
router.post('/apply', authenticate, async (req: AuthRequest, res) => {
  try {
    const staff = await prisma.staff.findFirst({
      where: { userId: req.user!.id }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff profile not found' })
    }

    const validated = applyLeaveSchema.parse(req.body)

    const leave = await LeaveService.applyLeave({
      staffId: staff.id,
      storeId: staff.storeId,
      leaveType: validated.leaveType,
      startDate: new Date(validated.startDate),
      endDate: new Date(validated.endDate),
      totalDays: validated.totalDays,
      reason: validated.reason,
      halfDay: validated.halfDay,
      contactPhone: validated.contactPhone,
      attachmentUrl: validated.attachmentUrl
    })

    res.status(201).json({
      code: 201,
      message: 'Leave application submitted',
      data: leave,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Apply leave error:', error)
    res.status(400).json({
      code: 400,
      message: error.message || 'Failed to apply for leave',
      timestamp: new Date().toISOString()
    })
  }
})

// GET /api/leave/my - Get my leave records
router.get('/my', authenticate, async (req: AuthRequest, res) => {
  try {
    const staff = await prisma.staff.findFirst({
      where: { userId: req.user!.id }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff profile not found' })
    }

    const { status, startDate, endDate } = req.query
    const leaves = await LeaveService.getStaffLeaves(staff.id, {
      status: status as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined
    })

    res.json({
      code: 200,
      data: leaves,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Get my leaves error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get leaves' })
  }
})

// GET /api/leave/balance - Get my leave balance
router.get('/balance', authenticate, async (req: AuthRequest, res) => {
  try {
    const staff = await prisma.staff.findFirst({
      where: { userId: req.user!.id }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff profile not found' })
    }

    const year = parseInt(req.query.year as string) || new Date().getFullYear()
    const balance = await LeaveService.getLeaveBalance(staff.id, year)

    res.json({
      code: 200,
      data: balance,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Get leave balance error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get leave balance' })
  }
})

// GET /api/leave/balance/:staffId - Admin/Manager view staff member's leave balance
router.get('/balance/:staffId', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { staffId } = req.params
    const year = parseInt(req.query.year as string) || new Date().getFullYear()
    const balance = await LeaveService.getLeaveBalance(staffId, year)

    res.json({
      code: 200,
      data: balance,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Get staff leave balance error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get leave balance' })
  }
})

// PUT /api/leave/cancel/:id - Cancel my leave application
router.put('/cancel/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const staff = await prisma.staff.findFirst({
      where: { userId: req.user!.id }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff profile not found' })
    }

    const leave = await LeaveService.cancelLeave(req.params.id, staff.id)

    res.json({
      code: 200,
      message: 'Leave cancelled',
      data: leave,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Cancel leave error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Failed to cancel leave' })
  }
})

// ============================================
// Admin/Manager APIs
// ============================================

// GET /api/leave/list - Get all leave applications
router.get('/list', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { storeId, status, staffId, startDate, endDate } = req.query

    let targetStoreId = storeId as string
    if (!targetStoreId) {
      if (req.user!.role === 'staff' || req.user!.role === 'cashier') {
        targetStoreId = req.user!.storeId!
      }
    }

    const leaves = await LeaveService.getStoreLeaves(targetStoreId, {
      status: status as string,
      staffId: staffId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined
    })

    res.json({
      code: 200,
      data: leaves,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Get leaves error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get leaves' })
  }
})

// GET /api/leave/:id - Get leave detail
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const leave = await LeaveService.getLeaveById(req.params.id)

    if (!leave) {
      return res.status(404).json({ code: 404, message: 'Leave not found' })
    }

    // Check access permission
    if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
      const staff = await prisma.staff.findFirst({
        where: { userId: req.user!.id }
      })
      if (!staff || leave.staffId !== staff.id) {
        return res.status(403).json({ code: 403, message: 'Not authorized' })
      }
    }

    res.json({
      code: 200,
      data: leave,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Get leave error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get leave' })
  }
})

// PUT /api/leave/approve/:id - Approve leave
router.put('/approve/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const leave = await LeaveService.approveLeave(req.params.id, req.user!.id)

    res.json({
      code: 200,
      message: 'Leave approved',
      data: leave,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Approve leave error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Failed to approve leave' })
  }
})

// PUT /api/leave/reject/:id - Reject leave
router.put('/reject/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { reason } = req.body
    const leave = await LeaveService.rejectLeave(req.params.id, req.user!.id, reason || '')

    res.json({
      code: 200,
      message: 'Leave rejected',
      data: leave,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Reject leave error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Failed to reject leave' })
  }
})

// PUT /api/leave/balance/:staffId - Set staff leave balance
router.put('/balance/:staffId', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { staffId } = req.params
    const validated = setBalanceSchema.parse(req.body)

    const balance = await LeaveService.setLeaveBalance(staffId, {
      staffId,
      year: validated.year,
      annualLeave: validated.annualLeave,
      sickLeave: validated.sickLeave,
      unpaidLeave: validated.unpaidLeave,
      broughtForward: validated.broughtForward
    })

    res.json({
      code: 200,
      message: 'Leave balance updated',
      data: balance,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Set leave balance error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Failed to set leave balance' })
  }
})

export { router as leaveRouter }