"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addonRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = __importDefault(require("../config/database"));
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../utils/validation");
const router = (0, express_1.Router)();
exports.addonRouter = router;
const createAddonSchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    name: zod_1.z.string().min(1).max(50),
    price: zod_1.z.number().int().optional().default(0),
    priceAdjustment: zod_1.z.number().int().optional().default(0),
    isFree: zod_1.z.boolean().optional().default(false)
});
const updateAddonSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(50).optional(),
    price: zod_1.z.number().int().optional(),
    priceAdjustment: zod_1.z.number().int().optional(),
    isFree: zod_1.z.boolean().optional()
});
// GET /api/addons
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const { storeId } = req.query;
        const where = {};
        if (storeId)
            where.storeId = storeId;
        else if (req.user.role === 'staff' || req.user.role === 'cashier') {
            where.storeId = req.user.storeId;
        }
        const addons = await database_1.default.addon.findMany({
            where,
            orderBy: { createdAt: 'asc' }
        });
        res.json({
            code: 200,
            data: addons,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get addons error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get addons' });
    }
});
// GET /api/addons/:id
router.get('/:id', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const addon = await database_1.default.addon.findUnique({
            where: { id },
            include: {
                productAddons: {
                    include: {
                        product: { select: { id: true, name: true } },
                        spec: { select: { id: true, name: true } }
                    }
                }
            }
        });
        if (!addon) {
            return res.status(404).json({ code: 404, message: 'Addon not found' });
        }
        res.json({
            code: 200,
            data: addon,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get addon error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get addon' });
    }
});
// POST /api/addons
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), (0, validation_1.validateBody)(createAddonSchema), async (req, res) => {
    try {
        const { storeId, name, price, priceAdjustment, isFree } = req.body;
        const addon = await database_1.default.addon.create({
            data: {
                storeId,
                name,
                price,
                priceAdjustment,
                isFree
            }
        });
        res.status(201).json({
            code: 201,
            message: 'Addon created',
            data: addon,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Create addon error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create addon' });
    }
});
// PUT /api/addons/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, price, priceAdjustment, isFree } = req.body;
        const addon = await database_1.default.addon.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(price !== undefined && { price }),
                ...(priceAdjustment !== undefined && { priceAdjustment }),
                ...(isFree !== undefined && { isFree })
            }
        });
        res.json({
            code: 200,
            message: 'Addon updated',
            data: addon,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Update addon error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update addon' });
    }
});
// DELETE /api/addons/:id
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        // Delete related ProductAddon records first
        await database_1.default.productAddon.deleteMany({ where: { addonId: id } });
        await database_1.default.addon.delete({ where: { id } });
        res.json({
            code: 200,
            message: 'Addon deleted',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Delete addon error:', error);
        res.status(500).json({ code: 500, message: 'Failed to delete addon' });
    }
});
//# sourceMappingURL=addon.js.map