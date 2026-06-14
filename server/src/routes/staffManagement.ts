import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import * as StaffManagementService from '../services/StaffManagementService'

const router = Router()

// ==================== PERFORMANCE ====================

// GET /api/staff-management/performance
router.get('/performance', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { startDate, endDate } = req.query

    const result = await StaffManagementService.getStaffPerformance(
      storeId,
      startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate ? new Date(endDate as string) : new Date()
    )

    res.json({
      code: 200,
      data: { list: result },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get staff performance error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get staff performance' })
  }
})

// GET /api/staff-management/attendance-analytics
router.get('/attendance-analytics', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1
    const year = parseInt(req.query.year as string) || new Date().getFullYear()

    const result = await StaffManagementService.getAttendanceAnalytics(storeId, month, year)

    res.json({
      code: 200,
      data: { list: result },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get attendance analytics error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get attendance analytics' })
  }
})

// ==================== SCHEDULE ====================

// GET /api/staff-management/schedule-coverage
router.get('/schedule-coverage', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const weekStart = req.query.weekStart
      ? new Date(req.query.weekStart as string)
      : new Date()

    const result = await StaffManagementService.getScheduleCoverage(storeId, weekStart)

    res.json({
      code: 200,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get schedule coverage error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get schedule coverage' })
  }
})

// ==================== PAYROLL ====================

// GET /api/staff-management/payroll
router.get('/payroll', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1
    const year = parseInt(req.query.year as string) || new Date().getFullYear()

    const result = await StaffManagementService.generatePayroll(storeId, month, year)

    res.json({
      code: 200,
      data: { list: result },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Generate payroll error:', error)
    res.status(500).json({ code: 500, message: 'Failed to generate payroll' })
  }
})

// ==================== KPI ====================

// GET /api/staff-management/kpi
router.get('/kpi', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1
    const year = parseInt(req.query.year as string) || new Date().getFullYear()

    const result = await StaffManagementService.getStaffKPIs(storeId, month, year)

    res.json({
      code: 200,
      data: { list: result },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get staff KPIs error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get staff KPIs' })
  }
})

// ==================== TURNOVER ====================

// GET /api/staff-management/turnover
router.get('/turnover', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const months = parseInt(req.query.months as string) || 12

    const result = await StaffManagementService.getTurnoverRate(storeId, months)

    res.json({
      code: 200,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get turnover rate error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get turnover rate' })
  }
})

// ==================== TRAINING ====================

// POST /api/staff-management/training
router.post('/training', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { staffId, trainingType, title, date, duration, provider, certificate, notes, attachments, status } = req.body

    const result = await StaffManagementService.addTrainingRecord({
      staffId,
      storeId: req.user!.storeId,
      trainingType,
      title,
      date: new Date(date),
      duration,
      provider,
      certificate,
      notes,
      attachments,
      status
    })

    res.status(201).json({
      code: 201,
      message: 'Training record added',
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Add training record error:', error)
    res.status(500).json({ code: 500, message: 'Failed to add training record' })
  }
})

// PUT /api/staff-management/training/:id
router.put('/training/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { staffId, trainingType, title, date, duration, provider, certificate, notes, attachments, status } = req.body

    const result = await StaffManagementService.updateTrainingRecord(id, {
      staffId,
      trainingType,
      title,
      date: date ? new Date(date) : undefined,
      duration,
      provider,
      certificate,
      notes,
      attachments,
      status
    })

    res.json({
      code: 200,
      message: 'Training record updated',
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update training record error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update training record' })
  }
})

// GET /api/staff-management/training/:staffId
router.get('/training/:staffId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { staffId } = req.params

    const result = await StaffManagementService.getTrainingRecords(staffId)

    res.json({
      code: 200,
      data: { list: result },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get training records error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get training records' })
  }
})

// GET /api/staff-management/training/all?storeId=xxx - 批量获取所有员工的培训记录
router.get('/training/all', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId

    // 获取所有员工
    const staffList = await prisma.staff.findMany({
      where: { storeId },
      select: { id: true, name: true }
    })
    const staffMap = Object.fromEntries(staffList.map(s => [s.id, s.name]))

    // 批量获取培训记录
    const trainings = await prisma.training.findMany({
      where: {
        staffId: { in: staffList.map(s => s.id) }
      },
      orderBy: { startDate: 'desc' }
    })

    // 附员工名称
    const result = trainings.map(t => ({
      ...t,
      staffName: staffMap[t.staffId] || 'Unknown'
    }))

    res.json({
      code: 200,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get all training records error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get all training records' })
  }
})

// DELETE /api/staff-management/training/:id
router.delete('/training/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    await prisma.training.delete({
      where: { id }
    })

    res.json({
      code: 200,
      message: 'Training record deleted',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Delete training error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete training record' })
  }
})

export { router as staffManagementRouter }