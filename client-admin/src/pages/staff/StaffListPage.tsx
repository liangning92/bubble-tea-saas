import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { staffApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Clock, CheckCircle, Plus, Loader2, Edit2, Users, Search, Eye, Trash2 } from 'lucide-react'

export function StaffListPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [positionFilter, setPositionFilter] = useState<string>('')

  const { data, isLoading } = useQuery({
    queryKey: ['staff', search, statusFilter, positionFilter],
    queryFn: () => staffApi.list({
      storeId: user?.storeId,
      pageSize: 100,
      search: search || undefined,
      status: statusFilter || undefined,
      position: positionFilter || undefined
    })
  })

  const { data: todayAttendance } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => staffApi.attendanceToday()
  })

  const staff = data?.data?.list || []
  const todayRecord = todayAttendance?.data

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return 'badge-success'
      case 'inactive': return 'badge-warning'
      case 'resigned': return 'badge-error'
      case 'suspended': return 'badge-error'
      default: return 'badge-info'
    }
  }

  const getPositionLabel = (position: string) => {
    const labels: Record<string, string> = {
      manager: t('staff.manager'),
      cashier: t('staff.cashier'),
      barista: t('staff.barista'),
      kitchen: t('staff.kitchen')
    }
    return labels[position] || position
  }

  const getEmploymentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      full_time: t('staff.fullTime'),
      part_time: t('staff.partTime'),
      contract: t('staff.contract'),
      intern: t('staff.intern')
    }
    return labels[type] || type
  }

  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: (id: string) => staffApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
    }
  })

  const handleDelete = (staff: any) => {
    if (!confirm(t('common.confirmDelete') + '?')) return
    deleteMutation.mutate(staff.id)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        <Link to="/staff/new" className="btn-primary flex items-center gap-2">
          <Plus size={20} /> {t('staff.addStaff')}
        </Link>
      </div>

      {/* Today's Attendance Summary */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">{t('staff.todaysAttendance')}</h2>
        <div className="flex items-center gap-4">
          {todayRecord ? (
            <div className="flex items-center gap-2 text-success">
              <CheckCircle size={20} />
              <span className="font-medium">{t('staff.checkedIn')}</span>
              <span className="text-gray-500">- {new Date(todayRecord.checkInTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-500">
              <Clock size={20} />
              <span>{t('staff.notCheckedIn')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={t('staff.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10 w-full"
              />
            </div>
          </div>
          <div className="w-40">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input"
            >
              <option value="">{t('staff.allStatus')}</option>
              <option value="active">{t('common.active')}</option>
              <option value="inactive">{t('common.inactive')}</option>
              <option value="resigned">{t('staff.resigned')}</option>
            </select>
          </div>
          <div className="w-40">
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="input"
            >
              <option value="">{t('staff.allPositions')}</option>
              <option value="manager">{t('staff.manager')}</option>
              <option value="cashier">{t('staff.cashier')}</option>
              <option value="barista">{t('staff.barista')}</option>
              <option value="kitchen">{t('staff.kitchen')}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : staff.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Users size={48} className="mb-4 opacity-50" />
            <p>{t('common.noData')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">{t('staff.employeeNumber')}</th>
                  <th className="pb-3 font-medium">{t('staff.name')}</th>
                  <th className="pb-3 font-medium">{t('staff.phone')}</th>
                  <th className="pb-3 font-medium">{t('staff.position')}</th>
                  <th className="pb-3 font-medium">{t('staff.employmentType')}</th>
                  <th className="pb-3 font-medium">{t('staff.status')}</th>
                  <th className="pb-3 font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s: any) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-mono text-sm">{s.employeeNumber || s.id.slice(-6).toUpperCase()}</td>
                    <td className="py-3 font-medium">{s.name}</td>
                    <td className="py-3 text-gray-600">{s.phone}</td>
                    <td className="py-3">{getPositionLabel(s.position)}</td>
                    <td className="py-3 text-sm text-gray-600">{getEmploymentTypeLabel(s.employmentType || 'full_time')}</td>
                    <td className="py-3">
                      <span className={`badge ${getStatusBadge(s.status)} capitalize`}>
                        {s.status === 'active' ? t('common.active') : s.status === 'inactive' ? t('common.inactive') : s.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/staff/${s.id}`}
                          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                          title={t('common.view')}
                        >
                          <Eye size={18} />
                        </Link>
                        <Link
                          to={`/staff/${s.id}/edit`}
                          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                          title={t('common.edit')}
                        >
                          <Edit2 size={18} />
                        </Link>
                        <button
                          onClick={() => handleDelete(s)}
                          className="p-2 rounded-lg hover:bg-red-50 text-red-600"
                          title={t('common.delete')}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}