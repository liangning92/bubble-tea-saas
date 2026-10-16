import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Bell, ArrowRight } from 'lucide-react'
import api from '../services/api'
import { DashboardReadFailure } from './DashboardReadState'
import { requireRead } from '../utils/dashboardNavigation'

const copy = {
  zh: { title: '申请与审批', empty: '暂无待处理申请或审批', refunds: '退款申请', leave: '请假申请', correction: '考勤纠错', swap: '调班申请', overtime: '加班申请', reimbursement: '报销申请', rewards: '积分兑换申请', purchases: '采购审批', counts: '盘点审核', hygiene: '卫生任务审批', permissions: '权限操作审批', cash: '班次现金差额审核' },
  en: { title: 'Requests and approvals', empty: 'No pending requests or approvals', refunds: 'Refund requests', leave: 'Leave requests', correction: 'Attendance corrections', swap: 'Shift swap requests', overtime: 'Overtime requests', reimbursement: 'Reimbursements', rewards: 'Reward redemptions', purchases: 'Purchase approvals', counts: 'Inventory count reviews', hygiene: 'Hygiene task approvals', permissions: 'Action approvals', cash: 'Shift cash reviews' },
  id: { title: 'Pengajuan dan persetujuan', empty: 'Tidak ada pengajuan atau persetujuan tertunda', refunds: 'Pengajuan pengembalian dana', leave: 'Pengajuan cuti', correction: 'Koreksi kehadiran', swap: 'Pengajuan tukar sif', overtime: 'Pengajuan lembur', reimbursement: 'Pengajuan penggantian biaya', rewards: 'Penukaran hadiah', purchases: 'Persetujuan pembelian', counts: 'Pemeriksaan stok opname', hygiene: 'Persetujuan tugas kebersihan', permissions: 'Persetujuan tindakan', cash: 'Pemeriksaan selisih kas sif' }
}
type Action = { key: Exclude<keyof typeof copy.en, 'title' | 'empty'>; count: number; to: string }
export function DashboardPendingActions({ storeId }: { storeId: string }) {
  const { t, i18n } = useTranslation()
  const labels = copy[i18n.language.startsWith('zh') ? 'zh' : i18n.language.startsWith('id') ? 'id' : 'en']
  const query = useQuery({
    queryKey: ['dashboard-pending-actions', storeId],
    queryFn: async () => {
      const res = await api.get('/reports/pending-actions')
      const data = res.data?.data
      return requireRead(data, Array.isArray(data?.actions) && data.actions.every((a: Action) => Object.prototype.hasOwnProperty.call(copy.en, a.key) && Number.isSafeInteger(a.count) && a.count >= 0 && typeof a.to === 'string' && a.to.startsWith('/') && !a.to.startsWith('//')) && Number.isSafeInteger(data.total)) as { actions: Action[]; total: number }
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: 'always'
  })
  const actions = query.data?.actions.filter(action => action.count > 0) || []
  return <section aria-label={labels.title} className="card mb-6">
    <h2 className="font-semibold text-lg flex items-center gap-2 mb-3"><Bell size={20} className="shrink-0" />{labels.title}{!!query.data?.total && <span className="rounded-full bg-red-500 text-white px-2 py-0.5 text-xs">{query.data.total}</span>}</h2>
    {query.isError ? <DashboardReadFailure retry={() => query.refetch()} /> : query.isPending ? <p role="status" className="text-sm text-gray-500">{t('common.loading')}</p> : actions.length === 0 ? <p className="text-sm text-gray-500">{labels.empty}</p> : <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {actions.map(action => <Link key={`${action.key}:${action.to}`} to={action.to} className="flex items-center gap-3 rounded-lg border border-red-100 bg-red-50 p-3 hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-primary">
        <span className="min-w-0 flex-1 text-sm font-medium break-words">{labels[action.key]}</span><span className="shrink-0 rounded-full bg-red-500 text-white text-xs px-2 py-0.5">{action.count}</span><ArrowRight size={16} className="shrink-0" />
      </Link>)}
    </div>}
  </section>
}
