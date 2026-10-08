import { readSnapshot, saveSnapshot, snapshotPath } from '../utils/offlineSale'
import { assertBackendAuth, assertCheckoutBackend, backendIdentity, backendAuthHeaders, readBackendAuth } from '../utils/backendIdentity'
import axios from 'axios'
import { getApiUrl, setApiUrl, normalizeApiUrl } from '../config'
import { connectionManager, type ConnectionEvent } from './ConnectionManager'

declare module 'axios' {
  interface AxiosRequestConfig { posBackend?: string; posStoreId?: string; posActorId?: string; posCachedSnapshot?: boolean; posSnapshotComplete?: boolean }
}

const api = axios.create({
  baseURL: getApiUrl(),
  headers: { 'Content-Type': 'application/json' }
})

// Update baseURL dynamically (for API URL configuration)
export function updateApiUrl(url: string) {
  const normalized = normalizeApiUrl(url)
  setApiUrl(normalized)
  api.defaults.baseURL = normalized
}

// Listen for connection manager events to update API URL
connectionManager.addListener((event: ConnectionEvent) => {
  if (event.type === 'connected' || event.type === 'url-changed') {
    if (event.url) {
      const normalized = normalizeApiUrl(event.url)
      api.defaults.baseURL = connectionManager.getCurrentUrl()
    }
  }
})

// Fetch API URL from server config (Admin can change this)
export async function fetchApiUrlFromServer(): Promise<string | null> {
  try {
    const token = sessionStorage.getItem('pos-auth')
    if (!token) return null

    const { state } = JSON.parse(token)
    if (!state?.token || !state?.user?.storeId) return null

    const storeId = state.user.storeId
    // baseUrl already ends with /api, so use /config not /api/config
    const baseUrl = getApiUrl().replace(/\/$/, '')  // Remove trailing slash
    const response = await fetch(`${baseUrl}/config/${storeId}/pos_api_url`, {
      headers: backendAuthHeaders(baseUrl, storeId)
    })

    if (response.ok) {
      const data = await response.json()
      if (data.data?.value) {
        return data.data.value
      }
    }
  } catch (e) {
    // Ignore errors, will use cached URL
  }
  return null
}

api.interceptors.request.use(async (config) => {
  config.baseURL = config.posBackend ? assertCheckoutBackend(config.posBackend, config.posStoreId || '') : connectionManager.getCurrentUrl()
  if (!config.url?.includes('/auth/login') && !(!readBackendAuth().token && config.method === 'get' && snapshotPath(config.url || ''))) assertBackendAuth(backendIdentity(config.baseURL))
  const requestIdentity = readBackendAuth()
  if (config.method === 'get' && snapshotPath(config.url || '')) {
    const queryStore = config.params?.storeId || new URL(config.url!,window.location.href).searchParams.get('storeId')
    if (queryStore && queryStore !== requestIdentity.user?.storeId) throw new Error('CHECKOUT_BACKEND_LOGIN_REQUIRED')
    config.posStoreId = requestIdentity.user?.storeId
    config.posActorId = requestIdentity.user?.id
    config.posSnapshotComplete = snapshotPath(config.url || '') !== '/config' || !(config.params?.category || new URL(config.url!,window.location.href).searchParams.get('category'))
  }
  const cachedPath = config.method === 'get' && snapshotPath(config.url || '')
  if (cachedPath && !readBackendAuth().token) {
    const storeId = readBackendAuth().user?.storeId
    if (!storeId) throw new Error('OFFLINE_INITIALIZATION_REQUIRED')
    const data = await readSnapshot(cachedPath,storeId)
    config.posCachedSnapshot = true
    config.adapter = async () => ({data,status:200,statusText:'Local cached snapshot',headers:{},config})
  }
  const token = sessionStorage.getItem('pos-auth')
  if (token) {
    try {
      const { state } = JSON.parse(token)
      if (state?.token && !config.url?.includes('/auth/login')) {
        config.headers.Authorization = `Bearer ${state.token}`
      }
    } catch {}
  }
  return config
})

api.interceptors.response.use(
  async (response) => {
    const path = response.config.method === 'get' && snapshotPath(response.config.url || '')
    const auth = JSON.parse(sessionStorage.getItem('pos-auth') || '{}').state
    if (path && !response.config.posCachedSnapshot && auth?.user?.storeId === response.config.posStoreId && auth?.user?.id === response.config.posActorId) await saveSnapshot(path,response.data,backendIdentity(response.config.baseURL!),auth.user.storeId,response.config.posSnapshotComplete === true)
    return response
  },
  async (error) => {
    const path = error.config?.method === 'get' && snapshotPath(error.config.url || '')
    const auth = JSON.parse(sessionStorage.getItem('pos-auth') || '{}').state
    if (path && !error.response && auth?.user?.storeId === error.config.posStoreId && auth?.user?.id === error.config.posActorId) {
      try { return {data:await readSnapshot(path,auth.user.storeId),status:200,config:error.config,headers:{},statusText:'Local cached snapshot'} } catch {}
    }
    // Auto-logout on 401 Unauthorized (except for login requests)
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      import('../stores/auth').then(({ useAuthStore }) => {
        const current = readBackendAuth()
        if (current.apiUrl && backendIdentity(current.apiUrl) === backendIdentity(error.config.baseURL) && error.config.headers?.Authorization === `Bearer ${current.token}`) useAuthStore.getState().expireCloudSession()
      })
    }
    return Promise.reject(error)
  }
)

