"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoryRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = __importDefault(require("../config/database"));
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../utils/validation");
const router = (0, express_1.Router)();
exports.categoryRouter = router;
const createCategorySchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    name: zod_1.z.string().min(1).max(50),
    code: zod_1.z.string().optional(), // 3-letter prefix like "MILK", "TEA"
    sortOrder: zod_1.z.number().int().optional().default(0)
});
// GET /api/categories
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const { storeId } = req.query;
        const where = {};
        if (storeId)
            where.storeId = storeId;
        else if (req.user.role === 'staff' || req.user.role === 'cashier') {
            where.storeId = req.user.storeId;
        }
        const categories = await database_1.default.category.findMany({
            where,
            orderBy: { sortOrder: 'asc' },
            include: {
                _count: { select: { products: true } }
            }
        });
        res.json({
            code: 200,
            data: categories.map(c => ({
                ...c,
                productCount: c._count.products,
                _count: undefined
            })),
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get categories' });
    }
});
// POST /api/categories
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), (0, validation_1.validateBody)(createCategorySchema), async (req, res) => {
    try {
        const { storeId, name, code, sortOrder } = req.body;
        // Auto-generate code if not provided
        let finalCode = code;
        if (!finalCode && name) {
            finalCode = generateCategoryCode(name);
        }
        const category = await database_1.default.category.create({
            data: { storeId, name, code: finalCode, sortOrder }
        });
        res.status(201).json({
            code: 201,
            message: 'Category created',
            data: category,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create category' });
    }
});
// PUT /api/categories/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, code, sortOrder } = req.body;
        // Auto-generate code if name changed but code not provided
        let finalCode = code;
        if (!finalCode && name) {
            finalCode = generateCategoryCode(name);
        }
        const category = await database_1.default.category.update({
            where: { id },
            data: { name, code: finalCode, sortOrder }
        });
        res.json({
            code: 200,
            message: 'Category updated',
            data: category,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update category' });
    }
});
// DELETE /api/categories/:id
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        // Check if there are any active products in this category
        const activeProductCount = await database_1.default.product.count({
            where: { categoryId: id, deletedAt: null }
        });
        if (activeProductCount > 0) {
            return res.status(400).json({
                code: 400,
                message: `Cannot delete category: ${activeProductCount} active product(s) still reference this category`
            });
        }
        // Delete soft-deleted products first (they still reference the category)
        await database_1.default.product.deleteMany({
            where: { categoryId: id, deletedAt: { not: null } }
        });
        await database_1.default.category.delete({ where: { id } });
        res.json({
            code: 200,
            message: 'Category deleted',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({
            code: 500,
            message: error.message || 'Failed to delete category'
        });
    }
});
// Generate 3-letter category code from name
function generateCategoryCode(name) {
    const cleanName = name
        .replace(/\s*(茶|奶茶|饮料|饮品|冰沙|奶茶店|泡泡茶|咖啡|咖啡店)\s*$/gi, '')
        .replace(/[奶茶饮料冰沙咖啡]s*$/gi, '')
        .trim();
    if (cleanName.length === 0)
        return 'CAT';
    const words = cleanName.split(/\s+/);
    if (words.length >= 2) {
        return words.slice(0, 3).map(w => w[0].toUpperCase()).join('');
    }
    return cleanName.substring(0, 3).toUpperCase().padEnd(3, 'X');
}
//# sourceMappingURL=category.js.map