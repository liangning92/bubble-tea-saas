import { adjustmentPlan, savedAdjustmentPlan, saveAdjustmentPlan, normalizeAdjustments, changeSalaryAdjustment, listSalaryAdjustments, periodLock, SalaryAdjustmentError } from '../services/SalaryAdjustmentService'
import { normalizeSalaryDeposits, salaryDepositPlan, sameDepositPlan } from '../services/SalaryDepositPlan'
import { requireResourceStore } from '../middlewares/resourceStore'
import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { calculateSalary } from '../services/StaffService'
import { DepositInputError, recordDepositDeduction } from '../services/DepositService'
import prisma from '../config/database'
import { z } from 'zod'
import { validateBody } from '../utils/validation'

const router = Router()
const money = z.number().int().min(0).max(2000000000)
const depositPlan = z.array(z.object({ staffDepositId: z.string().min(1), amountMinor: z.number().int().positive().max(2000000000) })).max(20).default([])
const salaryFields = z.object({ baseSalary: money, overtime: money.default(0), commission: money.default(0), bonus: money.default(0), deduction: money.default(0), status: z.literal('pending').optional(), depositDeductions: depositPlan, compensationAdjustmentIds:z.array(z.string().uuid()).max(200).default([]) }).refine(s => s.baseSalary + s.overtime + s.commission + s.bonus >= s.deduction, 'Deductions exceed gross salary')
const createSalary = z.object({ staffId: z.string().min(1), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), baseSalary: money, overtime: money.default(0), commission: money.default(0), bonus: money.default(0), deduction: money.default(0), status: z.literal('pending').optional(), depositDeductions: depositPlan, compensationAdjustmentIds:z.array(z.string().uuid()).max(200).default([]) }).refine(s => s.baseSalary + s.overtime + s.commission + s.bonus >= s.deduction, 'Deductions exceed gross salary')
class SalaryConflict extends Error {}
async function saveDepositPlan(tx: any, salary: any, items: Array<{ staffDepositId: string; amountMinor: number }>) {
  if (new Set(items.map(item => item.staffDepositId)).size !== items.length || items.reduce((sum, item) => sum + item.amountMinor, 0) > salary.deduction * 100) throw new DepositInputError('Deposit plan exceeds payroll deductions')
  for (const item of items) {
    const deposit = await tx.staffDeposit.findUnique({ where: { id: item.staffDepositId } })
    if (!deposit || deposit.staffId !== salary.staffId || deposit.status !== 'active' || item.amountMinor > deposit.totalAmount - deposit.deductedAmount) throw new DepositInputError('Invalid deposit deduction plan')
  }
  const staff = await tx.staff.findUniqueOrThrow({ where: { id: salary.staffId }, select: { storeId: true } })
  await tx.config.upsert({ where: { storeId_key: { storeId: staff.storeId, key: `salary.depositPlan.${salary.id}` } }, create: { storeId: staff.storeId, key: `salary.depositPlan.${salary.id}`, category: 'staff', value: JSON.stringify(items) }, update: { value: JSON.stringify(items) } })
}
const staffStore = requireResourceStore(req=>prisma.staff.findUnique({where:{id:req.params.staffId || req.body.staffId},select:{storeId:true}}))
const salaryStore = requireResourceStore(async req=>{const row=await prisma.salary.findUnique({where:{id:req.params.id},select:{staff:{select:{storeId:true}}}});return row?.staff || null})

