import { inventoryInputUnits, defaultInventoryInputUnit, inventoryLedgerQuantity } from '../utils/inventoryInputUnits';
export { defaultInventoryInputUnit };
import axios from 'axios';
import { useAuthStore } from '../stores/auth';
const configured = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const base = configured.endsWith('/api') ? configured : `${configured}/api`;
const headers = () => ({ 'X-Client-App':'employee', Authorization: `Bearer ${useAuthStore.getState().token}` });
const get = async (path: string) => (await axios.get(base + path, { headers: headers() })).data;
const post = async (path: string, data: unknown) => (await axios.post(base + path, data, { headers: headers() })).data;
/** Persist retry identity across lost responses and page reloads. */
async function intent(path: string, data: Record<string, unknown>, keyField: string) {
    const key = 'inventory.intent.' + JSON.stringify([useAuthStore.getState().user?.id, path, data]);
    const requestId = localStorage.getItem(key) || crypto.randomUUID();
    localStorage.setItem(key, requestId);
    const result = await post(path, { ...data, [keyField]: requestId });
    localStorage.removeItem(key);
    return result;
}
export const inventoryFlowApi = {
    list: () => get('/inventory'), counts: () => get('/inventory-counts'), purchases: () => get('/purchase-orders'), suppliers: () => get('/suppliers/dropdown'),
    purchase: (data: Record<string, unknown>) => intent('/purchase-orders', data, 'requestId'), receive: (id: string, items: any[] = []) => post(`/purchase-orders/${id}/receive`, {items}),
    stock: (kind: 'in' | 'out', data: Record<string, unknown>) => intent(`/inventory/stock-${kind}`, data, 'operationId'),
    startCount: (data: unknown) => post('/inventory-counts', data), submitCount: (id: string) => post(`/inventory-counts/${id}/submit`, {})
};
export interface Material {
    effectiveSafetyStock?: number; dynamicSafetyStock?: number; forecastHistoryDays?: number; daysUntilStockOut?: number | null;
    id: string;
    name: string;
    category: string;
    unit: string;
    currentStock: number;
    safetyStock: number;
    packaging?: {
        unit: string;
        quantity: number;
        baseUnit: string;
    } | null;
}
export function stockQuantity(material: Material | undefined, quantity: string, unit: string) {
    if (!material)
        return 0;
    return inventoryLedgerQuantity(Number(quantity), material, unit);
}
export function materialUnits(material?: Material) { return material ? inventoryInputUnits(material) : []; }
export function jakartaDate() { return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); }
export function materialName(name: string, language: string) { return language === 'zh' ? name : name.replace(/\s*\([^)]*[\u4e00-\u9fff]+[^)]*\)/g, '').trim(); }
