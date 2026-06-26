import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/auth'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { AttendancePage } from './pages/AttendancePage'
import { AttendanceCorrectionPage } from './pages/AttendanceCorrectionPage'
import { OvertimeRequestPage } from './pages/OvertimeRequestPage'
import { ShiftSwapPage } from './pages/ShiftSwapPage'
import { AnnouncementsPage } from './pages/AnnouncementsPage'
import { SchedulePage } from './pages/SchedulePage'
import { SalaryPage } from './pages/SalaryPage'
import { ProfilePage } from './pages/ProfilePage'
import { LeavePage } from './pages/LeavePage'
import { ReimbursementPage } from './pages/ReimbursementPage'
import { HygienePage } from './pages/HygienePage'
import { InventoryPage } from './pages/InventoryPage'
import { StaffPointsPage } from './pages/StaffPointsPage'
import { DepositPage } from './pages/DepositPage'
import { DepositRulesPage } from './pages/DepositRulesPage'
import { TrainingPage } from './pages/TrainingPage'
import { AttendanceRulesPage } from './pages/AttendanceRulesPage'
import { BottomNav } from './components/BottomNav'

// Layout with BottomNav
function LayoutWithNav({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {children}
      <BottomNav />
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <LayoutWithNav><HomePage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance"
        element={
          <ProtectedRoute>
            <LayoutWithNav><AttendancePage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance/correction"
        element={
          <ProtectedRoute>
            <LayoutWithNav><AttendanceCorrectionPage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
      <Route
        path="/overtime"
        element={
          <ProtectedRoute>
            <LayoutWithNav><OvertimeRequestPage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
      <Route
        path="/shift-swap"
        element={
          <ProtectedRoute>
            <LayoutWithNav><ShiftSwapPage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
      <Route
        path="/announcements"
        element={
          <ProtectedRoute>
            <LayoutWithNav><AnnouncementsPage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
      <Route
        path="/schedule"
        element={
          <ProtectedRoute>
            <LayoutWithNav><SchedulePage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
      <Route
        path="/salary"
        element={
          <ProtectedRoute>
            <LayoutWithNav><SalaryPage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <LayoutWithNav><ProfilePage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leave"
        element={
          <ProtectedRoute>
            <LayoutWithNav><LeavePage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reimbursement"
        element={
          <ProtectedRoute>
            <LayoutWithNav><ReimbursementPage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
       <Route
        path="/hygiene"
        element={
          <ProtectedRoute>
            <LayoutWithNav><HygienePage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedRoute>
            <LayoutWithNav><InventoryPage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
      <Route
        path="/points"
        element={
          <ProtectedRoute>
            <LayoutWithNav><StaffPointsPage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
      <Route
        path="/deposit"
        element={
          <ProtectedRoute>
            <LayoutWithNav><DepositPage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
      <Route
        path="/deposit/rules"
        element={
          <ProtectedRoute>
            <LayoutWithNav><DepositRulesPage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
      <Route
        path="/training"
        element={
          <ProtectedRoute>
            <LayoutWithNav><TrainingPage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance/rules"
        element={
          <ProtectedRoute>
            <LayoutWithNav><AttendanceRulesPage /></LayoutWithNav>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default App