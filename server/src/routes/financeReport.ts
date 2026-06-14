import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import * as ReportExportService from '../services/ReportExportService'

const router = Router()

// GET /api/finance/reports/download
router.get('/download', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { type, month } = req.query

    const [y, m] = (month as string || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`).split('-').map(Number)
    const includeDepreciation = req.query.includeDepreciation === 'true'

    let buffer: Buffer
    let filename: string

    switch (type) {
      case 'income_statement':
        buffer = await ReportExportService.generateIncomeStatementExcel(storeId, m, y, includeDepreciation)
        filename = `income_statement_${y}-${String(m).padStart(2, '0')}.xlsx`
        break

      case 'cash_flow':
        buffer = await ReportExportService.generateCashFlowExcel(storeId, m, y)
        filename = `cash_flow_${y}-${String(m).padStart(2, '0')}.xlsx`
        break

      case 'balance_sheet':
        buffer = await ReportExportService.generateBalanceSheetExcel(storeId, m, y)
        filename = `balance_sheet_${y}-${String(m).padStart(2, '0')}.xlsx`
        break

      case 'monthly':
        buffer = await ReportExportService.generateMonthlyReportPackage(storeId, m, y)
        filename = `monthly_report_${y}-${String(m).padStart(2, '0')}.xlsx`
        break

      default:
        res.status(400).json({ code: 400, message: 'Invalid report type' })
        return
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(buffer)
  } catch (error: any) {
    console.error('Download report error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to generate report' })
  }
})

// GET /api/finance/reports/tax/download
router.get('/tax/download', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { type, month } = req.query

    const [y, m] = (month as string || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`).split('-').map(Number)

    let buffer: Buffer
    let filename: string

    switch (type) {
      case 'ppn':
        buffer = await ReportExportService.generateTaxReportPPNExcel(storeId, m, y)
        filename = `spt_ppn_${y}-${String(m).padStart(2, '0')}.xlsx`
        break
      case 'pph':
        buffer = await ReportExportService.generateTaxReportPPHExcel(storeId, m, y)
        filename = `spt_pph_${y}-${String(m).padStart(2, '0')}.xlsx`
        break
      default:
        res.status(400).json({ code: 400, message: 'Invalid tax report type. Use: ppn or pph' })
        return
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(buffer)
  } catch (error: any) {
    console.error('Download tax report error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to generate tax report' })
  }
})

export { router as financeReportRouter }