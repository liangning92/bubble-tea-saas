"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.financeReportRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const ReportExportService = __importStar(require("../services/ReportExportService"));
const router = (0, express_1.Router)();
exports.financeReportRouter = router;
// GET /api/finance/reports/download
router.get('/download', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { type, month } = req.query;
        const [y, m] = (month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
        const includeDepreciation = req.query.includeDepreciation === 'true';
        let buffer;
        let filename;
        switch (type) {
            case 'income_statement':
                buffer = await ReportExportService.generateIncomeStatementExcel(storeId, m, y, includeDepreciation);
                filename = `income_statement_${y}-${String(m).padStart(2, '0')}.xlsx`;
                break;
            case 'cash_flow':
                buffer = await ReportExportService.generateCashFlowExcel(storeId, m, y);
                filename = `cash_flow_${y}-${String(m).padStart(2, '0')}.xlsx`;
                break;
            case 'balance_sheet':
                buffer = await ReportExportService.generateBalanceSheetExcel(storeId, m, y);
                filename = `balance_sheet_${y}-${String(m).padStart(2, '0')}.xlsx`;
                break;
            case 'monthly':
                buffer = await ReportExportService.generateMonthlyReportPackage(storeId, m, y);
                filename = `monthly_report_${y}-${String(m).padStart(2, '0')}.xlsx`;
                break;
            default:
                res.status(400).json({ code: 400, message: 'Invalid report type' });
                return;
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    }
    catch (error) {
        console.error('Download report error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to generate report' });
    }
});
// GET /api/finance/reports/tax/download
router.get('/tax/download', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { type, month } = req.query;
        const [y, m] = (month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
        let buffer;
        let filename;
        switch (type) {
            case 'ppn':
                buffer = await ReportExportService.generateTaxReportPPNExcel(storeId, m, y);
                filename = `spt_ppn_${y}-${String(m).padStart(2, '0')}.xlsx`;
                break;
            case 'pph':
                buffer = await ReportExportService.generateTaxReportPPHExcel(storeId, m, y);
                filename = `spt_pph_${y}-${String(m).padStart(2, '0')}.xlsx`;
                break;
            default:
                res.status(400).json({ code: 400, message: 'Invalid tax report type. Use: ppn or pph' });
                return;
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    }
    catch (error) {
        console.error('Download tax report error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to generate tax report' });
    }
});
//# sourceMappingURL=financeReport.js.map