import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Zap, TrendingUp, Calendar } from 'lucide-react'

interface CampaignReport {
  campaignId: string
  campaignName: string
  campaignType: string
  status: string
  totalMembers: number
  couponsIssued: number
  couponsUsed: number
  conversionRate: number
  totalRevenue: number
  startDate: string
  endDate?: string
}

export function CampaignReportPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const storeId = user?.storeId || 'default'

  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')

  // Fetch campaign reports
  const { data, isLoading } = useQuery({
    queryKey: ['campaign-reports', storeId],
    queryFn: () => marketingApi.campaignReports(storeId)
  })

  const reports: CampaignReport[] = data?.data?.data || []

  const filteredReports = reports.filter(r => {
    if (filter === 'all') return true
    if (filter === 'active') return r.status === 'active'
    if (filter === 'completed') return r.status === 'completed'
    return true
  })

  // Calculate summary
  const summary = filteredReports.reduce((acc, r) => ({
    totalCampaigns: acc.totalCampaigns + 1,
    totalMembers: acc.totalMembers + r.totalMembers,
    totalIssued: acc.totalIssued + r.couponsIssued,
    totalUsed: acc.totalUsed + r.couponsUsed,
    totalRevenue: acc.totalRevenue + r.totalRevenue
  }), { totalCampaigns: 0, totalMembers: 0, totalIssued: 0, totalUsed: 0, totalRevenue: 0 })

  const avgConversion = summary.totalIssued > 0 ? Math.round((summary.totalUsed / summary.totalIssued) * 100) : 0

  const formatCurrency = (value: number) => `Rp ${value.toLocaleString('id-ID')}`

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'birthday': return t('marketing.birthdayAutomation')
      case 'reactivation': return t('marketing.reactivationAutomation')
      case 'welcome': return t('marketing.welcomeAutomation')
      case 'seasonal': return t('marketing.seasonalAutomation')
      case 'points_expiring': return t('marketing.pointsExpiringAutomation')
      default: return type
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'badge-success'
      case 'paused': return 'badge-warning'
      case 'completed': return 'badge-gray'
      default: return 'badge-gray'
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <TrendingUp size={24} className="text-primary" />
          <h1 className="text-xl font-semibold">{t('marketing.campaignReport')}</h1>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {(['all', 'active', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${filter === f ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              {f === 'all' ? t('common.all') : f === 'active' ? t('common.active') : t('marketing.completed')}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="card text-center">
          <div className="text-3xl font-bold text-primary">{summary.totalCampaigns}</div>
          <div className="text-sm text-gray-500 mt-1">{t('marketing.totalCampaigns')}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-info">{summary.totalMembers}</div>
          <div className="text-sm text-gray-500 mt-1">{t('marketing.totalMembers')}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-green-600">{summary.totalIssued}</div>
          <div className="text-sm text-gray-500 mt-1">{t('marketing.couponsIssued')}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-warning">{summary.totalUsed}</div>
          <div className="text-sm text-gray-500 mt-1">{t('marketing.couponsUsed')}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-secondary">{avgConversion}%</div>
          <div className="text-sm text-gray-500 mt-1">{t('marketing.conversionRate')}</div>
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Zap size={48} className="mb-4 opacity-50" />
            <p>{t('common.noData')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReports.map((report) => (
              <div key={report.campaignId} className="p-4 border rounded-lg hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Zap size={20} className="text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">{report.campaignName}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="badge badge-gray">{getTypeLabel(report.campaignType)}</span>
                        <span className={`badge ${getStatusColor(report.status)}`}>{t(`common.${report.status}`)}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar size={14} />
                          {new Date(report.startDate).toLocaleDateString('id-ID')}
                          {report.endDate && ` - ${new Date(report.endDate).toLocaleDateString('id-ID')}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-6 text-right">
                    <div>
                      <div className="text-2xl font-bold text-primary">{report.couponsIssued}</div>
                      <div className="text-xs text-gray-500">{t('marketing.issued')}</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">{report.couponsUsed}</div>
                      <div className="text-xs text-gray-500">{t('marketing.used')}</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-info">{report.conversionRate}%</div>
                      <div className="text-xs text-gray-500">{t('marketing.conversionRate')}</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-secondary">{formatCurrency(report.totalRevenue)}</div>
                      <div className="text-xs text-gray-500">{t('marketing.revenue')}</div>
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-500">{t('marketing.usageProgress')}</span>
                    <span className="font-medium">{report.couponsUsed} / {report.couponsIssued}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${report.conversionRate}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}