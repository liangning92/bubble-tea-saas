"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pointsRuleRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const PointsRuleService_1 = require("../services/PointsRuleService");
const router = (0, express_1.Router)();
exports.pointsRuleRouter = router;
// GET /api/points-rules - Get points rule for store
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const rule = await (0, PointsRuleService_1.getOrCreatePointsRule)(storeId);
        res.json({ code: 200, data: rule, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get points rule error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get points rule' });
    }
});
// PUT /api/points-rules - Update points rule
router.put('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { pointsPerRupiah, minPurchase, birthdayMultiplier, tierMultiplier, isActive } = req.body;
        const rule = await (0, PointsRuleService_1.upsertPointsRule)({
            storeId,
            pointsPerRupiah,
            minPurchase,
            birthdayMultiplier,
            tierMultiplier,
            isActive
        });
        res.json({ code: 200, message: 'Points rule updated', data: rule, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Update points rule error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update points rule' });
    }
});
//# sourceMappingURL=pointsRule.js.map