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
exports.referralRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../utils/validation");
const ReferralService = __importStar(require("../services/ReferralService"));
const storeHelper_1 = require("../utils/storeHelper");
const router = (0, express_1.Router)();
exports.referralRouter = router;
const createReferralSchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    startDate: zod_1.z.string(),
    endDate: zod_1.z.string().optional(),
    inviterReward: zod_1.z.object({ type: zod_1.z.string(), value: zod_1.z.number() }),
    rewardeeReward: zod_1.z.object({ type: zod_1.z.string(), value: zod_1.z.number() }),
    minOrderAmount: zod_1.z.number().int().optional().default(0),
    maxUsageCount: zod_1.z.number().int().optional().default(0),
    referralCode: zod_1.z.string().min(3),
    conditions: zod_1.z.any().optional()
});
// GET /api/marketing/referrals
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = (0, storeHelper_1.getStoreId)(req);
        const campaigns = await ReferralService.getReferralCampaigns(storeId);
        res.json({ code: 200, data: { list: campaigns }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get referrals error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get referral campaigns' });
    }
});
// POST /api/marketing/referrals
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), (0, validation_1.validateBody)(createReferralSchema), async (req, res) => {
    try {
        const campaign = await ReferralService.createReferralCampaign({
            ...req.body,
            startDate: new Date(req.body.startDate),
            endDate: req.body.endDate ? new Date(req.body.endDate) : undefined
        });
        res.status(201).json({ code: 201, message: 'Referral campaign created', data: campaign, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Create referral error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create referral campaign' });
    }
});
// GET /api/marketing/referrals/:id
router.get('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const campaign = await ReferralService.getReferralCampaign(req.params.id);
        if (!campaign)
            return res.status(404).json({ code: 404, message: 'Referral campaign not found' });
        res.json({ code: 200, data: campaign, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get referral error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get referral campaign' });
    }
});
// PUT /api/marketing/referrals/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const campaign = await ReferralService.updateReferralCampaign(req.params.id, {
            ...req.body,
            startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
            endDate: req.body.endDate ? new Date(req.body.endDate) : undefined
        });
        res.json({ code: 200, message: 'Referral campaign updated', data: campaign, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Update referral error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update referral campaign' });
    }
});
// DELETE /api/marketing/referrals/:id
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        await ReferralService.deleteReferralCampaign(req.params.id);
        res.json({ code: 200, message: 'Referral campaign deleted', timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Delete referral error:', error);
        res.status(500).json({ code: 500, message: 'Failed to delete referral campaign' });
    }
});
// GET /api/marketing/referrals/:id/stats
router.get('/:id/stats', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const stats = await ReferralService.getReferralStats(req.params.id);
        res.json({ code: 200, data: stats, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get referral stats error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get referral stats' });
    }
});
// POST /api/marketing/referrals/apply - member applies a referral code
router.post('/apply', auth_1.authenticate, async (req, res) => {
    try {
        const { memberId, code } = req.body;
        const result = await ReferralService.applyReferralCode(memberId, code);
        res.json({ code: 200, message: 'Referral code applied', data: result, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Apply referral code error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to apply referral code' });
    }
});
//# sourceMappingURL=referral.js.map