import axios from 'axios'
import { useAuthStore } from '../stores/auth'

function getApiBase(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
  return configured.endsWith('/api') ? configured : `${configured}/api`
}

const API_BASE = getApiBase()

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = 'Bearer ' + token
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

// Update API base URL dynamically (for API URL configuration)
export function updateApiUrl(url: string) {
  api.defaults.baseURL = url
}

// Auth
export const authApi = {
  login: (phone: string, password: string) => api.post('/auth/login', { phone, password }),
  register: (data: any, bootstrapSecret: string) => api.post('/auth/register', data, {
    headers: { 'X-Bootstrap-Secret': bootstrapSecret }
  }),
  me: () => api.get('/auth/me')
}

// Store
export const storeApi = {
  create: (data: any) => api.post('/stores', data),
  get: (id: string) => api.get('/stores/' + id)
}

// Products
export const productApi = {
  list: (params?: any) => api.get('/products', { params }),
  get: (id: string) => api.get('/products/' + id),
  create: (data: any) => api.post('/products', data),
  update: (id: string, data: any) => api.put('/products/' + id, data),
  delete: (id: string) => api.delete('/products/' + id),
  updateStatus: (id: string, status: string) => api.put('/products/' + id + '/status', { status }),
  updateBom: (id: string, data: any) => api.put('/products/' + id + '/bom', data)
}

// Categories
export const categoryApi = {
  list: (storeId?: string) => api.get('/categories', { params: storeId ? { storeId } : undefined }),
  create: (data: any) => api.post('/categories', data),
  update: (id: string, data: any) => api.put('/categories/' + id, data),
  delete: (id: string) => api.delete('/categories/' + id)
}

// Orders
export const orderApi = {
  list: (params?: any) => api.get('/orders', { params }),
  get: (id: string) => api.get('/orders/' + id),
  create: (data: any) => api.post('/orders', data),
  updateStatus: (id: string, status: string) => api.put('/orders/' + id + '/status', { status }),
  refund: (id: string, reason?: string) => api.post('/orders/' + id + '/refund', { reason }),
  getKDS: (storeId: string, params?: any) => api.get('/orders/kds/list', { params: { storeId, ...params } })
}

// Refund Requests
export const adminApi = {
  getRefundRequests: (status?: string) => api.get('/orders/refund-requests', { params: { status } }),
  approveRefund: (id: string, data: { note?: string }) => api.post('/orders/refund-requests/' + id + '/approve', data),
  rejectRefund: (id: string, data: { note: string }) => api.post('/orders/refund-requests/' + id + '/reject', data)
}

// Inventory
export const inventoryApi = {
  list: (params?: any) => api.get('/inventory', { params }),
  get: (id: string) => api.get('/inventory/' + id),
  create: (data: any) => api.post('/inventory', data),
  update: (id: string, data: any) => api.put('/inventory/' + id, data),
  delete: (id: string) => api.delete('/inventory/' + id),
  stockIn: (data: any) => api.post('/inventory/stock-in', data),
  stockOut: (data: any) => api.post('/inventory/stock-out', data),
  adjust: (id: string, data: any) => api.put('/inventory/' + id + '/adjust', data),
  logs: (params?: any) => api.get('/inventory/logs', { params }),
  logsStockIn: (params?: any) => api.get('/inventory/logs/stock-in', { params }),
  logsStockOut: (params?: any) => api.get('/inventory/logs/stock-out', { params }),
  alerts: () => api.get('/inventory/alerts/low-stock'),
  stats: () => api.get('/inventory/stats/summary'),
  consumptionAnalysis: (params: any) => api.get('/inventory/consumption-analysis', { params }),
  anomalySummary: (params: any) => api.get('/inventory/anomaly-summary', { params }),
  // Alert config
  getAlertConfig: () => api.get('/inventory/alert-config'),
  saveAlertConfig: (config: any) => api.put('/inventory/alert-config', config),
  // Inventory count
  getInventoryCounts: () => api.get('/inventory-counts'),
  getInventoryCount: (id: string) => api.get('/inventory-counts/' + id),
  createInventoryCount: (data: any) => api.post('/inventory-counts', data),
  updateInventoryCountItem: (countId: string, itemId: string, data: any) =>
    api.put('/inventory-counts/' + countId + '/item/' + itemId, data),
  completeInventoryCount: (id: string) => api.post('/inventory-counts/' + id + '/complete'),
  cancelInventoryCount: (id: string) => api.post('/inventory-counts/' + id + '/cancel')
}

