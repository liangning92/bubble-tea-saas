import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { hygieneApi, staffApi } from '../../services/api'
import { Loader2, ArrowLeft, Plus, Trash2 } from 'lucide-react'

// 预设区域（从后端获取或使用默认值）
const DEFAULT_AREA_CODES = ['counter', 'kitchen', 'ingredients', 'floor', 'restroom', 'waste', 'equipment', 'ventilation']

const CATEGORIES = [
  { value: 'food_safety', labelKey: 'hygiene.foodSafety' },
  { value: 'daily', labelKey: 'hygiene.dailyCleaning' },
  { value: 'equipment', labelKey: 'hygiene.equipmentMaintenance' },
  { value: 'periodic', labelKey: 'hygiene.periodicMaintenance' },
  { value: 'opening', labelKey: 'hygiene.openingChecklist' },
  { value: 'closing', labelKey: 'hygiene.closingChecklist' },
]

const FREQUENCIES = [
  { value: 'daily', labelKey: 'hygiene.daily' },
  { value: 'weekly', labelKey: 'hygiene.weekly' },
  { value: 'monthly', labelKey: 'hygiene.monthly' },
  { value: 'specific_days', labelKey: 'hygiene.specificDays' },
]

const PRIORITIES = [
  { value: 1, labelKey: 'hygiene.priorityCritical' },
  { value: 2, labelKey: 'hygiene.priorityHigh' },
  { value: 3, labelKey: 'hygiene.priorityNormal' },
  { value: 4, labelKey: 'hygiene.priorityLow' },
]

const EVIDENCE_TYPES = [
  { value: 'photo', labelKey: 'hygiene.evidencePhoto' },
  { value: 'signature', labelKey: 'hygiene.evidenceSignature' },
  { value: 'both', labelKey: 'hygiene.evidenceBoth' },
]

const SHIFTS = [
  { value: 'morning', labelKey: 'hygiene.morning' },
  { value: 'afternoon', labelKey: 'hygiene.afternoon' },
  { value: 'evening', labelKey: 'hygiene.evening' },
]

const WEEKDAYS = [
  { value: 1, labelKey: 'hygiene.mon' },
  { value: 2, labelKey: 'hygiene.tue' },
  { value: 3, labelKey: 'hygiene.wed' },
  { value: 4, labelKey: 'hygiene.thu' },
  { value: 5, labelKey: 'hygiene.fri' },
  { value: 6, labelKey: 'hygiene.sat' },
  { value: 7, labelKey: 'hygiene.sun' },
]

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

interface ChecklistItem {
  id?: string
  item: string
  description: string
  isRequired: boolean
}

