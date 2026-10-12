import { workingDaysSchema, savePayrollBasis, savedPayrollBasis, calculatePayrollBasis, ProbationInputError } from '../services/ProbationService'
import { adjustmentPlan, savedAdjustmentPlan, saveAdjustmentPlan, normalizeAdjustments, changeSalaryAdjustment, listSalaryAdjustments, voucherStatuses, periodLock, SalaryAdjustmentError } from '../services/SalaryAdjustmentService'
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
const salaryFields = z.object({ workingDays: workingDaysSchema.optional(), autoBaseSalary: z.boolean().optional(), baseSalary: money, overtime: money.default(0), commission: money.default(0), bonus: money.default(0), deduction: money.default(0), status: z.literal('pending').optional(), depositDeductions: depositPlan, compensationAdjustmentIds:z.array(z.string().uuid()).max(200).default([]) }).refine(s => s.baseSalary + s.overtime + s.commission + s.bonus >= s.deduction, 'Deductions exceed gross salary')
const createSalary = z.object({ workingDays: workingDaysSchema.optional(), autoBaseSalary: z.boolean().optional(), staffId: z.string().min(1), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), baseSalary: money, overtime: money.default(0), commission: money.default(0), bonus: money.default(0), deduction: money.default(0), status: z.literal('pending').optional(), depositDeductions: depositPlan, compensationAdjustmentIds:z.array(z.string().uuid()).max(200).default([]) }).refine(s => s.baseSalary + s.overtime + s.commission + s.bonus >= s.deduction, 'Deductions exceed gross salary')
async function payrollEmployee(tx:any, staffId:string, automatic:boolean) {
  if(automatic && !process.env.DATABASE_URL?.startsWith('file:')) await tx.$queryRaw`SELECT id FROM "Staff" WHERE id=${staffId} FOR UPDATE`
  return tx.staff.findUniqueOrThrow({where:{id:staffId}})
}
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

const adjustmentInput = z.object({staffId:z.string().min(1),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),type:z.enum(['reward','penalty']),amount:z.number().int().positive().max(2000000000),reason:z.string().trim().min(1).max(1000),requestId:z.string().uuid(),rewardMethod:z.enum(['cash','voucher']).default('cash'),validDays:z.number().int().min(1).max(365).default(30),encouragement:z.string().trim().max(500).optional()}).refine(v=>v.type==='reward'||v.rewardMethod==='cash','Only rewards may issue vouchers')
router.get('/adjustments', authenticate, authorize('admin','manager'), async(req:AuthRequest,res)=>{
  try {
  const list=await voucherStatuses(req.user!.storeId!,await listSalaryAdjustments(req.user!.storeId!))
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
      return {...salary, payrollBasis:await savedPayrollBasis(prisma,storeId!,salary.id), compensationRewards:compensation.rewards,compensationPenalties:compensation.penalties,compensationItems:compensation.items,compensationAdjustmentIds:compensation.items.map((i:any)=>i.id),depositDeductionAmount:saved.reduce((sum:number,i:any)=>sum+Math.round(i.amountMinor/100),0), depositDeductions:saved, depositNeedsReview:!sameDepositPlan(saved,expected), expectedDepositAmount:expected.reduce((sum: number,item: any)=>sum+Math.round(item.amountMinor/100),0)}
    }))
    if(req.query.includeUnrecorded==='true'){
      if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new ProbationInputError('INVALID_SALARY_PERIOD')
      const recorded=await prisma.salary.findMany({where:{staff:{storeId},month},select:{staffId:true}})
      const ids=new Set(recorded.map(s=>s.staffId))
      const monthStart=new Date(month+'-01T00:00:00+07:00'),monthEnd=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)-7*3600000)
      const employees=await prisma.staff.findMany({where:{storeId,...(staffId?{id:String(staffId)}:{}),OR:[{status:'active'},{status:'resigned',terminationDate:{gte:monthStart}}]},include:{user:{select:{id:true,phone:true,role:true}}},orderBy:{employeeNumber:'asc'}})
      if(!status || status==='unrecorded')for(const staff of employees){
        if(ids.has(staff.id)||(staff.hireDate&&staff.hireDate>=monthEnd)||(staff.terminationDate&&staff.terminationDate<monthStart))continue
        let basis=null,calculationError=null
        try{basis=await calculatePayrollBasis(prisma,staff,month)}catch(error:any){calculationError=error.message}
        list.push({id:'unrecorded:'+staff.id,staffId:staff.id,month,staff,status:'unrecorded',baseSalary:basis?.amount||0,overtime:0,commission:0,bonus:0,deduction:0,finalAmount:basis?.amount||0,payrollBasis:basis,calculationError} as any)
      }
    }
    res.json({ code: 200, data: { list } })
  } catch (error: any) {
    if (error instanceof ProbationInputError) return res.status(400).json({code:400,message:error.message})
    if (error instanceof SalaryAdjustmentError) return res.status(409).json({code:409,message:error.message})
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    if (error instanceof SalaryConflict) return res.status(409).json({ code: 409, message: error.message })
    console.error('Get salaries error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get salaries' })
  }
})

