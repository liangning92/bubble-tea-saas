import { unpaidLeavePlan } from '../services/SalaryLeavePlan'
import { readPayslip, buildPayslip, retainPayslip } from '../services/SalaryPayslipService'
import { randomUUID } from 'crypto'
import { payrollCorrectionSchema, saveCorrection, payrollMonthClosed } from '../services/PayrollCorrectionService'
import { isPayrollEmployee } from '../services/StaffIdentityService'
import { isLegacyAutomaticBasis, workingDaysSchema, savePayrollBasis, savedPayrollBasis, calculatePayrollBasis, getEnrollment, businessDate, ProbationInputError } from '../services/ProbationService'
import { adjustmentPlan, savedAdjustmentPlan, saveAdjustmentPlan, normalizeAdjustments, changeSalaryAdjustment, listSalaryAdjustments, voucherStatuses, periodLock, SalaryAdjustmentError } from '../services/SalaryAdjustmentService'
import { normalizeSalaryDeposits, salaryDepositPlan, salaryRefundPlan, sameDepositPlan } from '../services/SalaryDepositPlan'
import { requireResourceStore } from '../middlewares/resourceStore'
import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { calculateSalary } from '../services/StaffService'
import { DepositInputError, recordDepositDeduction, processRefund } from '../services/DepositService'
import prisma from '../config/database'
import { z } from 'zod'
import { validateBody } from '../utils/validation'

