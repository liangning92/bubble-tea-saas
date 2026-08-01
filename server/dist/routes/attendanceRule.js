"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attendanceRuleRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const AttendanceRuleService_1 = require("../services/AttendanceRuleService");
const router = (0, express_1.Router)();
exports.attendanceRuleRouter = router;
// GET /api/attendance-rules - Get attendance rules for store
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const rules = await (0, AttendanceRuleService_1.getAttendanceRules)(req.user.storeId);
        res.json({ code: 200, data: rules, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get attendance rules error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get attendance rules' });
    }
});
// GET /api/attendance-rules/default - Get default rule for store
router.get('/default', auth_1.authenticate, async (req, res) => {
    try {
        const rule = await (0, AttendanceRuleService_1.getDefaultAttendanceRule)(req.user.storeId);
        res.json({ code: 200, data: rule, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get default attendance rule error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get default attendance rule' });
    }
});
// POST /api/attendance-rules - Create attendance rule
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const result = await (0, AttendanceRuleService_1.createAttendanceRule)({
            ...req.body,
            storeId: req.user.storeId
        });
        res.status(201).json({ code: 201, data: result, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Create attendance rule error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create attendance rule' });
    }
});
// PUT /api/attendance-rules/:id - Update attendance rule
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const result = await (0, AttendanceRuleService_1.updateAttendanceRule)(req.params.id, req.body);
        res.json({ code: 200, data: result, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Update attendance rule error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update attendance rule' });
    }
});
// DELETE /api/attendance-rules/:id - Delete attendance rule
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        await (0, AttendanceRuleService_1.deleteAttendanceRule)(req.params.id);
        res.json({ code: 200, message: 'Attendance rule deleted', timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Delete attendance rule error:', error);
        res.status(500).json({ code: 500, message: 'Failed to delete attendance rule' });
    }
});
//# sourceMappingURL=attendanceRule.js.map