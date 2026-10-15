import prisma from '../config/database'
import { requireResourceStore } from '../middlewares/resourceStore'
import { validateBody } from '../utils/validation'
import { z } from 'zod'
import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import {
  DepositInputError,
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
const ruleScope = requireResourceStore(req => prisma.depositRule.findUnique({ where: { id: req.params.id }, select: { storeId: true } }))
const depositScope = requireResourceStore(req => prisma.staffDeposit.findUnique({ where: { id: req.params.staffDepositId || req.body.staffDepositId }, select: { storeId: true } }))
const staffScope = requireResourceStore(req => prisma.staff.findUnique({ where: { id: req.params.staffId }, select: { storeId: true } }))
const amount = z.number().int().positive().max(2000000000)
const ruleSchema = z.object({ name: z.string().trim().min(1), depositAmount: amount, deductionType: z.enum(['one_time', 'monthly', 'limited']), monthlyAmount: amount.nullable().optional(), maxDeductions: z.number().int().positive().nullable().optional(), refundType: z.enum(['full', 'prorata', 'forfeited', 'none']), prorataPercent: z.number().min(0).max(1).nullable().optional(), isActive: z.boolean().optional() })
const validRule = ruleSchema.refine(rule => rule.deductionType === 'one_time' || !!rule.monthlyAmount, 'Monthly amount is required').refine(rule => rule.deductionType !== 'limited' || !!rule.maxDeductions, 'Maximum deductions is required').refine(rule => rule.refundType !== 'prorata' || rule.prorataPercent != null, 'Refund percentage is required')
const depositSchema = z.object({ staffId: z.string().min(1), depositRuleId: z.string().min(1), totalAmount: amount })
const deductionSchema = z.object({ staffDepositId: z.string().min(1), amount, requestId: z.string().uuid().optional(), salaryId: z.string().min(1).optional(), note: z.string().optional() })
const refundSchema = z.object({ staffDepositId: z.string().min(1), amount, requestId: z.string().uuid().optional(), reason: z.string().trim().min(1), note: z.string().optional() })

// GET /api/deposit/rules - Get deposit rules for store
router.get('/rules', authenticate, async (req: AuthRequest, res) => {
  try {
    const rules = await getDepositRules(req.user!.storeId)
    res.json({ code: 200, data: rules, timestamp: new Date().toISOString() })
  } catch (error) {
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Get deposit rules error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get deposit rules' })
  }
})

// POST /api/deposit/rules - Create deposit rule
router.post('/rules', authenticate, authorize('admin', 'manager'), validateBody(validRule), async (req: AuthRequest, res) => {
  try {
    const result = await createDepositRule({
      ...req.body,
      storeId: req.user!.storeId
    })
    res.status(201).json({ code: 201, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Create deposit rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create deposit rule' })
  }
})

// PUT /api/deposit/rules/:id - Update deposit rule
router.put('/rules/:id', authenticate, authorize('admin', 'manager'), ruleScope, validateBody(ruleSchema.partial()), async (req: AuthRequest, res) => {
  try {
    const result = await updateDepositRule(req.params.id, req.body)
    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Update deposit rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update deposit rule' })
  }
})

// DELETE /api/deposit/rules/:id - Delete deposit rule
router.delete('/rules/:id', authenticate, authorize('admin', 'manager'), ruleScope, async (req: AuthRequest, res) => {
  try {
    await deleteDepositRule(req.params.id)
    res.json({ code: 200, message: 'Deposit rule deleted', timestamp: new Date().toISOString() })
  } catch (error) {
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Delete deposit rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete deposit rule' })
  }
})

// GET /api/deposit/staff/my - Get current staff's deposit record
router.get('/staff/my', authenticate, async (req: AuthRequest, res) => {
  try {
    const deposit = await getStaffDeposit(req.user!.staffId)
    res.json({ code: 200, data: deposit, timestamp: new Date().toISOString() })
  } catch (error) {
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Get my deposit error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get deposit' })
  }
})

// GET /api/deposit/staff/:staffId - Get staff deposit record
router.get('/staff/:staffId', authenticate, authorize('admin', 'manager'), staffScope, async (req: AuthRequest, res) => {
  try {
    const deposit = await getStaffDeposit(req.params.staffId)
    res.json({ code: 200, data: deposit, timestamp: new Date().toISOString() })
  } catch (error) {
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Get staff deposit error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get staff deposit' })
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
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Get my deposit logs error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get deposit logs' })
  }
})

// GET /api/deposit/staff-list - Get all staff deposits for store
router.get('/staff-list', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const deposits = await getAllStaffDeposits(req.user!.storeId)
    res.json({ code: 200, data: deposits, timestamp: new Date().toISOString() })
  } catch (error) {
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Get all staff deposits error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get staff deposits' })
  }
})

// POST /api/deposit/staff - Create staff deposit record
router.post('/staff', authenticate, authorize('admin', 'manager'), validateBody(depositSchema), async (req: AuthRequest, res) => {
  try {
    const result = await createStaffDeposit({
      ...req.body,
      storeId: req.user!.storeId
    })
    res.status(201).json({ code: 201, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Create staff deposit error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create staff deposit' })
  }
})

// GET /api/deposit/calculate/:staffDepositId - Calculate monthly deduction
router.get('/calculate/:staffDepositId', authenticate, authorize('admin', 'manager'), depositScope, async (req: AuthRequest, res) => {
  try {
    const staffDeposit = await prisma.staffDeposit.findUnique({ where: { id: req.params.staffDepositId }, include: { depositRule: true } })
    if (!staffDeposit) {
      return res.status(404).json({ code: 404, message: 'Staff deposit not found' })
    }
    const result = await calculateMonthlyDeduction(staffDeposit)
    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Calculate deduction error:', error)
    res.status(500).json({ code: 500, message: 'Failed to calculate deduction' })
  }
})

// POST /api/deposit/deduct - Record deduction
router.post('/deduct', authenticate, authorize('admin', 'manager'), validateBody(deductionSchema), depositScope, async (req: AuthRequest, res) => {
  try {
    const result = await recordDepositDeduction(req.body)
    res.status(201).json({ code: 201, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Record deduction error:', error)
    res.status(500).json({ code: 500, message: 'Failed to record deduction' })
  }
})

// GET /api/deposit/refund/calculate/:staffDepositId - Calculate refund amount
router.get('/refund/calculate/:staffDepositId', authenticate, authorize('admin', 'manager'), depositScope, async (req: AuthRequest, res) => {
  try {
    const staffDeposit = await prisma.staffDeposit.findUnique({ where: { id: req.params.staffDepositId }, include: { depositRule: true } })
    if (!staffDeposit) {
      return res.status(404).json({ code: 404, message: 'Staff deposit not found' })
    }
    const result = await calculateRefundAmount(staffDeposit, new Date())
    res.json({ code: 200, data: { refundAmount: result }, timestamp: new Date().toISOString() })
  } catch (error) {
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Calculate refund error:', error)
    res.status(500).json({ code: 500, message: 'Failed to calculate refund' })
  }
})

// POST /api/deposit/refund - Process refund
router.post('/refund', authenticate, authorize('admin', 'manager'), validateBody(refundSchema), depositScope, async (req: AuthRequest, res) => {
  try {
    const result = await processRefund({
      ...req.body,
      processedBy: req.user!.id
    })
    res.status(201).json({ code: 201, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    if (error instanceof DepositInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Process refund error:', error)
    res.status(500).json({ code: 500, message: 'Failed to process refund' })
  }
})

export { router as depositRouter }
router.put('/staff/:id',authenticate,authorize('admin'),validateBody(z.object({totalAmount:amount,reason:z.string().trim().min(1).max(1000),expectedVersion:z.string().datetime()})),async(req:AuthRequest,res)=>{
 try{const result=await prisma.$transaction(async tx=>{
  const old=await tx.staffDeposit.findFirst({where:{id:req.params.id,storeId:req.user!.storeId}});if(!old)throw new Error('DEPOSIT_NOT_FOUND');
  if(req.body.totalAmount<old.deductedAmount||old.refundedAmount>0)throw new Error('DEPOSIT_AMOUNT_BELOW_PAID_OR_REFUNDED');
  const changed=await tx.staffDeposit.updateMany({where:{id:old.id,updatedAt:new Date(req.body.expectedVersion)},data:{totalAmount:req.body.totalAmount,status:req.body.totalAmount===old.deductedAmount?'completed':'active'}});if(changed.count!==1)throw new Error('DEPOSIT_CHANGED_REFRESH');
  await tx.financeAuditLog.create({data:{storeId:old.storeId,userId:req.user!.id,action:'update',entityType:'deposit',entityId:old.id,description:req.body.reason,oldValue:JSON.stringify(old),newValue:JSON.stringify(req.body)}});return tx.staffDeposit.findUniqueOrThrow({where:{id:old.id}})
 });res.json({code:200,data:result})}catch(e:any){res.status(409).json({code:409,message:e.message})}
});
router.post('/staff/:id/reverse/:kind/:logId',authenticate,authorize('admin'),validateBody(z.object({reason:z.string().trim().min(1).max(1000)})),async(req:AuthRequest,res)=>{
 try{const result=await prisma.$transaction(async tx=>{
  const old=await tx.staffDeposit.findFirst({where:{id:req.params.id,storeId:req.user!.storeId}});if(!old||!['deduction','refund'].includes(req.params.kind))throw new Error('DEPOSIT_NOT_FOUND');
  const locked=await tx.staffDeposit.updateMany({where:{id:old.id,updatedAt:old.updatedAt},data:{updatedAt:new Date()}});if(locked.count!==1)throw new Error('DEPOSIT_CHANGED_REFRESH');
  const key=`deposit.reversal.${req.params.kind}.${req.params.logId}`;
  if(await tx.config.findUnique({where:{storeId_key:{storeId:old.storeId,key}}}))throw new Error('DEPOSIT_LOG_ALREADY_REVERSED');
  const isDeduct=req.params.kind==='deduction',log:any=isDeduct?await tx.staffDepositDeduction.findFirst({where:{id:req.params.logId,staffDepositId:old.id}}):await tx.staffDepositRefund.findFirst({where:{id:req.params.logId,staffDepositId:old.id}});
  if(!log||log.amount<=0)throw new Error('DEPOSIT_LOG_NOT_REVERSIBLE');
  // Salary deductions are reconciled by payroll; never silently change paid salaries.
  if(log.salaryId)throw new Error('SALARY_LINKED_DEDUCTION_USE_PAYROLL_CORRECTION');
  if(isDeduct&&old.deductedAmount-log.amount<old.refundedAmount)throw new Error('DEDUCTION_ALREADY_REFUNDED');
  const update=isDeduct?{deductedAmount:old.deductedAmount-log.amount,deductionCount:Math.max(0,old.deductionCount-1)}:{refundedAmount:old.refundedAmount-log.amount};
  if(!isDeduct&&update.refundedAmount!<0)throw new Error('REFUND_BALANCE_INVALID');
  if(isDeduct)await tx.staffDepositDeduction.create({data:{staffDepositId:old.id,amount:-log.amount,note:`[REVERSAL:${log.id}] ${req.body.reason}`}});
  else await tx.staffDepositRefund.create({data:{staffDepositId:old.id,amount:-log.amount,reason:'correction',processedBy:req.user!.id,note:`[REVERSAL:${log.id}] ${req.body.reason}`}});
  await tx.config.create({data:{storeId:old.storeId,key,category:'staff',value:JSON.stringify({actor:req.user!.id,reason:req.body.reason})}});
  const refunded=isDeduct?old.refundedAmount:update.refundedAmount!,deducted=isDeduct?update.deductedAmount!:old.deductedAmount;
  const result=await tx.staffDeposit.update({where:{id:old.id},data:{...update,status:refunded>0&&refunded===deducted?'refunded':deducted>=old.totalAmount?'completed':'active',endDate:null}});
  await tx.financeAuditLog.create({data:{storeId:old.storeId,userId:req.user!.id,action:'update',entityType:'deposit',entityId:old.id,description:req.body.reason,oldValue:JSON.stringify(old),newValue:JSON.stringify({result,reversedLogId:log.id})}});return result
 });res.json({code:200,data:result})}catch(e:any){res.status(409).json({code:409,message:e.message})}
});