const router = Router()
const money = z.number().int().min(0).max(2000000000)
const depositPlan = z.array(z.object({ staffDepositId: z.string().min(1), amountMinor: z.number().int().positive().max(2000000000) })).max(20).default([])
const salaryFields = z.object({ correction:payrollCorrectionSchema.optional(),includedLeaveDeduction:money.default(0),includedAttendanceDeduction:money.default(0),daysSource:z.enum(['estimate','manual','attendance']).optional(),manualCorrection:z.boolean().optional(), manualBaseSalary:z.boolean().optional(), workingDays: workingDaysSchema.optional(), autoBaseSalary: z.boolean().optional(), baseSalary: money, overtime: money.default(0), commission: money.default(0), bonus: money.default(0), deduction: money.default(0), status: z.literal('pending').optional(), depositDeductions: depositPlan, compensationAdjustmentIds:z.array(z.string().uuid()).max(200).default([]) }).refine(s => s.baseSalary + s.overtime + s.commission + s.bonus >= s.deduction, 'Deductions exceed gross salary')
const createSalary = z.object({ correction:payrollCorrectionSchema.optional(),includedLeaveDeduction:money.default(0),includedAttendanceDeduction:money.default(0),daysSource:z.enum(['estimate','manual','attendance']).optional(),manualCorrection:z.boolean().optional(), manualBaseSalary:z.boolean().optional(), workingDays: workingDaysSchema.optional(), autoBaseSalary: z.boolean().optional(), staffId: z.string().min(1), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), baseSalary: money, overtime: money.default(0), commission: money.default(0), bonus: money.default(0), deduction: money.default(0), status: z.literal('pending').optional(), depositDeductions: depositPlan, compensationAdjustmentIds:z.array(z.string().uuid()).max(200).default([]) }).refine(s => s.baseSalary + s.overtime + s.commission + s.bonus >= s.deduction, 'Deductions exceed gross salary')
async function payrollEmployee(tx:any, staffId:string, automatic:boolean) {
  if(automatic && !process.env.DATABASE_URL?.startsWith('file:')) await tx.$queryRaw`SELECT id FROM "Staff" WHERE id=${staffId} FOR UPDATE`
  const staff=await tx.staff.findUniqueOrThrow({where:{id:staffId}})
  if(!await isPayrollEmployee(tx,staff))throw new ProbationInputError('ACCOUNT_NOT_EMPLOYEE')
  return staff
}
class SalaryConflict extends Error {}
const payrollReviewReason=(error:any)=>{const code=error?.message;return ['STAFF_BASE_SALARY_REQUIRED','DEDUCTIONS_EXCEED_PAY','PAYROLL_AMOUNT_OUT_OF_RANGE','PROBATION_HIRE_DATE_REQUIRED','PROBATION_SALARY_EXCEEDS_FORMAL_SALARY','CONFIRMATION_BEFORE_HIRE','INVALID_PROBATION_DATE','SALARY_DEPOSIT_RECALC_REQUIRED','SALARY_ADJUSTMENTS_RECALC_REQUIRED','TERMINATION_BEFORE_HIRE'].includes(code)?code:'PAYROLL_CALCULATION_FAILED'}
const reviewKey=(staffId:string,month:string)=>`salary.review.${staffId}.${month}`
async function review(db:any,storeId:string,staffId:string,month:string){const row=await db.config.findUnique({where:{storeId_key:{storeId,key:reviewKey(staffId,month)}}});return row?JSON.parse(row.value):null}
async function setReview(db:any,storeId:string,staffId:string,month:string,value:any){const key=reviewKey(staffId,month);await db.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,category:'staff',value:JSON.stringify(value)},update:{value:JSON.stringify(value)}})}
async function saveDepositPlan(tx: any, salary: any, items: Array<{ staffDepositId: string; amountMinor: number }>) {
  if (new Set(items.map(item => item.staffDepositId)).size !== items.length || items.reduce((sum, item) => sum + item.amountMinor, 0) > salary.deduction * 100) throw new DepositInputError('Deposit plan exceeds payroll deductions')
  for (const item of items) {
    const deposit = await tx.staffDeposit.findUnique({ where: { id: item.staffDepositId } })
    if (!deposit || deposit.staffId !== salary.staffId || deposit.status !== 'active' || item.amountMinor > deposit.totalAmount - deposit.deductedAmount) throw new DepositInputError('Invalid deposit deduction plan')
  }
  const staff = await tx.staff.findUniqueOrThrow({ where: { id: salary.staffId }, select: { storeId: true } })
  await tx.config.upsert({ where: { storeId_key: { storeId: staff.storeId, key: `salary.depositPlan.${salary.id}` } }, create: { storeId: staff.storeId, key: `salary.depositPlan.${salary.id}`, category: 'staff', value: JSON.stringify(items) }, update: { value: JSON.stringify(items) } })
}
async function correctionMetadata(tx:any,staff:any,month:string,body:any,actorId:string) {
  if(body.manualCorrection && body.daysSource!=='estimate' && !body.workingDays)throw new ProbationInputError('ACTUAL_WORKING_DAYS_REQUIRED')
  const correction=body.correction?await saveCorrection(tx,staff.storeId,staff.id,month,body.correction,actorId):null
  let unpaidLeave:any=null
  if(body.daysSource==='estimate'){
    const basis=await calculatePayrollBasis(tx,staff,month,undefined,'estimate')
    const leaves=await tx.leave.findMany({where:{staffId:staff.id,status:'approved',startDate:{lt:new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)-7*3600000)},endDate:{gte:new Date(month+'-01T00:00:00+07:00')}}})
    const types=leaves.length?await tx.leaveType.findMany({where:{storeId:staff.storeId,paidLeave:false},select:{code:true}}):[]
    const override=body.correction?.unpaidProbationDays!==undefined||body.correction?.unpaidRegularDays!==undefined?{probation:body.correction?.unpaidProbationDays||0,regular:body.correction?.unpaidRegularDays||0}:undefined
    unpaidLeave=unpaidLeavePlan(staff,await getEnrollment(tx,staff),basis,leaves,new Set(['unpaid',...types.map((t:any)=>t.code)]),override)
  }
  const depositRefund=await salaryRefundPlan(staff.id,month,tx)
  return {workingDays:body.workingDays||null,daysSource:body.daysSource||'manual',correction,unpaidLeave,depositRefund,settlementVersion:1,terminationDate:staff.terminationDate?businessDate(staff.terminationDate):null,confirmed:body.manualCorrection===true,actorId,reason:body.correction?.reason||'Payroll confirmed',recordedAt:new Date().toISOString()}
}
async function saveCorrectionAudit(tx:any,staff:any,salary:any,previous:any,metadata:any) {
  const key=`salary.correctionAudit.${salary.id}.${randomUUID()}`
  const value=JSON.stringify({previous,salary,metadata,basis:await savedPayrollBasis(tx,staff.storeId,salary.id)})
  await tx.config.create({data:{storeId:staff.storeId,key,category:'staff',value}})
}
function correctedDeduction(deduction:number,body:any,metadata:any) {
  if(deduction<body.includedAttendanceDeduction)throw new ProbationInputError('INVALID_ATTENDANCE_DEDUCTION')
  if(deduction<(body.includedAttendanceDeduction||0)+(body.includedLeaveDeduction||0))throw new ProbationInputError('INVALID_ATTENDANCE_DEDUCTION')
  return (metadata.correction ? deduction-(body.includedAttendanceDeduction||0)+metadata.correction.lateDeduction+metadata.correction.otherAttendanceDeduction : deduction)-(body.includedLeaveDeduction||0)+(metadata.unpaidLeave?.deduction||0)
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
      const basis=await savedPayrollBasis(prisma,storeId!,salary.id)
      let reestimate:any=null
      if(salary.status==='pending'&&(isLegacyAutomaticBasis(basis)||basis?.daysSource==='estimate'&&!basis?.confirmed)){try{const preview=await calculateSalary(salary.staffId,Number(salary.month.slice(5)),Number(salary.month.slice(0,4)));reestimate={baseSalary:preview.baseSalary,overtime:preview.overtimePay,commission:salary.commission,bonus:preview.bonuses,deduction:preview.deductions,finalAmount:preview.totalSalary+salary.commission,depositRefundAmount:preview.depositRefundAmount,settlementAmount:preview.settlementAmount+salary.commission,originalFinalAmount:salary.finalAmount,difference:preview.totalSalary+salary.commission-salary.finalAmount,payrollBasis:preview.payrollBasis,compensationRewards:preview.compensation.rewards,compensationPenalties:preview.compensation.penalties,compensationAdjustmentIds:preview.compensationAdjustmentIds,compensationItems:preview.compensation.items,depositDeductions:preview.depositDeductions,depositDeductionAmount:preview.depositDeductions.reduce((sum,item)=>sum+item.amount,0)}}catch{reestimate={error:'PAYROLL_CALCULATION_FAILED'}}}
      const refund=salary.status==='paid'?basis?.depositRefund||{amount:0,items:[]}:await salaryRefundPlan(salary.staffId,salary.month)
      const snapshot=salary.status==='paid'?await readPayslip(prisma,storeId!,salary.id):null
      return {...salary,staff:snapshot?{...salary.staff,name:snapshot.staffName,employeeNumber:snapshot.employeeNumber}:salary.staff,depositRefundAmount:refund.amount,settlementAmount:salary.finalAmount+refund.amount,reestimate, payrollReview:salary.status==='pending'?await review(prisma,storeId!,salary.staffId,salary.month):null, payrollBasis:basis, compensationRewards:compensation.rewards,compensationPenalties:compensation.penalties,compensationItems:compensation.items,compensationAdjustmentIds:compensation.items.map((i:any)=>i.id),depositDeductionAmount:saved.reduce((sum:number,i:any)=>sum+Math.round(i.amountMinor/100),0), depositDeductions:saved, depositNeedsReview:!sameDepositPlan(saved,expected), expectedDepositAmount:expected.reduce((sum: number,item: any)=>sum+Math.round(item.amountMinor/100),0)}
    }))
    if(req.query.includeUnrecorded==='true'){
      if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new ProbationInputError('INVALID_SALARY_PERIOD')
      const recorded=await prisma.salary.findMany({where:{staff:{storeId},month},select:{staffId:true}})
      const ids=new Set(recorded.map(s=>s.staffId))
      const monthStart=new Date(month+'-01T00:00:00+07:00'),monthEnd=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)-7*3600000)
      const employees=await prisma.staff.findMany({where:{storeId,...(staffId?{id:String(staffId)}:{}),OR:[{status:'active'},{status:'resigned',terminationDate:{gte:monthStart}}]},include:{user:{select:{id:true,phone:true,role:true}}},orderBy:{employeeNumber:'asc'}})
      if(!status || status==='unrecorded')for(const staff of employees){
        if(!await isPayrollEmployee(prisma,staff)||ids.has(staff.id)||(staff.hireDate&&staff.hireDate>=monthEnd)||(staff.terminationDate&&staff.terminationDate<monthStart))continue
        let calculation:any=null,calculationError=null
        try{calculation=await calculateSalary(staff.id,Number(month.slice(5)),Number(month.slice(0,4)))}catch(error:any){calculationError=payrollReviewReason(error)}
        const payrollReview=await review(prisma,storeId!,staff.id,month)|| (calculationError?{reason:calculationError}:calculation?.totalSalary<0?{reason:'DEDUCTIONS_EXCEED_PAY'}:null)
        list.push({id:'unrecorded:'+staff.id,staffId:staff.id,month,staff,status:'unrecorded',depositRefundAmount:calculation?.depositRefundAmount||0,settlementAmount:calculation?.settlementAmount||0,baseSalary:calculation?.baseSalary||0,overtime:calculation?.overtimePay||0,commission:0,bonus:calculation?.bonuses||0,deduction:calculation?.deductions||0,finalAmount:calculation?.totalSalary||0,payrollBasis:calculation?.payrollBasis||null,compensationRewards:calculation?.compensation?.rewards||0,compensationPenalties:calculation?.compensation?.penalties||0,compensationItems:calculation?.compensation?.items||[],compensationAdjustmentIds:calculation?.compensationAdjustmentIds||[],depositDeductions:calculation?.depositDeductions||[],depositDeductionAmount:(calculation?.depositDeductions||[]).reduce((sum:number,item:any)=>sum+item.amount,0),payrollReview,calculationError} as any)
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

// Estimates are read-only. Confirmation is an explicit create/update operation.
router.post('/prepare-month', authenticate, authorize('admin','manager'), validateBody(z.object({month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)})), async(req:AuthRequest,res)=>{
  res.json({code:200,data:{created:0,updated:0,existing:0,skipped:[],estimateOnly:true}})
})