export function HygieneTemplateFormPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const queryClient = useQueryClient()
  const isEdit = Boolean(id)

  // Helper to get label text from item with either label or labelKey
  const getLabel = (item: any) => item.labelKey ? t(item.labelKey) : item.label

  const [form, setForm] = useState({
    areaCode: 'counter',
    name: '',
    description: '',
    category: 'daily',
    frequency: 'daily',
    specificDays: [] as number[],
    time: '10:00',
    executionTimes: [] as string[], // 每日多次执行时间
    priority: 2,
    estimatedMinutes: 10,
    standardBefore: '',
    standardDuring: '',
    standardAfter: '',
    toolsRequired: [] as string[],
    photoRequired: true,
    evidenceType: 'photo',
    assignedType: 'shift',
    shift: 'morning',
    staffId: '',
    staffIds: [] as string[], // 多个员工
    requiresApproval: false,
    alertMinutesBefore: 15,
    autoGenerate: true,
    regulationCode: '',
  })

  const [toolInput, setToolInput] = useState('')
  const [checklists, setChecklists] = useState<ChecklistItem[]>([])

  // Fetch areas from API
  const { data: areasData } = useQuery({
    queryKey: ['hygiene-areas'],
    queryFn: () => hygieneApi.areas(),
  })

  // Fetch categories and priorities from API
  const { data: categoriesData } = useQuery({
    queryKey: ['hygiene-categories'],
    queryFn: () => hygieneApi.categories(),
  })

  const { data: prioritiesData } = useQuery({
    queryKey: ['hygiene-priorities'],
    queryFn: () => hygieneApi.priorities(),
  })

  const { data: staffData, isLoading: staffLoading } = useQuery({
    queryKey: ['staff-list'],
    queryFn: () => staffApi.list({ pageSize: 100 }),
  })

  const { data: templateData, isLoading: templateLoading } = useQuery({
    queryKey: ['hygiene-template', id],
    queryFn: () => hygieneApi.getTemplate(id!),
    enabled: Boolean(id),
  })

  // Build areas list (API + defaults)
  const getAreaName = (code: string) => t(`hygiene.${code}`) || code
  const areas = areasData?.data?.data?.list?.length
    ? areasData.data.data.list.map((a: any) => ({
        code: a.code,
        name: a.isCustom ? a.name : getAreaName(a.code),
      }))
    : DEFAULT_AREA_CODES.map(code => ({ code, name: getAreaName(code) }))

  // Build categories list (API + defaults)
  const categories = categoriesData?.data?.length
    ? categoriesData.data.map((c: any) => ({ value: c.value, label: c.label }))
    : CATEGORIES

  // Build priorities list
  const priorities = prioritiesData?.data?.length
    ? prioritiesData.data.map((p: any) => ({ value: p.value, label: p.label }))
    : PRIORITIES

  useEffect(() => {
    if (templateData?.data) {
      const template = templateData.data.data
      setForm({
        areaCode: template.areaCode || template.area || 'counter',
        name: template.name || '',
        description: template.description || '',
        category: template.category || 'daily',
        frequency: template.frequency || 'daily',
        specificDays: template.specificDays ? JSON.parse(template.specificDays) : [],
        time: template.time || '10:00',
        executionTimes: template.executionTimes ? JSON.parse(template.executionTimes) : [], // 新增
        priority: template.priority || 2,
        estimatedMinutes: template.estimatedMinutes || 10,
        standardBefore: template.standardBefore || '',
        standardDuring: template.standardDuring || '',
        standardAfter: template.standardAfter || '',
        toolsRequired: template.toolsRequired ? JSON.parse(template.toolsRequired) : [],
        photoRequired: template.photoRequired ?? true,
        evidenceType: template.evidenceType || 'photo',
        assignedType: template.assignedType || 'shift',
        shift: template.shift || 'morning',
        staffId: template.staffId || '',
        staffIds: template.staffIds ? JSON.parse(template.staffIds) : [], // 新增
        requiresApproval: template.requiresApproval ?? false,
        alertMinutesBefore: template.alertMinutesBefore || 15,
        autoGenerate: template.autoGenerate ?? true,
        regulationCode: template.regulationCode || '',
      })
      // Load checklists
      if (template.checklists && template.checklists.length > 0) {
        setChecklists(template.checklists.map((c: any) => ({
          id: c.id,
          item: c.item,
          description: c.description || '',
          isRequired: c.isRequired ?? true,
        })))
      }
    }
  }, [templateData])

  const staffList = staffData?.data?.data?.list || []

  const createMutation = useMutation({
    mutationFn: (data: any) => hygieneApi.createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hygiene-templates'] })
      navigate('/hygiene')
    },
    onError: (error: any) => {
      console.error('Create template error:', error)
      alert(t('hygiene.createTemplateFailed') + ': ' + (error?.message || error?.response?.data?.message || t('common.unknownError')))
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => hygieneApi.updateTemplate(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hygiene-templates'] })
      navigate('/hygiene')
    },
    onError: (error: any) => {
      console.error('Update template error:', error)
      alert(t('hygiene.updateTemplateFailed') + ': ' + (error?.message || error?.response?.data?.message || t('common.unknownError')))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const payload: any = {
        ...form,
        // Clear fields based on assignedType
        ...(form.assignedType === 'staff' ? { shift: null, areaManagerId: null, staffIds: null } : {}),
        ...(form.assignedType === 'shift' ? { staffId: null, staffIds: null, areaManagerId: null } : {}),
        ...(form.assignedType === 'area' ? { staffId: null, staffIds: null, shift: null } : {}),
        // Parse specificDays to JSON
        specificDays: form.frequency === 'specific_days' ? form.specificDays : undefined,
        // Parse executionTimes to JSON (keep as array for API)
      }

      // Add checklists
      if (checklists.length > 0) {
        payload.checklists = checklists.map((c: any, idx: number) => ({
          item: c.item,
          description: c.description,
          isRequired: c.isRequired,
          order: idx,
        }))
      }

      if (isEdit) {
        updateMutation.mutate(payload)
      } else {
        createMutation.mutate(payload)
      }
    } catch (err) {
      console.error('Submit error:', err)
      alert(t('hygiene.submitFailed') + ': ' + (err instanceof Error ? err.message : t('common.unknownError')))
    }
  }

  const addTool = () => {
    if (toolInput.trim() && !form.toolsRequired.includes(toolInput.trim())) {
      setForm({ ...form, toolsRequired: [...form.toolsRequired, toolInput.trim()] })
      setToolInput('')
    }
  }

  const removeTool = (tool: string) => {
    setForm({ ...form, toolsRequired: form.toolsRequired.filter(t => t !== tool) })
  }

  const addChecklist = () => {
    setChecklists([...checklists, { item: '', description: '', isRequired: true }])
  }

  const updateChecklist = (index: number, field: keyof ChecklistItem, value: any) => {
    const updated = [...checklists]
    updated[index] = { ...updated[index], [field]: value }
    setChecklists(updated)
  }

  const removeChecklist = (index: number) => {
    setChecklists(checklists.filter((_, i) => i !== index))
  }

  const toggleSpecificDay = (day: number) => {
    const days = form.specificDays.includes(day)
      ? form.specificDays.filter(d => d !== day)
      : [...form.specificDays, day].sort()
    setForm({ ...form, specificDays: days })
  }

  const isLoading = staffLoading || (isEdit && templateLoading)
  const isSaving = createMutation.isPending || updateMutation.isPending

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => navigate('/hygiene')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft size={20} />
        {t('common.back')}
      </button>

      <div className="card">
        <h2 className="text-lg font-semibold mb-6">
          {isEdit ? t('hygiene.editTemplate') : t('hygiene.addTemplate')}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Area */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('hygiene.area')} *
              </label>
              <select
                value={form.areaCode}
                onChange={(e) => setForm({ ...form, areaCode: e.target.value })}
                className="input w-full"
                required
              >
                {areas.map((area: any) => (
                  <option key={area.code} value={area.code}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('hygiene.category')}
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="input w-full"
              >
                {categories.map((cat: any) => (
                  <option key={cat.value} value={cat.value}>
                    {getLabel(cat)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('hygiene.templateName')} *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input w-full"
              placeholder={t('hygiene.namePlaceholder')}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('hygiene.templateDescription')}
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input w-full"
              rows={2}
              placeholder={t('hygiene.templateDescriptionPlaceholder')}
            />
          </div>

          {/* Priority & Time Row */}
          <div className="grid grid-cols-3 gap-4">
            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('hygiene.priority')}
              </label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) })}
                className="input w-full"
              >
                {priorities.map((p: any) => (
                  <option key={p.value} value={p.value}>
                    {getLabel(p)}
                  </option>
                ))}
              </select>
            </div>

            {/* Estimated Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('hygiene.estimatedMinutes')}
              </label>
              <input
                type="number"
                value={form.estimatedMinutes}
                onChange={(e) => setForm({ ...form, estimatedMinutes: parseInt(e.target.value) || 10 })}
                className="input w-full"
                min="1"
                max="480"
              />
            </div>

            {/* Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('hygiene.time')}
              </label>
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="input w-full"
                required
              />
            </div>
          </div>

          {/* Execution Times (Multiple Daily Executions) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('hygiene.executionTimes')} ({t('hygiene.executionTimesOptional')})
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              {form.executionTimes.map((time, idx) => (
                <div key={idx} className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                  <span className="text-sm">{time}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const newTimes = form.executionTimes.filter((_, i) => i !== idx)
                      setForm({ ...form, executionTimes: newTimes })
                    }}
                    className="text-blue-500 hover:text-red-500"
                  >
                    ×
                  </button>
                </div>
              ))}
              <input
                type="time"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    const input = e.target as HTMLInputElement
                    if (input.value && !form.executionTimes.includes(input.value)) {
                      setForm({ ...form, executionTimes: [...form.executionTimes, input.value].sort() })
                      input.value = ''
                    }
                  }
                }}
                className="input w-32"
                placeholder={t('hygiene.addTime')}
              />
              <span className="text-xs text-gray-500">{t('hygiene.executionTimesTip')}</span>
            </div>
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('hygiene.frequency')}
            </label>
            <div className="flex flex-wrap gap-4">
              {FREQUENCIES.map((freq) => (
                <label key={freq.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={freq.value}
                    checked={form.frequency === freq.value}
                    onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                    className="text-primary"
                  />
                  <span className="text-sm">{getLabel(freq)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Specific Days (if frequency is specific_days) */}
          {form.frequency === 'specific_days' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('hygiene.selectDays')}
              </label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleSpecificDay(day.value)}
                    className={`px-3 py-1 rounded text-sm ${
                      form.specificDays.includes(day.value)
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {getLabel(day)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Three-Phase Standards */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              {t('hygiene.executionStandards')}
            </label>

            {/* Before */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                <span className="font-medium text-blue-700">{t('hygiene.standardBefore')}</span>
              </div>
              <textarea
                value={form.standardBefore}
                onChange={(e) => setForm({ ...form, standardBefore: e.target.value })}
                className="input w-full"
                rows={2}
                placeholder={t('hygiene.standardBeforePlaceholder')}
              />
            </div>

            {/* During */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                <span className="font-medium text-green-700">{t('hygiene.standardDuring')}</span>
              </div>
              <textarea
                value={form.standardDuring}
                onChange={(e) => setForm({ ...form, standardDuring: e.target.value })}
                className="input w-full"
                rows={2}
                placeholder={t('hygiene.standardDuringPlaceholder')}
              />
            </div>

            {/* After */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                <span className="font-medium text-purple-700">{t('hygiene.standardAfter')}</span>
              </div>
              <textarea
                value={form.standardAfter}
                onChange={(e) => setForm({ ...form, standardAfter: e.target.value })}
                className="input w-full"
                rows={2}
                placeholder={t('hygiene.standardAfterPlaceholder')}
              />
            </div>
          </div>

          {/* Tools Required */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('hygiene.toolsRequired')}
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={toolInput}
                onChange={(e) => setToolInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTool())}
                className="input flex-1"
                placeholder={t('hygiene.toolsPlaceholder')}
              />
              <button type="button" onClick={addTool} className="btn-secondary">
                <Plus size={18} />
              </button>
            </div>
            {form.toolsRequired.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.toolsRequired.map((tool) => (
                  <span
                    key={tool}
                    className="px-2 py-1 bg-gray-100 rounded text-sm flex items-center gap-1"
                  >
                    {tool}
                    <button
                      type="button"
                      onClick={() => removeTool(tool)}
                      className="text-gray-500 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Evidence Type & Photo Required */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('hygiene.evidenceType')}
              </label>
              <select
                value={form.evidenceType}
                onChange={(e) => setForm({ ...form, evidenceType: e.target.value })}
                className="input w-full"
              >
                {EVIDENCE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {getLabel(type)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.photoRequired}
                  onChange={(e) => setForm({ ...form, photoRequired: e.target.checked })}
                  className="w-4 h-4 text-primary"
                />
                <span className="text-sm">{t('hygiene.photoRequired')}</span>
              </label>
            </div>
          </div>

          {/* Assignment */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('hygiene.assigneeType')}
              </label>
              <select
                value={form.assignedType}
                onChange={(e) => setForm({ ...form, assignedType: e.target.value })}
                className="input w-full"
              >
                <option value="shift">{t('hygiene.assignToShift')}</option>
                <option value="staff">{t('hygiene.assignToStaff')}</option>
                <option value="area">{t('hygiene.assignToArea')}</option>
              </select>
            </div>
            <div>
              {form.assignedType === 'shift' ? (
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('hygiene.selectShift')}
                </label>
              ) : form.assignedType === 'staff' ? (
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('hygiene.selectStaff')}
                </label>
              ) : (
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('hygiene.selectArea')}
                </label>
              )}
              {form.assignedType === 'shift' ? (
                <select
                  value={form.shift || 'morning'}
                  onChange={(e) => setForm({ ...form, shift: e.target.value })}
                  className="input w-full"
                >
                  {SHIFTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {getLabel(s)}
                    </option>
                  ))}
                </select>
              ) : form.assignedType === 'staff' ? (
                <div>
                  <select
                    value={form.staffId}
                    onChange={(e) => setForm({ ...form, staffId: e.target.value })}
                    className="input w-full"
                  >
                    <option value="">{t('hygiene.selectStaff')}</option>
                    {staffList.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {/* Multiple Staff Selection */}
                  <div className="mt-2">
                    <label className="text-xs text-gray-500 mb-1 block">
                      {t('hygiene.orSelectMultipleStaff')}
                    </label>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto border border-gray-200 rounded p-2">
                      {staffList.map((s: any) => (
                        <label key={s.id} className="flex items-center gap-1 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.staffIds.includes(s.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setForm({ ...form, staffIds: [...form.staffIds, s.id] })
                              } else {
                                setForm({ ...form, staffIds: form.staffIds.filter(id => id !== s.id) })
                              }
                            }}
                            className="w-4 h-4"
                          />
                          {s.name}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <select
                  value={form.areaCode || ''}
                  onChange={(e) => setForm({ ...form, areaCode: e.target.value })}
                  className="input w-full"
                >
                  <option value="">{t('hygiene.selectArea')}</option>
                  {AREAS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {t(a.label)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Approval & Auto Generate */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.requiresApproval}
                  onChange={(e) => setForm({ ...form, requiresApproval: e.target.checked })}
                  className="w-4 h-4 text-primary"
                />
                <span className="text-sm">{t('hygiene.requiresApproval')}</span>
              </label>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoGenerate}
                  onChange={(e) => setForm({ ...form, autoGenerate: e.target.checked })}
                  className="w-4 h-4 text-primary"
                />
                <span className="text-sm">{t('hygiene.autoGenerate')}</span>
              </label>
            </div>
          </div>

          {/* Alert Minutes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('hygiene.alertMinutesBefore')}
            </label>
            <input
              type="number"
              value={form.alertMinutesBefore}
              onChange={(e) => setForm({ ...form, alertMinutesBefore: parseInt(e.target.value) || 15 })}
              className="input w-full max-w-[200px]"
              min="0"
              max="120"
            />
          </div>

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                {t('hygiene.checklist')}
              </label>
              <button
                type="button"
                onClick={addChecklist}
                className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
              >
                <Plus size={16} />
                {t('hygiene.addChecklistItem')}
              </button>
            </div>
            {checklists.length > 0 && (
              <div className="space-y-2">
                {checklists.map((checklist, index) => (
                  <div key={index} className="flex gap-2 items-start bg-gray-50 p-2 rounded">
                    <input
                      type="text"
                      value={checklist.item}
                      onChange={(e) => updateChecklist(index, 'item', e.target.value)}
                      className="input flex-1"
                      placeholder={t('hygiene.checklistItem')}
                    />
                    <input
                      type="text"
                      value={checklist.description}
                      onChange={(e) => updateChecklist(index, 'description', e.target.value)}
                      className="input flex-1"
                      placeholder={t('hygiene.checklistDescription')}
                    />
                    <label className="flex items-center gap-1 text-sm whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={checklist.isRequired}
                        onChange={(e) => updateChecklist(index, 'isRequired', e.target.checked)}
                        className="w-4 h-4"
                      />
                      {t('hygiene.checklistRequired')}
                    </label>
                    <button
                      type="button"
                      onClick={() => removeChecklist(index)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => navigate('/hygiene')}
              className="btn-secondary"
            >
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? <Loader2 className="animate-spin" size={18} /> : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
