import { Router } from 'express'
import { z } from 'zod'
import prisma from '../config/database'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'

const router = Router()

// Validation schemas
const createLeaveTypeSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional().default('#EC6D88'),
  icon: z.string().optional(),
  deductBalance: z.boolean().optional().default(true),
  requiresProof: z.boolean().optional().default(false),
  maxDaysPerYear: z.number().optional().nullable(),
  paidLeave: z.boolean().optional().default(true),
  sortOrder: z.number().optional().default(0)
})

const updateLeaveTypeSchema = createLeaveTypeSchema.partial()

// GET /api/leave-types - Get all leave types for store
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId

    const leaveTypes = await prisma.leaveType.findMany({
      where: { storeId, isActive: true },
      orderBy: { sortOrder: 'asc' }
    })

    res.json({
      code: 200,
      data: leaveTypes,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Get leave types error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get leave types' })
  }
})

// GET /api/leave-types/all - Get all leave types including inactive
router.get('/all', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId

    const leaveTypes = await prisma.leaveType.findMany({
      where: { storeId },
      orderBy: { sortOrder: 'asc' }
    })

    res.json({
      code: 200,
      data: leaveTypes,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Get all leave types error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get leave types' })
  }
})

// POST /api/leave-types - Create a new leave type
router.post('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const validated = createLeaveTypeSchema.parse(req.body)

    // Check if code already exists
    const existing = await prisma.leaveType.findUnique({
      where: { storeId_code: { storeId, code: validated.code } }
    })

    if (existing) {
      return res.status(400).json({ code: 400, message: 'Leave type code already exists' })
    }

    const leaveType = await prisma.leaveType.create({
      data: { ...validated, storeId } as any
    })

    res.status(201).json({
      code: 201,
      message: 'Leave type created',
      data: leaveType,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Create leave type error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Failed to create leave type' })
  }
})

// PUT /api/leave-types/:id - Update a leave type
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const validated = updateLeaveTypeSchema.parse(req.body)

    const leaveType = await prisma.leaveType.update({
      where: { id },
      data: validated
    })

    res.json({
      code: 200,
      message: 'Leave type updated',
      data: leaveType,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Update leave type error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Failed to update leave type' })
  }
})

// DELETE /api/leave-types/:id - Soft delete (deactivate) a leave type
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const leaveType = await prisma.leaveType.update({
      where: { id },
      data: { isActive: false }
    })

    res.json({
      code: 200,
      message: 'Leave type deactivated',
      data: leaveType,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Delete leave type error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Failed to delete leave type' })
  }
})

// Seed default leave types for a store
router.post('/seed', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId

    const defaultTypes = [
      { code: 'annual', name: 'Cuti Tahunan', color: '#10B981', deductBalance: true, requiresProof: false, paidLeave: true, sortOrder: 1 },
      { code: 'sick', name: 'Cuti Sakit', color: '#F59E0B', deductBalance: true, requiresProof: true, paidLeave: true, sortOrder: 2 },
      { code: 'unpaid', name: 'Cuti Tidak Dibayar', color: '#6B7280', deductBalance: false, requiresProof: false, paidLeave: false, sortOrder: 3 },
      { code: 'maternity', name: 'Cuti Melahirkan', color: '#EC4899', deductBalance: false, requiresProof: true, paidLeave: true, sortOrder: 4 },
      { code: 'paternity', name: 'Cuti Ayah', color: '#8B5CF6', deductBalance: false, requiresProof: true, paidLeave: true, sortOrder: 5 },
      { code: 'bereavement', name: 'Cuti Duka', color: '#374151', deductBalance: false, requiresProof: false, paidLeave: true, sortOrder: 6 }
    ]

    const created = []
    for (const type of defaultTypes) {
      const existing = await prisma.leaveType.findUnique({
        where: { storeId_code: { storeId, code: type.code } }
      })
      if (!existing) {
        const createdType = await prisma.leaveType.create({
          data: { ...type, storeId }
        })
        created.push(createdType)
      }
    }

    res.json({
      code: 201,
      message: `Seeded ${created.length} leave types`,
      data: created,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Seed leave types error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to seed leave types' })
  }
})

export { router as leaveTypeRouter }