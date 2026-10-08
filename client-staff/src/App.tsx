import { lazy, Suspense } from 'react'
import { RouteLoading } from './components/RouteLoading'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/auth'
import { BottomNav } from './components/BottomNav'

// Layout with BottomNav
const TrainingLibraryPage = lazy(() => import('./pages/TrainingLibraryPage').then(module => ({ default: module.TrainingLibraryPage })))
const InventoryCountPage = lazy(() => import('./pages/InventoryCountPage').then(module => ({ default: module.InventoryCountPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then(module => ({ default: module.LoginPage })))
const HomePage = lazy(() => import('./pages/HomePage').then(module => ({ default: module.HomePage })))
const AttendancePage = lazy(() => import('./pages/AttendancePage').then(module => ({ default: module.AttendancePage })))
const AttendanceCorrectionPage = lazy(() => import('./pages/AttendanceCorrectionPage').then(module => ({ default: module.AttendanceCorrectionPage })))
const OvertimeRequestPage = lazy(() => import('./pages/OvertimeRequestPage').then(module => ({ default: module.OvertimeRequestPage })))
const ShiftSwapPage = lazy(() => import('./pages/ShiftSwapPage').then(module => ({ default: module.ShiftSwapPage })))
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage').then(module => ({ default: module.AnnouncementsPage })))
const SchedulePage = lazy(() => import('./pages/SchedulePage').then(module => ({ default: module.SchedulePage })))
const SalaryPage = lazy(() => import('./pages/SalaryPage').then(module => ({ default: module.SalaryPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(module => ({ default: module.ProfilePage })))
const LeavePage = lazy(() => import('./pages/LeavePage').then(module => ({ default: module.LeavePage })))
const ReimbursementPage = lazy(() => import('./pages/ReimbursementPage').then(module => ({ default: module.ReimbursementPage })))
const HygienePage = lazy(() => import('./pages/HygienePage').then(module => ({ default: module.HygienePage })))
const InventoryPage = lazy(() => import('./pages/InventoryPage').then(module => ({ default: module.InventoryPage })))
const StaffPointsPage = lazy(() => import('./pages/StaffPointsPage').then(module => ({ default: module.StaffPointsPage })))
const DepositPage = lazy(() => import('./pages/DepositPage').then(module => ({ default: module.DepositPage })))
const DepositRulesPage = lazy(() => import('./pages/DepositRulesPage').then(module => ({ default: module.DepositRulesPage })))
const TrainingPage = lazy(() => import('./pages/TrainingPage').then(module => ({ default: module.TrainingPage })))
const AttendanceRulesPage = lazy(() => import('./pages/AttendanceRulesPage').then(module => ({ default: module.AttendanceRulesPage })))

function LayoutWithNav({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <Suspense fallback={<RouteLoading />}>{children}</Suspense>
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
    <Suspense fallback={<RouteLoading />}><Routes>
      <Route path="/inventory/count" element={<ProtectedRoute><LayoutWithNav><InventoryCountPage /></LayoutWithNav></ProtectedRoute>} />
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
      <Route path="/training/library" element={<ProtectedRoute><LayoutWithNav><TrainingLibraryPage /></LayoutWithNav></ProtectedRoute>} />
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
    </Routes></Suspense>
  )
}

export default App