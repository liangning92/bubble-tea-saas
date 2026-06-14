import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import * as FinanceAccountService from '../services/FinanceAccountService'

const router = Router()

// GET /api/finance/accounts
router.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { type } = req.query

    const accounts = await FinanceAccountService.getAccounts(storeId, type as string)
    res.json({ code: 200, data: { list: accounts } })
  } catch (error: any) {
    console.error('Get accounts error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get accounts' })
  }
})

// POST /api/finance/accounts/seed
router.post('/seed', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const result = await FinanceAccountService.seedDefaultAccounts(storeId)
    res.json({ code: 200, data: result })
  } catch (error: any) {
    console.error('Seed accounts error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to seed accounts' })
  }
})

// GET /api/finance/accounts/:id
router.get('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const account = await FinanceAccountService.getAccount(req.params.id)
    if (!account) {
      res.status(404).json({ code: 404, message: 'Account not found' })
      return
    }
    res.json({ code: 200, data: account })
  } catch (error: any) {
    console.error('Get account error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get account' })
  }
})

// POST /api/finance/accounts
router.post('/', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const account = await FinanceAccountService.createAccount(req.body)
    res.status(201).json({ code: 201, data: account })
  } catch (error: any) {
    console.error('Create account error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to create account' })
  }
})

// PUT /api/finance/accounts/:id
router.put('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const account = await FinanceAccountService.updateAccount(req.params.id, req.body)
    res.json({ code: 200, data: account })
  } catch (error: any) {
    console.error('Update account error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to update account' })
  }
})

// DELETE /api/finance/accounts/:id
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    await FinanceAccountService.deleteAccount(req.params.id)
    res.json({ code: 200, message: 'Account deleted' })
  } catch (error: any) {
    console.error('Delete account error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to delete account' })
  }
})

// POST /api/finance/accounts/transfer - Transfer between accounts
router.post('/transfer', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const transfer = await FinanceAccountService.transfer({
      storeId: req.user!.storeId,
      fromAccountId: req.body.fromAccountId,
      toAccountId: req.body.toAccountId,
      amount: req.body.amount,
      note: req.body.note,
      date: new Date(req.body.date)
    })
    res.status(201).json({ code: 201, data: transfer })
  } catch (error: any) {
    console.error('Transfer error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to transfer' })
  }
})

// GET /api/finance/accounts/transfers - Get transfer history
router.get('/transfers/list', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { fromAccountId, toAccountId, startDate, endDate } = req.query

    const transfers = await FinanceAccountService.getTransfers(storeId, {
      fromAccountId: fromAccountId as string,
      toAccountId: toAccountId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined
    })
    res.json({ code: 200, data: { list: transfers } })
  } catch (error: any) {
    console.error('Get transfers error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get transfers' })
  }
})

export { router as financeAccountRouter }