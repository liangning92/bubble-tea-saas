import axios from 'axios'
import { useAuthStore } from '../stores/auth'

// Auto-detect API base URL based on browser hostname:
// - localhost / 127.0.0.1 → use Vite proxy (/api)
// - remote access via cloudflare tunnel → use https://api.aicube.online/api
function getApiBase(): string {
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1') {
    return '/api'  // Vite dev proxy → localhost:7072
  }
  // Remote access: full URL to cloudflare-tunneled backend
  return 'https://api.aicube.online/api'
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
  register: (data: any) => api.post('/auth/register', data),
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
  getCategories: () => api.get('/finance/budgets/categories'),
  saveCategories: (categories: any[]) => api.put('/finance/budgets/categories', { categories })
}

// Finance Assets
export const assetApi = {
  list: (params?: any) => api.get('/finance/assets', { params }),
  schedule: () => api.get('/finance/assets/schedule'),
  get: (id: string) => api.get('/finance/assets/' + id),
  create: (data: any) => api.post('/finance/assets', data),
  update: (id: string, data: any) => api.put('/finance/assets/' + id, data),
  delete: (id: string) => api.delete('/finance/assets/' + id),
  dispose: (id: string, data: { saleValue: number; disposalDate?: string; note?: string }) =>
    api.post('/finance/assets/' + id + '/dispose', data)
}

// Finance Accounts (Chart of Accounts)
export const accountApi = {
  list: (params?: any) => api.get('/finance/accounts', { params }),
  seed: () => api.post('/finance/accounts/seed'),
  get: (id: string) => api.get('/finance/accounts/' + id),
  create: (data: any) => api.post('/finance/accounts', data),
  update: (id: string, data: any) => api.put('/finance/accounts/' + id, data),
  delete: (id: string) => api.delete('/finance/accounts/' + id),
  transfer: (data: any) => api.post('/finance/accounts/transfer', data),
  transfers: (params?: any) => api.get('/finance/accounts/transfers/list', { params }),
  // Account types (customizable)
  getTypes: () => api.get('/finance/accounts/types'),
  saveTypes: (types: any[]) => api.put('/finance/accounts/types', { types })
}

// Bank Accounts
export const bankAccountApi = {
  list: (params?: any) => api.get('/bank/accounts', { params }),
  get: (id: string) => api.get('/bank/accounts/' + id),
  create: (data: any) => api.post('/bank/accounts', data),
  update: (id: string, data: any) => api.put('/bank/accounts/' + id, data),
  delete: (id: string) => api.delete('/bank/accounts/' + id)
}

// Bank Transactions
export const bankTransactionApi = {
  list: (params?: any) => api.get('/bank/transactions', { params }),
  create: (data: any) => api.post('/bank/transactions', data),
  delete: (id: string) => api.delete('/bank/transactions/' + id)
}

// Finance API (combined)
export const financeApi = {
  // Financial reports
  revenue: (params?: any) => api.get('/finance/revenue', { params }),
  daily: (params?: any) => api.get('/finance/revenue/daily', { params }),
  hourly: (params?: any) => api.get('/finance/revenue/hourly', { params }),
  profit: (params?: any) => api.get('/finance/profit', { params }),
  incomeStatement: (params?: any) => api.get('/finance/income-statement', { params }),
  cashFlow: (params?: any) => api.get('/finance/cash-flow', { params }),
  tax: (params?: any) => api.get('/finance/tax', { params }),
  // Report downloads
  downloadReport: (params: { type: string; month: string; format?: string; includeDepreciation?: boolean }) => {
    return api.get('/finance/reports/download', { params, responseType: 'blob' })
  },
  downloadTaxReport: (params: { type: string; month: string }) => {
    return api.get('/finance/reports/tax/download', { params, responseType: 'blob' })
  },
  // Combined sub-APIs
  budgets: budgetApi,
  assets: assetApi,
  accounts: accountApi
}

// Bank API (combined)
export const bankApi = {
  accounts: bankAccountApi,
  transactions: bankTransactionApi
}

