import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Clock, Calendar, Wallet, ShieldCheck, Package, Receipt, BookOpen, User, CalendarDays, Star } from 'lucide-react'

export function EmployeeActions() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const actions = [
    ['/attendance', 'nav.attendance', Clock], ['/salary', 'salary.title', Wallet],
    ['/schedule', 'home.schedule', Calendar], ['/hygiene', 'hygiene.title', ShieldCheck],
    ['/inventory', 'inventory.title', Package], ['/inventory/count', 'countFlow.title', Package],
    ['/reimbursement', 'home.reimbursement', Receipt], ['/training', 'home.training', BookOpen],
    ['/leave', 'home.leave', CalendarDays], ['/profile', 'profile.title', User],
    ['/points', 'home.points', Star], ['/deposit', 'home.deposit', Wallet]
  ] as const
  return <section aria-label={t('home.quickActions')}>
    <h2 className="text-sm font-bold text-gray-700 mb-3">{t('home.quickActions')}</h2>
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
      {actions.map(([path, key, Icon]) => <button key={path} onClick={() => navigate(path)} className="bg-white p-3 rounded-2xl border border-gray-100 flex flex-col items-center text-center active:scale-95 focus-visible:ring-2 focus-visible:ring-primary">
        <span className="w-11 h-11 bg-primary/10 text-primary rounded-xl flex items-center justify-center mb-2"><Icon size={22} /></span>
        <span className="text-sm font-semibold text-gray-800">{t(key)}</span>
      </button>)}
    </div>
  </section>
}