// Create missing monthly drafts in one operation; existing and paid records stay intact.
router.post('/prepare-month', authenticate, authorize('admin'), validateBody(z.object({month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)})), async(req:AuthRequest,res)=>{
 const month=req.body.month,storeId=req.user!.storeId!
 try{
  const monthStart=new Date(month+'-01T00:00:00+07:00'),monthEnd=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)-7*3600000)
  const employees=await prisma.staff.findMany({where:{storeId,OR:[{status:'active'},{status:'resigned',terminationDate:{gte:monthStart}}]}})
  const result:{created:number;existing:number;skipped:Array<{staffId:string;name:string;reason:string}>}={created:0,existing:0,skipped:[]}
  for(const employee of employees){
   if((employee.hireDate&&employee.hireDate>=monthEnd)||(employee.terminationDate&&employee.terminationDate<monthStart))continue
   try{
    if(await prisma.salary.findFirst({where:{staffId:employee.id,month}})){result.existing++;continue}
    const initial=await calculatePayrollBasis(prisma,employee,month)
    const initialDays={probation:initial.segments.find(s=>s.type==='probation')?.days||0,regular:initial.segments.find(s=>s.type==='regular')?.days||0}
    const preview=await calculateSalary(employee.id,Number(month.slice(5)),Number(month.slice(0,4)),initialDays)
    const created=await prisma.$transaction(async tx=>{
     const staff=await payrollEmployee(tx,employee.id,true)
     if(staff.storeId!==storeId)throw new SalaryConflict('STAFF_STORE_MISMATCH')
     await periodLock(tx,storeId,staff.id,month)
     if(await tx.salary.findFirst({where:{staffId:staff.id,month}}))return false
     const basis=await calculatePayrollBasis(tx,staff,month)
     const days={probation:basis.segments.find(s=>s.type==='probation')?.days||0,regular:basis.segments.find(s=>s.type==='regular')?.days||0}
     const deposits=await normalizeSalaryDeposits(tx,staff.id,month,0,[])
     const adjustments=await normalizeAdjustments(tx,storeId,staff.id,month,0,deposits.deduction,[])
     const finalAmount=basis.amount+preview.overtimePay+adjustments.bonus-adjustments.deduction
     if(finalAmount<0||finalAmount>2000000000)throw new ProbationInputError('INVALID_PAYROLL_AMOUNT')
     const salary=await tx.salary.create({data:{staffId:staff.id,month,baseSalary:basis.amount,overtime:preview.overtimePay,commission:0,bonus:adjustments.bonus,deduction:adjustments.deduction,finalAmount,status:'pending'}})
     await saveDepositPlan(tx,salary,deposits.items)
     await saveAdjustmentPlan(tx,storeId,salary.id,adjustments.plan)
     await savePayrollBasis(tx,salary,staff,days)
     return true
    })
    if(created)result.created++;else result.existing++
   }catch(error:any){result.skipped.push({staffId:employee.id,name:employee.name,reason:error.message})}
  }
  res.json({code:200,data:result})
 }catch(error:any){res.status(500).json({code:500,message:error.message||'Failed to prepare payroll'})}
})