// Upload
export const uploadApi = {
  uploadProduct: (files: File[]) => {
    const formData = new FormData()
    files.forEach(file => formData.append('images', file))
    return api.post('/upload/product', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  uploadReceipt: (files: File[]) => {
    const formData = new FormData()
    files.forEach(file => formData.append('receipts', file))
    return api.post('/upload/receipt', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  uploadAttachment: (files: File[]) => {
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    return api.post('/upload/attachment', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  uploadAvatar: (file: File) => {
    const formData = new FormData()
    formData.append('avatar', file)
    return api.post('/upload/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  uploadDualScreen: (files: File[]) => {
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    return api.post('/upload/dualScreen', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  delete: (type: string, filename: string) => api.delete('/upload/' + type + '/' + filename)
}

// Hygiene
export const hygieneApi = {
  // Areas
  areas: () => api.get('/hygiene/areas'),
  createArea: (data: any) => api.post('/hygiene/areas', data),
  updateArea: (id: string, data: any) => api.put('/hygiene/areas/' + id, data),
  deleteArea: (id: string) => api.delete('/hygiene/areas/' + id),
  initAreas: () => api.post('/hygiene/areas/init'),
  presetAreas: () => api.get('/hygiene/areas/preset'),

  // Templates
  templates: (params?: { areaCode?: string; category?: string; status?: string }) =>
    api.get('/hygiene/templates', { params }),
  getTemplate: (id: string) => api.get('/hygiene/templates/' + id),
  createTemplate: (data: any) => api.post('/hygiene/templates', data),
  updateTemplate: (id: string, data: any) => api.put('/hygiene/templates/' + id, data),
  deleteTemplate: (id: string) => api.delete('/hygiene/templates/' + id),
  duplicateTemplate: (id: string) => api.post('/hygiene/templates/' + id + '/duplicate'),
  seedTemplates: () => api.post('/hygiene/templates/seed'),

  // Tasks
  tasks: (params: { date: string; shift?: string; areaCode?: string; staffId?: string; status?: string }) =>
    api.get('/hygiene/tasks', { params }),
  getTask: (id: string) => api.get('/hygiene/tasks/' + id),
  myTasks: (params?: { date?: string }) => api.get('/hygiene/tasks/my', { params }),
  pendingTasks: (params?: { staffId?: string }) => api.get('/hygiene/tasks/pending', { params }),
  overdueTasks: () => api.get('/hygiene/tasks/overdue'),
  staffHistory: (staffId: string, page?: number, pageSize?: number) =>
    api.get('/hygiene/tasks/history/' + staffId, { params: { page, pageSize } }),
  createTemporaryTask: (data: any) => api.post('/hygiene/tasks/temporary', data),
  generateTasks: (date: string) => api.post('/hygiene/tasks/generate', { date }),
  startTask: (id: string) => api.put('/hygiene/tasks/' + id + '/start'),
  completeTask: (id: string, data: any) => api.put('/hygiene/tasks/' + id + '/complete', data),
  approveTask: (id: string, data: any) => api.put('/hygiene/tasks/' + id + '/approve', data),
  skipTask: (id: string, reason: string) => api.put('/hygiene/tasks/' + id + '/skip', { reason }),
  reportIssue: (id: string, data: any) => api.put('/hygiene/tasks/' + id + '/issue', data),
  taskLogs: (id: string) => api.get('/hygiene/tasks/' + id + '/logs'),

  // Stats
  stats: (date: string) => api.get('/hygiene/stats', { params: { date } }),
  statsRange: (startDate: string, endDate: string) => api.get('/hygiene/stats/range', { params: { startDate, endDate } }),
  staffStats: (startDate: string, endDate: string) => api.get('/hygiene/stats/staff', { params: { startDate, endDate } }),

  // Presets (user-configurable, fetched from HygieneConfig)
  categories: () => api.get('/hygiene/categories'),
  priorities: () => api.get('/hygiene/priorities'),
  shifts: () => api.get('/hygiene/shifts'),
  evidenceTypes: () => api.get('/hygiene/evidence-types'),
  weekdays: () => api.get('/hygiene/weekdays'),
  frequencies: () => api.get('/hygiene/frequencies'),
  assignedTypes: () => api.get('/hygiene/assigned-types'),

  // Config management
  getConfig: (key: string) => api.get('/hygiene/config/' + key),
  getAllConfigs: () => api.get('/hygiene/config'),
  updateConfig: (key: string, value: any[]) => api.put('/hygiene/config/' + key, value),
}

// BOM Analysis
export const bomApi = {
  getProducts: () => api.get('/bom/products'),
  getProductDetail: (id: string) => api.get('/bom/products/' + id),
  getMaterialUsage: (days?: number) => api.get('/bom/materials/usage', { params: days ? { days } : undefined }),
  getLowStockAlerts: (days?: number) => api.get('/bom/materials/low-stock-alert', { params: days ? { days } : undefined }),
  getRecipeCost: (productId: string) => api.get('/bom/recipes/' + productId + '/cost'),
  getInventoryBreakdown: (inventoryId: string, quantity?: number) =>
    api.get('/bom/inventory/' + inventoryId + '/breakdown', {
      params: quantity ? { quantity } : undefined
    })
}

// Announcements
export const announcementApi = {
  list: (storeId?: string) => api.get('/announcement', { params: storeId ? { storeId } : undefined }),
  get: (id: string) => api.get('/announcement/' + id),
  create: (data: any) => api.post('/announcement', data),
  update: (id: string, data: any) => api.put('/announcement/' + id, data),
  delete: (id: string) => api.delete('/announcement/' + id)
}

// Salaries
export const salaryApi = {
  list: (params?: any) => api.get('/salaries', { params }),
  create: (data: any) => api.post('/salaries', data),
  update: (id: string, data: any) => api.put('/salaries/' + id, data),
  markPaid: (id: string) => api.put('/salaries/' + id + '/mark-paid'),
  delete: (id: string) => api.delete('/salaries/' + id),
  calculate: (staffId: string, month: number, year: number) =>
    api.get('/staff-salary/calculate/' + staffId, { params: { month, year } })
}

// Marketing
export const marketingApi = {
  // Campaigns
  campaigns: (storeId?: string) => api.get('/marketing/campaigns', { params: storeId ? { storeId } : undefined }),
  getCampaign: (id: string) => api.get('/marketing/campaigns/' + id),
  createCampaign: (data: any) => api.post('/marketing/campaigns', data),
  updateCampaign: (id: string, data: any) => api.put('/marketing/campaigns/' + id, data),
  deleteCampaign: (id: string) => api.delete('/marketing/campaigns/' + id),
  campaignStats: (id: string) => api.get('/marketing/campaigns/' + id + '/stats'),
  // Campaign Categories
  campaignCategories: (storeId?: string) => api.get('/marketing/campaign-categories', { params: storeId ? { storeId } : undefined }),
  getCampaignCategory: (id: string) => api.get('/marketing/campaign-categories/' + id),
  createCampaignCategory: (data: any) => api.post('/marketing/campaign-categories', data),
  updateCampaignCategory: (id: string, data: any) => api.put('/marketing/campaign-categories/' + id, data),
  deleteCampaignCategory: (id: string) => api.delete('/marketing/campaign-categories/' + id),
  seedCampaignCategories: (storeId: string) => api.post('/marketing/campaign-categories/seed', { storeId }),
  // Coupons
  coupons: (storeId?: string) => api.get('/marketing/coupons', { params: storeId ? { storeId } : undefined }),
  getCoupon: (id: string) => api.get('/marketing/coupons/' + id),
  createCoupon: (data: any) => api.post('/marketing/coupons', data),
  updateCoupon: (id: string, data: any) => api.put('/marketing/coupons/' + id, data),
  deleteCoupon: (id: string) => api.delete('/marketing/coupons/' + id),
  getMemberCoupons: (memberId: string) => api.get('/marketing/members/' + memberId + '/coupons'),
  generateCoupon: (couponId: string, memberId: string) => api.post('/marketing/coupons/' + couponId + '/generate/' + memberId),
  redeemCoupon: (memberCouponId: string, orderId: string) => api.post('/marketing/coupons/' + memberCouponId + '/redeem', { orderId }),
  // Automation
  runAutomation: (storeId?: string) => api.post('/marketing/automation/run', {}, { params: storeId ? { storeId } : undefined }),
  runBirthdayAutomation: (storeId?: string) => api.post('/marketing/automation/birthday', {}, { params: storeId ? { storeId } : undefined }),
  runReactivationAutomation: (storeId?: string) => api.post('/marketing/automation/reactivation', {}, { params: storeId ? { storeId } : undefined }),
  runPointsExpiringAutomation: (storeId?: string) => api.post('/marketing/automation/points-expiring', {}, { params: storeId ? { storeId } : undefined }),
  runSeasonalAutomation: (storeId?: string) => api.post('/marketing/automation/seasonal', {}, { params: storeId ? { storeId } : undefined }),
  // Automation time settings
  getAutomationTime: (storeId?: string) => api.get('/marketing/automation/time', { params: storeId ? { storeId } : undefined }),
  setAutomationTime: (storeId: string, time: string) => api.put('/marketing/automation/time', { time }, { params: { storeId } }),
  // Referrals
  referrals: (storeId?: string) => api.get('/marketing/referrals', { params: storeId ? { storeId } : undefined }),
  getReferral: (id: string) => api.get('/marketing/referrals/' + id),
  createReferral: (data: any) => api.post('/marketing/referrals', data),
  updateReferral: (id: string, data: any) => api.put('/marketing/referrals/' + id, data),
  deleteReferral: (id: string) => api.delete('/marketing/referrals/' + id),
  referralStats: (id: string) => api.get('/marketing/referrals/' + id + '/stats'),
  applyReferralCode: (memberId: string, code: string) => api.post('/marketing/referrals/apply', { memberId, code }),
  // Tier Benefits
  tierBenefits: (storeId?: string) => api.get('/marketing/tier-benefits', { params: storeId ? { storeId } : undefined }),
  getTierBenefit: (id: string) => api.get('/marketing/tier-benefits/' + id),
  createTierBenefit: (data: any) => api.post('/marketing/tier-benefits', data),
  updateTierBenefit: (id: string, data: any) => api.put('/marketing/tier-benefits/' + id, data),
  deleteTierBenefit: (id: string) => api.delete('/marketing/tier-benefits/' + id),
  // Points Expiry
  pointsExpiryRules: (storeId?: string) => api.get('/marketing/points-expiry-rules', { params: storeId ? { storeId } : undefined }),
  createPointsExpiryRule: (data: any) => api.post('/marketing/points-expiry-rules', data),
  updatePointsExpiryRule: (id: string, data: any) => api.put('/marketing/points-expiry-rules/' + id, data),
  processPointsExpiry: (storeId: string) => api.post('/marketing/points-expiry-rules/process', { storeId }),
  // Marketing Channels
  marketingChannels: (storeId?: string) => api.get('/marketing/channels', { params: storeId ? { storeId } : undefined }),
  createMarketingChannel: (data: any) => api.post('/marketing/channels', data),
  updateMarketingChannel: (id: string, data: any) => api.put('/marketing/channels/' + id, data),
  deleteMarketingChannel: (id: string) => api.delete('/marketing/channels/' + id),
  // Analytics
  marketingROI: (params: any) => api.get('/marketing/analytics/roi', { params }),
  campaignAnalytics: (id: string, params: any) => api.get('/marketing/analytics/campaigns/' + id, { params }),
  // Notifications
  notifications: (params: any) => api.get('/notifications', { params }),
  createNotification: (data: any) => api.post('/notifications', data),
  markNotificationRead: (id: string) => api.put('/notifications/' + id + '/read'),
  markAllNotificationsRead: () => api.put('/notifications/mark-all-read'),
  // Member Balance
  searchMember: (phone: string) => api.get('/marketing/members/search', { params: { phone } }),
  getMemberBalance: (memberId: string) => api.get('/marketing/members/' + memberId + '/balance'),
  getBalanceLogs: (storeId: string) => api.get('/marketing/balance-logs', { params: { storeId } }),
  memberTopup: (memberId: string, amount: number, note?: string) => api.post('/marketing/members/' + memberId + '/balance/topup', { amount, note }),
  memberDeduct: (memberId: string, amount: number, note?: string) => api.post('/marketing/members/' + memberId + '/balance/deduct', { amount, note }),
  // Discount Rules
  discountRules: (storeId?: string) => api.get('/marketing/discount-rules', { params: storeId ? { storeId } : undefined }),
  createDiscountRule: (data: any) => api.post('/marketing/discount-rules', data),
  updateDiscountRule: (id: string, data: any) => api.put('/marketing/discount-rules/' + id, data),
  deleteDiscountRule: (id: string) => api.delete('/marketing/discount-rules/' + id),
  // Timed Specials
  timedSpecials: (storeId?: string) => api.get('/marketing/timed-specials', { params: storeId ? { storeId } : undefined }),
  createTimedSpecial: (data: any) => api.post('/marketing/timed-specials', data),
  updateTimedSpecial: (id: string, data: any) => api.put('/marketing/timed-specials/' + id, data),
  deleteTimedSpecial: (id: string) => api.delete('/marketing/timed-specials/' + id),
  // Stacking Rules
  stackingRules: (storeId?: string) => api.get('/marketing/stacking-rules', { params: storeId ? { storeId } : undefined }),
  createStackingRule: (data: any) => api.post('/marketing/stacking-rules', data),
  updateStackingRule: (id: string, data: any) => api.put('/marketing/stacking-rules/' + id, data),
  deleteStackingRule: (id: string) => api.delete('/marketing/stacking-rules/' + id),
  // Automation Rules
  automationRules: (storeId?: string) => api.get('/marketing/automation-rules', { params: storeId ? { storeId } : undefined }),
  createAutomationRule: (data: any) => api.post('/marketing/automation-rules', data),
  updateAutomationRule: (id: string, data: any) => api.put('/marketing/automation-rules/' + id, data),
  deleteAutomationRule: (id: string) => api.delete('/marketing/automation-rules/' + id),
  toggleAutomationRule: (id: string, status: string) => api.put('/marketing/automation-rules/' + id + '/status', { status }),
  automationLogs: (storeId?: string) => api.get('/marketing/automation-logs', { params: storeId ? { storeId } : undefined }),
  messageStats: (storeId: string, period: string) => api.get('/marketing/message-stats', { params: { storeId, period } }),
  couponReports: (storeId: string, period: string) => api.get('/marketing/coupon-reports', { params: { storeId, period } }),
  campaignReports: (storeId: string) => api.get('/marketing/campaign-reports', { params: { storeId } }),
  referralFunnel: (storeId: string, period: string) => api.get('/marketing/referral-funnel', { params: { storeId, period } }),
  searchProducts: (keyword: string) => api.get('/products', { params: { keyword, storeId: useAuthStore.getState().user?.storeId } })
}

// Message Management API
export const messageApi = {
  // Channels
  channels: () => api.get('/messages/channels'),
  createChannel: (data: any) => api.post('/messages/channels', data),
  updateChannel: (id: string, data: any) => api.put('/messages/channels/' + id, data),
  deleteChannel: (id: string) => api.delete('/messages/channels/' + id),

  // Templates
  templates: (type?: string) => api.get('/messages/templates', { params: type ? { type } : undefined }),
  createTemplate: (data: any) => api.post('/messages/templates', data),
  updateTemplate: (id: string, data: any) => api.put('/messages/templates/' + id, data),
  deleteTemplate: (id: string) => api.delete('/messages/templates/' + id),
  initTemplates: () => api.post('/messages/templates/init'),
  variables: () => api.get('/messages/variables'),

  // Logs
  logs: (params?: any) => api.get('/messages/logs', { params }),
  stats: () => api.get('/messages/stats'),

  // Send
  send: (data: any) => api.post('/messages/send', data),
  broadcast: (data: any) => api.post('/messages/broadcast', data)
}

// Points Rules
export const pointsRuleApi = {
  get: () => api.get('/points-rules'),
  update: (data: any) => api.put('/points-rules', data)
}

// Rewards Catalog
export const rewardApi = {
  list: (params?: { active?: boolean }) => api.get('/rewards', { params }),
  get: (id: string) => api.get('/rewards/' + id),
  create: (data: any) => api.post('/rewards', data),
  update: (id: string, data: any) => api.put('/rewards/' + id, data),
  remove: (id: string) => api.delete('/rewards/' + id),
  redeem: (id: string, data: { memberId: string; orderId?: string }) => api.post('/rewards/' + id + '/redeem', data),
  memberRewards: (memberId: string, params?: { unused?: boolean }) => api.get('/rewards/member/' + memberId, { params }),
  markUsed: (id: string, orderId: string) => api.put('/rewards/use/' + id, { orderId })
}

// Staff Points
export const staffPointsApi = {
  getStorePoints: (storeId: string) => api.get('/staff-points/store/' + storeId),
  getBalance: (staffId: string) => api.get('/staff-points/balance/' + staffId),
  getHistory: (staffId: string, limit?: number) => api.get('/staff-points/history/' + staffId, { params: limit ? { limit } : undefined }),
  earn: (data: { staffId: string; points: number; reason: string; note?: string }) => api.post('/staff-points/earn', data),
  adjust: (data: { staffId: string; points: number; reason: string; note?: string }) => api.post('/staff-points/adjust', data),
  // Redemption
  getPendingRedemptions: () => api.get('/staff-points/redemption/pending'),
  fulfillRedemption: (id: string) => api.post('/staff-points/redemption/' + id + '/fulfill'),
  cancelRedemption: (id: string) => api.post('/staff-points/redemption/' + id + '/cancel'),
  // Points Rules
  getRules: () => api.get('/staff-points/rules'),
  saveRules: (rules: any) => api.put('/staff-points/rules', rules)
}

// Deposit Management
export const depositApi = {
  // Rules
  rules: () => api.get('/deposit/rules'),
  createRule: (data: any) => api.post('/deposit/rules', data),
  updateRule: (id: string, data: any) => api.put('/deposit/rules/' + id, data),
  deleteRule: (id: string) => api.delete('/deposit/rules/' + id),
  // Staff Deposits
  staffDeposits: () => api.get('/deposit/staff-list'),
  getStaffDeposit: (staffId: string) => api.get('/deposit/staff/' + staffId),
  createStaffDeposit: (data: any) => api.post('/deposit/staff', data),
  calculateDeduction: (staffDepositId: string) => api.get('/deposit/calculate/' + staffDepositId),
  recordDeduction: (data: any) => api.post('/deposit/deduct', data),
  calculateRefund: (staffDepositId: string) => api.get('/deposit/refund/calculate/' + staffDepositId),
  processRefund: (data: any) => api.post('/deposit/refund', data)
}

// Attendance Rules
export const attendanceRulesApi = {
  list: () => api.get('/attendance-rules'),
  create: (data: any) => api.post('/attendance-rules', data),
  update: (id: string, data: any) => api.put('/attendance-rules/' + id, data),
  delete: (id: string) => api.delete('/attendance-rules/' + id)
}

// Training
export const trainingApi = {
  getCategories: () => api.get('/training/categories'),
  saveCategories: (data: any) => api.post('/training/categories', data),
  getAll: () => api.get('/staff-management/training/all'),
  delete: (id: string) => api.delete('/staff-management/training/' + id)
}

export const receiptTemplateApi = {
  list: (storeId: string) => api.get('/receipt-templates', { params: { storeId } }),
  get: (id: string) => api.get('/receipt-templates/' + id),
  create: (data: { storeId: string; name: string; content: string; isDefault?: boolean }) =>
    api.post('/receipt-templates', data),
  update: (id: string, data: { name?: string; content?: string; isDefault?: boolean }) =>
    api.put('/receipt-templates/' + id, data),
  delete: (id: string) => api.delete('/receipt-templates/' + id),
  setDefault: (id: string) => api.put('/receipt-templates/' + id + '/set-default'),
  getDefault: (storeId: string) => api.get('/receipt-templates/default', { params: { storeId } })
}

export const posActionLogApi = {
  list: (params: { page?: number; limit?: number; staffId?: string; severity?: string; action?: string; startDate?: string; endDate?: string }) =>
    api.get('/pos-action-logs', { params }),
  getStats: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/pos-action-logs/stats', { params }),
  getSessions: () => api.get('/pos-action-logs/sessions'),
}