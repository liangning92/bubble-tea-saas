import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { leaveApi } from '../../services/api'
import { KanbanBoard, KanbanColumn, KanbanItem } from '../../components/KanbanBoard'
import { CalendarDays } from 'lucide-react'

interface Leave {
  id: string
  staffId: string
  leaveType: string
  startDate: string
  endDate: string
  totalDays: number
  reason?: string
  status: string
  halfDay: boolean
  staff?: { name: string }
  createdAt: string
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: 'leave.annual',
  sick: 'leave.sick',
  unpaid: 'leave.unpaid',
  maternity: 'leave.maternity',
  paternity: 'leave.paternity',
  bereavement: 'leave.bereavement',
  other: 'leave.other'
}

export function LeaveKanbanPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [leaves, setLeaves] = useState<Leave[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadLeaves()
  }, [user])

  const loadLeaves = async () => {
    setIsLoading(true)
    try {
      const response = await leaveApi.list({ storeId: user?.storeId, status: '' })
      setLeaves(response.data?.data || [])
    } catch (error) {
      console.error('Failed to load leaves:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleApprove = async (leaveId: string) => {
    try {
      await leaveApi.approve(leaveId)
      loadLeaves()
    } catch (error) {
      console.error('Failed to approve:', error)
      alert(t('leave.approveFailed'))
    }
  }

  const handleReject = async (leaveId: string) => {
    const reason = prompt(t('leave.rejectReasonPlaceholder'))
    if (reason === null) return
    try {
      await leaveApi.reject(leaveId, reason)
      loadLeaves()
    } catch (error) {
      console.error('Failed to reject:', error)
      alert(t('leave.rejectFailed'))
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  }

  // Convert leaves to Kanban columns
  const columns: KanbanColumn[] = [
    {
      id: 'pending',
      title: t('leave.pending'),
      color: 'bg-yellow-400',
      items: leaves
        .filter(l => l.status === 'pending')
        .map(l => ({
          id: l.id,
          title: l.staff?.name || 'Staff',
          subtitle: t(`leave.${LEAVE_TYPE_LABELS[l.leaveType] || l.leaveType}`),
          description: l.reason,
          badge: `${l.totalDays} ${t('leave.days')}`,
          badgeColor: l.halfDay ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600',
          metadata: {
            [t('leave.dateRange')]: `${formatDate(l.startDate)} - ${formatDate(l.endDate)}`,
            [t('leave.submitted')]: new Date(l.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
          }
        }))
    },
    {
      id: 'approved',
      title: t('leave.approved'),
      color: 'bg-green-400',
      items: leaves
        .filter(l => l.status === 'approved')
        .map(l => ({
          id: l.id,
          title: l.staff?.name || 'Staff',
          subtitle: t(`leave.${LEAVE_TYPE_LABELS[l.leaveType] || l.leaveType}`),
          badge: `${l.totalDays} ${t('leave.days')}`,
          metadata: {
            [t('leave.dateRange')]: `${formatDate(l.startDate)} - ${formatDate(l.endDate)}`
          }
        }))
    },
    {
      id: 'rejected',
      title: t('leave.rejected'),
      color: 'bg-red-400',
      items: leaves
        .filter(l => l.status === 'rejected')
        .map(l => ({
          id: l.id,
          title: l.staff?.name || 'Staff',
          subtitle: t(`leave.${LEAVE_TYPE_LABELS[l.leaveType] || l.leaveType}`),
          badge: `${l.totalDays} ${t('leave.days')}`,
          metadata: {
            [t('leave.dateRange')]: `${formatDate(l.startDate)} - ${formatDate(l.endDate)}`
          }
        }))
    },
    {
      id: 'cancelled',
      title: t('leave.cancelled'),
      color: 'bg-gray-400',
      items: leaves
        .filter(l => l.status === 'cancelled')
        .map(l => ({
          id: l.id,
          title: l.staff?.name || 'Staff',
          subtitle: t(`leave.${LEAVE_TYPE_LABELS[l.leaveType] || l.leaveType}`),
          badge: `${l.totalDays} ${t('leave.days')}`
        }))
    }
  ]

  const handleItemMove = async (itemId: string, fromColumn: string, toColumn: string) => {
    if (fromColumn === 'pending' && toColumn === 'approved') {
      await handleApprove(itemId)
    } else if (fromColumn === 'pending' && toColumn === 'rejected') {
      await handleReject(itemId)
    }
  }

  const renderItem = (item: KanbanItem) => (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="font-medium text-gray-900 text-sm">{item.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{item.subtitle}</p>
          {item.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{item.description}</p>
          )}
        </div>
        {item.badge && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.badgeColor || 'bg-gray-100 text-gray-600'}`}>
            {item.badge}
          </span>
        )}
      </div>
      {item.metadata && Object.keys(item.metadata).length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
          {Object.entries(item.metadata).map(([key, value]) => (
            <div key={key} className="text-xs flex justify-between">
              <span className="text-gray-400">{key}:</span>
              <span className="text-gray-600 font-medium">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          <CalendarDays size={28} className="text-primary" />
          <div />
        </div>
      </header>

      {/* Kanban Board */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <KanbanBoard
            columns={columns}
            onItemMove={handleItemMove}
            renderItem={renderItem}
          />
        )}
      </div>
    </div>
  )
}