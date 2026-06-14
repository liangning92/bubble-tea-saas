import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import {
  getDepositRules,
  createDepositRule,
  updateDepositRule,
  deleteDepositRule,
  getStaffDeposit,
  getAllStaffDeposits,
  createStaffDeposit,
  calculateMonthlyDeduction,
  recordDepositDeduction,
  calculateRefundAmount,
  processRefund
} from '../services/DepositService'

const router = Router()

// GET /api/deposit/rules - Get deposit rules for store
router.get('/rules', authenticate, async (req: AuthRequest, res) => {
  try {
    const rules = await getDepositRules(req.user!.storeId)
    res.json({ code: 200, data: rules, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get deposit rules error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get deposit rules' })
  }
})

// POST /api/deposit/rules - Create deposit rule
router.post('/rules', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const result = await createDepositRule({
      ...req.body,
      storeId: req.user!.storeId
    })
    res.status(201).json({ code: 201, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Create deposit rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create deposit rule' })
  }
})

// PUT /api/deposit/rules/:id - Update deposit rule
router.put('/rules/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const result = await updateDepositRule(req.params.id, req.body)
    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Update deposit rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update deposit rule' })
  }
})

// DELETE /api/deposit/rules/:id - Delete deposit rule
router.delete('/rules/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    await deleteDepositRule(req.params.id)
    res.json({ code: 200, message: 'Deposit rule deleted', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Delete deposit rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete deposit rule' })
  }
})

// GET /api/deposit/staff/:staffId - Get staff deposit record
router.get('/staff/:staffId', authenticate, async (req: AuthRequest, res) => {
  try {
    const deposit = await getStaffDeposit(req.params.staffId)
    res.json({ code: 200, data: deposit, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get staff deposit error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get staff deposit' })
  }
})

// GET /api/deposit/staff/my - Get current staff's deposit record
router.get('/staff/my', authenticate, async (req: AuthRequest, res) => {
  try {
    const deposit = await getStaffDeposit(req.user!.staffId)
    res.json({ code: 200, data: deposit, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get my deposit error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get deposit' })
  }
})

// GET /api/deposit/staff/my/logs - Get current staff's deposit deduction logs
router.get('/staff/my/logs', authenticate, async (req: AuthRequest, res) => {
  try {
    const deposit = await getStaffDeposit(req.user!.staffId)
    if (!deposit) {
      return res.json({ code: 200, data: { deductionLogs: [], refundLogs: [] } })
    }
    res.json({
      code: 200,
      data: {
        deductionLogs: deposit.deductionLogs || [],
        refundLogs: deposit.refundLogs || []
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get my deposit logs error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get deposit logs' })
  }
})

// GET /api/deposit/staff-list - Get all staff deposits for store
router.get('/staff-list', authenticate, async (req: AuthRequest, res) => {
  try {
    const deposits = await getAllStaffDeposits(req.user!.storeId)
    res.json({ code: 200, data: deposits, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get all staff deposits error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get staff deposits' })
  }
})

// POST /api/deposit/staff - Create staff deposit record
router.post('/staff', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const result = await createStaffDeposit({
      ...req.body,
      storeId: req.user!.storeId
    })
    res.status(201).json({ code: 201, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Create staff deposit error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create staff deposit' })
  }
})

// GET /api/deposit/calculate/:staffDepositId - Calculate monthly deduction
router.get('/calculate/:staffDepositId', authenticate, async (req: AuthRequest, res) => {
  try {
    const staffDeposit = await getStaffDeposit(req.params.staffDepositId)
    if (!staffDeposit) {
      return res.status(404).json({ code: 404, message: 'Staff deposit not found' })
    }
    const result = await calculateMonthlyDeduction(staffDeposit)
    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Calculate deduction error:', error)
    res.status(500).json({ code: 500, message: 'Failed to calculate deduction' })
  }
})

// POST /api/deposit/deduct - Record deduction
router.post('/deduct', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const result = await recordDepositDeduction(req.body)
    res.status(201).json({ code: 201, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Record deduction error:', error)
    res.status(500).json({ code: 500, message: 'Failed to record deduction' })
  }
})

// GET /api/deposit/refund/calculate/:staffDepositId - Calculate refund amount
router.get('/refund/calculate/:staffDepositId', authenticate, async (req: AuthRequest, res) => {
  try {
    const staffDeposit = await getStaffDeposit(req.params.staffDepositId)
    if (!staffDeposit) {
      return res.status(404).json({ code: 404, message: 'Staff deposit not found' })
    }
    const result = await calculateRefundAmount(staffDeposit, new Date())
    res.json({ code: 200, data: { refundAmount: result }, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Calculate refund error:', error)
    res.status(500).json({ code: 500, message: 'Failed to calculate refund' })
  }
})

// POST /api/deposit/refund - Process refund
router.post('/refund', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const result = await processRefund({
      ...req.body,
      processedBy: req.user!.id
    })
    res.status(201).json({ code: 201, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Process refund error:', error)
    res.status(500).json({ code: 500, message: 'Failed to process refund' })
  }
})

export { router as depositRouter }