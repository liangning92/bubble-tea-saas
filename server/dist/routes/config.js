"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = __importDefault(require("../config/database"));
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../utils/validation");
const StaffConfigService_1 = require("../services/StaffConfigService");
const router = (0, express_1.Router)();
exports.configRouter = router;
const configSchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    key: zod_1.z.string(),
    value: zod_1.z.any(),
    category: zod_1.z.enum(['pos', 'inventory', 'staff', 'member', 'notification', 'payment', 'store', 'marketing', 'finance', 'hygiene'])
});
// GET /api/config
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const { storeId, category } = req.query;
        const where = {};
        if (storeId)
            where.storeId = storeId;
        if (category)
            where.category = category;
        const configs = await database_1.default.config.findMany({
            where,
            orderBy: { key: 'asc' }
        });
        // Transform to key-value object
        const result = {};
        configs.forEach(c => {
            try {
                result[c.key] = JSON.parse(c.value);
            }
            catch {
                result[c.key] = c.value;
            }
        });
        res.json({
            code: 200,
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get configs error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get configs' });
    }
});
// ==================== STAFF FEATURE CONFIG ====================
// NOTE: These routes MUST be before /:storeId/:key to avoid being matched by that pattern
// GET /api/config/staff/features
router.get('/staff/features', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const config = await (0, StaffConfigService_1.getStaffConfig)(storeId);
        res.json({
            code: 200,
            data: config,
            defaults: StaffConfigService_1.DEFAULT_STAFF_CONFIG,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get staff features error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get staff features' });
    }
});
// PUT /api/config/staff/features
router.put('/staff/features', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const features = req.body;
        const config = await (0, StaffConfigService_1.saveStaffConfig)(storeId, features);
        res.json({
            code: 200,
            message: 'Staff features updated',
            data: config,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Save staff features error:', error);
        res.status(500).json({ code: 500, message: 'Failed to save staff features' });
    }
});
// GET /api/config/:storeId/:key
router.get('/:storeId/:key', auth_1.authenticate, async (req, res) => {
    try {
        const { storeId, key } = req.params;
        const config = await database_1.default.config.findUnique({
            where: { storeId_key: { storeId, key } }
        });
        if (!config) {
            return res.status(404).json({ code: 404, message: 'Config not found' });
        }
        let value;
        try {
            value = JSON.parse(config.value);
        }
        catch {
            value = config.value;
        }
        res.json({
            code: 200,
            data: { key: config.key, value, category: config.category },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get config error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get config' });
    }
});
// POST /api/config
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), (0, validation_1.validateBody)(configSchema), async (req, res) => {
    try {
        const { storeId, key, value, category } = req.body;
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        const config = await database_1.default.config.upsert({
            where: { storeId_key: { storeId, key } },
            create: { storeId, key, value: valueStr, category },
            update: { value: valueStr, category }
        });
        res.json({
            code: 200,
            message: 'Config saved',
            data: { key: config.key, category: config.category },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Save config error:', error);
        res.status(500).json({ code: 500, message: 'Failed to save config' });
    }
});
// POST /api/config/batch
router.post('/batch', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { storeId, configs } = req.body; // configs: [{key, value, category}]
        await database_1.default.$transaction(configs.map((c) => database_1.default.config.upsert({
            where: { storeId_key: { storeId, key: c.key } },
            create: {
                storeId,
                key: c.key,
                value: typeof c.value === 'string' ? c.value : JSON.stringify(c.value),
                category: c.category
            },
            update: {
                value: typeof c.value === 'string' ? c.value : JSON.stringify(c.value),
                category: c.category
            }
        })));
        res.json({
            code: 200,
            message: 'Configs saved',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Batch save configs error:', error);
        res.status(500).json({ code: 500, message: 'Failed to save configs' });
    }
});
// DELETE /api/config/:storeId/:key
router.delete('/:storeId/:key', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { storeId, key } = req.params;
        await database_1.default.config.delete({
            where: { storeId_key: { storeId, key } }
        });
        res.json({
            code: 200,
            message: 'Config deleted',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Delete config error:', error);
        res.status(500).json({ code: 500, message: 'Failed to delete config' });
    }
});
// Default configs for POS
const defaultPOSConfigs = {
    'pos.default_payment': 'cash',
    'pos.receipt_header': 'YOUME',
    'pos.receipt_footer': 'Thank you!',
    'pos.offline_mode': true,
    'pos.sync_interval': 60,
    'pos.low_stock_threshold': 20,
    'pos.tax_rate': 0.11,
    'pos.shift_start': '09:00',
    'pos.shift_end': '21:00',
    'pos.grid_cols': '4',
    'pos.card_size': 'medium',
    'pos.show_category': true,
    'pos.show_price': true,
    'pos.quick_amounts': { enabled: true, amounts: [10000, 20000, 50000] },
    'pos.shift_settings': { requireReconciliation: false, requireSupervisorConfirm: false, showSummary: true, cashDifferenceLimit: 0 },
    'pos.auto_logout': 30,
    'pos.sound_settings': { keypress: { enabled: true, volume: 80 }, orderComplete: { enabled: true, volume: 100 }, error: { enabled: true, volume: 100 }, newOrder: { enabled: true, volume: 100 } },
    'pos_api_url': '' // POS API URL, set by Admin
};
const defaultMemberConfigs = {
    'member.default_level': '普通',
    'member.points_rate': 1,
    'member.points_per': 10000,
    'member.birthday_bonus': 500,
    'member.upgrade_threshold': 500000
};
const defaultPaymentConfigs = {
    'payment.settings': { defaultMethod: 'cash', minAmount: 0, maxCashAmount: 0, changeEnabled: true },
    'payment.methods': { cash: true, qris: true, gopay: true, ovo: true, dana: true, shopeepay: true, debit: false }
};
// GET /api/config/defaults
router.get('/defaults/:category', auth_1.authenticate, async (req, res) => {
    try {
        const { category } = req.params;
        let defaults = {};
        if (category === 'pos')
            defaults = defaultPOSConfigs;
        else if (category === 'member')
            defaults = defaultMemberConfigs;
        else if (category === 'payment')
            defaults = defaultPaymentConfigs;
        res.json({
            code: 200,
            data: defaults,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get default configs error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get default configs' });
    }
});
//# sourceMappingURL=config.js.map