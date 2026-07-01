import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { hygieneApi, staffApi } from '../../services/api'
import { Plus, Edit2, Trash2, Loader2, CheckCircle, Copy, X } from 'lucide-react'

const AREAS = [
  { value: 'counter', label: 'hygiene.counter' },
  { value: 'kitchen', label: 'hygiene.kitchen' },
  { value: 'ingredients', label: 'hygiene.ingredients' },
  { value: 'floor', label: 'hygiene.floor' },
  { value: 'restroom', label: 'hygiene.restroom' },
  { value: 'waste', label: 'hygiene.waste' },
  { value: 'equipment', label: 'hygiene.equipment' },
  { value: 'ventilation', label: 'hygiene.ventilation' },
]

const CATEGORIES = [
  { value: 'food_safety', label: 'hygiene.foodSafety' },
  { value: 'daily', label: 'hygiene.dailyCleaning' },
  { value: 'equipment', label: 'hygiene.equipmentMaintenance' },
  { value: 'periodic', label: 'hygiene.periodicMaintenance' },
  { value: 'opening', label: 'hygiene.openingChecklist' },
  { value: 'closing', label: 'hygiene.closingChecklist' },
]

const FREQUENCIES = [
  { value: 'daily', label: 'hygiene.daily' },
  { value: 'weekly', label: 'hygiene.weekly' },
  { value: 'monthly', label: 'hygiene.monthly' },
  { value: 'specific_days', label: 'hygiene.specificDays' },
]

export function HygieneTemplateListPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showSuccess, setShowSuccess] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['hygiene-templates'],
    queryFn: () => hygieneApi.templates()
  })

  const { data: staffData } = useQuery({
    queryKey: ['staff-dropdown'],
    queryFn: () => staffApi.list({ pageSize: 100 })
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => hygieneApi.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hygiene-templates'] })
      setShowSuccess(true)
      setDeleteId(null)
      setTimeout(() => setShowSuccess(false), 2000)
    },
    onError: (error: any) => {
      console.error('Delete template error:', error)
      alert(t('hygiene.deleteTemplateFailed') + ': ' + (error?.message || error?.response?.data?.message || t('common.unknownError')))
    }
  })

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => hygieneApi.duplicateTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hygiene-templates'] })
    },
    onError: (error: any) => {
      console.error('Duplicate template error:', error)
      alert(t('hygiene.duplicateTemplateFailed') + ': ' + (error?.message || error?.response?.data?.message || t('common.unknownError')))
    }
  })

  const templates = templatesData?.data?.data?.list || []
  const staffList = staffData?.data?.data?.list || []

  const getStaffName = (staffId?: string) => {
    if (!staffId) return '-'
    const staff = staffList.find((s: any) => s.id === staffId)
    return staff?.name || '-'
  }

  const getAreaLabel = (areaCode: string) => {
    const found = AREAS.find(a => a.value === areaCode)
    return t(found?.label || areaCode)
  }

  const getCategoryLabel = (category: string) => {
    const found = CATEGORIES.find(c => c.value === category)
    return t(found?.label || category)
  }

  const getFrequencyLabel = (freq: string) => {
    const found = FREQUENCIES.find(f => f.value === freq)
    return t(found?.label || freq)
  }

  const getPriorityBadge = (priority: number) => {
    const colors: Record<number, string> = {
      1: 'bg-red-100 text-red-700',
      2: 'bg-orange-100 text-orange-700',
      3: 'bg-blue-100 text-blue-700',
      4: 'bg-gray-100 text-gray-700',
    }
    const labels: Record<number, string> = {
      1: t('hygiene.priorityCritical'),
      2: t('hygiene.priorityHigh'),
      3: t('hygiene.priorityNormal'),
      4: t('hygiene.priorityLow'),
    }
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${colors[priority] || colors[3]}`}>
        {labels[priority] || priority}
      </span>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        <Link to="/hygiene/new" className="btn-primary flex items-center gap-2">
          <Plus size={20} /> {t('hygiene.addTemplate')}
        </Link>
      </div>

      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed top-4 right-4 bg-success text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50 animate-pulse">
          <CheckCircle size={18} />
          <span>{t('common.success')}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : templates.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">
          <p>{t('hygiene.noTemplates')}</p>
          <Link to="/hygiene/new" className="btn-primary mt-4 inline-flex">
            {t('hygiene.addFirstTemplate')}
          </Link>
        </div>
      ) : (
        <div className="card">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-sm text-gray-500">
                <th className="py-3 px-4">{t('hygiene.area')}</th>
                <th className="py-3 px-4">{t('hygiene.name')}</th>
                <th className="py-3 px-4">{t('hygiene.frequency')}</th>
                <th className="py-3 px-4">{t('hygiene.priority')}</th>
                <th className="py-3 px-4">{t('hygiene.assignee')}</th>
                <th className="py-3 px-4">{t('hygiene.photoRequired')}</th>
                <th className="py-3 px-4">Auto</th>
                <th className="py-3 px-4 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template: any) => (
                <tr key={template.id} className="border-b border-border last:border-0 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <span className="px-2 py-1 bg-gray-100 rounded text-sm">
                      {getAreaLabel(template.areaCode)}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium">{template.name}</div>
                    <div className="text-xs text-gray-500">{getCategoryLabel(template.category)}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-gray-600">
                      {getFrequencyLabel(template.frequency)}
                    </div>
                    <div className="text-xs text-gray-500">{template.time}</div>
                  </td>
                  <td className="py-3 px-4">
                    {getPriorityBadge(template.priority || 3)}
                  </td>
                  <td className="py-3 px-4">
                    {template.assignedType === 'staff' ? (
                      getStaffName(template.staffId)
                    ) : (
                      <span className="text-gray-500">
                        {template.shift ? t('hygiene.' + template.shift) : '-'}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {template.photoRequired ? (
                      <span className="text-success text-sm">✓ {template.evidenceType === 'both' ? '+Sig' : ''}</span>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {template.autoGenerate ? (
                      <span className="text-xs text-green-600">{t('hygiene.auto')}</span>
                    ) : (
                      <span className="text-xs text-gray-400">{t('hygiene.manual')}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => duplicateMutation.mutate(template.id)}
                        className="p-2 text-gray-500 hover:text-blue-500 rounded"
                        title={t('common.duplicate')}
                      >
                        <Copy size={18} />
                      </button>
                      <Link
                        to={`/hygiene/${template.id}/edit`}
                        className="p-2 text-gray-500 hover:text-primary rounded"
                      >
                        <Edit2 size={18} />
                      </Link>
                      <button
                        onClick={() => setDeleteId(template.id)}
                        className="p-2 text-gray-500 hover:text-red-500 rounded"
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

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteId(null)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t('hygiene.confirmDelete')}</h3>
              <button onClick={() => setDeleteId(null)} className="p-1 hover:bg-gray-100 rounded">
                <X size={20} />
              </button>
            </div>
            <p className="text-gray-600 mb-6">{t('hygiene.deleteWarning')}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}