import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { staffApi } from '../../services/api'
import { ArrowLeft, Mail, Phone, MapPin, Clock, User, AlertCircle, Shield } from 'lucide-react'

export function StaffDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['staff', id],
    queryFn: () => staffApi.get(id!),
    enabled: !!id
  })

  const [showRoleModal, setShowRoleModal] = useState(false)
  const [selectedRole, setSelectedRole] = useState('')

  const staff = data?.data

  const updateRoleMutation = useMutation({
    mutationFn: (role: string) => staffApi.updateRole(id!, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', id] })
      setShowRoleModal(false)
    }
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!staff) {
    return (
      <div className="text-center py-12 text-gray-500">
        <AlertCircle size={48} className="mx-auto mb-4 opacity-50" />
        <p>{t('common.notFound')}</p>
      </div>
    )
  }

  const currentRole = staff.role || 'staff'

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return 'badge-success'
      case 'inactive': return 'badge-warning'
      case 'resigned': return 'badge-error'
      case 'suspended': return 'badge-error'
      default: return 'badge-info'
    }
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      active: t('common.active'),
      inactive: t('common.inactive'),
      resigned: t('staff.resigned'),
      suspended: t('staff.suspended')
    }
    return labels[status] || status
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

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: t('staff.roleAdmin') || 'Admin',
      manager: t('staff.roleManager') || 'Manager',
      cashier: t('staff.roleCashier') || 'Cashier',
      staff: t('staff.roleStaff') || 'Staff'
    }
    return labels[role] || role
  }

  // 计算本月出勤统计
  const thisMonthAttendances = staff.attendances?.filter((a: any) => {
    const date = new Date(a.checkInTime)
    const now = new Date()
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
  }) || []

  const lateCount = thisMonthAttendances.filter((a: any) => a.status === 'late').length
  const presentCount = thisMonthAttendances.filter((a: any) => a.checkInTime).length

  const handleOpenRoleModal = () => {
    setSelectedRole(currentRole)
    setShowRoleModal(true)
  }

  const handleSaveRole = () => {
    updateRoleMutation.mutate(selectedRole)
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link to="/staff" className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{t('staff.staffDetails')}</h1>
        <Link to={`/staff/${id}/edit`} className="btn-primary ml-auto">
          {t('common.edit')}
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Basic Info Card */}
        <div className="card">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold text-primary">
                {staff.name?.charAt(0) || 'S'}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold">{staff.name}</h2>
              <p className="text-gray-500">{staff.employeeNumber}</p>
              <span className={`badge ${getStatusBadge(staff.status)} capitalize mt-1`}>
                {getStatusLabel(staff.status)}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 text-gray-600">
              <User size={18} className="text-gray-400" />
              <span>{getPositionLabel(staff.position)}</span>
            </div>
            <div className="flex items-center gap-3 text-gray-600">
              <Clock size={18} className="text-gray-400" />
              <span>{getEmploymentTypeLabel(staff.employmentType || 'full_time')}</span>
            </div>
            <div className="flex items-center gap-3 text-gray-600">
              <Phone size={18} className="text-gray-400" />
              <span>{staff.phone || staff.user?.phone}</span>
            </div>
            {staff.email && (
              <div className="flex items-center gap-3 text-gray-600">
                <Mail size={18} className="text-gray-400" />
                <span>{staff.email}</span>
              </div>
            )}
            {staff.address && (
              <div className="flex items-center gap-3 text-gray-600">
                <MapPin size={18} className="text-gray-400" />
                <span>{staff.address}</span>
              </div>
            )}
          </div>
        </div>

        {/* Role & Permissions Card */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">{t('staff.rolePermission') || '角色权限'}</h3>
            <button
              onClick={handleOpenRoleModal}
              className="p-2 rounded-lg hover:bg-gray-100 text-primary"
              title={t('common.edit')}
            >
              <Shield size={18} />
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">{t('staff.systemRole') || '系统角色'}</span>
              <span className="font-medium">{getRoleLabel(currentRole)}</span>
            </div>
            <div className="text-xs text-gray-400">
              <p>• Admin: {t('staff.roleAdminDesc') || '全部权限'}</p>
              <p>• Manager: {t('staff.roleManagerDesc') || '管理本门店'}</p>
              <p>• Cashier: {t('staff.roleCashierDesc') || '收银权限'}</p>
              <p>• Staff: {t('staff.roleStaffDesc') || '基础权限'}</p>
            </div>
          </div>
        </div>

        {/* Employment Info Card */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">{t('staff.employmentInfo')}</h3>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-500">{t('staff.hireDate')}</span>
              <span className="font-medium">
                {staff.hireDate
                  ? new Date(staff.hireDate).toLocaleDateString('id-ID')
                  : '-'}
              </span>
            </div>
            {staff.terminationDate && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t('staff.terminationDate')}</span>
                <span className="font-medium text-red-600">
                  {new Date(staff.terminationDate).toLocaleDateString('id-ID')}
                </span>
              </div>
            )}
            {staff.weeklyHours && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t('staff.weeklyHours')}</span>
                <span className="font-medium">{staff.weeklyHours}h</span>
              </div>
            )}
            {staff.hourlyRate && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t('staff.hourlyRate')}</span>
                <span className="font-medium">Rp {staff.hourlyRate.toLocaleString('id-ID')}/jam</span>
              </div>
            )}
          </div>
        </div>

        {/* This Month Stats Card */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">{t('staff.thisMonthStats')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{presentCount}</p>
              <p className="text-sm text-green-600">{t('staff.workDays')}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{lateCount}</p>
              <p className="text-sm text-red-600">{t('staff.lateDays')}</p>
            </div>
          </div>
        </div>

        {/* Emergency Contact Card */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">{t('staff.emergencyContact')}</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">{t('staff.contactName')}</span>
              <span className="font-medium">{staff.emergencyContact || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('staff.contactPhone')}</span>
              <span className="font-medium">{staff.emergencyPhone || '-'}</span>
            </div>
          </div>
        </div>

        {/* Bank Info Card */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">{t('staff.bankInfo')}</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">{t('staff.bankName')}</span>
              <span className="font-medium">{staff.bankName || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('staff.bankAccount')}</span>
              <span className="font-medium">{staff.bankAccount || '-'}</span>
            </div>
          </div>
        </div>

        {/* Recent Salary Card */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">{t('staff.recentSalary')}</h3>
          {staff.salaries && staff.salaries.length > 0 ? (
            <div className="space-y-2">
              {staff.salaries.slice(0, 3).map((s: any) => (
                <div key={s.id} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">{s.month}</span>
                  <span className="font-medium">Rp {s.finalAmount?.toLocaleString('id-ID') || 0}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">{t('common.noData')}</p>
          )}
        </div>
      </div>

      {/* Role Edit Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowRoleModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{t('staff.editRole') || '编辑角色'}</h3>

            <div className="space-y-3 mb-4">
              {[
                { key: 'admin', label: t('staff.roleAdmin') || 'Admin', desc: t('staff.roleAdminDesc') || '全部权限' },
                { key: 'manager', label: t('staff.roleManager') || 'Manager', desc: t('staff.roleManagerDesc') || '管理本门店' },
                { key: 'cashier', label: t('staff.roleCashier') || 'Cashier', desc: t('staff.roleCashierDesc') || '收银权限' },
                { key: 'staff', label: t('staff.roleStaff') || 'Staff', desc: t('staff.roleStaffDesc') || '基础权限' }
              ].map(role => (
                <label
                  key={role.key}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedRole === role.key
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={role.key}
                    checked={selectedRole === role.key}
                    onChange={e => setSelectedRole(e.target.value)}
                    className="text-primary"
                  />
                  <div>
                    <p className="font-medium">{role.label}</p>
                    <p className="text-xs text-gray-500">{role.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowRoleModal(false)}
                className="flex-1 py-2 border border-gray-200 rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveRole}
                disabled={updateRoleMutation.isPending}
                className="flex-1 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
              >
                {updateRoleMutation.isPending ? t('common.loading') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}