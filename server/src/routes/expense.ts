import { createPosExpense, getPosExpenses, legacyPosExpenseBody } from '../services/PosExpenseService'
import { parseDateBoundary } from '../utils/businessDate'
import {validExpenseDate} from '../services/RecurringExpenseService'
import prisma from '../config/database'
import {z} from 'zod'
import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import * as ExpenseService from '../services/ExpenseService'
import * as FinanceAuditService from '../services/FinanceAuditService'
import * as XLSX from 'xlsx'

const router = Router()

const recurringSchema=z.array(z.object({id:z.string().min(1).max(100),storeId:z.string().optional(),name:z.string().min(1).max(200),category:z.string().max(100),amount:z.number().int().positive(),frequency:z.enum(['daily','weekly','monthly']),nextDueDate:z.string().refine(validExpenseDate),active:z.boolean()})).max(500)
router.get('/recurring',authenticate,authorize('admin','manager'),async(req:AuthRequest,res,next)=>{try{const record=await prisma.config.findUnique({where:{storeId_key:{storeId:req.user!.storeId,key:'expenses.recurring'}}});res.json({code:200,data:record?JSON.parse(record.value):{revision:0,items:[]}})}catch(e){next(e)}})
router.put('/recurring',authenticate,authorize('admin','manager'),async(req:AuthRequest,res,next)=>{try{
 const items=recurringSchema.parse(req.body.items).map(item=>({...item,storeId:req.user!.storeId})),revision=z.number().int().min(0).parse(req.body.revision)
 if(new Set(items.map(i=>i.id)).size!==items.length)return res.status(400).json({code:400,message:'DUPLICATE_RECURRING_ID'})
 const data=await prisma.$transaction(async tx=>{await tx.store.update({where:{id:req.user!.storeId},data:{updatedAt:new Date()}});const where={storeId_key:{storeId:req.user!.storeId,key:'expenses.recurring'}};const current=await tx.config.findUnique({where});const value=current?JSON.parse(current.value):{revision:0,items:[]};if(value.revision!==revision)throw Error('RECURRING_REVISION_CONFLICT');const next={revision:revision+1,items};await tx.config.upsert({where,create:{storeId:req.user!.storeId,key:'expenses.recurring',category:'expense',value:JSON.stringify(next)},update:{value:JSON.stringify(next)}});return next})
 res.json({code:200,data})
}catch(e){if((e as Error).message==='RECURRING_REVISION_CONFLICT')return res.status(409).json({code:409,message:'RECURRING_REVISION_CONFLICT'});next(e)}})

// POS is a personal daily purchase reimbursement entry; other financial expenses stay in Admin.
router.get('/pos', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res, next) => {
  try { res.json({ code: 200, data: { list: await getPosExpenses(req.user!) } }) } catch (e) { next(e) }
})
router.post('/pos', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res, next) => {
  try { res.status(201).json({ code: 201, data: await createPosExpense(req.user!, req.body) }) }
  catch (e) { if (e instanceof z.ZodError || e instanceof ExpenseService.ExpenseInputError || String((e as Error).message).startsWith('POS_EXPENSE_')) return res.status((e as Error).message === 'POS_EXPENSE_REQUEST_CONFLICT' ? 409 : 400).json({ code: 400, message: (e as Error).message }); next(e) }
})

// ==================== EXPENSE CATEGORIES (Customizable) ====================

// GET /api/expenses/categories
router.get('/categories', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const categories = await ExpenseService.getExpenseCategories(storeId)
    res.json({ code: 200, data: { list: categories } })
  } catch (error: any) {
    console.error('Get expense categories error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get expense categories' })
  }
})

// PUT /api/expenses/categories
router.put('/categories', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { categories } = req.body
    await ExpenseService.saveExpenseCategories(storeId, categories)
    res.json({ code: 200, message: 'Expense categories updated' })
  } catch (error: any) {
    console.error('Save expense categories error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to save expense categories' })
  }
})


// GET /api/expenses
router.get('/', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    if (req.user!.role === 'cashier') return res.json({ code: 200, data: { list: await getPosExpenses(req.user!) } })
    const { type, category, startDate, endDate } = req.query

    const expenses = await ExpenseService.getExpenses(storeId, {
      type: type as string,
      category: category as string,
      startDate: startDate ? parseDateBoundary(startDate as string) : undefined,
      endDate: endDate ? parseDateBoundary(endDate as string, true) : undefined
    })

    res.json({ code: 200, data: { list: expenses } })
  } catch (error: any) {
    console.error('Get expenses error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get expenses' })
  }
})

