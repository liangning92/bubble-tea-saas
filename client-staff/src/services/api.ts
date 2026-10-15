import axios from 'axios'
import { useAuthStore } from '../stores/auth'

function getApiBase(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
  return configured.endsWith('/api') ? configured : `${configured}/api`
}

const API_BASE = getApiBase()

export const http = axios.create({ timeout: 15000 })
http.interceptors.response.use(response => response, error => {
  const token = useAuthStore.getState().token
  if (error.response?.status === 401 && token && error.config?.headers?.Authorization === `Bearer ${token}`) {
    sessionStorage.setItem('staff-login-notice', 'expired')
    useAuthStore.getState().logout()
  }
  return Promise.reject(error)
})

const getAuthHeader = () => {
  const token = useAuthStore.getState().token
  return token ? { Authorization: `Bearer ${token}`, 'X-Client-App': 'employee' } : {}
}

async function loadShiftSettings() {
  const response = await http.get(`${API_BASE}/shifts`, { headers: getAuthHeader() })
  if (!Array.isArray(response.data?.data)) throw new Error('Invalid shift settings response')
  return response.data.data
}

export const staffApi = {
 reportTaskIssue: async(id:string,description:string)=>(await http.put(`${API_BASE}/hygiene/tasks/${id}/issue`,{description},{headers:getAuthHeader()})).data,
  getInventoryCounts:async()=> (await http.get(`${API_BASE}/inventory-counts`,{headers:getAuthHeader()})).data,
  recordInventoryCount:async(countId:string,itemId:string,data:any)=>(await http.put(`${API_BASE}/inventory-counts/${countId}/item/${itemId}`,data,{headers:getAuthHeader()})).data,

  // Auth
  login: async (phone: string, password: string) => {
    const response = await http.post(`${API_BASE}/auth/login`, { phone, password })
    return response.data
  },

  // Attendance -统一使用 /staff/attendance (type字段区分check_in/check_out)
  checkIn: async (data: { storeId: string; date: string; checkInTime: string; location?: string }) => {
    const response = await http.post(`${API_BASE}/staff/attendance`, {
      type: 'check_in',
      gpsLocation: data.location,
      date: data.date
    }, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // QR Attendance - 扫描前台POS动态防伪码打卡
  checkInWithQR: async (qrData: string, type: 'check_in' | 'check_out' = 'check_in', attendanceId?: string) => {
    const response = await http.post(`${API_BASE}/attendance-qr/verify`, {
      qrData,
      type,
      attendanceId
    }, {
      headers: getAuthHeader()
    })
    return response.data
  },

  checkOut: async (attendanceId: string, data: { checkOutTime: string; location?: string }) => {
    // 服务端通过同一个endpoint处理check_out，使用type字段
    const response = await http.post(`${API_BASE}/staff/attendance`, {
      type: 'check_out',
      attendanceId,
      gpsLocation: data.location
    }, {
      headers: getAuthHeader()
    })
    return response.data
  },

  getTodayAttendance: async (staffId: string) => {
    const response = await http.get(`${API_BASE}/staff/attendance/today`, {
      params: { staffId },
      headers: getAuthHeader()
    })
    return response.data
  },

  // Monthly Overview for Home Page
  getMonthlyOverview: async (params?: { month?: number; year?: number }) => {
    const [response, shifts] = await Promise.all([
      http.get(`${API_BASE}/staff/overview/monthly`, { params, headers: getAuthHeader() }),
      loadShiftSettings()
    ])
    const todayShift = response.data.data?.schedule?.todayShift
    const settings = shifts.find((shift: any) => shift.key === todayShift?.shiftKey)
    if (todayShift && settings) {
      Object.assign(todayShift, { shiftName: settings.name, shiftNameZh: settings.nameZh, shiftNameId: settings.nameId })
    }
    return response.data
  },

  getAttendanceHistory: async (staffId: string, month: number, year: number) => {
    const response = await http.get(`${API_BASE}/staff/attendance/history`, {
      params: { staffId, month, year },
      headers: getAuthHeader()
    })
    return response.data
  },

  // Schedule
  getMySchedule: async (staffId: string, weekStart: string) => {
    const [response, shiftDetails] = await Promise.all([
      http.get(`${API_BASE}/staff/schedule/my`, {
        params: { staffId, weekStart }, headers: getAuthHeader()
      }),
      loadShiftSettings()
    ])
    return { ...response.data, data: response.data.data ? { ...response.data.data, shiftDetails } : null }
  },

  // Attendance Rules
  getAttendanceRules: async () => {
    const response = await http.get(`${API_BASE}/attendance-rules`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Salary
  getMyProbation: async (month: string) => {const response = await http.get(`${API_BASE}/staff/salary/my/probation`, {params:{month},headers:getAuthHeader()});return response.data},
  getMySalary: async (staffId: string, month: number, year: number) => {
    const response = await http.get(`${API_BASE}/staff/salary/my`, {
      params: { staffId, month, year },
      headers: getAuthHeader()
    })
    return response.data
  },

  // Profile
  getMyProfile: async () => {
    const response = await http.get(`${API_BASE}/auth/me`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  changePassword: async (oldPassword: string, newPassword: string) => {
    const response = await http.put(`${API_BASE}/auth/password`, {
      oldPassword,
      newPassword
    }, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Notifications
  getNotifications: async () => {
    const response = await http.get(`${API_BASE}/notifications`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  markNotificationRead: async (id: string) => {
    const response = await http.put(`${API_BASE}/notifications/${id}/read`, {}, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Leave Types
  getLeaveRules: async () => {
    const response=await http.get(`${API_BASE}/leave/rules`, {headers:getAuthHeader()})
    const rules=response.data?.data
    if(!rules||!Array.isArray(rules.blockedLeaveWeekdays)||rules.blockedLeaveWeekdays.some((day:unknown)=>typeof day!=='number'||!Number.isInteger(day)||day<0||day>6)||typeof rules.allowHalfDayLeave!=='boolean')throw new Error('LEAVE_RULES_READ_FAILED')
    return response.data
  },
  getLeaveTypes: async () => {
    const response = await http.get(`${API_BASE}/leave-types`, {
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
    const response = await http.post(`${API_BASE}/leave/apply`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  getMyLeaves: async (params?: { status?: string; startDate?: string; endDate?: string }) => {
    const response = await http.get(`${API_BASE}/leave/my`, {
      params,
      headers: getAuthHeader()
    })
    return response.data
  },

  getMyLeaveBalance: async (year?: number) => {
    const response = await http.get(`${API_BASE}/leave/balance`, {
      params: { year },
      headers: getAuthHeader()
    })
    return response.data
  },

  cancelLeave: async (leaveId: string) => {
    const response = await http.put(`${API_BASE}/leave/cancel/${leaveId}`, {}, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Reimbursement
  getReimbursementTypes: async () => {
    const response = await http.get(`${API_BASE}/reimbursement-types`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  applyReimbursement: async (data: {
    type: string
    amount: number
    description: string
    receiptUrls?: string[]
  }) => {
    const response = await http.post(`${API_BASE}/reimbursement/apply`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  getMyReimbursements: async (params?: { status?: string; startDate?: string; endDate?: string }) => {
    const response = await http.get(`${API_BASE}/reimbursement/my`, {
      params,
      headers: getAuthHeader()
    })
    return response.data
  },

  cancelReimbursement: async (reimbursementId: string) => {
    const response = await http.put(`${API_BASE}/reimbursement/cancel/${reimbursementId}`, {}, {
      headers: getAuthHeader()
    })
    return response.data
  },

  uploadReceipts: async (files: File[]) => {
    const formData = new FormData()
    files.forEach(file => formData.append('receipts', file))
    const response = await http.post(`${API_BASE}/reimbursement/upload`, formData, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  },

  uploadAttachment: async (file: File) => {
    const formData = new FormData()
    formData.append('files', file)
    const response = await http.post(`${API_BASE}/upload/attachment`, formData, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  },

  getStoreAnnouncements: async (storeId: string) => (await http.get(`${API_BASE}/announcement/active`, { params: { storeId }, headers: getAuthHeader() })).data,
  startTask: async (taskId: string) => (await http.put(`${API_BASE}/hygiene/tasks/${taskId}/start`, {}, { headers: getAuthHeader() })).data,

  // Hygiene Tasks
  getMyTasks: async (date?: string) => {
    const response = await http.get(`${API_BASE}/hygiene/tasks/my`, {
      params: { date },
      headers: getAuthHeader()
    })
    return response.data
  },

  getMyPendingTasks: async () => {
    const response = await http.get(`${API_BASE}/hygiene/tasks/my/pending`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  getPendingTasks: async () => {
    const response = await http.get(`${API_BASE}/hygiene/tasks/pending`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  completeTask: async (taskId: string, data: { photoUrl?: string; note?: string }) => {
    const response = await http.put(`${API_BASE}/hygiene/tasks/${taskId}/complete`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  skipTask: async (taskId: string, note: string) => {
    const response = await http.put(`${API_BASE}/hygiene/tasks/${taskId}/skip`, { note }, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Inventory Management
  getInventoryList: async (params?: { storeId?: string; search?: string; category?: string; lowStock?: boolean }) => {
    const response = await http.get(`${API_BASE}/inventory`, {
      params,
      headers: getAuthHeader()
    })
    return response.data
  },

  getInventoryDetail: async (inventoryId: string) => {
    const response = await http.get(`${API_BASE}/inventory/${inventoryId}`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  stockIn: async (data: { inventoryId: string; storeId: string; quantity: number; unitCost?: number; note?: string }) => {
    const response = await http.post(`${API_BASE}/inventory/stock-in`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  stockOut: async (data: { inventoryId: string; storeId: string; quantity: number; reason: string; note?: string }) => {
    const response = await http.post(`${API_BASE}/inventory/stock-out`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  getStockLogs: async (params?: { storeId?: string; inventoryId?: string; type?: 'stock-in' | 'stock-out' }) => {
    try {
      const [stockInRes, stockOutRes] = await Promise.all([
        http.get(`${API_BASE}/inventory/logs/stock-in`, { params, headers: getAuthHeader() }),
        http.get(`${API_BASE}/inventory/logs/stock-out`, { params, headers: getAuthHeader() })
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
      throw error
    }
  },

  getLowStockAlerts: async (storeId: string) => {
    try {
      const response = await http.get(`${API_BASE}/inventory/alerts/low-stock`, {
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
    const response = await http.get(`${API_BASE}/staff-points/my`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  getMyPointLogs: async (params?: { type?: string; startDate?: string; endDate?: string }) => {
    const response = await http.get(`${API_BASE}/staff-points/logs/my`, {
      params,
      headers: getAuthHeader()
    })
    return response.data
  },

  getAvailableRewards: async () => {
    const response = await http.get(`${API_BASE}/staff-points/rewards/available`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  redeemReward: async (data: { rewardId: string; quantity?: number }) => {
    const response = await http.post(`${API_BASE}/staff-points/redeem`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Staff Deposit
  getMyDeposit: async () => {
    const response = await http.get(`${API_BASE}/deposit/staff/my`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  getMyDepositLogs: async () => {
    const response = await http.get(`${API_BASE}/deposit/staff/my/logs`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  getDepositRules: async () => {
    const response = await http.get(`${API_BASE}/deposit/rules`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Training
  getMyTraining: async () => {
    const response = await http.get(`${API_BASE}/training/my`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Recipe book: active products with specs + BOM (ingredients)
  getRecipes: async () => {
    const response = await http.get(`${API_BASE}/products`, {
      params: { status: 'active' },
      headers: getAuthHeader()
    })
    return response.data
  },

  // Shift Swap
  getPendingShiftSwaps: async () => (await http.get(`${API_BASE}/shift-swap/pending-confirm`, { headers: getAuthHeader() })).data,
  confirmShiftSwap: async (id: string) => (await http.put(`${API_BASE}/shift-swap/${id}/confirm`, {}, { headers: getAuthHeader() })).data,
  getMyShiftSwaps: async () => {
    const response = await http.get(`${API_BASE}/shift-swap/my`, {
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
    const response = await http.post(`${API_BASE}/shift-swap`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Overtime Request
  getMyOvertimeRequests: async () => {
    const response = await http.get(`${API_BASE}/overtime/my`, {
      headers: getAuthHeader()
    })
    return response.data
  },

  createOvertimeRequest: async (data: {
    date: string
    startTime: string
    endTime: string
    reason?: string
  }) => {
    const response = await http.post(`${API_BASE}/overtime`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Attendance Correction
  getMyCorrections: async () => {
    const response = await http.get(`${API_BASE}/staff-correction/my`, {
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
    const response = await http.post(`${API_BASE}/staff-correction`, data, {
      headers: getAuthHeader()
    })
    return response.data
  },

  // Training Categories
  getTrainingCategories: async () => {
    const response = await http.get(`${API_BASE}/training/categories`, {
      headers: getAuthHeader()
    })
    return response.data
  }
}

export const employeeApi = {
 get: async (path:string) => (await http.get(`${API_BASE}/staff-work${path}`,{headers:getAuthHeader()})).data.data,
 post: async (path:string,data:any) => (await http.post(`${API_BASE}/staff-work${path}`,data,{headers:getAuthHeader()})).data.data,
 put: async (path:string,data:any) => (await http.put(`${API_BASE}/staff-work${path}`,data,{headers:getAuthHeader()})).data.data,
 delete: async(path:string,data?:any) => http.delete(`${API_BASE}/staff-work${path}`,{headers:getAuthHeader(),data}),
 upload: async(file:File) => {const data=new FormData();data.append('file',file);return (await http.post(`${API_BASE}/staff-work/my/files`,data,{headers:getAuthHeader()})).data.data.id},
 file: async(id:string) => {const res=await http.get(`${API_BASE}/staff-work/files/${id}`,{headers:getAuthHeader(),responseType:'blob'});return res.data as Blob},
 permissions: async() => (await http.get(`${API_BASE}/staff-permissions/me`,{headers:getAuthHeader()})).data.data
}

const approvalHeaders=()=>({...getAuthHeader(),'X-Client-App':'pos'})
export const staffPermissionClient={get:(path:string,config?:any)=>http.get(API_BASE+path,{...config,headers:approvalHeaders()}),post:(path:string,body:any,config?:any)=>http.post(API_BASE+path,body,{...config,headers:approvalHeaders()})}
