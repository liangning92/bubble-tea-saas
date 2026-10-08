import { lazy, Suspense } from 'react'
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
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RootRoute() {
  const { isAuthenticated } = useAuthStore()
  return <Navigate to={isAuthenticated ? "/pos" : "/login"} replace />
}

const TvDisplayPage = lazy(() => import('./pages/TvDisplayPage').then(module => ({ default: module.TvDisplayPage })))

function App() {
  const installing=useOrderStore(state=>state.isInstallingUpdate)
  return (
    <>
      <UpdateNotification />
      <div style={installing?{pointerEvents:'none'}:undefined} onKeyDownCapture={event=>{if(installing){event.preventDefault();event.stopPropagation()}}}>
      <Suspense fallback={<RouteLoading />}><Routes>
      <Route path="/login" element={<LoginPage />} />
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
    </>
  )
}

export default App
