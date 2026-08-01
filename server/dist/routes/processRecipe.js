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
exports.processRecipeRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../utils/validation");
const ProcessRecipeService = __importStar(require("../services/ProcessRecipeService"));
const router = (0, express_1.Router)();
exports.processRecipeRouter = router;
const createSchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    name: zod_1.z.string().min(1),
    outputUnit: zod_1.z.string(),
    inputs: zod_1.z.array(zod_1.z.object({
        inventoryId: zod_1.z.string(),
        quantity: zod_1.z.number().positive()
    })),
    outputs: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        quantity: zod_1.z.number().positive()
    }))
});
const executeSchema = zod_1.z.object({
    multiplier: zod_1.z.number().positive().optional().default(1)
});
// GET /api/process-recipes
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const recipes = await ProcessRecipeService.getRecipes(storeId);
        res.json({ code: 200, data: { list: recipes }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get recipes error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get recipes' });
    }
});
// GET /api/process-recipes/:id
router.get('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const recipe = await ProcessRecipeService.getRecipeById(req.params.id);
        if (!recipe)
            return res.status(404).json({ code: 404, message: 'Recipe not found' });
        res.json({ code: 200, data: recipe, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get recipe error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get recipe' });
    }
});
// POST /api/process-recipes
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), (0, validation_1.validateBody)(createSchema), async (req, res) => {
    try {
        const recipe = await ProcessRecipeService.createRecipe(req.body);
        res.status(201).json({ code: 201, message: 'Recipe created', data: recipe, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Create recipe error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to create recipe' });
    }
});
// POST /api/process-recipes/:id/execute
router.post('/:id/execute', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager', 'staff'), (0, validation_1.validateBody)(executeSchema), async (req, res) => {
    try {
        const result = await ProcessRecipeService.executeRecipe(req.params.id, req.body.multiplier);
        res.json({ code: 200, message: 'Recipe executed', data: result, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Execute recipe error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to execute recipe' });
    }
});
// PUT /api/process-recipes/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const recipe = await ProcessRecipeService.updateRecipe(req.params.id, req.body);
        res.json({ code: 200, message: 'Recipe updated', data: recipe, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Update recipe error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to update recipe' });
    }
});
// DELETE /api/process-recipes/:id
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        await ProcessRecipeService.deleteRecipe(req.params.id);
        res.json({ code: 200, message: 'Recipe deleted', timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Delete recipe error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to delete recipe' });
    }
});
//# sourceMappingURL=processRecipe.js.map