const adjustmentInput = z.object({staffId:z.string().min(1),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),type:z.enum(['reward','penalty']),amount:z.number().int().positive().max(2000000000),reason:z.string().trim().min(1).max(1000),requestId:z.string().uuid()})
router.get('/adjustments', authenticate, authorize('admin','manager'), async(req:AuthRequest,res)=>{
  try {
  const list=await listSalaryAdjustments(req.user!.storeId!)
  const staff=await prisma.staff.findMany({where:{storeId:req.user!.storeId!},select:{id:true,name:true}})
  const salaries=await prisma.salary.findMany({where:{staff:{storeId:req.user!.storeId!}},select:{staffId:true,month:true,status:true}})
  res.json({code:200,data:{list:list.map(i=>({...i,staffName:staff.find(s=>s.id===i.staffId)?.name||'',payrollStatus:salaries.find(s=>s.staffId===i.staffId&&s.month===i.month)?.status||null}))}})
  } catch {res.status(500).json({code:500,message:'Failed to load rewards and penalties'})}
})
router.post('/adjustments',authenticate,authorize('admin'),validateBody(adjustmentInput),async(req:AuthRequest,res)=>{
  try {res.status(201).json({code:201,data:await changeSalaryAdjustment({id:req.user!.id,storeId:req.user!.storeId!},req.body)})}
  catch(error:any){res.status(error instanceof SalaryAdjustmentError?409:500).json({code:error instanceof SalaryAdjustmentError?409:500,message:error.message})}
})
router.post('/adjustments/:adjustmentId/cancel',authenticate,authorize('admin'),async(req:AuthRequest,res)=>{
  try {res.json({code:200,data:await changeSalaryAdjustment({id:req.user!.id,storeId:req.user!.storeId!},{cancelId:req.params.adjustmentId})})}
  catch(error:any){res.status(error instanceof SalaryAdjustmentError?409:500).json({code:error instanceof SalaryAdjustmentError?409:500,message:error.message})}
})

// GET /api/salaries
router.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { month, staffId, status } = req.query

    const where: any = {}
    if (month) where.month = month as string
    if (status) where.status = status as string
    if (staffId) where.staffId = staffId as string

    // Get staff for this store first
    const staffList = await prisma.staff.findMany({
      where: { storeId },
      select: { id: true }
    })
    where.staffId = { in: staffList.filter(s => !staffId || s.id === staffId).map(s => s.id) }

    const salaries = await prisma.salary.findMany({
      where,
      include: { staff: { include: { user: { select: { id: true, phone: true, role: true } } } } },
      orderBy: { month: 'desc' }
    })

    const plans = await prisma.config.findMany({ where: { storeId, key: { startsWith: 'salary.depositPlan.' } } })
    const planMap = new Map(plans.map(plan => [plan.key, JSON.parse(plan.value)]))
    const list = await Promise.all(salaries.map(async salary => {
      const saved = planMap.get(`salary.depositPlan.${salary.id}`) || []
      const expected = salary.status === 'pending' ? await salaryDepositPlan(salary.staffId, salary.month) : saved
      const compensation = await savedAdjustmentPlan(storeId!,salary.id)
      return {...salary, compensationRewards:compensation.rewards,compensationPenalties:compensation.penalties,compensationItems:compensation.items,compensationAdjustmentIds:compensation.items.map((i:any)=>i.id),depositDeductionAmount:saved.reduce((sum:number,i:any)=>sum+Math.round(i.amountMinor/100),0), depositDeductions:saved, depositNeedsReview:!sameDepositPlan(saved,expected), expectedDepositAmount:expected.reduce((sum: number,item: any)=>sum+Math.round(item.amountMinor/100),0)}
    }))
    res.json({ code: 200, data: { list } })
  } catch (error: any) {
    if (error instanceof SalaryAdjustmentError) return res.status(409).json({code:409,message:error.message})
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    if (error instanceof SalaryConflict) return res.status(409).json({ code: 409, message: error.message })
    console.error('Get salaries error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get salaries' })
  }
})

