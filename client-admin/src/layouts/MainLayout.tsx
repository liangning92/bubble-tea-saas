import { EmployeeAccessContext } from '../contexts/EmployeeAccess'
import api from '../services/api'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { YOUME_LOGO_RED } from '../assets/logo'
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
import { Suspense, useState, useEffect } from 'react'
import { RouteLoading } from '../components/RouteLoading'

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
  const [lang, setLang] = useState(i18n.language)
  const [access,setAccess]=useState<{actor:string;role:{name:string;permissions:string[]}|null;failed:boolean}|null>(null)
  const actorKey=(user?.id||'')+':'+(user?.storeId||'')+':'+(user?.role||'')
  useEffect(()=>{
    if(user?.role==='admin'){setAccess({actor:actorKey,role:null,failed:false});return}
    if(!user?.id)return
    let current=true
    const refresh=()=>api.get('/staff-permissions/me').then(response=>{if(current)setAccess({actor:actorKey,role:response.data.data.role,failed:false})})
      .catch(()=>{if(current)setAccess({actor:actorKey,role:null,failed:true})})
    void refresh()
    window.addEventListener('focus',refresh)
    window.addEventListener('staff-access-changed',refresh)
    return()=>{current=false;window.removeEventListener('focus',refresh);window.removeEventListener('staff-access-changed',refresh)}
  },[actorKey,user?.role,location.pathname])
  const ready=user?.role==='admin'||(access?.actor===actorKey&&!access.failed)
  const customRole=access?.actor===actorKey?access.role:null
  const visibleNavItems=navItems.filter(item=>{
    if(user?.role==='admin')return true
    if(!ready)return false
    if(!customRole)return true
    const groups:Record<string,string[]>={
      '/dashboard':['dashboard.read'], '/products':['products.read'], '/inventory':['inventory.read'],
      '/finance':['finance.read','dashboard.read'], '/channels':['channels.read'],
      '/staff':['staff.read','attendance.read','schedules.read','salary.read','deposits.read','rewards.read','training.read'],
      '/hygiene':['hygiene.read'], '/marketing':['marketing.read','members.read'], '/settings':[]
    }
    return (groups[item.path]||[]).some(permission=>customRole.permissions.includes(permission))
  })

  const navigationTarget=(path:string)=>{
    if(!customRole)return path
    const permissions=customRole.permissions
    if(path==='/finance'&&!permissions.includes('dashboard.read'))return '/finance/expenses'
    if(path==='/marketing'&&!permissions.includes('marketing.read'))return '/marketing/members'
    if(path==='/staff'&&!permissions.includes('staff.read')){
      const pages=[['attendance.read','/staff/attendance'],['schedules.read','/staff/schedule'],['salary.read','/staff/salary'],['deposits.read','/staff/salary/deposit'],['rewards.read','/staff/points'],['training.read','/staff/training']]
      return pages.find(([permission])=>permissions.includes(permission))?.[1]||path
    }
    return path
  }

  // 监听 i18n 语言变化，强制 React 重新渲染
  useEffect(() => {
    const handler = () => setLang(i18n.language)
    i18n.on('languageChanged', handler)
    return () => { i18n.off('languageChanged', handler) }
  }, [])

  const handleLanguageChange = (newLang: string) => {
    i18n.changeLanguage(newLang).then(() => {
      localStorage.setItem('bubble-tea-language', newLang)
      setLang(newLang)
      // 强制重新加载以确保所有组件使用新语言
      window.location.reload()
    })
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <EmployeeAccessContext.Provider value={{role:customRole,ready}}>
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
              <img
                src={YOUME_LOGO_RED}
                alt="YOUME"
                onError={(e) => {
                  const target = e.currentTarget as HTMLImageElement
                  target.onerror = null
                  target.src = YOUME_LOGO_RED
                }}
                className="h-10 w-auto object-contain"
              />
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
          {visibleNavItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path)
            return (
              <Link
                key={item.path}
                to={navigationTarget(item.path)}
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
                value={lang}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white appearance-none cursor-pointer"
              >
                <option value="id">🇮🇩 Bahasa Indonesia</option>
                <option value="en">🇬🇧 English</option>
                <option value="zh">🇨🇳 {t('common.chinese')}</option>
              </select>
              <Globe size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          ) : (
            <select
              value={lang}
              onChange={(e) => handleLanguageChange(e.target.value)}
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
                <p className="text-xs text-gray-500 capitalize">{customRole?.name || user?.role}</p>
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
          {!ready ? access?.failed ? <div role="alert" className="card text-red-600">{t('common.error')}<button className="btn-primary ml-4" onClick={()=>window.location.reload()}>{t('common.refresh')}</button></div> : <RouteLoading /> : <Suspense fallback={<RouteLoading />}><Outlet /></Suspense>}
        </div>
      </main>
    </div>
    </EmployeeAccessContext.Provider>
  )
}