// POST /api/salaries
router.post('/', authenticate, authorize('admin'), validateBody(createSalary), staffStore, async (req: AuthRequest, res) => {
  try {
    const { staffId, month, baseSalary, overtime, commission, bonus, deduction, status } = req.body

    const finalAmount = baseSalary + (overtime || 0) + (commission || 0) + (bonus || 0) - (deduction || 0)

    const salary = await prisma.$transaction(async tx => {
      const staff = await payrollEmployee(tx,staffId,req.body.autoBaseSalary===true)
      const metadata=await correctionMetadata(tx,staff,month,req.body,req.user!.id)
      const effectiveBaseSalary = !req.body.manualBaseSalary && (req.body.autoBaseSalary || req.body.workingDays) ? (await calculatePayrollBasis(tx,staff,month,req.body.workingDays,req.body.daysSource)).amount : baseSalary
      // Serialize creation for this employee and month, including across API instances.
      await tx.config.upsert({ where: { storeId_key: { storeId: staff.storeId, key: `salary.period.${staffId}.${month}` } },
        create: { storeId: staff.storeId, key: `salary.period.${staffId}.${month}`, value: month, category: 'staff' }, update: { value: month } })
      if (await tx.salary.findFirst({ where: { staffId, month } })) throw new SalaryConflict('Salary already exists for this employee and month')
      const adjustments = await normalizeAdjustments(tx,staff.storeId!,staffId,month,bonus || 0,correctedDeduction(deduction||0,req.body,metadata),req.body.compensationAdjustmentIds)
      const gross = effectiveBaseSalary + (overtime || 0) + (commission || 0) + adjustments.bonus
      const plan = await normalizeSalaryDeposits(tx, staffId, month, adjustments.deduction, req.body.depositDeductions,gross)
      if (plan.deduction > gross || adjustments.bonus > 2000000000 || plan.deduction > 2000000000 || gross-plan.deduction > 2000000000) throw new DepositInputError('Deductions exceed gross salary')
      const created = await tx.salary.create({
      data: {
        staffId,
        month,
        baseSalary: effectiveBaseSalary,
        overtime: overtime || 0,
        commission: commission || 0,
        bonus: adjustments.bonus,
        deduction: plan.deduction,
        finalAmount: gross - plan.deduction,
        status: 'pending'
      }
      })
      await saveDepositPlan(tx, created, plan.items)
      await saveAdjustmentPlan(tx,staff.storeId!,created.id,adjustments.plan)
      await savePayrollBasis(tx,created,staff,req.body.workingDays,req.body.manualCorrection===true,metadata)
      await saveCorrectionAudit(tx,staff,created,null,metadata)
      await setReview(tx,staff.storeId,staff.id,month,null)
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
      const metadata=await correctionMetadata(tx,staff,existing.month,req.body,req.user!.id)
      const effectiveBaseSalary = !req.body.manualBaseSalary && (req.body.autoBaseSalary || req.body.workingDays) ? (await calculatePayrollBasis(tx,staff,existing.month,req.body.workingDays,req.body.daysSource)).amount : baseSalary
      await periodLock(tx,staff.storeId!,existing.staffId,existing.month)
      if (existing.status !== 'pending') throw new SalaryConflict('Paid salary cannot be edited')
      const adjustments = await normalizeAdjustments(tx,staff.storeId!,existing.staffId,existing.month,bonus || 0,correctedDeduction(deduction||0,req.body,metadata),req.body.compensationAdjustmentIds)
      const gross = effectiveBaseSalary + (overtime || 0) + (commission || 0) + adjustments.bonus
      const plan = await normalizeSalaryDeposits(tx, existing.staffId, existing.month, adjustments.deduction, req.body.depositDeductions,gross)
      if (plan.deduction > gross || adjustments.bonus > 2000000000 || plan.deduction > 2000000000 || gross-plan.deduction > 2000000000) throw new DepositInputError('Deductions exceed gross salary')
      const updated = await tx.salary.updateMany({
      where: { id: req.params.id, status: 'pending' },
      data: {
        baseSalary: effectiveBaseSalary,
        overtime: overtime || 0,
        commission: commission || 0,
        bonus: adjustments.bonus,
        deduction: plan.deduction,
        finalAmount: gross - plan.deduction,
        status: 'pending'
      }
      })
      if (updated.count !== 1) throw new SalaryConflict('Paid salary cannot be edited')
      const salary = await tx.salary.findUniqueOrThrow({ where: { id: req.params.id } })
      const previousBasis=await savedPayrollBasis(tx,staff.storeId,salary.id)
      await saveDepositPlan(tx, salary, plan.items)
      await saveAdjustmentPlan(tx,staff.storeId!,salary.id,adjustments.plan)
      await savePayrollBasis(tx,salary,staff,req.body.workingDays,req.body.manualCorrection===true,metadata)
      await saveCorrectionAudit(tx,staff,salary,{...existing,payrollBasis:previousBasis},metadata)
      await setReview(tx,staff.storeId,staff.id,salary.month,null)
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
      const before = await tx.salary.findUniqueOrThrow({where:{id:req.params.id},include:{staff:true}})
      await periodLock(tx,before.staff.storeId!,before.staffId,before.month)
      if(before.status==='pending'&&await review(tx,before.staff.storeId!,before.staffId,before.month))throw new SalaryConflict('SALARY_REVIEW_REQUIRED')
      const basis=await savedPayrollBasis(tx,before.staff.storeId!,before.id)
      if(before.status==='pending'&&(!(payrollMonthClosed(before.month)||(before.staff.terminationDate&&businessDate(before.staff.terminationDate).slice(0,7)===before.month&&businessDate(before.staff.terminationDate)<businessDate(new Date())))||basis?.version!==2||!basis?.confirmed))throw new SalaryConflict('SALARY_CONFIRMATION_REQUIRED')
      if(before.status==='pending'&&basis?.employmentNeedsReview)throw new SalaryConflict('SALARY_EMPLOYMENT_RECALC_REQUIRED')
      if(before.status==='pending'&&basis&&!basis.manualCorrection&&!basis.manualAdjustment&&basis.daysSource!=='manual'){
        const current=await calculateSalary(before.staffId,Number(before.month.slice(5)),Number(before.month.slice(0,4)))
        if(current.totalSalary<0)throw new SalaryConflict('SALARY_REVIEW_REQUIRED')
      }
      const changed = await tx.salary.updateMany({ where: { id: req.params.id, status: 'pending' }, data: { status: 'paid' } })
      const salary = await tx.salary.findUniqueOrThrow({ where: { id: req.params.id } })
      if (changed.count === 1) {
        const staff = await tx.staff.findUniqueOrThrow({ where: { id: salary.staffId }, select: { storeId: true } })
        const saved = await tx.config.findUnique({ where: { storeId_key: { storeId: staff.storeId, key: `salary.depositPlan.${salary.id}` } } })
        const plan = saved ? JSON.parse(saved.value) : []
        const expected = await salaryDepositPlan(salary.staffId, salary.month, tx, salary.baseSalary+salary.overtime+salary.commission+salary.bonus-salary.deduction+plan.reduce((sum:number,i:any)=>sum+Math.round(i.amountMinor/100),0))
        if (!sameDepositPlan(plan, expected)) throw new SalaryConflict('SALARY_DEPOSIT_RECALC_REQUIRED')
        await saveDepositPlan(tx, salary, plan)
        for (const item of plan) await recordDepositDeduction({ staffDepositId: item.staffDepositId, salaryId: salary.id, amount: item.amountMinor, note: `Salary ${salary.month}` }, tx)
        const refund=await salaryRefundPlan(salary.staffId,salary.month,tx)
        if(!sameDepositPlan(basis?.depositRefund?.items||[],refund.items))throw new SalaryConflict('SALARY_DEPOSIT_RECALC_REQUIRED')
        for(const item of refund.items){
          await processRefund({staffDepositId:item.staffDepositId,amount:item.amountMinor,reason:'full',note:`Final payroll ${salary.month}`,processedBy:req.user!.id,requestId:`salary-refund-${salary.id}-${item.staffDepositId}`,fullSettlement:true},tx)
          const expense=await tx.expense.create({data:{storeId:before.staff.storeId,type:'deposit_refund',category:'deposit_refund',amount:item.amountMinor,description:`${before.staff.name} · ${salary.month} · deposit refund`,date:new Date(),referenceType:'salary_deposit_refund',referenceId:salary.id}})
          await tx.financeAuditLog.create({data:{storeId:before.staff.storeId,userId:req.user!.id,action:'create',entityType:'expense',entityId:expense.id,description:'Payroll deposit refund',newValue:JSON.stringify({salaryId:salary.id,amount:item.amountMinor})}})
        }
        await retainPayslip(tx,salary,before.staff,refund)
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

router.get('/:id/payslip',authenticate,authorize('admin','manager'),salaryStore,async(req:AuthRequest,res)=>{
  try{
    const salary=await prisma.salary.findUniqueOrThrow({where:{id:req.params.id},include:{staff:true}})
    if(salary.status!=='paid')return res.status(409).json({code:409,message:'PAID_PAYSLIP_REQUIRED'})
    const snapshot=await readPayslip(prisma,salary.staff.storeId,salary.id)||await buildPayslip(prisma,salary,salary.staff,null)
    res.json({code:200,data:snapshot})
  }catch{res.status(500).json({code:500,message:'Failed to load payslip'})}
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
    const compensation = await adjustmentPlan(req.user!.storeId!,req.params.staffId,req.query.month,prisma,true)
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
