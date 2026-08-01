"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const zod_1 = require("zod");
const MessageService_1 = require("../services/MessageService");
const router = (0, express_1.Router)();
exports.messageRouter = router;
// Validation schemas
const channelCreateSchema = zod_1.z.object({
    type: zod_1.z.enum(['sms', 'whatsapp', 'push', 'email']),
    name: zod_1.z.string().min(1),
    provider: zod_1.z.string().min(1),
    config: zod_1.z.record(zod_1.z.string()),
    enabled: zod_1.z.boolean().optional(),
    priority: zod_1.z.number().optional(),
    costPerSms: zod_1.z.number().optional(),
    dailyLimit: zod_1.z.number().optional(),
    monthlyLimit: zod_1.z.number().optional(),
    isDefault: zod_1.z.boolean().optional()
});
const templateCreateSchema = zod_1.z.object({
    type: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    channel: zod_1.z.enum(['sms', 'whatsapp', 'push', 'all']),
    subject: zod_1.z.string().optional(),
    body: zod_1.z.string().min(1),
    variables: zod_1.z.array(zod_1.z.string()).optional(),
    enabled: zod_1.z.boolean().optional(),
    isDefault: zod_1.z.boolean().optional(),
    sortOrder: zod_1.z.number().optional()
});
// ============================================
// Channel Routes
// ============================================
// GET /api/messages/channels - Get all channels
router.get('/channels', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const channels = await (0, MessageService_1.getMessageChannels)(storeId);
        res.json({ code: 200, data: { list: channels }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get channels error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get channels' });
    }
});
// POST /api/messages/channels - Create channel
router.post('/channels', auth_1.authenticate, (0, auth_1.authorize)('admin'), validateBody(channelCreateSchema), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const channel = await (0, MessageService_1.createMessageChannel)({ ...req.body, storeId });
        res.status(201).json({ code: 201, message: 'Channel created', data: channel, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Create channel error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create channel' });
    }
});
// PUT /api/messages/channels/:id - Update channel
router.put('/channels/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const channel = await (0, MessageService_1.updateMessageChannel)(id, req.body);
        res.json({ code: 200, message: 'Channel updated', data: channel, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Update channel error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update channel' });
    }
});
// DELETE /api/messages/channels/:id - Delete channel
router.delete('/channels/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await (0, MessageService_1.deleteMessageChannel)(id);
        res.json({ code: 200, message: 'Channel deleted', timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Delete channel error:', error);
        res.status(500).json({ code: 500, message: 'Failed to delete channel' });
    }
});
// ============================================
// Template Routes
// ============================================
// GET /api/messages/templates - Get all templates
router.get('/templates', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { type } = req.query;
        const templates = await (0, MessageService_1.getMessageTemplates)(storeId, type);
        res.json({ code: 200, data: { list: templates }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get templates error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get templates' });
    }
});
// POST /api/messages/templates - Create template
router.post('/templates', auth_1.authenticate, (0, auth_1.authorize)('admin'), validateBody(templateCreateSchema), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const template = await (0, MessageService_1.createMessageTemplate)({ ...req.body, storeId });
        res.status(201).json({ code: 201, message: 'Template created', data: template, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Create template error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create template' });
    }
});
// PUT /api/messages/templates/:id - Update template
router.put('/templates/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const template = await (0, MessageService_1.updateMessageTemplate)(id, req.body);
        res.json({ code: 200, message: 'Template updated', data: template, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Update template error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update template' });
    }
});
// DELETE /api/messages/templates/:id - Delete template
router.delete('/templates/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await (0, MessageService_1.deleteMessageTemplate)(id);
        res.json({ code: 200, message: 'Template deleted', timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ code: 500, message: 'Failed to delete template' });
    }
});
// POST /api/messages/templates/init - Initialize default templates
router.post('/templates/init', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const templates = await (0, MessageService_1.createDefaultTemplates)(storeId);
        res.json({ code: 200, message: `Created ${templates.length} default templates`, data: { count: templates.length }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Init templates error:', error);
        res.status(500).json({ code: 500, message: 'Failed to initialize templates' });
    }
});
// GET /api/messages/variables - Get available variables
router.get('/variables', auth_1.authenticate, async (req, res) => {
    try {
        const variables = (0, MessageService_1.getAvailableVariables)();
        res.json({ code: 200, data: { variables }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get variables error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get variables' });
    }
});
// ============================================
// Log Routes
// ============================================
// GET /api/messages/logs - Get message logs
router.get('/logs', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { memberId, type, channelType, status, startDate, endDate, limit, offset } = req.query;
        const result = await (0, MessageService_1.getMessageLogs)(storeId, {
            memberId: memberId,
            type: type,
            channelType: channelType,
            status: status,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            limit: limit ? Number(limit) : 50,
            offset: offset ? Number(offset) : 0
        });
        res.json({
            code: 200,
            data: {
                list: result.logs,
                total: result.total,
                pagination: {
                    limit: limit ? Number(limit) : 50,
                    offset: offset ? Number(offset) : 0,
                    total: result.total
                }
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get logs error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get logs' });
    }
});
// GET /api/messages/stats - Get message statistics
router.get('/stats', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const stats = await (0, MessageService_1.getMessageStats)(storeId);
        res.json({ code: 200, data: stats, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get stats' });
    }
});
// ============================================
// Send Message Routes
// ============================================
// POST /api/messages/send - Send message to member
router.post('/send', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { memberId, type, channelType, templateId, customBody } = req.body;
        if (!memberId) {
            return res.status(400).json({ code: 400, message: 'memberId is required' });
        }
        const result = await (0, MessageService_1.sendMessageToMember)(storeId, memberId, type || 'custom', channelType || 'sms', templateId, customBody);
        if (result.success) {
            res.json({ code: 200, message: 'Message sent', data: { messageId: result.messageId }, timestamp: new Date().toISOString() });
        }
        else {
            res.status(400).json({ code: 400, message: result.error || 'Failed to send message' });
        }
    }
    catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ code: 500, message: 'Failed to send message' });
    }
});
// POST /api/messages/broadcast - Broadcast message to multiple members
router.post('/broadcast', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { memberIds, type, channelType, templateId, customBody } = req.body;
        if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
            return res.status(400).json({ code: 400, message: 'memberIds array is required' });
        }
        const result = await (0, MessageService_1.broadcastMessage)(storeId, memberIds, type || 'custom', channelType || 'sms', templateId, customBody);
        res.json({
            code: 200,
            message: `Sent ${result.success} messages, ${result.failed} failed`,
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Broadcast error:', error);
        res.status(500).json({ code: 500, message: 'Failed to broadcast message' });
    }
});
// Helper function for body validation
function validateBody(schema) {
    return (req, res, next) => {
        try {
            req.body = schema.parse(req.body);
            next();
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                res.status(400).json({
                    code: 400,
                    message: 'Validation failed',
                    errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
                });
            }
            else {
                next(error);
            }
        }
    };
}
//# sourceMappingURL=message.js.map