import axios from 'axios'
import { useAuthStore } from '../stores/auth'

const API_BASE = '/api'

const getAuthHeader = () => {
  const token = useAuthStore.getState().token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const staffApi = {
  // Auth
  login: async (phone: string, password: string) => {
    const response = await axios.post(`${API_BASE}/auth/login`, { phone, password })
    return response.data
  },

  // Attendance -统一使用 /staff/attendance (type字段区分check_in/check_out)
  checkIn: async (data: { storeId: string; date: string; checkInTime: string; location?: string }) => {
    const response = await axios.post(`${API_BASE}/staff/attendance`, {
      type: 'check_in',
      gpsLocation: data.location,
      date: data.date
    }, {
      headers: getAuthHeader()
    })
    return response.data
  },

  checkOut: async (attendanceId: string, data: { checkOutTime: string; location?: string }) => {
    // 服务端通过同一个endpoint处理check_out，使用type字段
    const response = await axios.post(`${API_BASE}/staff/attendance`, {
      type: 'check_out',
      attendanceId,
      gpsLocation: data.location
    }, {
      headers: getAuthHeader()
    })
    return response.data
  },

  getTodayAttendance: async (staffId: string) => {
    const response = await axios.get(`${API_BASE}/staff/attendance/today`, {
      params: { staffId },
      headers: getAuthHeader()
    })
    return response.data
  },

  getAttendanceHistory: async (staffId: string, month: number, year: number) => {
    const response = await axios.get(`${API_BASE}/staff/attendance/history`, {
      params: { staffId, month, year },
      headers: getAuthHeader()
    })
    return response.data
  },

  // Schedule
  getMySchedule: async (staffId: string, weekStart: string) => {
    const response = await axios.get(`${API_BASE}/staff/schedule/my`, {
      params: { staffId, weekStart },
      headers: getAuthHeader()
    })
    return response.data
  },

  // Attendance Rules
  getAttendanceRules: async () => {
    const response = await axios.get(`${API_BASE}/attendance-rules`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Salary
  getMySalary: async (staffId: string, month: number, year: number) => {
    const response = await axios.get(`${API_BASE}/staff/salary/my`, {
      params: { staffId, month, year },
      headers: getAuthHeader()
    })
    return response.data
  },

  // Profile
  getMyProfile: async () => {
    const response = await axios.get(`${API_BASE}/auth/me`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  changePassword: async (oldPassword: string, newPassword: string) => {
    const response = await axios.put(`${API_BASE}/auth/password`, {
      oldPassword,
      newPassword
    }, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Notifications
  getNotifications: async () => {
    const response = await axios.get(`${API_BASE}/notifications`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  markNotificationRead: async (id: string) => {
    const response = await axios.put(`${API_BASE}/notifications/${id}/read`, {}, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Leave Types
  getLeaveTypes: async () => {
    const response = await axios.get(`${API_BASE}/leave-types`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Leave
  applyLeave: async (data: {
    leaveType: string
    startDate: string
    endDate: string
    totalDays: number
    reason?: string
    halfDay?: boolean
    contactPhone?: string
    attachmentUrl?: string
  }) => {
    const response = await axios.post(`${API_BASE}/leave/apply`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  getMyLeaves: async (params?: { status?: string; startDate?: string; endDate?: string }) => {
    const response = await axios.get(`${API_BASE}/leave/my`, {
      params,
      headers: getAuthHeader()
    })
    return response.data
  },

  getMyLeaveBalance: async (year?: number) => {
    const response = await axios.get(`${API_BASE}/leave/balance`, {
      params: { year },
      headers: getAuthHeader()
    })
    return response.data
  },

  cancelLeave: async (leaveId: string) => {
    const response = await axios.put(`${API_BASE}/leave/cancel/${leaveId}`, {}, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Reimbursement
  applyReimbursement: async (data: {
    type: string
    amount: number
    description: string
    receiptUrls?: string[]
  }) => {
    const response = await axios.post(`${API_BASE}/reimbursement/apply`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  getMyReimbursements: async (params?: { status?: string; startDate?: string; endDate?: string }) => {
    const response = await axios.get(`${API_BASE}/reimbursement/my`, {
      params,
      headers: getAuthHeader()
    })
    return response.data
  },

  cancelReimbursement: async (reimbursementId: string) => {
    const response = await axios.put(`${API_BASE}/reimbursement/cancel/${reimbursementId}`, {}, {
      headers: getAuthHeader()
    })
    return response.data
  },

  uploadReceipts: async (files: File[]) => {
    const formData = new FormData()
    files.forEach(file => formData.append('receipts', file))
    const response = await axios.post(`${API_BASE}/reimbursement/upload`, formData, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  },

  // Hygiene Tasks
  getMyTasks: async (date?: string) => {
    const response = await axios.get(`${API_BASE}/hygiene/tasks/my`, {
      params: { date },
      headers: getAuthHeader()
    })
    return response.data
  },

  getMyPendingTasks: async () => {
    const response = await axios.get(`${API_BASE}/hygiene/tasks/my/pending`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  getPendingTasks: async () => {
    const response = await axios.get(`${API_BASE}/hygiene/tasks/pending`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  completeTask: async (taskId: string, data: { photoUrl?: string; note?: string }) => {
    const response = await axios.put(`${API_BASE}/hygiene/tasks/${taskId}/complete`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  skipTask: async (taskId: string, note: string) => {
    const response = await axios.put(`${API_BASE}/hygiene/tasks/${taskId}/skip`, { note }, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Inventory Management
  getInventoryList: async (params?: { storeId?: string; search?: string; category?: string; lowStock?: boolean }) => {
    const response = await axios.get(`${API_BASE}/inventory`, {
      params,
      headers: getAuthHeader()
    })
    return response.data
  },

  getInventoryDetail: async (inventoryId: string) => {
    const response = await axios.get(`${API_BASE}/inventory/${inventoryId}`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  stockIn: async (data: { inventoryId: string; storeId: string; quantity: number; unitCost?: number; note?: string }) => {
    const response = await axios.post(`${API_BASE}/inventory/stock-in`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  stockOut: async (data: { inventoryId: string; storeId: string; quantity: number; reason: string; note?: string }) => {
    const response = await axios.post(`${API_BASE}/inventory/stock-out`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  getStockLogs: async (params?: { storeId?: string; inventoryId?: string; type?: 'stock-in' | 'stock-out' }) => {
    try {
      const [stockInRes, stockOutRes] = await Promise.all([
        axios.get(`${API_BASE}/inventory/logs/stock-in`, { params, headers: getAuthHeader() }),
        axios.get(`${API_BASE}/inventory/logs/stock-out`, { params, headers: getAuthHeader() })
      ])

      const stockInLogs = stockInRes.data?.data?.list || []
      const stockOutLogs = stockOutRes.data?.data?.list || []

      // Mark logs with type and combine
      const allLogs = [
        ...stockInLogs.map((l: any) => ({ ...l, logType: 'stock-in' })),
        ...stockOutLogs.map((l: any) => ({ ...l, logType: 'stock-out' }))
      ]

      // Sort by date descending
      allLogs.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      return { code: 200, data: { list: allLogs } }
    } catch (error) {
      return { code: 500, message: 'Failed to load stock logs' }
    }
  },

  getLowStockAlerts: async (storeId: string) => {
    try {
      const response = await axios.get(`${API_BASE}/inventory/alerts/low-stock`, {
        params: { storeId },
        headers: getAuthHeader()
      })
      return response.data
    } catch (error) {
      // Staff may not have access, return empty
      return { code: 200, data: { list: [] } }
    }
  },

  // Staff Points
  getMyPoints: async () => {
    const response = await axios.get(`${API_BASE}/staff-points/my`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  getMyPointLogs: async (params?: { type?: string; startDate?: string; endDate?: string }) => {
    const response = await axios.get(`${API_BASE}/staff-points/logs/my`, {
      params,
      headers: getAuthHeader()
    })
    return response.data
  },

  getAvailableRewards: async () => {
    const response = await axios.get(`${API_BASE}/staff-points/rewards/available`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  redeemReward: async (data: { rewardId: string; quantity?: number }) => {
    const response = await axios.post(`${API_BASE}/staff-points/redeem`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Staff Deposit
  getMyDeposit: async () => {
    const response = await axios.get(`${API_BASE}/deposit/staff/my`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  getMyDepositLogs: async () => {
    const response = await axios.get(`${API_BASE}/deposit/staff/my/logs`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  getDepositRules: async () => {
    const response = await axios.get(`${API_BASE}/deposit/rules`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Training
  getMyTraining: async () => {
    const response = await axios.get(`${API_BASE}/training/my`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Shift Swap
  getMyShiftSwaps: async () => {
    const response = await axios.get(`${API_BASE}/shift-swap/my`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  createShiftSwap: async (data: {
    originalDate: string
    originalShift: string
    targetDate: string
    targetShift: string
    reason?: string
  }) => {
    const response = await axios.post(`${API_BASE}/shift-swap`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Overtime Request
  getMyOvertimeRequests: async () => {
    const response = await axios.get(`${API_BASE}/overtime/my`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  createOvertimeRequest: async (data: {
    date: string
    hours: number
    reason?: string
  }) => {
    const response = await axios.post(`${API_BASE}/overtime`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Attendance Correction
  getMyCorrections: async () => {
    const response = await axios.get(`${API_BASE}/staff-correction/my`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  createCorrection: async (data: {
    date: string
    originalCheckIn?: string
    originalCheckOut?: string
    correctCheckIn: string
    correctCheckOut: string
    reason: string
  }) => {
    const response = await axios.post(`${API_BASE}/staff-correction`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Training Categories
  getTrainingCategories: async () => {
    const response = await axios.get(`${API_BASE}/training/categories`, {
      headers: getAuthHeader()
    })
    return response.data
  }
}