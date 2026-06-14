import { useTranslation } from 'react-i18next'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { Wallet, Coins, Receipt } from 'lucide-react'

export function SalaryIndexPage() {
  const { t } = useTranslation()
  const location = useLocation()

  const tabs = [
    { key: 'salary', label: t('staff.salary'), path: '/staff/salary/salary', icon: Wallet },
    { key: 'reimbursement', label: t('nav.reimbursement'), path: '/staff/salary/reimbursement', icon: Receipt },
    { key: 'deposit', label: t('staff.deposit'), path: '/staff/salary/deposit', icon: Coins },
  ]

  const currentTab = tabs.find(tab => location.pathname.includes(tab.key))?.key || 'salary'

  return (
    <div className="flex flex-col h-full">
      {/* 三级导航 - 薪酬福利模块 */}
      <div className="sticky top-0 bg-gray-50 z-10 pb-4 mb-4">
        <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm inline-flex flex-wrap overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <Link
                key={tab.key}
                to={tab.path}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  currentTab === tab.key
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}