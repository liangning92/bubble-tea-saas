"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecipes = getRecipes;
exports.getRecipeById = getRecipeById;
exports.createRecipe = createRecipe;
exports.executeRecipe = executeRecipe;
exports.updateRecipe = updateRecipe;
exports.deleteRecipe = deleteRecipe;
const database_1 = __importDefault(require("../config/database"));
// Get all recipes for a store
async function getRecipes(storeId) {
    return database_1.default.processRecipe.findMany({
        where: { storeId },
        include: {
            items: {
                include: {
                    inventory: { select: { id: true, name: true, unit: true, currentStock: true } }
                }
            }
        },
        orderBy: { name: 'asc' }
    });
}
// Get recipe by ID
async function getRecipeById(recipeId) {
    return database_1.default.processRecipe.findUnique({
        where: { id: recipeId },
        include: {
            items: {
                include: {
                    inventory: { select: { id: true, name: true, unit: true, currentStock: true } }
                }
            }
        }
    });
}
// Create recipe
async function createRecipe(data) {
    return database_1.default.processRecipe.create({
        data: {
            storeId: data.storeId,
            name: data.name,
            outputUnit: data.outputUnit,
            items: {
                create: [
                    ...data.inputs.map(i => ({
                        inventoryId: i.inventoryId,
                        quantity: i.quantity,
                        type: 'input'
                    })),
                    ...data.outputs.map(o => ({
                        name: o.name,
                        quantity: o.quantity,
                        type: 'output'
                        // inventoryId 留空，产出不需要关联库存
                    }))
                ]
            }
        },
        include: {
            items: true
        }
    });
}
// Execute recipe (process)
async function executeRecipe(recipeId, multiplier = 1) {
    const recipe = await database_1.default.processRecipe.findUnique({
        where: { id: recipeId },
        include: {
            items: {
                include: { inventory: true }
            }
        }
    });
    if (!recipe)
        throw new Error('Recipe not found');
    const inputs = recipe.items.filter(i => i.type === 'input');
    const outputs = recipe.items.filter(i => i.type === 'output');
    return database_1.default.$transaction(async (tx) => {
        // 计算总投入成本
        let totalInputCost = 0;
        for (const input of inputs) {
            if (!input.inventoryId || !input.inventory)
                continue;
            const inv = input.inventory;
            const deductQty = input.quantity * multiplier;
            const isPerPiece = ['个', '支', '卷', 'pce', '件', '张'].includes((inv.unit || '').toLowerCase());
            const ratio = inv.concentrateRatio || 1;
            // 防止除零
            const safeRatio = ratio === 0 ? 1 : ratio;
            // 计算单位成本
            let unitCost = Number(inv.avgCost || 0);
            if (!isPerPiece) {
                // kg/L：先 ÷1000 转换为 g/ml，再 ÷concentrateRatio
                unitCost = unitCost / 1000 / safeRatio;
            }
            // 个/件等：直接使用，不需要转换
            totalInputCost += deductQty * unitCost;
            // 扣减投入库存
            await tx.inventory.update({
                where: { id: input.inventoryId },
                data: { currentStock: { decrement: deductQty } }
            });
            await tx.stockOutLog.create({
                data: {
                    inventoryId: input.inventoryId,
                    quantity: deductQty,
                    reason: 'process',
                    note: `加工: ${recipe.name}`
                }
            });
        }
        // 计算总产出数量
        let totalOutputQty = 0;
        for (const output of outputs) {
            totalOutputQty += output.quantity * multiplier;
        }
        // 计算产出单位成本 = 总投入成本 / 总产出数量
        const outputUnitCost = totalOutputQty > 0 ? Math.round(totalInputCost / totalOutputQty) : 0;
        // 添加产出到库存（按名称查找或创建）
        for (const output of outputs) {
            const addQty = output.quantity * multiplier;
            const outputName = output.name;
            if (!outputName)
                continue;
            // 查找或创建产出库存
            let outputInv = await tx.inventory.findFirst({
                where: {
                    storeId: recipe.storeId,
                    name: outputName
                }
            });
            if (!outputInv) {
                // 创建新库存并关联配方
                outputInv = await tx.inventory.create({
                    data: {
                        storeId: recipe.storeId,
                        name: outputName,
                        category: '加工产出',
                        type: 'semi_finished',
                        unit: recipe.outputUnit || 'g',
                        currentStock: 0,
                        avgCost: 0,
                        processRecipeId: recipe.id // 关联到配方！
                    }
                });
            }
            // 加权平均计算新均价
            const currentStock = outputInv.currentStock || 0;
            const currentAvgCost = outputInv.avgCost || 0;
            const newTotalStock = currentStock + addQty;
            const newAvgCost = newTotalStock > 0
                ? Math.round((Number(currentStock) * Number(currentAvgCost) + addQty * outputUnitCost) / newTotalStock)
                : outputUnitCost;
            await tx.inventory.update({
                where: { id: outputInv.id },
                data: {
                    currentStock: { increment: addQty },
                    avgCost: newAvgCost
                }
            });
            await tx.stockInLog.create({
                data: {
                    inventoryId: outputInv.id,
                    quantity: addQty,
                    unitCost: outputUnitCost,
                    totalAmount: addQty * outputUnitCost,
                    note: `加工产出: ${recipe.name}`
                }
            });
        }
        return {
            success: true,
            recipe: recipe.name,
            multiplier,
            totalInputCost,
            outputUnitCost
        };
    });
}
// Update recipe
async function updateRecipe(recipeId, data) {
    return database_1.default.processRecipe.update({
        where: { id: recipeId },
        data
    });
}
// Delete recipe
async function deleteRecipe(recipeId) {
    return database_1.default.processRecipe.delete({
        where: { id: recipeId }
    });
}
//# sourceMappingURL=ProcessRecipeService.js.map