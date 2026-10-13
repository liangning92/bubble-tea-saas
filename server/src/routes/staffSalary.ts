import { payrollCorrectionSchema } from '../services/PayrollCorrectionService'
import { workingDaysSchema, ProbationInputError } from '../services/ProbationService'
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

    const manualDays = req.query.probationDays !== undefined || req.query.regularDays !== undefined ? workingDaysSchema.safeParse({probation:Number(req.query.probationDays),regular:Number(req.query.regularDays)}) : null
    if(manualDays && !manualDays.success)return res.status(400).json({code:400,message:'INVALID_WORKING_DAYS'})
    const correction=req.query.lateMinutes!==undefined?payrollCorrectionSchema.safeParse({lateMinutes:Number(req.query.lateMinutes),lateMode:req.query.lateMode||'rule',manualLateDeduction:Number(req.query.manualLateDeduction||0),otherAttendanceDeduction:Number(req.query.otherAttendanceDeduction||0),unpaidProbationDays:req.query.unpaidProbationDays===undefined?undefined:Number(req.query.unpaidProbationDays),unpaidRegularDays:req.query.unpaidRegularDays===undefined?undefined:Number(req.query.unpaidRegularDays),reason:'preview'}):null
    if(correction&&!correction.success)return res.status(400).json({code:400,message:'INVALID_PAYROLL_CORRECTION'})
    const result = await calculateSalary(
      staffId,
      Number(month),
      Number(year),
      manualDays?.success ? manualDays.data : undefined,
      correction?.success?correction.data:undefined,
      req.query.daysSource==='attendance'?'attendance':manualDays?'manual':'estimate'
    )

    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error: any) {
    if (error instanceof ProbationInputError) return res.status(400).json({code:400,message:error.message})
    if (['INVALID_SALARY_PERIOD', 'STAFF_BASE_SALARY_REQUIRED'].includes(error.message)) return res.status(400).json({ code: 400, message: error.message })
    console.error('Calculate salary error:', error)
    res.status(500).json({ code: 500, message: 'Failed to calculate salary' })
  }
})

export { router as staffSalaryRouter }