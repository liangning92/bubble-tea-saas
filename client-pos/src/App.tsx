import { Routes, Route, Navigate } from 'react-router-dom'
import { POSPage } from './pages/POSPage'
import { LoginPage } from './pages/LoginPage'
import { OrderHistoryPage } from './pages/OrderHistoryPage'
import { CashManagementPage } from './pages/CashManagementPage'
import { DiagnosticsPage } from './pages/DiagnosticsPage'
import { CustomerDisplayPage } from './pages/CustomerDisplayPage'
import { RegisterMemberPage } from './pages/RegisterMemberPage'
import { ScanPage } from './pages/ScanPage'
import { HygieneTasksPage } from './pages/HygieneTasksPage'
import { UpdateNotification } from './components/UpdateNotification'
import { useAuthStore } from './stores/auth'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function App() {
  return (
    <>
      <UpdateNotification />
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/customer-display" element={<CustomerDisplayPage />} />
      <Route path="/register-member" element={<RegisterMemberPage />} />
      <Route path="/scan" element={
        <ProtectedRoute>
          <ScanPage />
        </ProtectedRoute>
      } />
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
      <Route path="/" element={<Navigate to="/pos" replace />} />
    </Routes>
    </>
  )
}

export default App
