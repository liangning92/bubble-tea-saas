import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { staffApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { ArrowLeft, Key, X } from 'lucide-react'

export function StaffFormPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const isEdit = !!id
  const [form, setForm] = useState({
    name: '',
    phone: '',
    password: '',
    role: 'staff',
    position: '',
    email: '',
    address: '',
    emergencyContact: '',
    emergencyPhone: '',
    bankName: '',
    bankAccount: '',
    status: 'active',
    employmentType: 'full_time',
    hourlyRate: '',
    weeklyHours: '',
    hireDate: ''
  })

  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetError, setResetError] = useState('')

  const resetPasswordMutation = useMutation({
    mutationFn: (password: string) => staffApi.resetPassword(id!, password),
    onSuccess: () => {
      alert(t('staff.passwordResetSuccess') || 'Password reset successfully')
      setShowPasswordModal(false)
      setNewPassword('')
      setConfirmPassword('')
      setResetError('')
    },
    onError: (error: any) => {
      setResetError(error?.message || t('staff.passwordResetFailed') || 'Failed to reset password')
    }
  })

  const handlePasswordReset = () => {
    if (newPassword.length < 6) {
      setResetError(t('staff.passwordMinLength') || 'Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setResetError(t('staff.passwordMismatch') || 'Passwords do not match')
      return
    }
    resetPasswordMutation.mutate(newPassword)
  }

  const { data: staffData } = useQuery({
    queryKey: ['staff', id],
    queryFn: () => staffApi.get(id!),
    enabled: !!id
  })

  useEffect(() => {
    if (staffData?.data) {
      const s = staffData.data.data
      setForm({
        name: s.name || '',
        phone: s.phone || s.user?.phone || '',
        password: '', // Password not shown in edit mode
        role: s.user?.role || 'staff',
        position: s.position || '',
        email: s.email || '',
        address: s.address || '',
        emergencyContact: s.emergencyContact || '',
        emergencyPhone: s.emergencyPhone || '',
        bankName: s.bankName || '',
        bankAccount: s.bankAccount || '',
        status: s.status || 'active',
        employmentType: s.employmentType || 'full_time',
        hourlyRate: s.hourlyRate || '',
        weeklyHours: s.weeklyHours || '',
        hireDate: s.hireDate ? new Date(s.hireDate).toISOString().slice(0, 10) : ''
      })
    }
  }, [staffData])

  const createMutation = useMutation({
    mutationFn: (data: any) => {
      console.log('Creating staff with data:', data)
      return staffApi.create(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      navigate('/staff')
    },
    onError: (error: any) => {
      console.error('Create staff error:', error)
      console.error('Error response:', error?.response?.data)
      alert(error?.response?.data?.message || error.message || 'Failed to create staff')
    }
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => staffApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      navigate('/staff')
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('=== FORM SUBMIT ===')
    console.log('form:', form)
    console.log('user:', user)
    console.log('user?.storeId:', user?.storeId)

    const submitData: any = { ...form }
    // Add storeId from current user
    submitData.storeId = user?.storeId

    console.log('submitData before processing:', submitData)

    // Convert empty strings to appropriate values
    if (submitData.hourlyRate === '') submitData.hourlyRate = undefined
    if (submitData.weeklyHours === '') submitData.weeklyHours = undefined
    if (submitData.hireDate === '') submitData.hireDate = undefined
    if (submitData.password === '') submitData.password = undefined

    console.log('submitData after processing:', submitData)

    // Validation for new staff
    if (!isEdit && !submitData.password) {
      alert(t('staff.passwordRequired') || 'Password is required')
      return
    }

    if (!submitData.storeId) {
      alert('Store ID is missing. Please login again.')
      return
    }

    if (isEdit) updateMutation.mutate(submitData)
    else createMutation.mutate(submitData)
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link to="/staff" className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeft size={20} /></Link>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? t('staff.editStaff') : t('staff.addStaff')}</h1>
      </div>

      <div className="card max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.name')} *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.phone')} *</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input"
                required
                disabled={isEdit}
              />
            </div>
          </div>

          {/* Password field - only for new staff */}
          {!isEdit && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.password')} *</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="input"
                  required
                  minLength={6}
                  placeholder={t('staff.passwordPlaceholder') || 'Minimum 6 characters'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.systemRole') || 'System Role'}</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="input"
                >
                  <option value="staff">{t('staff.staff') || 'Staff'}</option>
                  <option value="cashier">{t('staff.cashier') || 'Cashier'}</option>
                  <option value="manager">{t('staff.manager') || 'Manager'}</option>
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.position')} *</label>
              <select
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                className="input"
                required
              >
                <option value="">{t('staff.select')}</option>
                <option value="manager">{t('staff.manager')}</option>
                <option value="cashier">{t('staff.cashier')}</option>
                <option value="barista">{t('staff.barista')}</option>
                <option value="kitchen">{t('staff.kitchen')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.status')}</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="input"
              >
                <option value="active">{t('common.active')}</option>
                <option value="inactive">{t('common.inactive')}</option>
                <option value="resigned">{t('staff.resigned')}</option>
                <option value="suspended">{t('staff.suspended')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.employmentType')}</label>
              <select
                value={form.employmentType}
                onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
                className="input"
              >
                <option value="full_time">{t('staff.fullTime')}</option>
                <option value="part_time">{t('staff.partTime')}</option>
                <option value="contract">{t('staff.contract')}</option>
                <option value="intern">{t('staff.intern')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.hireDate')}</label>
              <input
                type="date"
                value={form.hireDate}
                onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
                className="input"
              />
            </div>
          </div>

          {/* Part-time fields */}
          {(form.employmentType === 'part_time' || form.employmentType === 'intern') && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.weeklyHours')}</label>
                <input
                  type="number"
                  value={form.weeklyHours}
                  onChange={(e) => setForm({ ...form, weeklyHours: e.target.value })}
                  className="input"
                  min="1"
                  max="40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.hourlyRate')} (IDR)</label>
                <input
                  type="number"
                  value={form.hourlyRate}
                  onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
                  className="input"
                  min="0"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.email')}</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.address')}</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="input"
              />
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="font-medium text-gray-900 mb-4">{t('staff.emergencyContact')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.contactName')}</label>
                <input
                  type="text"
                  value={form.emergencyContact}
                  onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.contactPhone')}</label>
                <input
                  type="tel"
                  value={form.emergencyPhone}
                  onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })}
                  className="input"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="font-medium text-gray-900 mb-4">{t('staff.bankInfo')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.bankName')}</label>
                <input
                  type="text"
                  value={form.bankName}
                  onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.bankAccount')}</label>
                <input
                  type="text"
                  value={form.bankAccount}
                  onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
                  className="input"
                />
              </div>
            </div>
          </div>

          {/* Password Reset Section - only for edit mode */}
          {isEdit && (
            <div className="border-t pt-6">
              <h3 className="font-medium text-gray-900 mb-4">{t('staff.passwordReset')}</h3>
              <button
                type="button"
                onClick={() => setShowPasswordModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-100"
              >
                <Key size={18} />
                {t('staff.resetPassword')}
              </button>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button type="submit" className="btn-primary">{t('common.save')}</button>
            <Link to="/staff" className="btn-secondary">{t('common.cancel')}</Link>
          </div>
        </form>
      </div>

      {/* Password Reset Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{t('staff.resetPassword')}</h3>
              <button onClick={() => setShowPasswordModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.newPassword')}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input w-full"
                  placeholder="******"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.confirmPassword')}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input w-full"
                  placeholder="******"
                />
              </div>
              {resetError && (
                <p className="text-sm text-red-600">{resetError}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 py-2 border border-gray-200 rounded-lg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handlePasswordReset}
                  disabled={resetPasswordMutation.isPending}
                  className="flex-1 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                >
                  {resetPasswordMutation.isPending ? t('common.loading') : t('staff.resetPassword')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}