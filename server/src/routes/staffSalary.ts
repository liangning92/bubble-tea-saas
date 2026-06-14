import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { calculateSalary } from '../services/StaffService'

const router = Router()

// GET /api/staff-salary/calculate/:staffId
router.get('/calculate/:staffId', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { staffId } = req.params
    const { month, year } = req.query

    if (!month || !year) {
      return res.status(400).json({ code: 400, message: 'Month and year are required' })
    }

    const result = await calculateSalary(
      staffId,
      parseInt(month as string),
      parseInt(year as string)
    )

    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Calculate salary error:', error)
    res.status(500).json({ code: 500, message: 'Failed to calculate salary' })
  }
})

export { router as staffSalaryRouter }