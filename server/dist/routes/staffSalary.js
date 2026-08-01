"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.staffSalaryRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const StaffService_1 = require("../services/StaffService");
const router = (0, express_1.Router)();
exports.staffSalaryRouter = router;
// GET /api/staff-salary/calculate/:staffId
router.get('/calculate/:staffId', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { staffId } = req.params;
        const { month, year } = req.query;
        if (!month || !year) {
            return res.status(400).json({ code: 400, message: 'Month and year are required' });
        }
        const result = await (0, StaffService_1.calculateSalary)(staffId, parseInt(month), parseInt(year));
        res.json({ code: 200, data: result, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Calculate salary error:', error);
        res.status(500).json({ code: 500, message: 'Failed to calculate salary' });
    }
});
//# sourceMappingURL=staffSalary.js.map