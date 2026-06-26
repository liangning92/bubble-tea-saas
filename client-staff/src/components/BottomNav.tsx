import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Clock, Calendar, CalendarDays, Receipt, User } from 'lucide-react'

export function BottomNav() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path: string) => location.pathname === path

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 flex justify-around z-40">
      <button
        onClick={() => navigate('/')}
        className={`flex flex-col items-center gap-1 ${
          isActive('/') ? 'text-primary' : 'text-gray-400'
        }`}
      >
        <Clock size={22} />
        <span className="text-xs">{t('nav.attendance')}</span>
      </button>
      <button
        onClick={() => navigate('/schedule')}
        className={`flex flex-col items-center gap-1 ${
          isActive('/schedule') ? 'text-primary' : 'text-gray-400'
        }`}
      >
        <Calendar size={22} />
        <span className="text-xs">{t('nav.schedule')}</span>
      </button>
      <button
        onClick={() => navigate('/leave')}
        className={`flex flex-col items-center gap-1 ${
          isActive('/leave') ? 'text-primary' : 'text-gray-400'
        }`}
      >
        <CalendarDays size={22} />
        <span className="text-xs">{t('nav.leave')}</span>
      </button>
      <button
        onClick={() => navigate('/reimbursement')}
        className={`flex flex-col items-center gap-1 ${
          isActive('/reimbursement') ? 'text-primary' : 'text-gray-400'
        }`}
      >
        <Receipt size={22} />
        <span className="text-xs">{t('nav.reimbursement')}</span>
      </button>
      <button
        onClick={() => navigate('/profile')}
        className={`flex flex-col items-center gap-1 ${
          isActive('/profile') ? 'text-primary' : 'text-gray-400'
        }`}
      >
        <User size={22} />
        <span className="text-xs">{t('nav.profile')}</span>
      </button>
    </nav>
  )
}
