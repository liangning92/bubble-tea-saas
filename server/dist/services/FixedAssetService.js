"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFixedAssets = getFixedAssets;
exports.getFixedAsset = getFixedAsset;
exports.createFixedAsset = createFixedAsset;
exports.updateFixedAsset = updateFixedAsset;
exports.deleteFixedAsset = deleteFixedAsset;
exports.calculateDepreciation = calculateDepreciation;
exports.getDepreciationSchedule = getDepreciationSchedule;
exports.disposeFixedAsset = disposeFixedAsset;
const database_1 = __importDefault(require("../config/database"));
async function getFixedAssets(storeId, options) {
    const where = { storeId };
    if (options?.status)
        where.status = options.status;
    return database_1.default.fixedAsset.findMany({
        where,
        orderBy: { purchaseDate: 'desc' }
    });
}
async function getFixedAsset(id) {
    return database_1.default.fixedAsset.findUnique({ where: { id } });
}
async function createFixedAsset(data) {
    return database_1.default.fixedAsset.create({
        data: {
            storeId: data.storeId,
            name: data.name,
            description: data.description,
            purchaseDate: data.purchaseDate,
            originalValue: data.originalValue,
            usefulLife: data.usefulLife,
            salvageValue: data.salvageValue,
            depreciationMethod: data.depreciationMethod || 'straight_line'
        }
    });
}
async function updateFixedAsset(id, data) {
    return database_1.default.fixedAsset.update({
        where: { id },
        data: {
            ...(data.name && { name: data.name }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.purchaseDate && { purchaseDate: data.purchaseDate }),
            ...(data.originalValue !== undefined && { originalValue: data.originalValue }),
            ...(data.usefulLife !== undefined && { usefulLife: data.usefulLife }),
            ...(data.salvageValue !== undefined && { salvageValue: data.salvageValue }),
            ...(data.status && { status: data.status })
        }
    });
}
async function deleteFixedAsset(id) {
    return database_1.default.fixedAsset.delete({ where: { id } });
}
// Calculate monthly depreciation using straight-line method
function calculateDepreciation(asset) {
    // Return zero depreciation for disposed/sold assets
    if (asset.status && asset.status !== 'active') {
        return {
            monthlyDepreciation: 0,
            accumulatedDepreciation: 0,
            currentValue: asset.originalValue,
            monthsElapsed: 0,
            remainingMonths: 0,
            isActive: false
        };
    }
    const depreciableAmount = asset.originalValue - asset.salvageValue;
    const monthlyDepreciation = depreciableAmount / asset.usefulLife;
    // Calculate accumulated depreciation up to now
    const now = new Date();
    const monthsElapsed = Math.max(0, (now.getFullYear() - asset.purchaseDate.getFullYear()) * 12 +
        (now.getMonth() - asset.purchaseDate.getMonth()));
    const accumulatedDepreciation = Math.min(monthlyDepreciation * monthsElapsed, depreciableAmount);
    const currentValue = asset.originalValue - accumulatedDepreciation;
    return {
        monthlyDepreciation: Math.round(monthlyDepreciation),
        accumulatedDepreciation: Math.round(accumulatedDepreciation),
        currentValue: Math.round(currentValue),
        monthsElapsed,
        remainingMonths: Math.max(0, asset.usefulLife - monthsElapsed)
    };
}
async function getDepreciationSchedule(storeId) {
    const assets = await database_1.default.fixedAsset.findMany({
        where: { storeId, status: 'active' }
    });
    return assets.map(asset => {
        const depreciation = calculateDepreciation(asset);
        return {
            id: asset.id,
            name: asset.name,
            originalValue: asset.originalValue,
            purchaseDate: asset.purchaseDate,
            ...depreciation
        };
    });
}
// Dispose fixed asset with sale value - calculates gain/loss and creates journal entry
async function disposeFixedAsset(params) {
    const asset = await database_1.default.fixedAsset.findUnique({
        where: { id: params.assetId }
    });
    if (!asset) {
        throw new Error('Asset not found');
    }
    if (asset.status !== 'active') {
        throw new Error('Only active assets can be disposed');
    }
    // Calculate current book value using depreciation
    const depreciation = calculateDepreciation(asset);
    const bookValue = depreciation.currentValue;
    // Calculate gain or loss
    const gainLoss = params.saleValue - bookValue;
    const disposalType = gainLoss >= 0 ? 'gain' : 'loss';
    // Create journal entry for the disposal
    // Debit: Cash/Bank (sale proceeds)
    // Credit: Fixed Asset (original value)
    // Debit/Credit: Accumulated Depreciation (to remove)
    // Debit (if loss) / Credit (if gain): Disposal Gain/Loss
    const journalEntry = await database_1.default.$transaction(async (tx) => {
        // Update asset status to disposed
        await tx.fixedAsset.update({
            where: { id: params.assetId },
            data: {
                status: 'disposed',
                description: `${asset.description || ''} [Disposed on ${params.disposalDate.toISOString().slice(0, 10)}: Sale ${params.saleValue}, Book Value ${bookValue}, ${disposalType === 'gain' ? 'Gain' : 'Loss'} ${Math.abs(gainLoss)}]`
            }
        });
        // Create expense/income record for the disposal
        await tx.expense.create({
            data: {
                storeId: asset.storeId,
                type: 'asset_disposal',
                category: disposalType === 'gain' ? 'other_income' : 'other',
                amount: Math.abs(gainLoss),
                description: `Asset disposal: ${asset.name} - ${disposalType === 'gain' ? 'Gain' : 'Loss'} from sale (Sale: ${params.saleValue}, Book Value: ${bookValue})${params.note ? `. Note: ${params.note}` : ''}`,
                date: params.disposalDate,
                referenceId: params.assetId,
                referenceType: 'fixed_asset_disposal'
            }
        });
        return {
            assetId: params.assetId,
            assetName: asset.name,
            originalValue: asset.originalValue,
            saleValue: params.saleValue,
            bookValue,
            gainLoss,
            disposalType,
            disposalDate: params.disposalDate
        };
    });
    return journalEntry;
}
//# sourceMappingURL=FixedAssetService.js.map