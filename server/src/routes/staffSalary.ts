import prisma from '../config/database'
import { requireResourceStore } from '../middlewares/resourceStore'
import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { calculateSalary } from '../services/StaffService'

const router = Router()

// GET /api/staff-salary/calculate/:staffId
router.get('/calculate/:staffId', authenticate, authorize('admin', 'manager'), requireResourceStore(req=>prisma.staff.findUnique({where:{id:req.params.staffId},select:{storeId:true}})), async (req: AuthRequest, res) => {
  try {
    const { staffId } = req.params
    const { month, year } = req.query

    if (!month || !year) {
      return res.status(400).json({ code: 400, message: 'Month and year are required' })
    }

    const result = await calculateSalary(
      staffId,
      Number(month),
      Number(year)
    )

    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error: any) {
    if (['INVALID_SALARY_PERIOD', 'STAFF_BASE_SALARY_REQUIRED'].includes(error.message)) return res.status(400).json({ code: 400, message: error.message })
    console.error('Calculate salary error:', error)
    res.status(500).json({ code: 500, message: 'Failed to calculate salary' })
  }
})

export { router as staffSalaryRouter }