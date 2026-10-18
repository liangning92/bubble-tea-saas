import {applySaleEstimate,reverseSaleEstimate} from './UnifiedInventoryService';
import {inventoryBusinessCalendar} from '../utils/inventoryBusinessCalendar';
import prisma from '../config/database';
import { convertQuantity } from '../utils/inventoryUnits';
import { formatDate } from '../utils/dateUtils';
import { randomUUID } from 'crypto';
export const FLOW_CUTOVER_KEY = 'employee_inventory_flow_started_at';
export interface ConsumptionMaterial {
    inventoryId: string;
    name: string;
    unit: string;
    quantity: number;
}
export interface ConsumptionIssue {
    productId: string;
    inventoryId?: string;
    code: string;
}
export async function ensureInventoryFlow(storeId: string, tx: any = prisma, now = new Date()) {
    const config = await tx.config.upsert({
        where: { storeId_key: { storeId, key: FLOW_CUTOVER_KEY } },
        create: { storeId, key: FLOW_CUTOVER_KEY, value: now.toISOString(), category: 'inventory' }, update: {}
    });
    return new Date(config.value);
}
/** Freeze expanded BOM quantities in the sale transaction. Never changes physical stock. */
export async function recordOrderConsumption(tx: any, storeId: string, orderId: string, items: any[], options?:{consumptionKey?:string;consumedAt?:Date}) {
    const sale = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { createdAt: true,storeId:true } });
    if(sale.storeId!==storeId)throw Error('INVENTORY_STORE_MISMATCH');
    const consumedAt=options?.consumedAt||sale.createdAt;
    await ensureInventoryFlow(storeId, tx, consumedAt);
    const materials = new Map<string, ConsumptionMaterial>();
    const issues: ConsumptionIssue[] = [];
    async function expand(inventoryId: string, quantity: number, productId: string, path: string[] = []) {
        if (path.length >= 10 || path.includes(inventoryId))
            throw Error('RECIPE_CYCLE');
        const inventory = await tx.inventory.findFirst({ where: { id: inventoryId, storeId } });
        if (!inventory)
            throw Error('INVENTORY_STORE_MISMATCH');
        if (inventory.type === 'semi_finished' && inventory.processRecipeId) {
            const recipe = await tx.processRecipe.findFirst({ where: { id: inventory.processRecipeId, storeId,status:'active' }, include: { items: true } });
            const outputs=recipe?.items.filter((i:any)=>i.type==='output')||[];
            const output = outputs.length===1?outputs[0]:null;
            const inputs = recipe?.items.filter((i: any) => i.type === 'input') || [];
            if (!output || output.quantity <= 0 || !inputs.length)
                throw Error('RECIPE_INCOMPLETE');
            const outputQty = convertQuantity(quantity, inventory.unit, recipe.outputUnit);
            for (const input of inputs) {
                if (!input.inventoryId)
                    throw Error('RECIPE_INCOMPLETE');
                await expand(input.inventoryId, outputQty / output.quantity * input.quantity, productId, [...path, inventoryId]);
            }
        }
        else {
            if (!['raw_material', 'finished_goods', 'semi_finished'].includes(inventory.type))
                throw Error('INVENTORY_TYPE_UNSUPPORTED');
            if (!Number.isFinite(quantity) || quantity < 0)
                throw Error('INVALID_QUANTITY');
            const previous = materials.get(inventoryId);
            materials.set(inventoryId, { inventoryId, name: inventory.name, unit: inventory.unit, quantity: (previous?.quantity || 0) + quantity });
        }
    }
    for (const item of items) {
        const bom = await tx.bOMItem.findMany({ where: { productId: item.productId }, include: { inventory: true } });
        if (!bom.length)
            issues.push({ productId: item.productId, code: 'BOM_MISSING' });
        for (const row of bom) {
            try {
                if (row.inventory.storeId !== storeId)
                    throw Error('INVENTORY_STORE_MISMATCH');
                await expand(row.inventoryId, convertQuantity(row.quantity * item.quantity, row.unit, row.inventory.unit), item.productId);
            }
            catch (error: any) {
                // Keep the sale available; the comparison must show incomplete evidence, never "normal".
                issues.push({ productId: item.productId, inventoryId: row.inventoryId, code: error.message });
            }
        }
    }
    const snapshot = await tx.orderConsumptionSnapshot.create({ data: {
            storeId, orderId:options?.consumptionKey||orderId, createdAt: consumedAt, materials: JSON.stringify([...materials.values()]), issues: JSON.stringify(issues)
        } });
    await applySaleEstimate(tx,storeId,snapshot);
    await markConsumptionDayDirty(tx, storeId, consumedAt);
    return snapshot;
}
export async function markConsumptionDayDirty(tx: any, storeId: string, at: Date) {
    const {formatDate}=await inventoryBusinessCalendar(storeId,tx);
    const key = 'employee_consumption_dirty:' + formatDate(at), value = randomUUID();
    await tx.config.upsert({ where: { storeId_key: { storeId, key } }, create: { storeId, key, value, category: 'inventory' }, update: { value } });
}
export async function reverseOrderConsumption(tx: any, orderId: string) {
    const snapshot = await tx.orderConsumptionSnapshot.findUnique({ where: { orderId } });
    const changed = await tx.orderConsumptionSnapshot.updateMany({ where: { orderId, reversedAt: null }, data: { reversedAt: new Date() } });
    if (changed.count && snapshot) {
        await reverseSaleEstimate(tx,snapshot);
        await markConsumptionDayDirty(tx, snapshot.storeId, snapshot.createdAt);
    }
    return changed;
}
