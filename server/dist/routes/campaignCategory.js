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
exports.campaignCategoryRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../utils/validation");
const CampaignCategoryService = __importStar(require("../services/CampaignCategoryService"));
const router = (0, express_1.Router)();
exports.campaignCategoryRouter = router;
const createCategorySchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    name: zod_1.z.string().min(1).max(50),
    icon: zod_1.z.string().optional(),
    color: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    sortOrder: zod_1.z.number().int().optional().default(0)
});
const updateCategorySchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(50).optional(),
    icon: zod_1.z.string().optional(),
    color: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    sortOrder: zod_1.z.number().int().optional()
});
// GET /api/marketing/campaign-categories
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.query.storeId || req.user.storeId;
        const categories = await CampaignCategoryService.getCampaignCategories(storeId);
        res.json({ code: 200, data: { list: categories }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get campaign categories error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get campaign categories' });
    }
});
// GET /api/marketing/campaign-categories/:id
router.get('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const category = await CampaignCategoryService.getCampaignCategory(req.params.id);
        if (!category) {
            return res.status(404).json({ code: 404, message: 'Category not found' });
        }
        res.json({ code: 200, data: category, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get campaign category error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get campaign category' });
    }
});
// POST /api/marketing/campaign-categories
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), (0, validation_1.validateBody)(createCategorySchema), async (req, res) => {
    try {
        const category = await CampaignCategoryService.createCampaignCategory(req.body);
        res.status(201).json({ code: 201, message: 'Category created', data: category, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Create campaign category error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ code: 400, message: 'Category name already exists for this store' });
        }
        res.status(500).json({ code: 500, message: error.message || 'Failed to create campaign category' });
    }
});
// PUT /api/marketing/campaign-categories/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), (0, validation_1.validateBody)(updateCategorySchema), async (req, res) => {
    try {
        const category = await CampaignCategoryService.updateCampaignCategory(req.params.id, req.body);
        res.json({ code: 200, message: 'Category updated', data: category, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Update campaign category error:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ code: 404, message: 'Category not found' });
        }
        res.status(500).json({ code: 500, message: error.message || 'Failed to update campaign category' });
    }
});
// DELETE /api/marketing/campaign-categories/:id
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        await CampaignCategoryService.deleteCampaignCategory(req.params.id);
        res.json({ code: 200, message: 'Category deleted', timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Delete campaign category error:', error);
        if (error.message === 'Category not found') {
            return res.status(404).json({ code: 404, message: error.message });
        }
        if (error.message === 'Cannot delete built-in category') {
            return res.status(400).json({ code: 400, message: error.message });
        }
        if (error.message === 'Cannot delete category that is used by campaigns') {
            return res.status(400).json({ code: 400, message: error.message });
        }
        res.status(500).json({ code: 500, message: error.message || 'Failed to delete campaign category' });
    }
});
// POST /api/marketing/campaign-categories/seed - Seed default categories
router.post('/seed', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const storeId = req.body.storeId || req.user.storeId;
        const created = await CampaignCategoryService.seedDefaultCategories(storeId);
        res.json({ code: 200, message: 'Default categories seeded', data: { created }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Seed campaign categories error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to seed categories' });
    }
});
//# sourceMappingURL=campaignCategory.js.map