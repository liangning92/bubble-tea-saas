"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_1 = require("../config/env");
const auth_1 = require("../middlewares/auth");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient({
    transactionOptions: {
        maxWait: 5000, // 5s max wait
        timeout: 10000 // 10s max query
    }
});
// CLOUD API base URL
const CLOUD_API = 'https://api.aicube.online';
const syncConnectLimiter = (0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
const consumedSyncTickets = new Map();
// POST /api/sync/connect
// Body: { phone: string, password: string }
// Returns a short-lived local ticket after cloud credentials are verified.
router.post('/connect', syncConnectLimiter, async (req, res) => {
    try {
        const parsed = zod_1.z.object({
            phone: zod_1.z.string().min(10).max(15),
            password: zod_1.z.string().min(1).refine(value => Buffer.byteLength(value, 'utf8') <= 72)
        }).safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ code: 400, message: 'Invalid credentials request' });
        const { phone, password } = parsed.data;
        // Step 1: Call cloud API to login
        const loginRes = await fetch(`${CLOUD_API}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password }),
            signal: AbortSignal.timeout(10000)
        });
        const loginData = await loginRes.json();
        // Cloud returns: { code, data: { token, user: { storeId } } }
        if (!loginRes.ok || !loginData?.data?.token) {
            return res.status(401).json({ code: 401, message: loginData?.message || 'Invalid credentials' });
        }
        const token = loginData.data.token;
        const cloudUser = loginData.data.user;
        const storeId = cloudUser?.storeId;
        if (!storeId) {
            return res.status(401).json({ code: 401, message: 'Account not linked to any store' });
        }
        // Step 2: Get store details (storeName, tenantId)
        const storeRes = await fetch(`${CLOUD_API}/api/stores/${storeId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10000)
        });
        if (!storeRes.ok)
            return res.status(403).json({ code: 403, message: 'Account cannot access its store' });
        const storeInfo = storeRes.ok ? (await storeRes.json()) : null;
        const store = storeInfo?.data || {};
        if (store.id !== storeId)
            return res.status(403).json({ code: 403, message: 'Store authorization failed' });
        const syncTicket = jsonwebtoken_1.default.sign({
            purpose: 'pos-full-sync',
            jti: (0, crypto_1.randomUUID)(),
            storeId,
            cloudToken: token
        }, env_1.config.jwt.secret, { expiresIn: '5m' });
        return res.json({
            code: 200,
            data: {
                storeId,
                storeName: store.name || 'My Store',
                tenantId: store.tenantId || 'default-tenant',
                syncTicket,
            }
        });
    }
    catch (err) {
        return res.status(500).json({ code: 500, message: err.message || 'Connection failed' });
    }
});
// POST /api/sync/full
// Body: { syncTicket }
// Fetches all data from cloud and writes to local SQLite
router.post('/full', async (req, res) => {
    try {
        const { syncTicket } = req.body;
        if (typeof syncTicket !== 'string') {
            return res.status(400).json({ code: 400, message: 'Sync ticket required' });
        }
        let ticket;
        try {
            ticket = jsonwebtoken_1.default.verify(syncTicket, env_1.config.jwt.secret);
        }
        catch {
            return res.status(401).json({ code: 401, message: 'Invalid or expired sync ticket' });
        }
        if (ticket.purpose !== 'pos-full-sync' || !ticket.jti || !ticket.storeId || !ticket.cloudToken) {
            return res.status(401).json({ code: 401, message: 'Invalid sync ticket' });
        }
        const now = Math.floor(Date.now() / 1000);
        for (const [jti, expiresAt] of consumedSyncTickets) {
            if (expiresAt <= now)
                consumedSyncTickets.delete(jti);
        }
        if (consumedSyncTickets.has(ticket.jti)) {
            return res.status(409).json({ code: 409, message: 'Sync ticket has already been used' });
        }
        if (typeof ticket.exp !== 'number' || ticket.exp <= now) {
            return res.status(401).json({ code: 401, message: 'Invalid or expired sync ticket' });
        }
        consumedSyncTickets.set(ticket.jti, ticket.exp);
        const storeId = ticket.storeId;
        const token = ticket.cloudToken;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        // Fetch all data (products/pos includes nested specs and addons)
        const [storeRes, categoriesRes, productsRes, addonsRes] = await Promise.all([
            fetch(`${CLOUD_API}/api/stores/${storeId}`, { headers }),
            fetch(`${CLOUD_API}/api/categories?storeId=${encodeURIComponent(storeId)}`, { headers }),
            fetch(`${CLOUD_API}/api/products/pos?storeId=${encodeURIComponent(storeId)}`, { headers }),
            fetch(`${CLOUD_API}/api/addons?storeId=${encodeURIComponent(storeId)}`, { headers }),
        ]);
        if (![storeRes, categoriesRes, productsRes, addonsRes].every(response => response.ok)) {
            return res.status(502).json({ code: 502, message: 'Could not fetch complete store data; local data was not changed' });
        }
        const storeData = storeRes ? await storeRes.json() : null;
        const categoriesData = categoriesRes ? await categoriesRes.json() : { data: [] };
        const productsData = productsRes ? await productsRes.json() : { data: { list: [] } };
        const addonsData = addonsRes ? await addonsRes.json() : { data: [] };
        const store = storeData?.data || {};
        if (store.id !== storeId) {
            return res.status(502).json({ code: 502, message: 'Cloud returned a different store; local data was not changed' });
        }
        const existingOtherStore = await prisma.store.findFirst({ where: { id: { not: storeId } }, select: { id: true } });
        if (existingOtherStore) {
            return res.status(409).json({ code: 409, message: 'This POS database is already linked to another store' });
        }
        // products/pos returns { data: { list: [...] } }
        const products = (productsData.data?.list || []);
        const categories = (categoriesData.data || []);
        const addons = (addonsData.data || []);
        // SQLite FK constraints cause issues with delete order,
        // so disable FK checks before clearing and re-enable after
        let fkDisabled = false;
        try {
            await prisma.$executeRaw `PRAGMA foreign_keys = OFF`;
            fkDisabled = true;
            const syncResult = await prisma.$transaction(async (tx) => {
                // Clear existing data first (in case of re-sync)
                // Order matters: children before parents, then junction tables
                await tx.spec.deleteMany();
                await tx.productAddon.deleteMany();
                await tx.product.deleteMany();
                await tx.addon.deleteMany();
                await tx.category.deleteMany();
                await tx.config.deleteMany();
                // Create Tenant
                const tenantId = store.tenantId || 'default-tenant';
                await tx.tenant.upsert({
                    where: { id: tenantId },
                    create: { id: tenantId, name: store.tenantName || store.name || 'My Store' },
                    update: { name: store.tenantName || store.name || 'My Store' }
                });
                // Create Store
                await tx.store.upsert({
                    where: { id: storeId },
                    create: {
                        id: storeId,
                        tenantId,
                        name: store.name || 'My Store',
                        address: store.address || '',
                        phone: store.phone || '',
                    },
                    update: { tenantId, name: store.name || 'My Store', address: store.address || '', phone: store.phone || '' }
                });
                // Create Categories
                for (const cat of categories) {
                    await tx.category.create({
                        data: {
                            id: cat.id,
                            storeId,
                            name: cat.name,
                            code: cat.code || cat.name?.substring(0, 3).toUpperCase() || 'MISC',
                            sortOrder: cat.sortOrder || 0,
                        }
                    }).catch(() => { });
                }
                // Create Addons
                for (const addon of addons) {
                    await tx.addon.create({
                        data: {
                            id: addon.id,
                            storeId,
                            name: addon.name,
                            price: Math.round((addon.price || 0)),
                            priceAdjustment: Math.round((addon.priceAdjustment || 0)),
                            isFree: addon.isFree || false,
                        }
                    }).catch(() => { });
                }
                // Create Products with nested Specs and Addon relations
                let specCount = 0;
                let addonRelationCount = 0;
                for (const product of products) {
                    const productCode = product.code || product.sku || `PROD-${product.id?.substring(0, 8).toUpperCase()}`;
                    await tx.product.create({
                        data: {
                            id: product.id,
                            storeId,
                            code: productCode,
                            categoryId: product.categoryId,
                            name: product.name,
                            description: product.description || '',
                            image: product.image || '',
                            status: product.status || 'active',
                            costPrice: Math.round((product.costPrice || 0)),
                            sortOrder: product.sortOrder || 0,
                            tags: typeof product.tags === 'string' ? product.tags : JSON.stringify(product.tags || []),
                        }
                    }).catch(() => { });
                    // Create Specs nested inside product
                    if (product.specs && Array.isArray(product.specs)) {
                        for (const spec of product.specs) {
                            await tx.spec.create({
                                data: {
                                    id: spec.id,
                                    productId: product.id,
                                    name: spec.name,
                                    price: Math.round((spec.price || 0)),
                                    priceAdjustment: Math.round((spec.priceAdjustment || 0)),
                                    isDefault: spec.isDefault || false,
                                }
                            }).catch(() => { });
                            specCount++;
                        }
                    }
                    // Create Product-Addon relations
                    if (product.addons && Array.isArray(product.addons)) {
                        for (const pa of product.addons) {
                            await tx.productAddon.create({
                                data: {
                                    productId: product.id,
                                    addonId: pa.id,
                                    priceOverride: pa.price != null ? Math.round(pa.price) : null,
                                }
                            }).catch(() => { });
                            addonRelationCount++;
                        }
                    }
                }
                return { specCount, addonRelationCount };
            });
            return res.json({
                code: 200,
                data: {
                    storeName: store.name || 'My Store',
                    categories: categories.length,
                    products: products.length,
                    specs: syncResult.specCount,
                    addons: syncResult.addonRelationCount,
                }
            });
        }
        finally {
            if (fkDisabled) {
                await prisma.$executeRaw `PRAGMA foreign_keys = ON`.catch(() => { });
            }
        }
    }
    catch (err) {
        console.error('Sync full error:', err);
        return res.status(500).json({ code: 500, message: err.message || 'Sync failed' });
    }
});
// GET /api/sync/status
// Check if store is set up (has data)
router.get('/status', async (req, res) => {
    try {
        const storeCount = await prisma.store.count();
        res.json({
            code: 200,
            data: {
                isSetUp: storeCount > 0,
            }
        });
    }
    catch (err) {
        res.status(500).json({ code: 500, message: err.message });
    }
});
// POST /api/sync/order
// Receives an order from local POS and upserts into cloud DB.
// Called by local server after creating an order locally.
// Uses order ID as unique key so duplicate syncs are idempotent.
router.post('/order', auth_1.authenticate, async (req, res) => {
    try {
        const { order } = req.body;
        if (!order?.id || !order?.storeId) {
            return res.status(400).json({ code: 400, message: 'order.id and order.storeId required' });
        }
        if (!req.user || !(0, auth_1.canAccessStore)(req.user, order.storeId)) {
            return res.status(403).json({ code: 403, message: 'Access denied: Store mismatch' });
        }
        // Upsert order - idempotent, safe to retry
        await prisma.$transaction(async (tx) => {
            // Delete existing items for this order (clean slate for items)
            await tx.orderItem.deleteMany({ where: { orderId: order.id } }).catch(() => { });
            // Upsert the order
            await tx.order.upsert({
                where: { id: order.id },
                create: {
                    id: order.id,
                    storeId: order.storeId,
                    channelId: order.channelId || null,
                    staffId: order.staffId,
                    memberId: order.memberId || null,
                    orderNumber: order.orderNumber,
                    totalAmount: order.totalAmount,
                    discountAmount: order.discountAmount || 0,
                    finalAmount: order.finalAmount,
                    customerCount: order.customerCount || 1,
                    status: order.status || 'completed',
                    paymentMethod: order.paymentMethod,
                    taxCategory: order.taxCategory || 'taxable',
                    platformOrderId: order.platformOrderId || null,
                    tableNumber: order.tableNumber || null,
                    callerPhone: order.callerPhone || null,
                    driverPickupTime: order.driverPickupTime ? new Date(order.driverPickupTime) : null,
                    purchaseOrderNo: order.purchaseOrderNo || null,
                    socialRef: order.socialRef || null,
                    note: order.note || null,
                    createdAt: order.createdAt ? new Date(order.createdAt) : new Date(),
                    items: {
                        create: (or