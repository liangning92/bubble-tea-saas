"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSuppliers = getSuppliers;
exports.getSupplierById = getSupplierById;
exports.createSupplier = createSupplier;
exports.updateSupplier = updateSupplier;
exports.deleteSupplier = deleteSupplier;
exports.getSupplierStats = getSupplierStats;
exports.getSuppliersForDropdown = getSuppliersForDropdown;
const database_1 = __importDefault(require("../config/database"));
// Get suppliers
async function getSuppliers(filter) {
    const where = {};
    if (filter.storeId)
        where.storeId = filter.storeId;
    if (filter.isActive !== undefined)
        where.isActive = filter.isActive;
    if (filter.search) {
        where.OR = [
            { name: { contains: filter.search, mode: 'insensitive' } },
            { contactPerson: { contains: filter.search, mode: 'insensitive' } },
            { phone: { contains: filter.search } }
        ];
    }
    return database_1.default.supplier.findMany({
        where,
        orderBy: { name: 'asc' }
    });
}
// Get supplier by ID
async function getSupplierById(supplierId) {
    return database_1.default.supplier.findUnique({
        where: { id: supplierId },
        include: {
            stockInLogs: {
                orderBy: { createdAt: 'desc' },
                take: 20
            },
            purchaseOrders: {
                orderBy: { createdAt: 'desc' },
                take: 10
            }
        }
    });
}
// Create supplier
async function createSupplier(data) {
    return database_1.default.supplier.create({
        data: {
            storeId: data.storeId,
            name: data.name,
            contactPerson: data.contactPerson,
            phone: data.phone,
            email: data.email,
            address: data.address,
            note: data.note,
            isActive: true
        }
    });
}
// Update supplier
async function updateSupplier(supplierId, data) {
    return database_1.default.supplier.update({
        where: { id: supplierId },
        data
    });
}
// Delete supplier (soft delete)
async function deleteSupplier(supplierId) {
    return database_1.default.supplier.update({
        where: { id: supplierId },
        data: { isActive: false }
    });
}
// Get supplier statistics
async function getSupplierStats(supplierId) {
    const [totalOrders, totalSpent, lastOrder] = await Promise.all([
        database_1.default.purchaseOrder.count({
            where: { supplierId, status: { not: 'cancelled' } }
        }),
        database_1.default.purchaseOrder.aggregate({
            where: { supplierId, status: 'received' },
            _sum: { totalAmount: true }
        }),
        database_1.default.purchaseOrder.findFirst({
            where: { supplierId },
            orderBy: { createdAt: 'desc' }
        })
    ]);
    return {
        totalOrders,
        totalSpent: totalSpent._sum.totalAmount || 0,
        lastOrderDate: lastOrder?.createdAt
    };
}
// Get suppliers for dropdown
async function getSuppliersForDropdown(storeId) {
    return database_1.default.supplier.findMany({
        where: { storeId, isActive: true },
        select: {
            id: true,
            name: true,
            contactPerson: true,
            phone: true
        },
        orderBy: { name: 'asc' }
    });
}
//# sourceMappingURL=SupplierService.js.map