// GET /api/expenses/summary
router.get('/summary', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const days = parseInt(req.query.days as string) || 30
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const endDate = new Date()

    const summary = await ExpenseService.getExpenseSummary(storeId, startDate, endDate)
    res.json({ code: 200, data: summary })
  } catch (error: any) {
    console.error('Get expense summary error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get expense summary' })
  }
})

// POST /api/expenses
router.post('/', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    if (req.user!.role === 'cashier') { const expense = await createPosExpense(req.user!, legacyPosExpenseBody(req.body)); return res.status(201).json({ code: 201, data: expense }) }
    const expense = await ExpenseService.createExpense({ ...req.body, storeId: req.user!.storeId })
    await FinanceAuditService.createAuditLog({
      storeId: req.user!.storeId,
      userId: req.user!.id,
      action: 'create',
      entityType: 'expense',
      entityId: expense.id,
      description: `Created expense: ${req.body.category} - ${req.body.amount}`,
      newValue: req.body
    })
    res.status(201).json({ code: 201, data: expense })
  } catch (error: any) {
    console.error('Create expense error:', error)
    const status = error instanceof ExpenseService.ExpenseInputError ? 400 : 500
    res.status(status).json({ code: status, message: error.message || 'Failed to create expense' })
  }
})

// PUT /api/expenses/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const oldExpense = await ExpenseService.getExpenseById(req.params.id)
    if (!oldExpense || oldExpense.storeId !== req.user!.storeId) return res.status(404).json({code:404,message:'Expense not found'})
    const expense = await ExpenseService.updateExpense(req.params.id, req.body)
    await FinanceAuditService.createAuditLog({
      storeId: req.user!.storeId,
      userId: req.user!.id,
      action: 'update',
      entityType: 'expense',
      entityId: req.params.id,
      description: `Updated expense: ${req.body.category || oldExpense?.category}`,
      oldValue: oldExpense || undefined,
      newValue: req.body
    })
    res.json({ code: 200, data: expense })
  } catch (error: any) {
    console.error('Update expense error:', error)
    const status = error instanceof ExpenseService.ExpenseInputError ? 400 : 500
    res.status(status).json({ code: status, message: error.message || 'Failed to update expense' })
  }
})

// POST /api/expenses/bulk - Bulk import from CSV/Excel
router.post('/bulk', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { expenses } = req.body as { expenses: Array<{
      type: string
      category: string
      amount: number
      description: string
      date: string
    }> }

    if (!expenses || !Array.isArray(expenses)) {
      res.status(400).json({ code: 400, message: 'Invalid expenses data' })
      return
    }

    const data = expenses.map(e => ({
      storeId,
      type: e.type || 'operational',
      category: e.category,
      amount: e.amount,
      description: e.description || '',
      date: e.date
    }))

    const result = await ExpenseService.createExpensesBulk(data)
    res.status(201).json({ code: 201, data: { count: result.count } })
  } catch (error: any) {
    console.error('Bulk import error:', error)
    const status = error instanceof ExpenseService.ExpenseInputError ? 400 : 500
    res.status(status).json({ code: status, message: error.message || 'Failed to import expenses' })
  }
})

// GET /api/expenses/export - Export expenses to Excel
router.get('/export', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { startDate, endDate, category } = req.query

    const options: any = {}
    if (startDate) options.startDate = parseDateBoundary(startDate as string)
    if (endDate) options.endDate = parseDateBoundary(endDate as string, true)
    if (category) options.category = category as string

    const expenses = await ExpenseService.getExpenses(storeId, options)

    // Create workbook
    const wb = XLSX.utils.book_new()
    const data = expenses.map((e: any) => ({
      Date: new Date(e.date).toLocaleDateString('id-ID'),
      Category: e.category,
      Type: e.type,
      Amount: e.amount / 100,
      Description: e.description || ''
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename=expenses.xlsx')
    res.send(buffer)
  } catch (error: any) {
    console.error('Export expenses error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to export expenses' })
  }
})

// DELETE /api/expenses/:id
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const expense = await ExpenseService.getExpenseById(req.params.id)
    if (!expense || expense.storeId !== req.user!.storeId) return res.status(404).json({code:404,message:'Expense not found'})
    await ExpenseService.deleteExpense(req.params.id)
    if (expense) {
      await FinanceAuditService.createAuditLog({
        storeId: req.user!.storeId,
        userId: req.user!.id,
        action: 'delete',
        entityType: 'expense',
        entityId: req.params.id,
        description: `Deleted expense: ${expense.category} - ${expense.amount}`,
        oldValue: expense as any
      })
    }
    res.json({ code: 200, message: 'Expense deleted' })
  } catch (error: any) {
    console.error('Delete expense error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to delete expense' })
  }
})

export { router as expenseRouter }
