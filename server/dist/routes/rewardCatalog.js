"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rewardCatalogRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const RewardCatalogService_1 = require("../services/RewardCatalogService");
const router = (0, express_1.Router)();
exports.rewardCatalogRouter = router;
// GET /api/rewards - Get all rewards for store
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { active } = req.query;
        const rewards = active === 'true'
            ? await (0, RewardCatalogService_1.getActiveRewards)(storeId)
            : await (0, RewardCatalogService_1.getRewards)(storeId);
        res.json({ code: 200, data: { list: rewards }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get rewards error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get rewards' });
    }
});
// GET /api/rewards/:id - Get single reward
router.get('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const reward = await (0, RewardCatalogService_1.getReward)(req.params.id);
        if (!reward) {
            return res.status(404).json({ code: 404, message: 'Reward not found' });
        }
        res.json({ code: 200, data: reward, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get reward error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get reward' });
    }
});
// POST /api/rewards - Create reward
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const reward = await (0, RewardCatalogService_1.createReward)({ ...req.body, storeId });
        res.status(201).json({ code: 201, message: 'Reward created', data: reward, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Create reward error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create reward' });
    }
});
// PUT /api/rewards/:id - Update reward
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const reward = await (0, RewardCatalogService_1.updateReward)(req.params.id, req.body);
        res.json({ code: 200, message: 'Reward updated', data: reward, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Update reward error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update reward' });
    }
});
// DELETE /api/rewards/:id - Delete reward
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        await (0, RewardCatalogService_1.deleteReward)(req.params.id);
        res.json({ code: 200, message: 'Reward deleted', timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Delete reward error:', error);
        res.status(500).json({ code: 500, message: 'Failed to delete reward' });
    }
});
// POST /api/rewards/:id/redeem - Redeem reward for member
router.post('/:id/redeem', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { memberId, orderId } = req.body;
        if (!memberId) {
            return res.status(400).json({ code: 400, message: 'memberId is required' });
        }
        const memberReward = await (0, RewardCatalogService_1.redeemReward)(memberId, req.params.id, orderId);
        res.json({ code: 200, message: 'Reward redeemed', data: memberReward, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Redeem reward error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Failed to redeem reward' });
    }
});
// GET /api/rewards/member/:memberId - Get member's rewards
router.get('/member/:memberId', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { unused } = req.query;
        const rewards = unused === 'true'
            ? await (0, RewardCatalogService_1.getMemberUnusedRewards)(req.params.memberId)
            : await (0, RewardCatalogService_1.getMemberRewards)(req.params.memberId);
        res.json({ code: 200, data: { list: rewards }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get member rewards error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get member rewards' });
    }
});
// PUT /api/rewards/use/:id - Mark reward as used
router.put('/use/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { orderId } = req.body;
        const memberReward = await (0, RewardCatalogService_1.useReward)(req.params.id, orderId);
        res.json({ code: 200, message: 'Reward marked as used', data: memberReward, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Use reward error:', error);
        res.status(500).json({ code: 500, message: 'Failed to mark reward as used' });
    }
});
//# sourceMappingURL=rewardCatalog.js.map