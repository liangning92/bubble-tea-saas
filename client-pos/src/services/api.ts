import axios from 'axios'
import { getApiUrl, setApiUrl } from '../config'
import { connectionManager, type ConnectionEvent } from './ConnectionManager'

const api = axios.create({
  baseURL: getApiUrl(),
  headers: { 'Content-Type': 'application/json' }
})

// Update baseURL dynamically (for API URL configuration)
export function updateApiUrl(url: string) {
  api.defaults.baseURL = url
}

// Listen for connection manager events to update API URL
connectionManager.addListener((event: ConnectionEvent) => {
  if (event.type === 'connected' || event.type === 'url-changed') {
    if (event.url) {
      api.defaults.baseURL = event.url
      setApiUrl(event.url)
      console.log('[API] Updated baseURL to:', event.url)
    }
  }
})

// Fetch API URL from server config (Admin can change this)
export async function fetchApiUrlFromServer(): Promise<string | null> {
  try {
    const token = localStorage.getItem('pos-auth')
    if (!token) return null

    const { state } = JSON.parse(token)
    if (!state?.token || !state?.user?.storeId) return null

    const storeId = state.user.storeId
    const response = await fetch(`${getApiUrl()}/api/config/${storeId}/pos_api_url`, {
      headers: {
        Authorization: `Bearer ${state.token}`
      }
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

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pos-auth')
  if (token) {
    try {
      const { state } = JSON.parse(token)
      if (state?.token) {
        config.headers.Authorization = `Bearer ${state.token}`
      }
    } catch {}
  }
  return config
})

export default api

export const posApi = {
  // Products (cached for offline)
  getProducts: (storeId: string) => api.get(`/products?storeId=${storeId}&status=active`),
  getProductsForPOS: (storeId: string) => api.get(`/products/pos?storeId=${storeId}`),
  getProductsVersion: (storeId: string) => api.get(`/products/pos/version?storeId=${storeId}`),
  getProductByBarcode: (barcode: string) => api.get(`/products/barcode/${barcode}`),

  // Channels
  getChannels: (storeId: string) => api.get('/channels', { params: { storeId } }),

  // Orders
  createOrder: (data: any) => api.post('/orders', data),
  getOrders: (params?: any) => api.get('/orders', { params }),
  requestRefund: (data: { orderId: string; reason: string; staffId?: string }) =>
    api.post('/orders/refund-request', data),

  // Members
  getMembers: (params?: any) => api.get('/members', { params }),
  getMemberByBarcode: (barcode: string) => api.get(`/members/barcode/${barcode}`),
  createMember: (data: any) => api.post('/members', data),

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

  // Staff
  getStaffInfo: () => api.get('/auth/me'),

  // Hygiene
  getMyTasks: (date?: string) => api.get('/hygiene/tasks/my', { params: { date } }),
  getPendingTasks: () => api.get('/hygiene/tasks/pending'),
  getTask: (id: string) => api.get('/hygiene/tasks/' + id),
  startTask: (id: string) => api.put('/hygiene/tasks/' + id + '/start'),
  completeTask: (id: string, data: { photoUrl?: string; signatureUrl?: string; note?: string; checklistResults?: { checklistId: string; completed: boolean; note?: string }[] }) =>
    api.put(`/hygiene/tasks/${id}/complete`, data),
  skipTask: (id: string, note: string) =>
    api.put(`/hygiene/tasks/${id}/skip`, { note }),

  // Cash Management
  getCashBalance: () => api.get('/pos-cash/balance'),
  getCashEvents: (params?: any) => api.get('/pos-cash/events', { params }),
  createCashEvent: (data: any) => api.post('/pos-cash/events', data),
  getTodayCash: () => api.get('/pos-cash/today'),
  getShifts: (params?: any) => api.get('/pos-cash/shifts', { params }),
  getCurrentShift: () => api.get('/pos-cash/shifts/current'),
  openShift: (data: { openFloat: number; shift: string }) => api.post('/pos-cash/shifts/open', data),
  closeShift: (data: { actualCash: number; closeNote?: string; nextStaffId?: string }) =>
    api.post('/pos-cash/shifts/close', data),
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
  requestTestPrint: (printerName: string, storeId: string) =>
    api.post('/hardware/test-print', { printerName, storeId }),
  requestTestDrawer: (printerName: string, storeId: string) =>
    api.post('/hardware/test-drawer', { printerName, storeId })
}