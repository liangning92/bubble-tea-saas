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
import { useAuthStore } from './stores/auth'
import { SetupWizard } from './pages/SetupWizard'
import { useEffect, useState } from 'react'
import { checkSyncStatus } from './services/syncApi'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function App() {
  const [checked, setChecked] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    checkSyncStatus().then(data => {
      setNeedsSetup(!data.isSetUp)
      setChecked(true)
    }).catch(() => {
      setNeedsSetup(true)
      setChecked(true)
    })
  }, [])

  if (!checked) return null

  return (
    <Routes>
      {needsSetup && <Route path="/setup" element={<SetupWizard />} />}
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
      <Route
        path={needsSetup ? '/*' : '/'}
        element={
          needsSetup ? <Navigate to="/setup" replace /> :
          <ProtectedRoute>
            <POSPage />
          </ProtectedRoute>
        }
      />
      {needsSetup && <Route path="/" element={<Navigate to="/setup" replace />} />}
      {!needsSetup && <Route path="/setup" element={<Navigate to="/" replace />} />}
    </Routes>
  )
}

export default App