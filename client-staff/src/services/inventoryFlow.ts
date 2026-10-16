import { itemDisplayName } from '../../../shared/utils/localizedItemName';
import { inventoryInputUnits, defaultInventoryInputUnit, inventoryLedgerQuantity } from '../utils/inventoryInputUnits';
export { defaultInventoryInputUnit };
import { http } from './api';
import { useAuthStore } from '../stores/auth';
const configured = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const base = configured.endsWith('/api') ? configured : `${configured}/api`;
const headers = () => ({ 'X-Client-App':'employee', Authorization: `Bearer ${useAuthStore.getState().token}` });
const get = async (path: string) => (await http.get(base + path, { headers: headers() })).data;
const post = async (path: string, data: unknown) => (await http.post(base + path, data, { headers: headers() })).data;
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
    updatePurchase:(id:string,data:any)=>http.put(base+`/purchase-orders/${id}`,data,{headers:headers()}),
    cancelPurchase:(id:string,reason:string)=>http.delete(base+`/purchase-orders/${id}`,{data:{reason},headers:headers()}),
    logs: async()=>{const [incoming,outgoing]=await Promise.all([get('/inventory/logs/stock-in?limit=100'),get('/inventory/logs/stock-out?limit=100')]);return {data:{list:[...incoming.data.list.map((r:any)=>({...r,type:'stock_in'})),...outgoing.data.list.map((r:any)=>({...r,type:'stock_out'}))]}}},
    list: () => get('/inventory'), counts: () => get('/inventory-counts'), purchases: () => get('/purchase-orders'), suppliers: () => get('/suppliers?isActive=true'),
    purchase: (data: Record<string, unknown>) => intent('/purchase-orders', data, 'requestId'), receive: (id: string, items: any[] = []) => post(`/purchase-orders/${id}/receive`, {items}),
    stock: (kind: 'in' | 'out', data: Record<string, unknown>) => intent(`/inventory/stock-${kind}`, data, 'operationId'),
    saveCount: (id: string, items: unknown[]) => http.put(base + `/inventory-counts/${id}/items`, {items}, {headers: headers()}),
    startCount: (data: unknown) => post('/inventory-counts', data), submitCount: (id: string, items: unknown[] = []) => post(`/inventory-counts/${id}/submit`, {items})
};
export interface Material {
    effectiveSafetyStock?: number; dynamicSafetyStock?: number; forecastHistoryDays?: number; daysUntilStockOut?: number | null;
    type?: string;
    processRecipeId?:string|null;
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
export function materialName(name: string, language: string) { return itemDisplayName(name, language); }