// Staff
export const staffApi = {
  list: (params?: any) => api.get('/staff', { params }),
  get: (id: string) => api.get('/staff/' + id),
  create: (data: any) => api.post('/staff', data),
  update: (id: string, data: any) => api.put('/staff/' + id, data),
  updateRole: (id: string, role: string) => api.put('/staff/' + id + '/role', { role }),
  delete: (id: string) => api.delete('/staff/' + id),
  resetPassword: (id: string, newPassword: string) => api.put('/staff/' + id + '/reset-password', { newPassword }),
  attendance: (data: any) => api.post('/staff/attendance', data),
  attendanceToday: () => api.get('/staff/attendance/today'),
  attendanceSummary: () => api.get('/staff/attendance/summary'),
  attendanceList: (params?: any) => api.get('/staff/attendance/list', { params }),
  schedule: (data: any) => api.post('/staff/schedule', data),
  scheduleList: (params?: any) => api.get('/staff/schedule/list', { params })
}

export const shiftApi = {
  list: (storeId?: string) => api.get('/shifts', { params: storeId ? { storeId } : undefined }),
  create: (data: any) => api.post('/shifts', data),
  update: (id: string, data: any) => api.put('/shifts/' + id, data),
  delete: (id: string) => api.delete('/shifts/' + id),
  seed: () => api.post('/shifts/seed')
}

// Members
export const memberApi = {
  list: (params?: any) => api.get('/members', { params }),
  get: (id: string, params?: any) => api.get('/members/' + id, { params }),
  getByPhone: (phone: string) => api.get('/members/phone/' + phone),
  create: (data: any) => api.post('/members', data),
  update: (id: string, data: any) => api.put('/members/' + id, data),
  delete: (id: string) => api.delete('/members/' + id),
  redeemPoints: (id: string, points: number) => api.post('/members/' + id + '/redeem', { points }),
  adjustPoints: (id: string, points: number, note?: string) => api.post('/members/' + id + '/adjust-points', { points, note }),
  stats: () => api.get('/members/stats/summary')
}

// Reports
export const reportApi = {
  revenue: (params?: any) => api.get('/reports/revenue', { params }),
  daily: (params?: any) => api.get('/reports/daily', { params }),
  hourly: (params?: any) => api.get('/reports/hourly', { params }),
  inventory: (params?: any) => api.get('/reports/inventory', { params }),
  staff: (params?: any) => api.get('/reports/staff', { params }),
  dashboard: () => api.get('/reports/dashboard'),
  getChannelReports: (params?: any) => api.get('/reports/channels', { params }),
  getChannelReport: (channelId: string, params?: any) => api.get('/reports/channels/' + channelId, { params }),
  getCommissionReports: (params?: any) => api.get('/reports/commissions', { params })
}

// Revenue (by Channel)
export const revenueApi = {
  byChannel: (params?: any) => api.get('/revenue/by-channel', { params }),
  summary: (params?: any) => api.get('/revenue/summary', { params }),
  daily: (params?: any) => api.get('/revenue/daily', { params })
}

// Product Analysis
export const productAnalysisApi = {
  recipes: () => api.get('/product-analysis/recipes'),
  mix: (days?: number) => api.get('/product-analysis/mix', { params: days ? { days } : undefined }),
  trend: (days?: number) => api.get('/product-analysis/trend', { params: days ? { days } : undefined }),
  abc: (days?: number) => api.get('/product-analysis/abc', { params: days ? { days } : undefined }),
  score: (productId: string, days?: number) => api.get('/product-analysis/score/' + productId, { params: days ? { days } : undefined })
}

