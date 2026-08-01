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
exports.tierBenefitRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../utils/validation");
const TierBenefitService = __importStar(require("../services/TierBenefitService"));
const router = (0, express_1.Router)();
exports.tierBenefitRouter = router;
const createTierBenefitSchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    level: zod_1.z.enum(['bronze', 'silver', 'gold', 'diamond']),
    pointsRate: zod_1.z.number().positive().optional().default(1.0),
    birthdayReward: zod_1.z.any().optional(),
    discountPercent: zod_1.z.number().optional().default(0),
    freeDeliveryThreshold: zod_1.z.number().int().optional().default(0),
    pointsToUpgrade: zod_1.z.number().int().optional(),
    description: zod_1.z.string().optional()
});
// GET /api/marketing/tier-benefits
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.query.storeId || req.user.storeId;
        const benefits = await TierBenefitService.getTierBenefits(storeId);
        res.json({ code: 200, data: { list: benefits }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get tier benefits error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get tier benefits' });
    }
});
// POST /api/marketing/tier-benefits
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), (0, validation_1.validateBody)(createTierBenefitSchema), async (req, res) => {
    try {
        const benefit = await TierBenefitService.upsertTierBenefit(req.body);
        res.status(201).json({ code: 201, message: 'Tier benefit saved', data: benefit, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Create tier benefit error:', error);
        res.status(500).json({ code: 500, message: 'Failed to save tier benefit' });
    }
});
// GET /api/marketing/tier-benefits/:id
router.get('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const benefit = await TierBenefitService.getTierBenefitById(req.params.id);
        if (!benefit)
            return res.status(404).json({ code: 404, message: 'Tier benefit not found' });
        res.json({ code: 200, data: benefit, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get tier benefit error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get tier benefit' });
    }
});
// PUT /api/marketing/tier-benefits/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const benefit = await TierBenefitService.updateTierBenefit(req.params.id, req.body);
        res.json({ code: 200, message: 'Tier benefit updated', data: benefit, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Update tier benefit error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update tier benefit' });
    }
});
// DELETE /api/marketing/tier-benefits/:id
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        await TierBenefitService.deleteTierBenefit(req.params.id);
        res.json({ code: 200, message: 'Tier benefit deleted', timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Delete tier benefit error:', error);
        res.status(500).json({ code: 500, message: 'Failed to delete tier benefit' });
    }
});
// GET /api/marketing/tier-benefits/level/:level
router.get('/level/:level', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.query.storeId || req.user.storeId;
        const benefit = await TierBenefitService.getTierBenefitByLevel(storeId, req.params.level);
        res.json({ code: 200, data: benefit, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get tier benefit by level error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get tier benefit' });
    }
});
//# sourceMappingURL=tierBenefit.js.map