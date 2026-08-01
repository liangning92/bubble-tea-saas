"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.receiptTemplateRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = __importDefault(require("../config/database"));
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../utils/validation");
const router = (0, express_1.Router)();
exports.receiptTemplateRouter = router;
// Schema for receipt block
const receiptBlockSchema = zod_1.z.object({
    id: zod_1.z.string(),
    type: zod_1.z.enum([
        'logo', 'header', 'storeInfo', 'orderInfo', 'items',
        'subtotal', 'tax', 'total', 'paymentInfo',
        'qrCode', 'barcode', 'footer', 'divider', 'customText'
    ]),
    enabled: zod_1.z.boolean(),
    order: zod_1.z.number(),
    style: zod_1.z.object({
        bold: zod_1.z.boolean().optional(),
        fontSize: zod_1.z.enum(['small', 'normal', 'large']).optional(),
        align: zod_1.z.enum(['left', 'center', 'right']).optional()
    }),
    config: zod_1.z.record(zod_1.z.any())
});
// Template content schema
const templateContentSchema = zod_1.z.object({
    version: zod_1.z.number().optional().default(1),
    blocks: zod_1.z.array(receiptBlockSchema)
});
// Receipt template schema
const createReceiptTemplateSchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    name: zod_1.z.string().min(1).max(100),
    content: zod_1.z.string(), // JSON string of template content
    isDefault: zod_1.z.boolean().optional()
});
const updateReceiptTemplateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100).optional(),
    content: zod_1.z.string().optional(),
    isDefault: zod_1.z.boolean().optional()
});
// Helper: validate template content
function validateTemplateContent(content) {
    try {
        const parsed = JSON.parse(content);
        const result = templateContentSchema.safeParse(parsed);
        return result.success;
    }
    catch {
        return false;
    }
}
// GET /api/receipt-templates?storeId=
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const { storeId } = req.query;
        if (!storeId || typeof storeId !== 'string') {
            res.status(400).json({ code: 400, message: 'storeId is required' });
            return;
        }
        const templates = await database_1.default.receiptTemplate.findMany({
            where: { storeId },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
        });
        res.json({
            code: 200,
            data: templates,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('List receipt templates error:', error);
        res.status(500).json({ code: 500, message: 'Failed to list receipt templates' });
    }
});
// GET /api/receipt-templates/default?storeId=
router.get('/default', auth_1.authenticate, async (req, res) => {
    try {
        const { storeId } = req.query;
        if (!storeId || typeof storeId !== 'string') {
            res.status(400).json({ code: 400, message: 'storeId is required' });
            return;
        }
        const template = await database_1.default.receiptTemplate.findFirst({
            where: { storeId, isDefault: true }
        });
        res.json({
            code: 200,
            data: template,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get default receipt template error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get default template' });
    }
});
// GET /api/receipt-templates/:id
router.get('/:id', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const template = await database_1.default.receiptTemplate.findUnique({
            where: { id }
        });
        if (!template) {
            res.status(404).json({ code: 404, message: 'Template not found' });
            return;
        }
        res.json({
            code: 200,
            data: template,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get receipt template error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get template' });
    }
});
// POST /api/receipt-templates
router.post('/', auth_1.authenticate, (0, validation_1.validateBody)(createReceiptTemplateSchema), async (req, res) => {
    try {
        const { storeId, name, content, isDefault } = req.body;
        // Validate template content JSON
        if (!validateTemplateContent(content)) {
            res.status(400).json({ code: 400, message: 'Invalid template content format' });
            return;
        }
        // Check if name already exists for this store
        const existing = await database_1.default.receiptTemplate.findUnique({
            where: { storeId_name: { storeId, name } }
        });
        if (existing) {
            res.status(409).json({ code: 409, message: 'Template name already exists for this store' });
            return;
        }
        // If isDefault=true, unset other defaults first
        if (isDefault) {
            await database_1.default.receiptTemplate.updateMany({
                where: { storeId, isDefault: true },
                data: { isDefault: false }
            });
        }
        const template = await database_1.default.receiptTemplate.create({
            data: { storeId, name, content, isDefault: isDefault ?? false }
        });
        res.json({
            code: 200,
            data: template,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Create receipt template error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create template' });
    }
});
// PUT /api/receipt-templates/:id
router.put('/:id', auth_1.authenticate, (0, validation_1.validateBody)(updateReceiptTemplateSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, content, isDefault } = req.body;
        const existing = await database_1.default.receiptTemplate.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ code: 404, message: 'Template not found' });
            return;
        }
        // Validate template content if provided
        if (content !== undefined && !validateTemplateContent(content)) {
            res.status(400).json({ code: 400, message: 'Invalid template content format' });
            return;
        }
        // Check name uniqueness if name is being changed
        if (name && name !== existing.name) {
            const nameConflict = await database_1.default.receiptTemplate.findUnique({
                where: { storeId_name: { storeId: existing.storeId, name } }
            });
            if (nameConflict) {
                res.status(409).json({ code: 409, message: 'Template name already exists for this store' });
                return;
            }
        }
        // If isDefault=true, unset other defaults first
        if (isDefault) {
            await database_1.default.receiptTemplate.updateMany({
                where: { storeId: existing.storeId, isDefault: true, id: { not: id } },
                data: { isDefault: false }
            });
        }
        const template = await database_1.default.receiptTemplate.update({
            where: { id },
            data: {
                ...(name && { name }),
                ...(content && { content }),
                ...(isDefault !== undefined && { isDefault })
            }
        });
        res.json({
            code: 200,
            data: template,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Update receipt template error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update template' });
    }
});
// PUT /api/receipt-templates/:id/set-default
router.put('/:id/set-default', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await database_1.default.receiptTemplate.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ code: 404, message: 'Template not found' });
            return;
        }
        // Unset all defaults for this store, then set this one
        await database_1.default.$transaction([
            database_1.default.receiptTemplate.updateMany({
                where: { storeId: existing.storeId, isDefault: true },
                data: { isDefault: false }
            }),
            database_1.default.receiptTemplate.update({
                where: { id },
                data: { isDefault: true }
            })
        ]);
        res.json({
            code: 200,
            data: { id, isDefault: true },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Set default receipt template error:', error);
        res.status(500).json({ code: 500, message: 'Failed to set default template' });
    }
});
// DELETE /api/receipt-templates/:id
router.delete('/:id', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await database_1.default.receiptTemplate.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ code: 404, message: 'Template not found' });
            return;
        }
        await database_1.default.receiptTemplate.delete({ where: { id } });
        res.json({
            code: 200,
            data: { id },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Delete receipt template error:', error);
        res.status(500).json({ code: 500, message: 'Failed to delete template' });
    }
});
//# sourceMappingURL=receiptTemplate.js.map