// Config
export const configApi = {
  get: (storeId?: string) => api.get('/config', { params: storeId ? { storeId } : undefined }),
  set: (storeId: string, key: string, value: any, category: string) => api.post('/config', { storeId, key, value, category }),
  setBatch: (storeId: string, configs: Array<{ key: string; value: any; category: string }>) => api.post('/config/batch', { storeId, configs }),
  getDefaults: (category: string) => api.get('/config/defaults/' + category),
  // Staff feature config
  getStaffFeatures: () => api.get('/config/staff/features'),
  setStaffFeatures: (features: any) => api.put('/config/staff/features', features)
}

// Addons
export const addonApi = {
  list: (storeId?: string) => api.get('/addons', { params: storeId ? { storeId } : undefined }),
  create: (data: any) => api.post('/addons', data),
  update: (id: string, data: any) => api.put('/addons/' + id, data),
  delete: (id: string) => api.delete('/addons/' + id)
}

// Channel
export const channelApi = {
  list: (storeId?: string) => api.get('/channels', { params: storeId ? { storeId } : undefined }),
  get: (id: string) => api.get('/channels/' + id),
  create: (data: any) => api.post('/channels', data),
  update: (id: string, data: any) => api.put('/channels/' + id, data),
  delete: (id: string) => api.delete('/channels/' + id),
  getProductPrices: (channelId: string) => api.get('/channels/' + channelId + '/products/all'),
  setProductPrice: (channelId: string, productId: string, data: any) =>
    api.put('/channels/' + channelId + '/products/' + productId, data),
  bulkAdjust: (channelId: string, data: any) =>
    api.put('/channels/' + channelId + '/products/adjust', data),
  getChannelOrders: (channelId: string, params?: any) =>
    api.get('/channels/' + channelId + '/orders', { params })
}

// Product Price
export const productPriceApi = {
  getPrice: (productId: string, channelId?: string, specId?: string) =>
    api.get('/product-price/' + productId + '/price', {
      params: { channelId, specId }
    }),
  getChannelPrices: (productId: string) =>
    api.get('/product-price/' + productId + '/channels'),
  setChannelPrice: (productId: string, channelId: string, data: any) =>
    api.put('/product-price/' + productId + '/channels/' + channelId, data)
}

// Leave
export const leaveApi = {
  list: (params?: any) => api.get('/leave/list', { params }),
  get: (id: string) => api.get('/leave/' + id),
  approve: (id: string) => api.put('/leave/approve/' + id),
  reject: (id: string, reason?: string) => api.put('/leave/reject/' + id, { reason }),
  setBalance: (staffId: string, data: any) => api.put('/leave/balance/' + staffId, data)
}

// Reimbursement
export const reimbursementApi = {
  list: (params?: any) => api.get('/reimbursement/list', { params }),
  get: (id: string) => api.get('/reimbursement/' + id),
  approve: (id: string) => api.put('/reimbursement/approve/' + id),
  reject: (id: string, reason?: string) => api.put('/reimbursement/reject/' + id, { reason }),
  markPaid: (id: string) => api.put('/reimbursement/mark-paid/' + id)
}

// Leave Types Config
export const leaveTypeApi = {
  list: () => api.get('/leave-types'),
  listAll: () => api.get('/leave-types/all'),
  get: (id: string) => api.get('/leave-types/' + id),
  create: (data: any) => api.post('/leave-types', data),
  update: (id: string, data: any) => api.put('/leave-types/' + id, data),
  delete: (id: string) => api.delete('/leave-types/' + id),
  seed: () => api.post('/leave-types/seed')
}

// Reimbursement Types Config
export const reimbursementTypeApi = {
  list: () => api.get('/reimbursement-types'),
  listAll: () => api.get('/reimbursement-types/all'),
  get: (id: string) => api.get('/reimbursement-types/' + id),
  create: (data: any) => api.post('/reimbursement-types', data),
  update: (id: string, data: any) => api.put('/reimbursement-types/' + id, data),
  delete: (id: string) => api.delete('/reimbursement-types/' + id),
  seed: () => api.post('/reimbursement-types/seed')
}

