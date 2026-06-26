import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import {
  LayoutDashboard,
  Package,
  Warehouse,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Globe,
  Megaphone,
  Sprout,
  Wallet,
  Link2
} from 'lucide-react'
import { useState } from 'react'

// 一级导航只有10个模块
const navItems = [
  { path: '/dashboard', label: 'nav.dashboard', icon: LayoutDashboard },
  { path: '/products', label: 'nav.products', icon: Package },
  { path: '/inventory', label: 'nav.inventory', icon: Warehouse },
  { path: '/finance', label: 'nav.finance', icon: Wallet },
  { path: '/channels', label: 'nav.channels', icon: Link2 },
  { path: '/staff', label: 'nav.staff', icon: Users },
  { path: '/hygiene', label: 'nav.hygiene', icon: Sprout },
  { path: '/marketing', label: 'nav.marketing', icon: Megaphone },
  { path: '/settings', label: 'nav.settings', icon: Settings },
]

export function MainLayout() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-surface">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-white border-r border-border transition-all duration-300 flex flex-col`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-border">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-white font-bold text-sm">🧋</span>
              </div>
              <span className="font-semibold text-gray-900">Bubble Tea</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path)
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-light text-primary'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <item.icon size={22} />
                {sidebarOpen && (
                  <span className="font-medium">{t(item.label)}</span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User Info */}
        <div className="p-4 border-t border-border space-y-3">
          {/* Language Selector */}
          {sidebarOpen ? (
            <div className="relative">
              <select
                value={i18n.language}
                onChange={(e) => {
                  const lang = e.target.value
                  i18n.changeLanguage(lang)
                  localStorage.setItem('bubble-tea-language', lang)
                }}
                className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white appearance-none cursor-pointer"
              >
                <option value="id">🇮🇩 Bahasa Indonesia</option>
                <option value="en">🇬🇧 English</option>
                <option value="zh">🇨🇳 中文</option>
              </select>
              <Globe size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          ) : (
            <select
              value={i18n.language}
              onChange={(e) => {
                const lang = e.target.value
                i18n.changeLanguage(lang)
                localStorage.setItem('bubble-tea-language', lang)
              }}
              className="w-10 h-10 border border-gray-200 rounded-lg text-sm bg-white flex items-center justify-center cursor-pointer"
            >
              <option value="id">🇮🇩</option>
              <option value="en">🇬🇧</option>
              <option value="zh">🇨🇳</option>
            </select>
          )}
          {sidebarOpen ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center">
                <span className="text-primary font-semibold">
                  {user?.staff?.name?.charAt(0) || user?.phone?.charAt(0) || 'U'}
                </span>
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900 text-sm">
                  {user?.staff?.name || 'User'}
                </p>
                <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                title={t('auth.logout')}
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className="w-full p-2 rounded-lg hover:bg-gray-100 text-gray-500 flex justify-center"
              title={t('auth.logout')}
            >
              <LogOut size={20} />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}