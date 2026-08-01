"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.forecastSales = forecastSales;
exports.generateRestockSuggestions = generateRestockSuggestions;
exports.predictWaste = predictWaste;
exports.getSalesComparison = getSalesComparison;
const database_1 = __importDefault(require("../config/database"));
const dateUtils_1 = require("../utils/dateUtils");
// Indonesian special dates multiplier
function getIndonesiaMultiplier(date) {
    let multiplier = 1.0;
    // Ramadan effect (more consumption during evening)
    if ((0, dateUtils_1.isRamadan)(date)) {
        multiplier *= 1.15;
    }
    // Friday (weekend effect in Indonesia)
    if ((0, dateUtils_1.isFriday)(date)) {
        multiplier *= 1.1;
    }
    // Holiday effect
    const holidayCheck = (0, dateUtils_1.isHoliday)(date);
    if (holidayCheck.isHoliday) {
        multiplier *= 1.2;
    }
    // Weekend (Saturday/Sunday)
    const day = date.getDay();
    if (day === 0 || day === 6) {
        multiplier *= 1.08;
    }
    // Rainy season (Indonesia: Nov-March) - rough approximation
    const month = date.getMonth();
    if (month >= 10 || month <= 2) {
        multiplier *= 1.05; // Rainy season slight increase for hot drinks
    }
    return multiplier;
}
// Get historical sales data for a product
async function getProductHistory(productId, days = 30) {
    const startDate = (0, dateUtils_1.subDays)(new Date(), days);
    const orders = await database_1.default.order.findMany({
        where: {
            createdAt: { gte: startDate },
            status: { not: 'refunded' },
            items: {
                some: { productId }
            }
        },
        include: {
            items: {
                where: { productId }
            }
        }
    });
    return orders.map(o => ({
        date: o.createdAt,
        quantity: o.items[0]?.quantity || 0,
        finalAmount: o.finalAmount
    }));
}
// Calculate average daily sales with trend
function calculateTrend(historicalData) {
    if (historicalData.length === 0) {
        return { average: 0, trend: 0 };
    }
    // Group by day
    const dailySales = {};
    historicalData.forEach(d => {
        const dateKey = new Date(d.date).toISOString().slice(0, 10);
        dailySales[dateKey] = (dailySales[dateKey] || 0) + d.quantity;
    });
    const sales = Object.values(dailySales);
    const average = sales.reduce((a, b) => a + b, 0) / sales.length;
    // Calculate trend using simple linear regression
    const n = sales.length;
    if (n < 7) {
        return { average, trend: 0 };
    }
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += sales[i];
        sumXY += i * sales[i];
        sumXX += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const avgSales = sumY / n;
    // Normalize trend to percentage
    const trend = avgSales > 0 ? (slope / avgSales) * 100 : 0;
    return { average, trend };
}
// Forecast sales for next 7 days
async function forecastSales(productId, storeId) {
    const product = await database_1.default.product.findUnique({
        where: { id: productId },
        include: { category: true }
    });
    if (!product) {
        throw new Error('Product not found');
    }
    // Get 30 days history
    const history = await getProductHistory(productId, 30);
    const { average, trend } = calculateTrend(history);
    // Get Indonesia-specific factors
    const factors = [];
    // Calculate multiplier for next 7 days
    const predictions = [];
    for (let i = 1; i <= 7; i++) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + i);
        const multiplier = getIndonesiaMultiplier(futureDate);
        let predicted = average * multiplier;
        // Apply trend
        if (trend > 0) {
            predicted *= (1 + trend / 100 * (i / 7));
        }
        else if (trend < 0) {
            predicted *= (1 + trend / 100 * (i / 7));
        }
        predictions.push(predicted);
    }
    const predictedQuantity = Math.round(predictions.reduce((a, b) => a + b, 0) / 7);
    // Calculate confidence based on data quality
    let confidence = 0.5; // Base confidence
    if (history.length >= 100)
        confidence += 0.3;
    else if (history.length >= 50)
        confidence += 0.2;
    else if (history.length >= 20)
        confidence += 0.1;
    // Reduce confidence if high trend volatility
    if (Math.abs(trend) > 20)
        confidence -= 0.1;
    confidence = Math.min(0.95, Math.max(0.3, confidence));
    // Add factors
    if (trend > 5) {
        factors.push({ name: 'Upward Trend', impact: Math.round(trend) });
    }
    else if (trend < -5) {
        factors.push({ name: 'Downward Trend', impact: Math.round(trend) });
    }
    // Check for special dates in next 7 days
    for (let i = 1; i <= 7; i++) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + i);
        if ((0, dateUtils_1.isRamadan)(futureDate)) {
            factors.push({ name: 'Ramadan Period', impact: 15 });
            break;
        }
    }
    const recommendations = [];
    if (predictedQuantity > average * 1.2) {
        recommendations.push(`Expected high demand (+${Math.round((predictedQuantity / average - 1) * 100)}%). Consider increasing inventory.`);
    }
    if (trend > 10) {
        recommendations.push('Strong upward trend detected. Plan for capacity increase.');
    }
    return {
        productId,
        productName: product.name,
        predictedQuantity,
        confidence,
        factors,
        recommendations
    };
}
// Generate restock suggestions
async function generateRestockSuggestions(storeId) {
    const inventory = await database_1.default.inventory.findMany({
        where: { storeId },
        include: {
            bomItems: {
                include: { product: true }
            }
        }
    });
    const suggestions = [];
    for (const item of inventory) {
        // Get 7-day usage from BOM
        let predictedUsage7Days = 0;
        // Find all products that use this inventory item
        for (const bom of item.bomItems) {
            const productHistory = await getProductHistory(bom.productId, 30);
            const { average } = calculateTrend(productHistory);
            predictedUsage7Days += average * 7 * bom.quantity;
        }
        const daysOfStock = item.currentStock > 0 ? item.currentStock / (predictedUsage7Days / 7) : 0;
        // Determine urgency
        let urgency = 'low';
        if (item.currentStock <= item.minStock) {
            urgency = 'critical';
        }
        else if (daysOfStock < 3) {
            urgency = 'high';
        }
        else if (daysOfStock < 7) {
            urgency = 'medium';
        }
        // Calculate suggested order quantity (enough for 14 days + buffer)
        const suggestedOrderQty = Math.max(0, Math.ceil(predictedUsage7Days * 2 - item.currentStock));
        if (suggestedOrderQty > 0 || urgency === 'critical') {
            suggestions.push({
                inventoryId: item.id,
                itemName: item.name,
                currentStock: item.currentStock,
                predictedUsage7Days: Math.round(predictedUsage7Days),
                suggestedOrderQty,
                urgency
            });
        }
    }
    // Sort by urgency
    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    suggestions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
    return suggestions;
}
// Waste prediction (estimate how much inventory might be wasted)
async function predictWaste(storeId) {
    const inventory = await database_1.default.inventory.findMany({
        where: { storeId }
    });
    const thirtyDaysAgo = (0, dateUtils_1.subDays)(new Date(), 30);
    // Calculate expiration-based waste (simplified)
    // In production, would track actual expiration dates
    const wastePredictions = inventory.map(item => {
        // Assume 5% waste for items with >30 day shelf life
        // Assume 15% waste for items with <7 day shelf life
        const baseWasteRate = item.category?.toLowerCase().includes('fresh')
            ? 0.15
            : 0.05;
        const predictedUsage = 0; // Would calculate from order history
        const potentialWaste = item.currentStock * baseWasteRate;
        return {
            inventoryId: item.id,
            itemName: item.name,
            currentStock: item.currentStock,
            estimatedWasteRate: baseWasteRate,
            estimatedWasteQuantity: Math.round(potentialWaste),
            estimatedWasteValue: Math.round(potentialWaste * Number(item.avgCost))
        };
    });
    return {
        predictions: wastePredictions.filter(w => w.estimatedWasteQuantity > 0),
        totalEstimatedWasteValue: wastePredictions.reduce((sum, w) => sum + w.estimatedWasteValue, 0)
    };
}
// Sales comparison (today vs last week)
async function getSalesComparison(storeId) {
    const today = new Date();
    const todayStart = (0, dateUtils_1.startOfDay)(today);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const lastWeekStart = (0, dateUtils_1.subDays)(today, 7);
    lastWeekStart.setHours(0, 0, 0, 0);
    const lastWeekEnd = (0, dateUtils_1.subDays)(today, 7);
    lastWeekEnd.setHours(23, 59, 59, 999);
    const [todayOrders, lastWeekOrders] = await Promise.all([
        database_1.default.order.findMany({
            where: {
                storeId,
                createdAt: { gte: todayStart, lte: todayEnd },
                status: { not: 'refunded' }
            }
        }),
        database_1.default.order.findMany({
            where: {
                storeId,
                createdAt: { gte: lastWeekStart, lte: lastWeekEnd },
                status: { not: 'refunded' }
            }
        })
    ]);
    const todayRevenue = todayOrders.reduce((sum, o) => sum + o.finalAmount, 0);
    const lastWeekRevenue = lastWeekOrders.reduce((sum, o) => sum + o.finalAmount, 0);
    const changePercent = lastWeekRevenue > 0
        ? Math.round((todayRevenue - lastWeekRevenue) / lastWeekRevenue * 100)
        : 0;
    return {
        today: {
            orders: todayOrders.length,
            revenue: todayRevenue
        },
        lastWeek: {
            orders: lastWeekOrders.length,
            revenue: lastWeekRevenue
        },
        changePercent,
        status: changePercent >= 0 ? 'up' : 'down'
    };
}
//# sourceMappingURL=AIForecastService.js.map