// Suppliers
export const supplierApi = {
  list: (params?: any) => api.get('/suppliers', { params }),
  getDropdown: (storeId?: string) => api.get('/suppliers/dropdown', { params: storeId ? { storeId } : undefined }),
  get: (id: string) => api.get('/suppliers/' + id),
  getStats: (id: string) => api.get('/suppliers/' + id + '/stats'),
  create: (data: any) => api.post('/suppliers', data),
  update: (id: string, data: any) => api.put('/suppliers/' + id, data),
  delete: (id: string) => api.delete('/suppliers/' + id)
}

// Purchase Orders
export const purchaseOrderApi = {
  list: (params?: any) => api.get('/purchase-orders', { params }),
  getPending: (storeId?: string) => api.get('/purchase-orders/pending', { params: storeId ? { storeId } : undefined }),
  get: (id: string) => api.get('/purchase-orders/' + id),
  create: (data: any) => api.post('/purchase-orders', data),
  updateStatus: (id: string, status: string) => api.put('/purchase-orders/' + id + '/status', { status }),
  receive: (id: string) => api.post('/purchase-orders/' + id + '/receive'),
  cancel: (id: string, reason?: string) => api.delete('/purchase-orders/' + id, { data: { reason } })
}

// Material Management
export const materialApi = {
  types: () => api.get('/material/types'),
  list: (params?: any) => api.get('/material', { params }),
  get: (id: string) => api.get('/material/' + id),
  create: (data: any) => api.post('/material', data),
  update: (id: string, data: any) => api.put('/material/' + id, data),
  lowStockAlerts: () => api.get('/material/alerts/low-stock'),
  expiryAlerts: (days: number = 7) => api.get('/material/alerts/expiry', { params: { days } }),
  restockSuggestions: (days?: number) => api.get('/material/suggestions/restock', { params: days ? { days } : undefined }),
  executeProcess: (recipeId: string, data: any) => api.post('/material/process/' + recipeId + '/execute', data),
  processHistory: (limit?: number) => api.get('/material/process/history', { params: limit ? { limit } : undefined }),
  getProcessLog: (id: string) => api.get('/material/process/' + id)
}

// Process Recipe
export const processRecipeApi = {
  list: (storeId?: string) => api.get('/process-recipes', { params: storeId ? { storeId } : undefined }),
  get: (id: string) => api.get('/process-recipes/' + id),
  create: (data: any) => api.post('/process-recipes', data),
  update: (id: string, data: any) => api.put('/process-recipes/' + id, data),
  delete: (id: string) => api.delete('/process-recipes/' + id),
  execute: (id: string, data: any) => api.post('/process-recipes/' + id + '/execute', data)
}

// Expenses
export const expenseApi = {
  list: (params?: any) => api.get('/expenses', { params }),
  get: (id: string) => api.get('/expenses/' + id),
  create: (data: any) => api.post('/expenses', data),
  update: (id: string, data: any) => api.put('/expenses/' + id, data),
  delete: (id: string) => api.delete('/expenses/' + id),
  summary: (days?: number) => api.get('/expenses/summary', { params: days ? { days } : undefined }),
  bulkImport: (expenses: any[]) => api.post('/expenses/bulk', { expenses }),
  export: (params?: any) => api.get('/expenses/export', { params, responseType: 'blob' }),
  // Expense categories (customizable)
  getCategories: () => api.get('/expenses/categories'),
  saveCategories: (categories: any[]) => api.put('/expenses/categories', { categories })
}

// Finance Budgets
export const budgetApi = {
  list: (params?: any) => api.get('/finance/budgets', { params }),
  summary: (year: number, month?: number) => api.get('/finance/budgets/summary', { params: { year, month } }),
  create: (data: any) => api.post('/finance/budgets', data),
  update: (id: string, data: any) => api.put('/finance/budgets/' + id, data),
  delete: (id: string) => api.delete('/finance/budgets/' + id),
  // Budget categories (customizable)
  getCategories: () => ap