// POST /api/salaries
router.post('/', authenticate, authorize('admin'), validateBody(createSalary), staffStore, async (req: AuthRequest, res) => {
  try {
    const { staffId, month, baseSalary, overtime, commission, bonus, deduction, status } = req.body

    const finalAmount = baseSalary + (overtime || 0) + (commission || 0) + (bonus || 0) - (deduction || 0)

    const salary = await prisma.$transaction(async tx => {
      const staff = await payrollEmployee(tx,staffId,req.body.autoBaseSalary===true)
      const effectiveBaseSalary = (req.body.autoBaseSalary || req.body.workingDays) ? (await calculatePayrollBasis(tx,staff,month,req.body.workingDays)).amount : baseSalary
      // Serialize creation for this employee and month, including across API instances.
      await tx.config.upsert({ where: { storeId_key: { storeId: staff.storeId, key: `salary.period.${staffId}.${month}` } },
        create: { storeId: staff.storeId, key: `salary.period.${staffId}.${month}`, value: month, category: 'staff' }, update: { value: month } })
      if (await tx.salary.findFirst({ where: { staffId, month } })) throw new SalaryConflict('Salary already exists for this employee and month')
      const plan = await normalizeSalaryDeposits(tx, staffId, month, deduction || 0, req.body.depositDeductions)
      const adjustments = await normalizeAdjustments(tx,staff.storeId!,staffId,month,bonus || 0,plan.deduction,req.body.compensationAdjustmentIds)
      const gross = effectiveBaseSalary + (overtime || 0) + (commission || 0) + adjustments.bonus
      if (adjustments.deduction > gross || adjustments.bonus > 2000000000 || adjustments.deduction > 2000000000 || gross-adjustments.deduction > 2000000000) throw new DepositInputError('Deductions exceed gross salary')
      const created = await tx.salary.create({
      data: {
        staffId,
        month,
        baseSalary: effectiveBaseSalary,
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
      await savePayrollBasis(tx,created,staff,req.body.workingDays)
      return created
    })

    res.status(201).json({ code: 201, data: salary })
  } catch (error: any) {
    if (error instanceof ProbationInputError) return res.status(400).json({code:400,message:error.message})
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
      const staff = await payrollEmployee(tx,existing.staffId,req.body.autoBaseSalary===true)
      const effectiveBaseSalary = (req.body.autoBaseSalary || req.body.workingDays) ? (await calculatePayrollBasis(tx,staff,existing.month,req.body.workingDays)).amount : baseSalary
      await periodLock(tx,staff.storeId!,existing.staffId,existing.month)
      if (existing.status !== 'pending') throw new SalaryConflict('Paid salary cannot be edited')
      const plan = await normalizeSalaryDeposits(tx, existing.staffId, existing.month, deduction || 0, req.body.depositDeductions)
      const adjustments = await normalizeAdjustments(tx,staff.storeId!,existing.staffId,existing.month,bonus || 0,plan.deduction,req.body.compensationAdjustmentIds)
      const gross = effectiveBaseSalary + (overtime || 0) + (commission || 0) + adjustments.bonus
      if (adjustments.deduction > gross || adjustments.bonus > 2000000000 || adjustments.deduction > 2000000000 || gross-adjustments.deduction > 2000000000) throw new DepositInputError('Deductions exceed gross salary')
      const updated = await tx.salary.updateMany({
      where: { id: req.params.id, status: 'pending' },
      data: {
        baseSalary: effectiveBaseSalary,
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
      await savePayrollBasis(tx,salary,staff,req.body.workingDays)
      return salary
    })
    res.json({ code: 200, data: salary })
  } catch (error: any) {
    if (error instanceof ProbationInputError) return res.status(400).json({code:400,message:error.message})
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
      const before = await tx.salary.findUniqueOrThrow({where:{id:req.params.id},include:{staff:{select:{storeId:true,name:true}}}})
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
        // Payroll uses whole rupiah while Expense stores hundredths. Record the
        // actual payment in the same transaction, so a failed ledger write
        // cannot leave payroll marked paid without a corresponding expense.
        const amountMinor = salary.finalAmount * 100
        if (!Number.isSafeInteger(amountMinor) || amountMinor > 2147483647) throw new SalaryConflict('SALARY_EXPENSE_AMOUNT_OUT_OF_RANGE')
        if (amountMinor > 0) {
          const expense = await tx.expense.create({data:{storeId:before.staff.storeId!,type:'salary',category:'salary',amount:amountMinor,description:`${before.staff.name} · ${salary.month}`,date:new Date(),referenceType:'salary',referenceId:salary.id}})
          await tx.financeAuditLog.create({data:{storeId:before.staff.storeId!,userId:req.user!.id,action:'create',entityType:'expense',entityId:expense.id,description:`Payroll paid for ${salary.month}`,newValue:JSON.stringify({salaryId:salary.id,amount:amountMinor})}})
        }
      }
      return salary
    })
    res.json({ code: 200, data: salary })
  } catch (error: any) {
    if (error instanceof ProbationInputError) return res.status(400).json({code:400,message:error.message})
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
    if (error instanceof ProbationInputError) return res.status(400).json({code:400,message:error.message})
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
    if (error instanceof ProbationInputError) return res.status(400).json({code:400,message:error.message})
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
    if (error instanceof ProbationInputError) return res.status(400).json({code:400,message:error.message})
    if (error instanceof SalaryAdjustmentError) return res.status(409).json({code:409,message:error.message})
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    if (error instanceof SalaryConflict) return res.status(409).json({ code: 409, message: error.message })
    console.error('Calculate salary error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to calculate salary' })
  }
})

export { router as salaryRouter }
