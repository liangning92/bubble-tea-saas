"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketingChannelRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../utils/validation");
const database_1 = __importDefault(require("../config/database"));
const MarketingChannelService_1 = require("../services/MarketingChannelService");
const router = (0, express_1.Router)();
exports.marketingChannelRouter = router;
const createChannelSchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    name: zod_1.z.string().min(1),
    code: zod_1.z.string().min(2),
    type: zod_1.z.enum(['delivery_platform', 'offline', 'online', 'call', 'corporate']),
    commission: zod_1.z.number().optional().default(0),
    status: zod_1.z.string().optional().default('active'),
    sortOrder: zod_1.z.number().int().optional().default(0)
});
const updateChannelSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    code: zod_1.z.string().min(2).optional(),
    type: zod_1.z.enum(['delivery_platform', 'offline', 'online', 'call', 'corporate']).optional(),
    commission: zod_1.z.number().optional(),
    status: zod_1.z.string().optional(),
    sortOrder: zod_1.z.number().int().optional()
});
// GET /api/marketing/channels
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const dateRange = req.query.startDate && req.query.endDate ? {
            startDate: new Date(req.query.startDate),
            endDate: new Date(req.query.endDate)
        } : undefined;
        // Get channels with statistics
        const channels = await (0, MarketingChannelService_1.getAllMarketingChannelsWithStats)(storeId, dateRange);
        res.json({
            code: 200,
            data: { list: channels },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get marketing channels error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get marketing channels' });
    }
});
// GET /api/marketing/channels/:id
router.get('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const dateRange = req.query.startDate && req.query.endDate ? {
            startDate: new Date(req.query.startDate),
            endDate: new Date(req.query.endDate)
        } : undefined;
        const channel = await (0, MarketingChannelService_1.getMarketingChannelWithStats)(req.params.id, dateRange);
        if (!channel) {
            return res.status(404).json({ code: 404, message: 'Channel not found' });
        }
        res.json({
            code: 200,
            data: channel,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get marketing channel error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get marketing channel' });
    }
});
// GET /api/marketing/channels/:id/members
router.get('/:id/members', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { page = '1', pageSize = '50', status } = req.query;
        const result = await (0, MarketingChannelService_1.getMembersByChannel)(req.params.id, {
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            status: status
        });
        res.json({
            code: 200,
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get channel members error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get channel members' });
    }
});
// GET /api/marketing/channels/attribution
router.get('/stats/attribution', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const dateRange = req.query.startDate && req.query.endDate ? {
            startDate: new Date(req.query.startDate),
            endDate: new Date(req.query.endDate)
        } : undefined;
        const report = await (0, MarketingChannelService_1.getChannelAttributionReport)(storeId, dateRange);
        res.json({
            code: 200,
            data: report,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get attribution report error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get attribution report' });
    }
});
// POST /api/marketing/channels
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), (0, validation_1.validateBody)(createChannelSchema), async (req, res) => {
    try {
        const channel = await database_1.default.marketingChannel.create({
            data: {
                storeId: req.body.storeId,
                name: req.body.name,
                code: req.body.code,
                type: req.body.type,
                commission: req.body.commission || 0,
                status: req.body.status || 'active',
                sortOrder: req.body.sortOrder || 0
            }
        });
        res.status(201).json({
            code: 201,
            message: 'Marketing channel created',
            data: channel,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Create marketing channel error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create marketing channel' });
    }
});
// PUT /api/marketing/channels/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), (0, validation_1.validateBody)(updateChannelSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = {};
        // Only update provided fields
        if (req.body.name !== undefined)
            updateData.name = req.body.name;
        if (req.body.code !== undefined)
            updateData.code = req.body.code;
        if (req.body.type !== undefined)
            updateData.type = req.body.type;
        if (req.body.commission !== undefined) {
            // Validate commission is between 0 and 1 (0% to 100%)
            const commission = parseFloat(req.body.commission);
            if (commission < 0 || commission > 1) {
                return res.status(400).json({ code: 400, message: 'Commission must be between 0 and 1 (0% to 100%)' });
            }
            updateData.commission = commission;
        }
        if (req.body.status !== undefined)
            updateData.status = req.body.status;
        if (req.body.sortOrder !== undefined)
            updateData.sortOrder = req.body.sortOrder;
        const channel = await database_1.default.marketingChannel.update({
            where: { id },
            data: updateData
        });
        res.json({
            code: 200,
            message: 'Marketing channel updated',
            data: channel,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Update marketing channel error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update marketing channel' });
    }
});
// DELETE /api/marketing/channels/:id
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        // Check if channel has associated members
        const memberCount = await database_1.default.memberChannel.count({
            where: { channelId: req.params.id }
        });
        if (memberCount > 0) {
            return res.status(400).json({
                code: 400,
                message: `Cannot delete channel with ${memberCount} associated members. Please reassign members first.`
            });
        }
        await database_1.default.marketingChannel.delete({
            where: { id: req.params.id }
        });
        res.json({
            code: 200,
            message: 'Marketing channel deleted',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Delete marketing channel error:', error);
        res.status(500).json({ code: 500, message: 'Failed to delete marketing channel' });
    }
});
//# sourceMappingURL=marketingChannel.js.map