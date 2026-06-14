import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import * as BudgetService from '../services/BudgetService'

const router = Router()

// GET /api/finance/budgets
router.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { category, period, year, month } = req.query

    const budgets = await BudgetService.getBudgets(storeId, {
      category: category as string,
      period: period as string,
      year: year ? parseInt(year as string) : undefined,
      month: month ? parseInt(month as string) : undefined
    })

    res.json({ code: 200, data: { list: budgets } })
  } catch (error: any) {
    console.error('Get budgets error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get budgets' })
  }
})

// GET /api/finance/budgets/summary
router.get('/summary', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const year = parseInt(req.query.year as string) || new Date().getFullYear()
    const month = req.query.month ? parseInt(req.query.month as string) : undefined

    const summary = await BudgetService.getBudgetSummary(storeId, year, month)
    res.json({ code: 200, data: summary })
  } catch (error: any) {
    console.error('Get budget summary error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get budget summary' })
  }
})

// POST /api/finance/budgets
router.post('/', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const budget = await BudgetService.createBudget(req.body)
    res.status(201).json({ code: 201, data: budget })
  } catch (error: any) {
    console.error('Create budget error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to create budget' })
  }
})

// PUT /api/finance/budgets/:id
router.put('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const budget = await BudgetService.updateBudget(req.params.id, req.body)
    res.json({ code: 200, data: budget })
  } catch (error: any) {
    console.error('Update budget error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to update budget' })
  }
})

// DELETE /api/finance/budgets/:id
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    await BudgetService.deleteBudget(req.params.id)
    res.json({ code: 200, message: 'Budget deleted' })
  } catch (error: any) {
    console.error('Delete budget error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to delete budget' })
  }
})

export { router as financeBudgetRouter }