// POST /api/salaries
router.post('/', authenticate, authorize('admin'), validateBody(createSalary), staffStore, async (req: AuthRequest, res) => {
  try {
    const { staffId, month, baseSalary, overtime, commission, bonus, deduction, status } = req.body

    const finalAmount = baseSalary + (overtime || 0) + (commission || 0) + (bonus || 0) - (deduction || 0)

    const salary = await prisma.$transaction(async tx => {
      const staff = await tx.staff.findUniqueOrThrow({ where: { id: staffId }, select: { storeId: true } })
      // Serialize creation for this employee and month, including across API instances.
      await tx.config.upsert({ where: { storeId_key: { storeId: staff.storeId, key: `salary.period.${staffId}.${month}` } },
        create: { storeId: staff.storeId, key: `salary.period.${staffId}.${month}`, value: month, category: 'staff' }, update: { value: month } })
      if (await tx.salary.findFirst({ where: { staffId, month } })) throw new SalaryConflict('Salary already exists for this employee and month')
      const plan = await normalizeSalaryDeposits(tx, staffId, month, deduction || 0, req.body.depositDeductions)
      const adjustments = await normalizeAdjustments(tx,staff.storeId!,staffId,month,bonus || 0,plan.deduction,req.body.compensationAdjustmentIds)
      const gross = baseSalary + (overtime || 0) + (commission || 0) + adjustments.bonus
      if (adjustments.deduction > gross || adjustments.bonus > 2000000000 || adjustments.deduction > 2000000000 || gross-adjustments.deduction > 2000000000) throw new DepositInputError('Deductions exceed gross salary')
      const created = await tx.salary.create({
      data: {
        staffId,
        month,
        baseSalary,
        overtime: overtime || 0,
        commission: commission || 0,
        bonus: adjustments.bonus,
        deduction: adjustments.deduction,
        finalAmount: gross - adjustments.deduction,
        status: 'pending'
      }
      })
      await saveDepositPlan(tx, created, plan.items)
      await saveAdjustmentPlan(tx,staff.storeId!,created.id,adjustments.plan)
      return created
    })

    res.status(201).json({ code: 201, data: salary })
  } catch (error: any) {
    if (error instanceof SalaryAdjustmentError) return res.status(409).json({code:409,message:error.message})
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    if (error instanceof SalaryConflict) return res.status(409).json({ code: 409, message: error.message })
    console.error('Create salary error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to create salary' })
  }
})

// PUT /api/salaries/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), validateBody(salaryFields), salaryStore, async (req: AuthRequest, res) => {
  try {
    const { baseSalary, overtime, commission, bonus, deduction, status } = req.body

    const finalAmount = baseSalary + (overtime || 0) + (commission || 0) + (bonus || 0) - (deduction || 0)

    const salary = await prisma.$transaction(async tx => {
      const existing = await tx.salary.findUniqueOrThrow({where:{id:req.params.id}})
      const staff = await tx.staff.findUniqueOrThrow({where:{id:existing.staffId},select:{storeId:true}})
      await periodLock(tx,staff.storeId!,existing.staffId,existing.month)
      if (existing.status !== 'pending') throw new SalaryConflict('Paid salary cannot be edited')
      const plan = await normalizeSalaryDeposits(tx, existing.staffId, existing.month, deduction || 0, req.body.depositDeductions)
      const adjustments = await normalizeAdjustments(tx,staff.storeId!,existing.staffId,existing.month,bonus || 0,plan.deduction,req.body.compensationAdjustmentIds)
      const gross = baseSalary + (overtime || 0) + (commission || 0) + adjustments.bonus
      if (adjustments.deduction > gross || adjustments.bonus > 2000000000 || adjustments.deduction > 2000000000 || gross-adjustments.deduction > 2000000000) throw new DepositInputError('Deductions exceed gross salary')
      const updated = await tx.salary.updateMany({
      where: { id: req.params.id, status: 'pending' },
      data: {
        baseSalary,
        overtime: overtime || 0,
        commission: commission || 0,
        bonus: adjustments.bonus,
        deduction: adjustments.deduction,
        finalAmount: gross - adjustments.deduction,
        status: 'pending'
      }
      })
      if (updated.count !== 1) throw new SalaryConflict('Paid salary cannot be edited')
      const salary = await tx.salary.findUniqueOrThrow({ where: { id: req.params.id } })
      await saveDepositPlan(tx, salary, plan.items)
      await saveAdjustmentPlan(tx,staff.storeId!,salary.id,adjustments.plan)
      return salary
    })
    res.json({ code: 200, data: salary })
  } catch (error: any) {
    if (error instanceof SalaryAdjustmentError) return res.status(409).json({code:409,message:error.message})
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    if (error instanceof SalaryConflict) return res.status(409).json({ code: 409, message: error.message })
    console.error('Update salary error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to update salary' })
  }
})

