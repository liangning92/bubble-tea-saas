import { staffIdentityLabels } from '../../../../shared/staffIdentityLabels'
import { payrollLabels } from '../../../../shared/payrollLabels'
import { jakartaInput } from '../../utils/orderExport'
import { probationLabels } from '../../../../shared/probationLabels'
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { staffApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { ArrowLeft, Key, X } from 'lucide-react'

export function StaffFormPage({ onSaved, onCancel }: { onSaved?: () => void; onCancel?: () => void } = {}) {
  const { t, i18n } = useTranslation()
  const identityText = staffIdentityLabels(i18n.language)
  const probationText = probationLabels(i18n.language)
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const isEdit = !!id
  const loadedStaffId = useRef<string>()
  const probationRuleQuery = useQuery({queryKey:['probation-rule',user?.storeId],queryFn:()=>staffApi.probationRule()})
  useEffect(()=>{if(!isEdit&&probationRuleQuery.data?.data?.data?.enabled)setForm(previous=>({...previous,probationEnabled:true}))},[isEdit,probationRuleQuery.data?.data?.data?.enabled])
  const [form, setForm] = useState({
    name: '',
    phone: '',
    password: '',
    role: 'staff',
    payrollEmployee:true,
    position: '',
    email: '',
    address: '',
    emergencyContact: '',
    emergencyPhone: '',
    bankName: '',
    bankAccount: '',
    status: 'active',
    employmentType: 'full_time',
    baseSalary: '',
    hourlyRate: '',
    weeklyHours: '',
    terminationDate: '',
    hireDate: '',
    probationEnabled: false,
    confirmationDate: ''
  })

  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [saveError, setSaveError] = useState('')
  const showSaveError = (error: any) => setSaveError(error?.response?.data?.errors?.map((item: any) => `${item.field}: ${item.message}`).join('; ') || error?.response?.data?.message || error?.message || t('common.error'))

  const resetPasswordMutation = useMutation({
    mutationFn: (password: string) => staffApi.resetPassword(id!, password),
    onSuccess: () => {
      alert(t('staff.passwordResetSuccess'))
      setShowPasswordModal(false)
      setNewPassword('')
      setConfirmPassword('')
      setResetError('')
    },
    onError: (error: any) => {
      setResetError(error?.message || t('staff.passwordResetFailed'))
    }
  })

  const handlePasswordReset = () => {
    if (newPassword.length < 6) {
      setResetError(t('staff.passwordMinLength'))
      return
    }
    if (newPassword !== confirmPassword) {
      setResetError(t('staff.passwordMismatch'))
      return
    }
    resetPasswordMutation.mutate(newPassword)
  }

  const { data: staffData, isLoading, isError, refetch } = useQuery({
    queryKey: ['staff', id],
    queryFn: () => staffApi.get(id!),
    enabled: !!id,
    refetchOnWindowFocus: false
  })

  useEffect(() => {
    if (staffData?.data?.data) {
      const s = staffData.data.data
      if (loadedStaffId.current === s.id) return
      loadedStaffId.current = s.id
      setForm({
        name: s.name || '',
        phone: s.phone || s.user?.phone || '',
        password: '', // Password not shown in edit mode
        role: s.role || s.user?.role || 'staff',
        payrollEmployee:s.payrollEmployee ?? (s.user?.role!=='admin'),
        position: s.position || '',
        email: s.email || '',
        address: s.address || '',
        emergencyContact: s.emergencyContact || '',
        emergencyPhone: s.emergencyPhone || '',
        bankName: s.bankName || '',
        bankAccount: s.bankAccount || '',
        status: s.status || 'active',
        employmentType: s.employmentType || 'full_time',
        baseSalary: s.baseSalary ?? '',
        hourlyRate: s.hourlyRate ?? '',
        weeklyHours: s.weeklyHours ?? '',
        terminationDate:s.terminationDate?jakartaInput(s.terminationDate).slice(0,10):'',
        hireDate: s.hireDate ? jakartaInput(s.hireDate).slice(0, 10) : '',
        probationEnabled: !!s.probation?.enabled,
        confirmationDate: s.probation?.overrideConfirmationDate || ''
      })
    }
  }, [staffData])

  const createMutation = useMutation({
    mutationFn: (data: any) => {
      return staffApi.create(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      navigate('/staff')
    },
    onError: (error: any) => {
      showSaveError(error)
    }
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => staffApi.update(id!, data),
    onError: showSaveError,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff'] })
      if (onSaved) onSaved()
      else navigate(`/staff/${id}`)
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (createMutation.isPending || updateMutation.isPending) return
    setSaveError('')

    const submitData: any = { ...form }
    // Add storeId from current user
    submitData.storeId = staffData?.data?.data?.storeId || user?.storeId


    // Convert empty strings to appropriate values
    submitData.baseSalary = submitData.baseSalary === '' ? undefined : Number(submitData.baseSalary)
    submitData.hourlyRate = submitData.hourlyRate === '' ? undefined : Number(submitData.hourlyRate)
    submitData.weeklyHours = submitData.weeklyHours === '' ? undefined : Number(submitData.weeklyHours)
    if(form.status==='resigned'&&(!form.terminationDate||(form.hireDate&&form.terminationDate<form.hireDate))){setSaveError(payrollLabels(i18n.language).terminationRequired);return}
    if(isEdit)submitData.terminationDate=form.terminationDate||null
    else delete submitData.terminationDate
    if(form.role!=='admin')delete submitData.payrollEmployee
    if(!form.payrollEmployee){submitData.probationEnabled=false;delete submitData.hireDate;delete submitData.baseSalary}
    submitData.confirmationDate = form.payrollEmployee ? form.confirmationDate || null : undefined
    if (submitData.probationEnabled && !form.hireDate) { setSaveError(probationText.hireRequired); return }
    if (submitData.hireDate === '') submitData.hireDate = undefined
    if (submitData.password === '') submitData.password = undefined


    // Validation for new staff
    if (!isEdit && !submitData.password) {
      alert(t('staff.passwordRequired'))
      return
    }

    if (!isEdit && !submitData.storeId) {
      alert('Store ID is missing. Please login again.')
      return
    }

    if (isEdit) {
      // The employee already owns a store and login account. Update profile fields only.
      delete submitData.storeId
      delete submitData.phone
      delete submitData.password
      delete submitData.role
      updateMutation.mutate(submitData)
    }
    else createMutation.mutate(submitData)
  }

  if (isEdit && isLoading) return <p role="status" className="py-12 text-center">{t('common.loading')}</p>
  if (isEdit && (isError || !staffData?.data?.data)) return <div role="alert" className="py-12 text-center">
    <p>{t('common.error')}</p>
    <button type="button" className="btn-secondary mt-4" onClick={() => refetch()}>↻</button>
  </div>

  return (
    <div>
      {!onCancel && <div className="flex items-center gap-4 mb-6">
        <Link to="/staff" className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeft size={20} /></Link>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? t('staff.editStaff') : t('staff.addStaff')}</h1>
      </div>}

      <div className="card max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <p className="text-sm text-gray-600">{t('staff.formRequiredHelp')}</p>
          {saveError && <p role="alert" className="text-red-600">{saveError}</p>}
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="staff-name" className="block text-sm font-medium text-gray-700 mb-1">{t('staff.name')} *</label>
              <input
                id="staff-name" type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
                required
              />
            </div>
            <div>
              <label htmlFor="staff-phone" className="block text-sm font-medium text-gray-700 mb-1">{t('staff.phone')} *</label>
              <input
                id="staff-phone" type="tel"
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
                <label htmlFor="staff-password" className="block text-sm font-medium text-gray-700 mb-1">{t('staff.password')} *</label>
                <input
                  id="staff-password" type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="input"
                  required
                  minLength={6}
                  placeholder={t('staff.passwordPlaceholder') || 'Minimum 6 characters'}
                />
              </div>
              <div>
                <label htmlFor="staff-role" className="block text-sm font-medium text-gray-700 mb-1">{t('staff.systemRole')}</label>
                <select
                  id="staff-role" value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="input"
                >
                  <option value="staff">{t('staff.staff')}</option>
                  <option value="cashier">{t('staff.cashier')}</option>
                  <option value="manager">{t('staff.manager')}</option>
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="staff-position" className="block text-sm font-medium text-gray-700 mb-1">{t('staff.position')} *</label>
              <select
                id="staff-position" value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                className="input"
                required
              >
                <option value="">{t('staff.select')}</option>
                {form.position && !['manager', 'cashier', 'barista', 'kitchen'].includes(form.position) && <option value={form.position}>{form.position}</option>}
                <option value="manager">{t('staff.manager')}</option>
                <option value="cashier">{t('staff.cashier')}</option>
                <option value="barista">{t('staff.barista')}</option>
                <option value="kitchen">{t('staff.kitchen')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="staff-status" className="block text-sm font-medium text-gray-700 mb-1">{t('staff.status')}</label>
              <select
                id="staff-status" value={form.status}
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

          {form.role==='admin' && <section className="bg-blue-50 rounded-xl p-4 space-y-2"><p className="font-medium">{identityText.identity}</p><p className="text-sm">{identityText.hint}</p><label className="flex gap-2"><input type="checkbox" checked={form.payrollEmployee} disabled={user?.role!=='admin'} onChange={e=>setForm({...form,payrollEmployee:e.target.checked,probationEnabled:e.target.checked&&!!probationRuleQuery.data?.data?.data?.enabled})}/>{identityText.employee}</label>{!form.payrollEmployee&&<p>{identityText.accountOnly}</p>}</section>}
          {isEdit&&<p className="text-sm text-gray-600">{identityText.offboardHint}</p>}
          {isEdit&&<label className="block text-sm">{payrollLabels(i18n.language).termination}<input type="date" min={form.hireDate||undefined} className="input" value={form.terminationDate} onChange={e=>setForm({...form,terminationDate:e.target.value})}/></label>}
          {form.payrollEmployee&&<>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="staff-employmentType" className="block text-sm font-medium text-gray-700 mb-1">{t('staff.employmentType')}</label>
              <select
                id="staff-employmentType" value={form.employmentType}
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
              <label htmlFor="staff-hireDate" className="block text-sm font-medium text-gray-700 mb-1">{t('staff.hireDate')}</label>
              <input
                id="staff-hireDate" type="date"
                value={form.hireDate}
                onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
                className="input"
              />
            </div>
          </div>

          <label htmlFor="staff-baseSalary" className="block text-sm">{probationText.formal} (IDR)<input id="staff-baseSalary" className="input" type="number" min="0" value={form.baseSalary} onChange={e=>setForm({...form,baseSalary:e.target.value})}/></label>
          <section className="bg-blue-50 rounded-xl p-4 space-y-3"><p className="text-sm">{probationText.contract}</p>
          <label className="flex gap-2 items-center"><input type="checkbox" checked={form.probationEnabled} disabled={probationRuleQuery.isLoading || probationRuleQuery.isError || (!probationRuleQuery.data?.data?.data?.enabled && !staffData?.data?.data?.probation?.enabled)} onChange={e=>setForm({...form,probationEnabled:e.target.checked})}/>{probationText.enroll}</label>
          {probationRuleQuery.isError&&<p role="alert">{probationText.loadError}<button type="button" onClick={()=>probationRuleQuery.refetch()}>↻</button></p>}
          {!probationRuleQuery.data?.data?.data?.enabled&&<Link to="/staff/salary/probation-rules" className="text-primary underline text-sm">{probationText.needsRule}</Link>}
          {form.probationEnabled&&<><p className="text-sm">{probationText.hireRequired}</p><label className="block text-sm">{probationText.override}<input type="date" min={form.hireDate||undefined} className="input" value={form.confirmationDate} onChange={e=>setForm({...form,confirmationDate:e.target.value})}/></label>{staffData?.data?.data?.probation?.confirmationDate&&<p className="text-sm">{probationText.confirmation}: {staffData.data.data.probation.confirmationDate}</p>}</>}
          </section>
          </>}
          {/* Part-time fields */}
          {(form.employmentType === 'part_time' || form.employmentType === 'intern') && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="staff-weeklyHours" className="block text-sm font-medium text-gray-700 mb-1">{t('staff.weeklyHours')}</label>
                <input
                  id="staff-weeklyHours" type="number"
                  value={form.weeklyHours}
                  onChange={(e) => setForm({ ...form, weeklyHours: e.target.value })}
                  className="input"
                  min="0"
                  max="168"
                />
              </div>
              <div>
                <label htmlFor="staff-hourlyRate" className="block text-sm font-medium text-gray-700 mb-1">{t('staff.hourlyRate')} (IDR)</label>
                <input
                  id="staff-hourlyRate" type="number"
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
              <label htmlFor="staff-email" className="block text-sm font-medium text-gray-700 mb-1">{t('staff.email')}</label>
              <input
                id="staff-email" type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="staff-address" className="block text-sm font-medium text-gray-700 mb-1">{t('staff.address')}</label>
              <input
                id="staff-address" type="text"
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
                <label htmlFor="staff-emergencyContact" className="block text-sm font-medium text-gray-700 mb-1">{t('staff.contactName')}</label>
                <input
                  id="staff-emergencyContact" type="text"
                  value={form.emergencyContact}
                  onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="staff-emergencyPhone" className="block text-sm font-medium text-gray-700 mb-1">{t('staff.contactPhone')}</label>
                <input
                  id="staff-emergencyPhone" type="tel"
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
                <label htmlFor="staff-bankName" className="block text-sm font-medium text-gray-700 mb-1">{t('staff.bankName')}</label>
                <input
                  id="staff-bankName" type="text"
                  value={form.bankName}
                  onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="staff-bankAccount" className="block text-sm font-medium text-gray-700 mb-1">{t('staff.bankAccount')}</label>
                <input
                  id="staff-bankAccount" type="text"
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
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="btn-primary">{t('common.save')}</button>
            {onCancel ? <button type="button" onClick={onCancel} className="btn-secondary" disabled={updateMutation.isPending}>{t('common.cancel')}</button> : <Link to={isEdit ? `/staff/${id}` : '/staff'} className="btn-secondary">{t('common.cancel')}</Link>}
          </div>
        </form>
      </div>

      {/* Password Reset Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 pointer-events-auto" onClick={e => e.stopPropagation()}>
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