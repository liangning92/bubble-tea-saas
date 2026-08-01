"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCampaignCategories = getCampaignCategories;
exports.getCampaignCategory = getCampaignCategory;
exports.createCampaignCategory = createCampaignCategory;
exports.updateCampaignCategory = updateCampaignCategory;
exports.deleteCampaignCategory = deleteCampaignCategory;
exports.seedDefaultCategories = seedDefaultCategories;
const database_1 = __importDefault(require("../config/database"));
// Get all categories for a store
async function getCampaignCategories(storeId) {
    return database_1.default.campaignCategory.findMany({
        where: { storeId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }]
    });
}
// Get single category
async function getCampaignCategory(id) {
    return database_1.default.campaignCategory.findUnique({
        where: { id }
    });
}
// Create category
async function createCampaignCategory(data) {
    return database_1.default.campaignCategory.create({
        data: {
            storeId: data.storeId,
            name: data.name,
            icon: data.icon || null,
            color: data.color || null,
            sortOrder: data.sortOrder || 0,
            isBuiltIn: false
        }
    });
}
// Update category
async function updateCampaignCategory(id, data) {
    const updateData = {};
    if (data.name !== undefined)
        updateData.name = data.name;
    if (data.icon !== undefined)
        updateData.icon = data.icon;
    if (data.color !== undefined)
        updateData.color = data.color;
    if (data.sortOrder !== undefined)
        updateData.sortOrder = data.sortOrder;
    return database_1.default.campaignCategory.update({
        where: { id },
        data: updateData
    });
}
// Delete category (only if not built-in)
async function deleteCampaignCategory(id) {
    const category = await database_1.default.campaignCategory.findUnique({
        where: { id }
    });
    if (!category) {
        throw new Error('Category not found');
    }
    if (category.isBuiltIn) {
        throw new Error('Cannot delete built-in category');
    }
    // Check if any campaigns use this category
    const campaignCount = await database_1.default.campaign.count({
        where: { categoryId: id }
    });
    if (campaignCount > 0) {
        throw new Error('Cannot delete category that is used by campaigns');
    }
    return database_1.default.campaignCategory.delete({
        where: { id }
    });
}
// Seed default categories for a store
async function seedDefaultCategories(storeId) {
    const defaults = [
        { name: 'birthday', icon: '🎂', color: '#FF6B6B', isBuiltIn: true, sortOrder: 1 },
        { name: 'reactivation', icon: '🔄', color: '#4ECDC4', isBuiltIn: true, sortOrder: 2 },
        { name: 'loyalty', icon: '⭐', color: '#FFE66D', isBuiltIn: true, sortOrder: 3 },
        { name: 'seasonal', icon: '🌙', color: '#95E1D3', isBuiltIn: true, sortOrder: 4 },
        { name: 'welcome', icon: '🎉', color: '#F38181', isBuiltIn: true, sortOrder: 5 },
        { name: 'points_expiring', icon: '⏰', color: '#AA96DA', isBuiltIn: true, sortOrder: 6 }
    ];
    const created = [];
    for (const d of defaults) {
        const existing = await database_1.default.campaignCategory.findFirst({
            where: { storeId, name: d.name }
        });
        if (!existing) {
            const cat = await database_1.default.campaignCategory.create({
                data: { ...d, storeId }
            });
            created.push(cat);
        }
    }
    return created;
}
//# sourceMappingURL=CampaignCategoryService.js.map