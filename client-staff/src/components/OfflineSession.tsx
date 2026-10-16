import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WifiOff, LogIn, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'
import { BottomNav } from './BottomNav'

export function OfflineSession() {
  const { user, offlineUntil, logout } = useAuthStore(), { t, i18n } = useTranslation(), navigate = useNavigate()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    if (!offlineUntil || now >= offlineUntil) { logout(); sessionStorage.setItem('staff-login-notice', 'expired'); navigate('/login', { replace: true }) }
  }, [offlineUntil, now, logout, navigate])
  const signIn = () => { logout(); navigate('/login', { replace: true }) }
  return <div className="employee-shell">
    <main className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      <section role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
        <h1 className="flex items-center gap-3 text-xl font-semibold"><WifiOff aria-hidden size={24} />{t('auth.offlineTitle')}</h1>
        <p className="mt-3 text-base">{t('auth.offlineDescription')}</p>
      </section>
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-xl font-semibold">{user?.name || user?.phone}</h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><dt className="text-sm text-gray-500">{t('auth.phone')}</dt><dd>{user?.phone}</dd></div>
          <div><dt className="text-sm text-gray-500">{t('auth.offlineStore')}</dt><dd>{user?.storeName || user?.storeId}</dd></div>
          <div className="sm:col-span-2"><dt className="text-sm text-gray-500">{t('auth.offlineUntil')}</dt><dd>{offlineUntil ? new Date(offlineUntil).toLocaleString(i18n.language) : '—'}</dd></div>
        </dl>
      </section>
      <p className="text-gray-600">{t('auth.offlineOperations')}</p>
      <div className="flex flex-wrap gap-3">
        <button onClick={signIn} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-white"><LogIn size={20}/>{t('auth.offlineReconnect')}</button>
        <button onClick={signIn} className="flex items-center gap-2 rounded-xl border bg-white px-5 py-3"><LogOut size={20}/>{t('auth.logout')}</button>
      </div>
    </main>
    <BottomNav />
  </div>
}
