import {syncManager} from './db/offline'
import {OfflineRefundInbox} from './components/OfflineRefundInbox'
import {StaffAccessProvider,useStaffAccess} from '../../shared/StaffAccess'
import {StaffApprovalDialog} from '../../shared/StaffApprovalDialog'
import {StaffApprovalInbox} from '../../shared/StaffApprovalInbox'
import api from './services/api'
import {useLocation} from 'react-router-dom'
import { ReceiptHandoverModal } from './components/ReceiptHandoverModal'
import { lazy, Suspense, useEffect } from 'react'
import { RouteLoading } from './components/RouteLoading'
import { Routes, Route, Navigate } from 'react-router-dom'
import { UpdateNotification } from './components/UpdateNotification'
import { useAuthStore } from './stores/auth'
import {useOrderStore} from './stores/orderStore'

const ReceiptSyncPage = lazy(() => import('./pages/ReceiptSyncPage').then(module => ({ default: module.ReceiptSyncPage })))
const POSPage = lazy(() => import('./pages/POSPage').then(module => ({ default: module.POSPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then(module => ({ default: module.LoginPage })))
const OrderHistoryPage = lazy(() => import('./pages/OrderHistoryPage').then(module => ({ default: module.OrderHistoryPage })))
const CashManagementPage = lazy(() => import('./pages/CashManagementPage').then(module => ({ default: module.CashManagementPage })))
const DiagnosticsPage = lazy(() => import('./pages/DiagnosticsPage').then(module => ({ default: module.DiagnosticsPage })))
const CustomerDisplayPage = lazy(() => import('./pages/CustomerDisplayPage').then(module => ({ default: module.CustomerDisplayPage })))
const RegisterMemberPage = lazy(() => import('./pages/RegisterMemberPage').then(module => ({ default: module.RegisterMemberPage })))
const HygieneTasksPage = lazy(() => import('./pages/HygieneTasksPage').then(module => ({ default: module.HygieneTasksPage })))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  const access=useStaffAccess(),path=useLocation().pathname
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if(!access.ready)return access.failed?<button onClick={()=>window.dispatchEvent(new Event('focus'))}>读取权限失败 / Retry</button>:<RouteLoading/>
  const permission=path.startsWith('/approvals')?'personal.profile':path.startsWith('/cash')?'pos.cash':path.startsWith('/orders')?'orders.read':path.startsWith('/tasks')?'personal.tasks':'orders.create'
  if(!access.can(permission))return <p role="alert" className="p-6">Access denied / 无权限</p>
  return <>{children}</>
}

function RootRoute() {
  const { isAuthenticated } = useAuthStore()
  return <Navigate to={isAuthenticated ? "/pos" : "/login"} replace />
}

const TvDisplayPage = lazy(() => import('./pages/TvDisplayPage').then(module => ({ default: module.TvDisplayPage })))

function App({desktopStarting = false}: {desktopStarting?: boolean} = {}) {
  const {user,apiUrl,token,isAuthenticated}=useAuthStore()
  useEffect(()=>{if(desktopStarting)return;syncManager.startSync(30000);const resume=()=>{void syncManager.syncPendingOrders()};window.addEventListener('pos-session-restored',resume);return()=>{window.removeEventListener('pos-session-restored',resume);syncManager.destroy()}},[desktopStarting])
  useEffect(()=>{if(!desktopStarting&&user?.id)void syncManager.syncPendingOrders()},[desktopStarting,user?.id,user?.storeId,apiUrl,token])
  const installing=useOrderStore(state=>state.isInstallingUpdate)
  if(desktopStarting && user)return <RouteLoading/>
  return (
    <StaffAccessProvider api={api} actor={!desktopStarting&&user?[user.id,user.storeId,apiUrl||'pos'].join(':'):''} owner={!desktopStarting&&user?.role==='admin'}><StaffApprovalDialog/>
      <UpdateNotification />
      <ReceiptHandoverModal />
      <div style={installing?{pointerEvents:'none'}:undefined} onKeyDownCapture={event=>{if(installing){event.preventDefault();event.stopPropagation()}}}>
      <Suspense fallback={<RouteLoading />}><Routes>
      <Route path="/approvals" element={<ProtectedRoute><><OfflineRefundInbox/><StaffApprovalInbox api={api} userId={user?.id||''}/></></ProtectedRoute>}/>
      <Route path="/login" element={!desktopStarting&&isAuthenticated?<Navigate to="/pos" replace/>:<LoginPage desktopStarting={desktopStarting}/>} />
      <Route path="/customer-display" element={<CustomerDisplayPage />} />
      <Route path="/tv-display" element={<TvDisplayPage />} />
      <Route path="/register-member" element={<RegisterMemberPage />} />
      <Route path="/scan" element={
        <ProtectedRoute>
          <POSPage scanRoute />
        </ProtectedRoute>
      } />
      <Route path="/receipt-sync" element={<ProtectedRoute><ReceiptSyncPage /></ProtectedRoute>} />
      <Route path="/history" element={
        <ProtectedRoute>
          <OrderHistoryPage />
        </ProtectedRoute>
      } />
      <Route path="/cash" element={
        <ProtectedRoute>
          <CashManagementPage />
        </ProtectedRoute>
      } />
      <Route path="/tasks" element={
        <ProtectedRoute>
          <HygieneTasksPage />
        </ProtectedRoute>
      } />
      <Route path="/diagnostics" element={
        <ProtectedRoute>
          <DiagnosticsPage />
        </ProtectedRoute>
      } />
      <Route path="/pos" element={
        <ProtectedRoute>
          <POSPage />
        </ProtectedRoute>
      } />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <POSPage />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<RootRoute />} />
    </Routes></Suspense>
    </div>
    </StaffAccessProvider>
  )
}

export default App
