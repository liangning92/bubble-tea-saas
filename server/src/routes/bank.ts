import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import * as BankService from '../services/BankService'

const router = Router()

// GET /api/bank/accounts
router.get('/accounts', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const accounts = await BankService.getBankAccounts(storeId)
    res.json({ code: 200, data: { list: accounts } })
  } catch (error: any) {
    console.error('Get accounts error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get accounts' })
  }
})

// GET /api/bank/accounts/:id
router.get('/accounts/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const account = await BankService.getBankAccount(req.params.id)
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

// POST /api/bank/accounts
router.post('/accounts', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const account = await BankService.createBankAccount(req.body)
    res.status(201).json({ code: 201, data: account })
  } catch (error: any) {
    console.error('Create account error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to create account' })
  }
})

// PUT /api/bank/accounts/:id
router.put('/accounts/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const account = await BankService.updateBankAccount(req.params.id, req.body)
    res.json({ code: 200, data: account })
  } catch (error: any) {
    console.error('Update account error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to update account' })
  }
})

// DELETE /api/bank/accounts/:id
router.delete('/accounts/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    await BankService.deleteBankAccount(req.params.id)
    res.json({ code: 200, message: 'Account deleted' })
  } catch (error: any) {
    console.error('Delete account error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to delete account' })
  }
})

// GET /api/bank/transactions
router.get('/transactions', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { bankAccountId, type, startDate, endDate } = req.query

    const transactions = await BankService.getBankTransactions(storeId, {
      bankAccountId: bankAccountId as string,
      type: type as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined
    })

    res.json({ code: 200, data: { list: transactions } })
  } catch (error: any) {
    console.error('Get transactions error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get transactions' })
  }
})

// POST /api/bank/transactions
router.post('/transactions', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const transaction = await BankService.createBankTransaction(req.body)
    res.status(201).json({ code: 201, data: transaction })
  } catch (error: any) {
    console.error('Create transaction error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to create transaction' })
  }
})

// DELETE /api/bank/transactions/:id
router.delete('/transactions/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    await BankService.deleteBankTransaction(req.params.id)
    res.json({ code: 200, message: 'Transaction deleted' })
  } catch (error: any) {
    console.error('Delete transaction error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to delete transaction' })
  }
})

export { router as bankRouter }