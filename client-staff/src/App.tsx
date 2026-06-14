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
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance"
        element={
          <ProtectedRoute>
            <AttendancePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance/correction"
        element={
          <ProtectedRoute>
            <AttendanceCorrectionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/overtime"
        element={
          <ProtectedRoute>
            <OvertimeRequestPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/shift-swap"
        element={
          <ProtectedRoute>
            <ShiftSwapPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/announcements"
        element={
          <ProtectedRoute>
            <AnnouncementsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/schedule"
        element={
          <ProtectedRoute>
            <SchedulePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/salary"
        element={
          <ProtectedRoute>
            <SalaryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/leave"
        element={
          <ProtectedRoute>
            <LeavePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reimbursement"
        element={
          <ProtectedRoute>
            <ReimbursementPage />
          </ProtectedRoute>
        }
      />
       <Route
        path="/hygiene"
        element={
          <ProtectedRoute>
            <HygienePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedRoute>
            <InventoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/points"
        element={
          <ProtectedRoute>
            <StaffPointsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/deposit"
        element={
          <ProtectedRoute>
            <DepositPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/deposit/rules"
        element={
          <ProtectedRoute>
            <DepositRulesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/training"
        element={
          <ProtectedRoute>
            <TrainingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance/rules"
        element={
          <ProtectedRoute>
            <AttendanceRulesPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default App