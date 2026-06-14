import { Router } from 'express'
import { z } from 'zod'
// @ts-ignore - multer types not available
import multer from 'multer'
import path from 'path'
import prisma from '../config/database'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import * as ReimbursementService from '../services/ReimbursementService'

const router = Router()

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/reimbursements/')
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)
    if (extname && mimetype) {
      return cb(null, true)
    }
    cb(new Error('Only image files (jpeg, jpg, png) and PDF are allowed'))
  }
})

// Validation schemas
const applyReimbursementSchema = z.object({
  type: z.enum(['transportation', 'meals', 'communication', 'medical', 'other']),
  amount: z.number().min(1),
  description: z.string().min(1),
  receiptUrls: z.array(z.string()).optional()
})

// Ensure upload directory exists
import fs from 'fs'
const uploadDir = 'uploads/reimbursements/'
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// ============================================
// Staff/Cashier APIs
// ============================================

// POST /api/reimbursement/apply - Apply for reimbursement
router.post('/apply', authenticate, async (req: AuthRequest, res) => {
  try {
    const staff = await prisma.staff.findFirst({
      where: { userId: req.user!.id }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff profile not found' })
    }

    const validated = applyReimbursementSchema.parse(req.body)

    const reimbursement = await ReimbursementService.applyReimbursement({
      staffId: staff.id,
      storeId: staff.storeId,
      type: validated.type,
      amount: validated.amount,
      description: validated.description,
      receiptUrls: validated.receiptUrls
    })

    res.status(201).json({
      code: 201,
      message: 'Reimbursement application submitted',
      data: reimbursement,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Apply reimbursement error:', error)
    res.status(400).json({
      code: 400,
      message: error.message || 'Failed to apply for reimbursement',
      timestamp: new Date().toISOString()
    })
  }
})

// GET /api/reimbursement/my - Get my reimbursement records
router.get('/my', authenticate, async (req: AuthRequest, res) => {
  try {
    const staff = await prisma.staff.findFirst({
      where: { userId: req.user!.id }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff profile not found' })
    }

    const { status, startDate, endDate } = req.query
    const reimbursements = await ReimbursementService.getStaffReimbursements(staff.id, {
      status: status as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined
    })

    res.json({
      code: 200,
      data: reimbursements,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Get my reimbursements error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get reimbursements' })
  }
})

// PUT /api/reimbursement/cancel/:id - Cancel my reimbursement application
router.put('/cancel/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const staff = await prisma.staff.findFirst({
      where: { userId: req.user!.id }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff profile not found' })
    }

    const reimbursement = await ReimbursementService.cancelReimbursement(req.params.id, staff.id)

    res.json({
      code: 200,
      message: 'Reimbursement cancelled',
      data: reimbursement,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Cancel reimbursement error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Failed to cancel reimbursement' })
  }
})

// POST /api/reimbursement/upload - Upload receipt images
router.post('/upload', authenticate, upload.array('receipts', 5), async (req: AuthRequest, res) => {
  try {
    const files = req.files as any[]
    if (!files || files.length === 0) {
      return res.status(400).json({ code: 400, message: 'No files uploaded' })
    }

    const receiptUrls = files.map(file => `/uploads/reimbursements/${file.filename}`)

    res.json({
      code: 200,
      message: 'Files uploaded successfully',
      data: { receiptUrls },
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Upload error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Failed to upload files' })
  }
})

// ============================================
// Admin/Manager APIs
// ============================================

// GET /api/reimbursement/list - Get all reimbursement applications
router.get('/list', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { storeId, status, staffId, startDate, endDate } = req.query

    let targetStoreId = storeId as string
    if (!targetStoreId) {
      if (req.user!.role === 'staff' || req.user!.role === 'cashier') {
        targetStoreId = req.user!.storeId!
      }
    }

    const reimbursements = await ReimbursementService.getStoreReimbursements(targetStoreId, {
      status: status as string,
      staffId: staffId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined
    })

    res.json({
      code: 200,
      data: reimbursements,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Get reimbursements error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get reimbursements' })
  }
})

// GET /api/reimbursement/:id - Get reimbursement detail
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const reimbursement = await ReimbursementService.getReimbursementById(req.params.id)

    if (!reimbursement) {
      return res.status(404).json({ code: 404, message: 'Reimbursement not found' })
    }

    // Check access permission
    if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
      const staff = await prisma.staff.findFirst({
        where: { userId: req.user!.id }
      })
      if (!staff || reimbursement.staffId !== staff.id) {
        return res.status(403).json({ code: 403, message: 'Not authorized' })
      }
    }

    res.json({
      code: 200,
      data: reimbursement,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Get reimbursement error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get reimbursement' })
  }
})

// PUT /api/reimbursement/approve/:id - Approve reimbursement
router.put('/approve/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const reimbursement = await ReimbursementService.approveReimbursement(req.params.id, req.user!.id)

    res.json({
      code: 200,
      message: 'Reimbursement approved',
      data: reimbursement,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Approve reimbursement error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Failed to approve reimbursement' })
  }
})

// PUT /api/reimbursement/reject/:id - Reject reimbursement
router.put('/reject/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { reason } = req.body
    const reimbursement = await ReimbursementService.rejectReimbursement(req.params.id, req.user!.id, reason || '')

    res.json({
      code: 200,
      message: 'Reimbursement rejected',
      data: reimbursement,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Reject reimbursement error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Failed to reject reimbursement' })
  }
})

// PUT /api/reimbursement/mark-paid/:id - Mark as paid
router.put('/mark-paid/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const reimbursement = await ReimbursementService.markAsPaid(req.params.id, req.user!.id)

    res.json({
      code: 200,
      message: 'Reimbursement marked as paid',
      data: reimbursement,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Mark paid error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Failed to mark as paid' })
  }
})

export { router as reimbursementRouter }