// PUT /api/salaries/:id/mark-paid
router.put('/:id/mark-paid', authenticate, authorize('admin'), salaryStore, async (req: AuthRequest, res) => {
  try {
    const salary = await prisma.$transaction(async tx => {
      const before = await tx.salary.findUniqueOrThrow({where:{id:req.params.id},include:{staff:{select:{storeId:true}}}})
      await periodLock(tx,before.staff.storeId!,before.staffId,before.month)
      const changed = await tx.salary.updateMany({ where: { id: req.params.id, status: 'pending' }, data: { status: 'paid' } })
      const salary = await tx.salary.findUniqueOrThrow({ where: { id: req.params.id } })
      if (changed.count === 1) {
        const staff = await tx.staff.findUniqueOrThrow({ where: { id: salary.staffId }, select: { storeId: true } })
        const saved = await tx.config.findUnique({ where: { storeId_key: { storeId: staff.storeId, key: `salary.depositPlan.${salary.id}` } } })
        const plan = saved ? JSON.parse(saved.value) : []
        const expected = await salaryDepositPlan(salary.staffId, salary.month, tx)
        if (!sameDepositPlan(plan, expected)) throw new SalaryConflict('SALARY_DEPOSIT_RECALC_REQUIRED')
        await saveDepositPlan(tx, salary, plan)
        for (const item of plan) await recordDepositDeduction({ staffDepositId: item.staffDepositId, salaryId: salary.id, amount: item.amountMinor, note: `Salary ${salary.month}` }, tx)
      }
      return salary
    })
    res.json({ code: 200, data: salary })
  } catch (error: any) {
    if (error instanceof SalaryAdjustmentError) return res.status(409).json({code:409,message:error.message})
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    if (error instanceof SalaryConflict) return res.status(409).json({ code: 409, message: error.message })
    console.error('Mark paid error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to update salary' })
  }
})

// DELETE /api/salaries/:id
router.delete('/:id', authenticate, authorize('admin'), salaryStore, async (req: AuthRequest, res) => {
  try {
    const deleted = await prisma.salary.deleteMany({ where: { id: req.params.id, status: 'pending' } })
    if (deleted.count !== 1) throw new SalaryConflict('Paid salary cannot be deleted')
    res.json({ code: 200, message: 'Salary deleted' })
  } catch (error: any) {
    if (error instanceof SalaryAdjustmentError) return res.status(409).json({code:409,message:error.message})
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    if (error instanceof SalaryConflict) return res.status(409).json({ code: 409, message: error.message })
    console.error('Delete salary error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to delete salary' })
  }
})

// Read-only plan preview used by both manual and calculated salary forms.
router.get('/deposit-plan/:staffId', authenticate, authorize('admin', 'manager'), staffStore, async (req: AuthRequest, res) => {
  try {
    if (typeof req.query.month !== 'string') throw new DepositInputError('Valid YYYY-MM month is required')
    const items = await salaryDepositPlan(req.params.staffId, req.query.month)
    const compensation = await adjustmentPlan(req.user!.storeId!,req.params.staffId,req.query.month)
    const salary=await prisma.salary.findFirst({where:{staffId:req.params.staffId,month:req.query.month},select:{status:true}})
    res.json({code:200,data:{depositDeductions:items,amount:items.reduce((sum,item)=>sum+item.amount,0),salaryStatus:salary?.status||null,compensation}})
  } catch (error: any) {
    if (error instanceof SalaryAdjustmentError) return res.status(409).json({code:409,message:error.message})
    if (error instanceof DepositInputError) return res.status(400).json({code:400,message:error.message})
    res.status(500).json({code:500,message:'Failed to load deposit plan'})
  }
})

// GET /api/salaries/calculate/:staffId
router.get('/calculate/:staffId', authenticate, authorize('admin', 'manager'), staffStore, async (req: AuthRequest, res) => {
  try {
    const { staffId } = req.params
    const { month } = req.query // format: YYYY-MM

    if (!month || !staffId) {
      res.status(400).json({ code: 400, message: 'staffId and month are required' })
      return
    }

    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ code: 400, message: 'Valid YYYY-MM month is required' })
    const [year, monthNumber] = month.split('-').map(Number)
    const result = await calculateSalary(staffId, monthNumber, year)
    res.json({ code: 200, data: { ...result, month, totalOvertimeHours: result.overtimeHours, deduction: result.deductions, finalAmount: result.totalSalary } })
  } catch (error: any) {
    if (error instanceof SalaryAdjustmentError) return res.status(409).json({code:409,message:error.message})
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    if (error instanceof SalaryConflict) return res.status(409).json({ code: 409, message: error.message })
    console.error('Calculate salary error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to calculate salary' })
  }
})

export { router as salaryRouter }