import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation } from '@tanstack/react-query'
import { announcementApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, ArrowLeft } from 'lucide-react'

export function AnnouncementFormPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const { user } = useAuthStore()
  const storeId = user?.storeId || 'default'
  const isEdit = !!id

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'info',
    priority: 0,
    isActive: true,
    startAt: '',
    endAt: ''
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  // Fetch announcement data if editing
  const { data: annData, isLoading: isLoadingAnn } = useQuery({
    queryKey: ['announcement', id],
    queryFn: () => announcementApi.get(id!),
    enabled: isEdit && !!id
  })

  useEffect(() => {
    if (annData?.data) {
      const ann = annData.data.data
      setFormData({
        title: ann.title || '',
        content: ann.content || '',
        type: ann.type || 'info',
        priority: ann.priority || 0,
        isActive: ann.isActive ?? true,
        startAt: ann.startAt ? ann.startAt.split('T')[0] : '',
        endAt: ann.endAt ? ann.endAt.split('T')[0] : ''
      })
    }
  }, [annData])

  const createMutation = useMutation({
    mutationFn: (data: any) => announcementApi.create(data),
    onSuccess: () => {
      navigate('/announcement')
    }
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => announcementApi.update(id!, data),
    onSuccess: () => {
      navigate('/announcement')
    }
  })

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!formData.title.trim()) {
      newErrors.title = t('announcement.titleRequired')
    }
    if (!formData.content.trim()) {
      newErrors.content = t('announcement.contentRequired')
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const submitData = {
      storeId,
      title: formData.title.trim(),
      content: formData.content.trim(),
      type: formData.type,
      priority: Number(formData.priority),
      isActive: formData.isActive,
      startAt: formData.startAt || null,
      endAt: formData.endAt || null
    }

    if (isEdit) {
      updateMutation.mutate(submitData)
    } else {
      createMutation.mutate(submitData)
    }
  }

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  if (isEdit && isLoadingAnn) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/announcement')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-gray-900">
          {isEdit ? t('announcement.edit') : t('announcement.create')}
        </h2>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="card max-w-2xl">
        {/* Title */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('announcement.formTitle')} *
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => handleChange('title', e.target.value)}
            className={`input w-full ${errors.title ? 'input-error' : ''}`}
            placeholder={t('announcement.titlePlaceholder')}
          />
          {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
        </div>

        {/* Content */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('announcement.formContent')} *
          </label>
          <textarea
            value={formData.content}
            onChange={(e) => handleChange('content', e.target.value)}
            className={`input w-full min-h-[120px] ${errors.content ? 'input-error' : ''}`}
            placeholder={t('announcement.contentPlaceholder')}
          />
          {errors.content && <p className="text-red-500 text-xs mt-1">{errors.content}</p>}
        </div>

        {/* Type */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('announcement.formType')}
          </label>
          <select
            value={formData.type}
            onChange={(e) => handleChange('type', e.target.value)}
            className="input w-full"
          >
            <option value="info">{t('announcement.typeInfo')}</option>
            <option value="warning">{t('announcement.typeWarning')}</option>
            <option value="urgent">{t('announcement.typeUrgent')}</option>
          </select>
        </div>

        {/* Priority */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('announcement.formPriority')}
          </label>
          <input
            type="number"
            value={formData.priority}
            onChange={(e) => handleChange('priority', e.target.value)}
            className="input w-full"
            min="0"
            max="100"
          />
          <p className="text-xs text-gray-500 mt-1">{t('announcement.priorityHint')}</p>
        </div>

        {/* Active */}
        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => handleChange('isActive', e.target.checked)}
              className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
            />
            <span className="text-sm text-gray-700">{t('announcement.active')}</span>
          </label>
        </div>

        {/* Start Date */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('announcement.formStartAt')}
          </label>
          <input
            type="date"
            value={formData.startAt}
            onChange={(e) => handleChange('startAt', e.target.value)}
            className="input w-full"
          />
        </div>

        {/* End Date */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('announcement.formEndAt')}
          </label>
          <input
            type="date"
            value={formData.endAt}
            onChange={(e) => handleChange('endAt', e.target.value)}
            className="input w-full"
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={() => navigate('/announcement')}
            className="btn-secondary"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {createMutation.isPending || updateMutation.isPending ? (
              <Loader2 className="animate-spin" size={18} />
            ) : isEdit ? t('common.save') : t('announcement.create')}
          </button>
        </div>
      </form>
    </div>
  )
}