export default api

export const posApi = {
  // Products (cached for offline)
  getActivityPrices: () => api.get('/marketing/activity-prices', {timeout:5000}),
  getProducts: (storeId: string) => api.get(`/products?storeId=${storeId}&status=active`),
  getProductsForPOS: (storeId: string) => api.get(`/products/pos?storeId=${storeId}`),
  getProductsVersion: (storeId: string) => api.get(`/products/pos/version?storeId=${storeId}`),
  getProductByBarcode: (barcode: string) => api.get(`/products/barcode/${barcode}`),

  // Channels
  getChannels: (storeId: string) => api.get('/channels', { params: { storeId } }),

  // Orders
  retainReceivedReceipt: (data:any,backendUrl:string|undefined) => {
    if (!backendUrl) return Promise.reject(new Error('CHECKOUT_BACKEND_EVIDENCE_REQUIRED'))
    return api.post('/orders/received-receipts',data,{posBackend:backendUrl,posStoreId:data.request.storeId})
  },
  createOrder: (data: any, backendUrl: string | undefined) => {
    if (!backendUrl) return Promise.reject(new Error('CHECKOUT_BACKEND_EVIDENCE_REQUIRED'))
    return api.post('/orders', data, { posBackend: backendUrl, posStoreId: data.storeId })
  },
  deleteOrder: (id: string) => api.delete(`/orders/${id}`),
  getOrders: (params?: any) => api.get('/orders', { params }),
  getRefundQuote: (id: string) => api.get(`/orders/${id}/refund-quote`),
  requestRefund: (data: { orderId: string; reason: string; staffId?: string; reasonCode: string; selectedItemIds?: string[]; requestId?: string; items?: {itemId:string;quantity:number}[] }) =>
    api.post('/orders/refund-request', data),

  // Members
  getMembers: (params?: any) => api.get('/members', { params }),
  getMemberByBarcode: (barcode: string) => api.get(`/members/barcode/${barcode}`),
  createMember: (data: any) => api.post('/members', data),
  getMemberCoupons: (memberId: string) => api.get(`/marketing/members/${memberId}/coupons`),
  verifyCoupon: (code: string, memberId?: string) =>
    api.post('/marketing/coupons/verify', { code, memberId }),
  redeemCoupon: (memberCouponId: string, orderId: string) =>
    api.post(`/marketing/coupons/${memberCouponId}/redeem`, { orderId }),

  // Marketing & Discount Rules
  getDiscountRules: (storeId: string) => api.get('/marketing/discount-rules', { params: { storeId, status: 'active' } }),

  // Auth
  login: (phone: string, password: string) =>
    api.post('/auth/login', { phone, password }),

  // Config
  getConfigs: (storeId: string, category?: string) =>
    api.get('/config', { params: { storeId, category } }),
  getConfig: (storeId: string, key: string) =>
    api.get(`/config/${storeId}/${key}`),
  setConfig: (storeId: string, key: string, value: any, category: string = 'pos') =>
    api.post('/config', { storeId, key, value, category }),
  setHardwareSettings: (storeId: string, hardwareSettings: any) =>
    api.put('/config/hardware-settings', { storeId, hardwareSettings }),
  reportPrinters: (printers: string[], storeId?: string) =>
    api.post('/hardware/printers', { printers, storeId }),

  // Receipt Template
  getReceiptTemplate: (templateId: string) =>
    api.get('/receipt-templates/' + templateId),
  getDefaultReceiptTemplate: (storeId?: string) =>
    api.get('/receipt-templates/default', { params: { storeId } }),
  getReceiptTemplates: (storeId?: string) =>
    api.get('/receipt-templates', { params: { storeId } }),

  // POS Action Log
  logPOSAction: (data: {
    action: string
    sessionId: string
    entityId?: string
    description: string
    metadata?: Record<string, any>
    severity?: 'info' | 'warning' | 'critical'
  }) => api.post('/pos-action-logs', data),

  // Staff
  getStaffInfo: () => api.get('/auth/me'),

  // Hygiene
  getMyTasks: (date?: string) => api.get('/hygiene/tasks/my', { params: { date } }),
  getPendingTasks: () => api.get('/hygiene/tasks/pending'),
  getOverdueTasks: () => api.get('/hygiene/tasks/overdue'),
  getTask: (id: string) => api.get('/hygiene/tasks/' + id),
  startTask: (id: string) => api.put('/hygiene/tasks/' + id + '/start'),
  completeTask: (id: string, data: { photoUrl?: string; signatureUrl?: string; note?: string; selfRating?: number; checklistResults?: { checklistId: string; completed: boolean; note?: string }[] }) =>
    api.put(`/hygiene/tasks/${id}/complete`, data),
  skipTask: (id: string, note: string) =>
    api.put(`/hygiene/tasks/${id}/skip`, { note }),

  // Cash Management
  getCashBalance: () => api.get('/pos-cash/balance'),
  getCashEvents: (params?: any) => api.get('/pos-cash/events', { params }),
  createCashEvent: (data: any) => api.post('/pos-cash/events', data),
  getTodayCash: () => api.get('/pos-cash/today'),
  getShifts: (params?: any) => api.get('/pos-cash/shifts', { params }),
  getShiftHandover: (id: string) => api.get('/pos-cash/shifts/' + id + '/handover'),
  getCurrentShift: () => api.get('/pos-cash/shifts/current'),
  openShift: (data: { openFloat: number; shift: string }) => api.post('/pos-cash/shifts/open', data),
  closeShift: async (data: { actualCash: number; closeNote?: string; nextStaffId?: string }) => {
    const response = await api.post('/pos-cash/shifts/close', data)
    const auth = readBackendAuth()
    if (auth.user?.storeId) await saveSnapshot('/pos-cash/shifts/current', {data:{hasOpenShift:false,shift:null}}, backendIdentity(auth.apiUrl!), auth.user.storeId, true)
    return response
  },
  getCashSummary: (params?: any) => api.get('/pos-cash/summary', { params }),

  // Announcements
  getActiveAnnouncements: (storeId: string) => api.get('/announcement/active', { params: { storeId } }),
  getHygieneAnnouncements: (storeId: string) => api.get('/announcement/hygiene/pending', { params: { storeId } }),

  // Attendance QR
  generateAttendanceQR: (posId: string) => api.post('/attendance-qr/generate', { posId }),
  verifyAttendanceQR: (qrData: string, type: 'check_in' | 'check_out' | 'verify', attendanceId?: string) =>
    api.post('/attendance-qr/verify', { qrData, type, attendanceId }),

  // QRIS Payments
  createQrisPayment: (storeId: string, orderId: string, amount: number) =>
    api.post('/payments/qris/create', { storeId, orderId, amount }),
  getQrisPaymentStatus: (externalId: string) =>
    api.get(`/payments/qris/status/${externalId}`),

  // Hardware (printers, cash drawers)
  getDetectedPrinters: () => api.get('/hardware/printers'),
  uploadPrinters: (printers: string[], storeId: string) =>
    api.post('/hardware/printers', { printers, storeId }),
  requestHardwareDetect: (storeId: string) =>
    api.post('/hardware/detect', { storeId }),
  getHardwareDetectStatus: () => api.get('/hardware/detect'),
  syncPrinters: (printers: string[], storeId: string) =>
    api.post('/hardware/printers', { printers, storeId }),
  requestTestPrint: (printerName: string, storeId: string) =>
    api.post('/hardware/test-print', { printerName, storeId }),
  requestTestDrawer: (printerName: string, storeId: string) =>
    api.post('/hardware/test-drawer', { printerName, storeId }),

  getMyPosExpenses: () => api.get('/expenses/pos'),
  createPosExpense: (data: { requestId: string; category: string; amount: number; quantity: number; description: string }) => api.post('/expenses/pos', data),
  getExpenseCategories: () => api.get('/expenses/categories'),
  // Expenses - POS can record daily expenses
  getExpenses: (params?: { startDate?: string; endDate?: string; type?: string }) =>
    api.get('/expenses', { params }),
  createExpense: (data: { type: string; category: string; amount: number; description: string; date: string }) =>
    api.post('/expenses', data),

  // File Upload
  uploadAttachment: (file: File) => {
    const formData = new FormData()
    formData.append('files', file)
    return api.post('/upload/attachment', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
}

// Shift API - uses admin's /api/shifts endpoint
export const shiftApi = {
  list: (storeId?: string) => api.get('/shifts', { params: storeId ? { storeId } : undefined }),
}

// TV Screen Marketing API
export const tvScreenApi = {
  getConfig: (storeId?: string, displayToken?: string) => api.get('/marketing/tv-screen/config', { params: { storeId, displayToken } }),
  triggerLottery: (data: { orderId: string }) =>
    api.post('/marketing/tv-screen/trigger-lottery', data),
}
