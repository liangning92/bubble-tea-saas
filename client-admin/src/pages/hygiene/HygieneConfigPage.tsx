import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { hygieneApi, configApi } from '../../services/api'
import { Loader2, Plus, Trash2, RotateCw } from 'lucide-react'

// Default config templates for reference
const DEFAULT_CATEGORIES = [
  { value: 'food_safety', label: 'Food Safety', labelZh: '食品安全', icon: '⚠️', color: '#FF0000' },
  { value: 'daily', label: 'Daily Cleaning', labelZh: '日常清洁', icon: '🧹', color: '#FFA500' },
  { value: 'equipment', label: 'Equipment', labelZh: '设备维护', icon: '🔧', color: '#00BFFF' },
  { value: 'periodic', label: 'Periodic', labelZh: '周期维护', icon: '📅', color: '#9370DB' },
  { value: 'opening', label: 'Opening', labelZh: '开业准备', icon: '🌅', color: '#32CD32' },
  { value: 'closing', label: 'Closing', labelZh: '闭店检查', icon: '🌙', color: '#8B0000' },
]

const DEFAULT_PRIORITIES = [
  { value: 1, label: 'Critical', labelZh: '紧急', color: '#FF0000' },
  { value: 2, label: 'High', labelZh: '重要', color: '#FFA500' },
  { value: 3, label: 'Normal', labelZh: '一般', color: '#00BFFF' },
  { value: 4, label: 'Low', labelZh: '低', color: '#808080' },
]

const DEFAULT_SHIFTS = [
  { value: 'morning', label: 'Morning', labelZh: '早班', time: '09:00-17:00' },
  { value: 'afternoon', label: 'Afternoon', labelZh: '午班', time: '14:00-22:00' },
  { value: 'evening', label: 'Evening', labelZh: '晚班', time: '22:00-06:00' },
]

const DEFAULT_EVIDENCE_TYPES = [
  { value: 'photo', label: 'Photo', labelZh: '拍照', icon: '📷' },
  { value: 'signature', label: 'Signature', labelZh: '签名', icon: '✍️' },
  { value: 'both', label: 'Photo + Signature', labelZh: '拍照+签名', icon: '📝' },
]

const DEFAULT_WEEKDAYS = [
  { value: 1, label: 'Monday', labelZh: '周一', short: 'Mon' },
  { value: 2, label: 'Tuesday', labelZh: '周二', short: 'Tue' },
  { value: 3, label: 'Wednesday', labelZh: '周三', short: 'Wed' },
  { value: 4, label: 'Thursday', labelZh: '周四', short: 'Thu' },
  { value: 5, label: 'Friday', labelZh: '周五', short: 'Fri' },
  { value: 6, label: 'Saturday', labelZh: '周六', short: 'Sat' },
  { value: 0, label: 'Sunday', labelZh: '周日', short: 'Sun' },
]

const DEFAULT_FREQUENCIES = [
  { value: 'daily', label: 'Daily', labelZh: '每日', icon: '📅' },
  { value: 'weekly', label: 'Weekly', labelZh: '每周', icon: '📆' },
  { value: 'monthly', label: 'Monthly', labelZh: '每月', icon: '🗓️' },
  { value: 'specific_days', label: 'Specific Days', labelZh: '特定日期', icon: '📌' },
]

const DEFAULT_ASSIGNED_TYPES = [
  { value: 'shift', label: 'By Shift', labelZh: '按班次', icon: '👥' },
  { value: 'staff', label: 'By Staff', labelZh: '指定员工', icon: '👤' },
  { value: 'area', label: 'By Area', labelZh: '按区域', icon: '📍' },
]

type ConfigTab = 'categories' | 'priorities' | 'shifts' | 'evidence_types' | 'weekdays' | 'frequencies' | 'assigned_types'

interface CategoryItem {
  value: string
  label: string
  labelZh: string
  icon: string
  color: string
}

interface PriorityItem {
  value: number
  label: string
  labelZh: string
  color: string
}

interface ShiftItem {
  value: string
  label: string
  labelZh: string
  time: string
}

interface EvidenceTypeItem {
  value: string
  label: string
  labelZh: string
  icon: string
}

interface WeekdayItem {
  value: number
  label: string
  labelZh: string
  short: string
}
interface FrequencyItem {
  value: string
  label: string
  labelZh: string
  icon: string
}

interface AssignedTypeItem {
  value: string
  label: string
  labelZh: string
  icon: string
}



export function HygieneConfigPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<ConfigTab>('categories')
  const [editData, setEditData] = useState<Record<string, any[]>>({})

  // Fetch all configs
  const { data: configsData, isLoading } = useQuery({
    queryKey: ['hygiene-configs'],
    queryFn: () => hygieneApi.getAllConfigs(),
  })

  // Update config mutation
  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: any[] }) => hygieneApi.updateConfig(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hygiene-configs'] })
      queryClient.invalidateQueries({ queryKey: ['hygiene-categories'] })
      queryClient.invalidateQueries({ queryKey: ['hygiene-priorities'] })
      queryClient.invalidateQueries({ queryKey: ['hygiene-frequencies'] })
      queryClient.invalidateQueries({ queryKey: ['hygiene-assignedTypes'] })
    },
    onError: (error: any) => {
      console.error('Update config error:', error)
      alert(t('hygiene.saveConfigFailed') + ': ' + (error?.message || error?.response?.data?.message || t('common.unknownError')))
    },
  })

  // Load configs into edit data when configs are fetched
  useEffect(() => {
    if (configsData?.data) {
      const configs = configsData.data.data
      setEditData({
        categories: configs.categories || DEFAULT_CATEGORIES,
        priorities: configs.priorities || DEFAULT_PRIORITIES,
        shifts: configs.shifts || DEFAULT_SHIFTS,
        evidence_types: configs.evidence_types || DEFAULT_EVIDENCE_TYPES,
        weekdays: configs.weekdays || DEFAULT_WEEKDAYS,
        frequencies: configs.frequencies || DEFAULT_FREQUENCIES,
        assigned_types: configs.assigned_types || DEFAULT_ASSIGNED_TYPES,
      })
    }
  }, [configsData])

  const handleSave = async () => {
    await updateMutation.mutateAsync({ key: activeTab, value: editData[activeTab] })
  }

  const handleReset = async (tab: ConfigTab) => {
    try {
      const response = await configApi.getDefaults(tab)
      const defaults = response.data?.data
      if (defaults) {
        setEditData({ ...editData, [tab]: defaults })
      }
    } catch (error) {
      console.error('Failed to load defaults:', error)
    }
  }

  const isSaving = updateMutation.isPending

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  const tabs: { key: ConfigTab; label: string }[] = [
    { key: 'categories', label: t('hygiene.categories') },
    { key: 'priorities', label: t('hygiene.priorities') },
    { key: 'shifts', label: t('hygiene.shifts') },
    { key: 'evidence_types', label: t('hygiene.evidenceTypes') },
    { key: 'weekdays', label: t('hygiene.weekdays') },
    { key: 'frequencies', label: t('hygiene.frequencies') },
    { key: 'assigned_types', label: t('hygiene.assignedTypes') },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        <button
          onClick={() => handleReset(activeTab)}
          className="btn-secondary flex items-center gap-2"
        >
          <RotateCw size={18} />
          {t('hygiene.resetToDefault')}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-primary shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="card">
        {activeTab === 'categories' && (
          <CategoryEditor
            data={editData.categories || DEFAULT_CATEGORIES}
            onChange={(data) => setEditData({ ...editData, categories: data })}
          />
        )}
        {activeTab === 'priorities' && (
          <PriorityEditor
            data={editData.priorities || DEFAULT_PRIORITIES}
            onChange={(data) => setEditData({ ...editData, priorities: data })}
          />
        )}
        {activeTab === 'shifts' && (
          <ShiftEditor
            data={editData.shifts || DEFAULT_SHIFTS}
            onChange={(data) => setEditData({ ...editData, shifts: data })}
          />
        )}
        {activeTab === 'evidence_types' && (
          <EvidenceTypeEditor
            data={editData.evidence_types || DEFAULT_EVIDENCE_TYPES}
            onChange={(data) => setEditData({ ...editData, evidence_types: data })}
          />
        )}
        {activeTab === 'weekdays' && (
          <WeekdayEditor
            data={editData.weekdays || DEFAULT_WEEKDAYS}
            onChange={(data) => setEditData({ ...editData, weekdays: data })}
          />
        )}

        {activeTab === 'frequencies' && (
          <FrequencyEditor
            data={editData.frequencies || DEFAULT_FREQUENCIES}
            onChange={(data) => setEditData({ ...editData, frequencies: data })}
          />
        )}

        {activeTab === 'assigned_types' && (
          <AssignedTypeEditor
            data={editData.assigned_types || DEFAULT_ASSIGNED_TYPES}
            onChange={(data) => setEditData({ ...editData, assigned_types: data })}
          />
        )}

        {/* Save Button */}
        <div className="flex justify-end gap-3 pt-4 border-t mt-6">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary flex items-center gap-2"
          >
            {isSaving && <Loader2 size={18} className="animate-spin" />}
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Category Editor
// ============================================
function CategoryEditor({ data, onChange }: { data: CategoryItem[]; onChange: (data: CategoryItem[]) => void }) {
  const { t } = useTranslation()

  const updateItem = (index: number, field: keyof CategoryItem, value: any) => {
    const newData = [...data]
    newData[index] = { ...newData[index], [field]: value }
    onChange(newData)
  }

  const addItem = () => {
    onChange([...data, { value: '', label: '', labelZh: '', icon: '📋', color: '#808080' }])
  }

  const removeItem = (index: number) => {
    onChange(data.filter((_, i) => i !== index))
  }

  const ICONS = ['⚠️', '🧹', '🔧', '📅', '🌅', '🌙', '🧾', '🍳', '🧋','🗑️', '⚙️', '💨', '🏪', '🧊', '📦', '🪑']
  const COLORS = ['#FF0000', '#FFA500', '#00BFFF', '#9370DB', '#32CD32', '#8B0000', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{t('hygiene.categoryManagement')}</h3>
        <button onClick={addItem} className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
          <Plus size={16} />
          {t('hygiene.addCategory')}
        </button>
      </div>

      {data.map((item, index) => (
        <div key={index} className="flex gap-3 items-start bg-gray-50 p-3 rounded-lg">
          {/* Icon */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('hygiene.icon')}</label>
            <select
              value={item.icon}
              onChange={(e) => updateItem(index, 'icon', e.target.value)}
              className="input w-16"
            >
              {ICONS.map((icon) => (
                <option key={icon} value={icon}>{icon}</option>
              ))}
            </select>
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('hygiene.color')}</label>
            <select
              value={item.color}
              onChange={(e) => updateItem(index, 'color', e.target.value)}
              className="input w-24"
            >
              {COLORS.map((color) => (
                <option key={color} value={color}>{color}</option>
              ))}
            </select>
          </div>

          {/* Value */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Key</label>
            <input
              type="text"
              value={item.value}
              onChange={(e) => updateItem(index, 'value', e.target.value)}
              className="input w-full"
              placeholder="e.g., food_safety"
            />
          </div>

          {/* Label EN */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label (EN)</label>
            <input
              type="text"
              value={item.label}
              onChange={(e) => updateItem(index, 'label', e.target.value)}
              className="input w-full"
              placeholder="Food Safety"
            />
          </div>

          {/* Label ZH */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label (ZH)</label>
            <input
              type="text"
              value={item.labelZh}
              onChange={(e) => updateItem(index, 'labelZh', e.target.value)}
              className="input w-full"
              placeholder="食品安全"
            />
          </div>

          {/* Delete */}
          <div className="pt-5">
            <button
              onClick={() => removeItem(index)}
              className="text-gray-400 hover:text-red-500 p-1"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Priority Editor
// ============================================
function PriorityEditor({ data, onChange }: { data: PriorityItem[]; onChange: (data: PriorityItem[]) => void }) {
  const { t } = useTranslation()

  const updateItem = (index: number, field: keyof PriorityItem, value: any) => {
    const newData = [...data]
    newData[index] = { ...newData[index], [field]: value }
    onChange(newData)
  }

  const addItem = () => {
    onChange([...data, { value: data.length + 1, label: '', labelZh: '', color: '#808080' }])
  }

  const removeItem = (index: number) => {
    onChange(data.filter((_, i) => i !== index))
  }

  const COLORS = ['#FF0000', '#FFA500', '#00BFFF', '#9370DB', '#32CD32', '#8B0000', '#808080', '#333333']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{t('hygiene.priorityManagement')}</h3>
        <button onClick={addItem} className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
          <Plus size={16} />
          {t('hygiene.addPriority')}
        </button>
      </div>

      {data.map((item, index) => (
        <div key={index} className="flex gap-3 items-start bg-gray-50 p-3 rounded-lg">
          {/* Value */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('hygiene.value')}</label>
            <input
              type="number"
              value={item.value}
              onChange={(e) => updateItem(index, 'value', parseInt(e.target.value) || 0)}
              className="input w-20"
              min="1"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('hygiene.color')}</label>
            <select
              value={item.color}
              onChange={(e) => updateItem(index, 'color', e.target.value)}
              className="input w-24"
            >
              {COLORS.map((color) => (
                <option key={color} value={color}>{color}</option>
              ))}
            </select>
          </div>

          {/* Label EN */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label (EN)</label>
            <input
              type="text"
              value={item.label}
              onChange={(e) => updateItem(index, 'label', e.target.value)}
              className="input w-full"
              placeholder="Critical"
            />
          </div>

          {/* Label ZH */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label (ZH)</label>
            <input
              type="text"
              value={item.labelZh}
              onChange={(e) => updateItem(index, 'labelZh', e.target.value)}
              className="input w-full"
              placeholder="紧急"
            />
          </div>

          {/* Delete */}
          <div className="pt-5">
            <button
              onClick={() => removeItem(index)}
              className="text-gray-400 hover:text-red-500 p-1"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Shift Editor
// ============================================
function ShiftEditor({ data, onChange }: { data: ShiftItem[]; onChange: (data: ShiftItem[]) => void }) {
  const { t } = useTranslation()

  const updateItem = (index: number, field: keyof ShiftItem, value: any) => {
    const newData = [...data]
    newData[index] = { ...newData[index], [field]: value }
    onChange(newData)
  }

  const addItem = () => {
    onChange([...data, { value: '', label: '', labelZh: '', time: '' }])
  }

  const removeItem = (index: number) => {
    onChange(data.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{t('hygiene.shiftManagement')}</h3>
        <button onClick={addItem} className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
          <Plus size={16} />
          {t('hygiene.addShift')}
        </button>
      </div>

      {data.map((item, index) => (
        <div key={index} className="flex gap-3 items-start bg-gray-50 p-3 rounded-lg">
          {/* Value */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Key</label>
            <input
              type="text"
              value={item.value}
              onChange={(e) => updateItem(index, 'value', e.target.value)}
              className="input w-24"
              placeholder="morning"
            />
          </div>

          {/* Time */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('hygiene.time')}</label>
            <input
              type="text"
              value={item.time}
              onChange={(e) => updateItem(index, 'time', e.target.value)}
              className="input w-32"
              placeholder="09:00-17:00"
            />
          </div>

          {/* Label EN */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label (EN)</label>
            <input
              type="text"
              value={item.label}
              onChange={(e) => updateItem(index, 'label', e.target.value)}
              className="input w-full"
              placeholder="Morning"
            />
          </div>

          {/* Label ZH */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label (ZH)</label>
            <input
              type="text"
              value={item.labelZh}
              onChange={(e) => updateItem(index, 'labelZh', e.target.value)}
              className="input w-full"
              placeholder="早班"
            />
          </div>

          {/* Delete */}
          <div className="pt-5">
            <button
              onClick={() => removeItem(index)}
              className="text-gray-400 hover:text-red-500 p-1"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Evidence Type Editor
// ============================================
function EvidenceTypeEditor({ data, onChange }: { data: EvidenceTypeItem[]; onChange: (data: EvidenceTypeItem[]) => void }) {
  const { t } = useTranslation()

  const updateItem = (index: number, field: keyof EvidenceTypeItem, value: any) => {
    const newData = [...data]
    newData[index] = { ...newData[index], [field]: value }
    onChange(newData)
  }

  const addItem = () => {
    onChange([...data, { value: '', label: '', labelZh: '', icon: '📷' }])
  }

  const removeItem = (index: number) => {
    onChange(data.filter((_, i) => i !== index))
  }

  const ICONS = ['📷', '✍️', '📝', '📸', '🎥', '🖼️']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{t('hygiene.evidenceTypeManagement')}</h3>
        <button onClick={addItem} className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
          <Plus size={16} />
          {t('hygiene.addEvidenceType')}
        </button>
      </div>

      {data.map((item, index) => (
        <div key={index} className="flex gap-3 items-start bg-gray-50 p-3 rounded-lg">
          {/* Icon */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('hygiene.icon')}</label>
            <select
              value={item.icon}
              onChange={(e) => updateItem(index, 'icon', e.target.value)}
              className="input w-16"
            >
              {ICONS.map((icon) => (
                <option key={icon} value={icon}>{icon}</option>
              ))}
            </select>
          </div>

          {/* Value */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Key</label>
            <input
              type="text"
              value={item.value}
              onChange={(e) => updateItem(index, 'value', e.target.value)}
              className="input w-24"
              placeholder="photo"
            />
          </div>

          {/* Label EN */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label (EN)</label>
            <input
              type="text"
              value={item.label}
              onChange={(e) => updateItem(index, 'label', e.target.value)}
              className="input w-full"
              placeholder="Photo"
            />
          </div>

          {/* Label ZH */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label (ZH)</label>
            <input
              type="text"
              value={item.labelZh}
              onChange={(e) => updateItem(index, 'labelZh', e.target.value)}
              className="input w-full"
              placeholder="拍照"
            />
          </div>

          {/* Delete */}
          <div className="pt-5">
            <button
              onClick={() => removeItem(index)}
              className="text-gray-400 hover:text-red-500 p-1"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Weekday Editor
// ============================================
function WeekdayEditor({ data, onChange }: { data: WeekdayItem[]; onChange: (data: WeekdayItem[]) => void }) {
  const { t } = useTranslation()

  const updateItem = (index: number, field: keyof WeekdayItem, value: any) => {
    const newData = [...data]
    newData[index] = { ...newData[index], [field]: value }
    onChange(newData)
  }

  const addItem = () => {
    onChange([...data, { value: 0, label: '', labelZh: '', short: '' }])
  }

  const removeItem = (index: number) => {
    onChange(data.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{t('hygiene.weekdayManagement')}</h3>
        <button onClick={addItem} className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
          <Plus size={16} />
          {t('hygiene.addWeekday')}
        </button>
      </div>

      {data.map((item, index) => (
        <div key={index} className="flex gap-3 items-start bg-gray-50 p-3 rounded-lg">
          {/* Value (day number) */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('hygiene.dayNumber')}</label>
            <input
              type="number"
              value={item.value}
              onChange={(e) => updateItem(index, 'value', parseInt(e.target.value) || 0)}
              className="input w-20"
              min="0"
              max="6"
            />
          </div>

          {/* Short */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Short</label>
            <input
              type="text"
              value={item.short}
              onChange={(e) => updateItem(index, 'short', e.target.value)}
              className="input w-16"
              placeholder="Mon"
            />
          </div>

          {/* Label EN */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label (EN)</label>
            <input
              type="text"
              value={item.label}
              onChange={(e) => updateItem(index, 'label', e.target.value)}
              className="input w-full"
              placeholder="Monday"
            />
          </div>

          {/* Label ZH */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label (ZH)</label>
            <input
              type="text"
              value={item.labelZh}
              onChange={(e) => updateItem(index, 'labelZh', e.target.value)}
              className="input w-full"
              placeholder="周一"
            />
          </div>

          {/* Delete */}
          <div className="pt-5">
            <button
              onClick={() => removeItem(index)}
              className="text-gray-400 hover:text-red-500 p-1"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Frequency Editor
// ============================================
function FrequencyEditor({ data, onChange }: { data: FrequencyItem[]; onChange: (data: FrequencyItem[]) => void }) {
  const { t } = useTranslation()

  const updateItem = (index: number, field: keyof FrequencyItem, value: any) => {
    const newData = [...data]
    newData[index] = { ...newData[index], [field]: value }
    onChange(newData)
  }

  const addItem = () => {
    onChange([...data, { value: '', label: '', labelZh: '', icon: '📅' }])
  }

  const removeItem = (index: number) => {
    onChange(data.filter((_, i) => i !== index))
  }

  const ICONS = ['📅', '📆', '🗓️', '📌', '⏰', '🔄', '⚡', '🎯']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{t('hygiene.frequencyManagement')}</h3>
        <button onClick={addItem} className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
          <Plus size={16} />
          {t('hygiene.addFrequency')}
        </button>
      </div>

      {data.map((item, index) => (
        <div key={index} className="flex gap-3 items-start bg-gray-50 p-3 rounded-lg">
          {/* Icon */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('hygiene.icon')}</label>
            <select
              value={item.icon}
              onChange={(e) => updateItem(index, 'icon', e.target.value)}
              className="input w-16"
            >
              {ICONS.map((icon) => (
                <option key={icon} value={icon}>{icon}</option>
              ))}
            </select>
          </div>

          {/* Value */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Key</label>
            <input
              type="text"
              value={item.value}
              onChange={(e) => updateItem(index, 'value', e.target.value)}
              className="input w-full"
              placeholder="daily"
            />
          </div>

          {/* Label EN */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label (EN)</label>
            <input
              type="text"
              value={item.label}
              onChange={(e) => updateItem(index, 'label', e.target.value)}
              className="input w-full"
              placeholder="Daily"
            />
          </div>

          {/* Label ZH */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label (ZH)</label>
            <input
              type="text"
              value={item.labelZh}
              onChange={(e) => updateItem(index, 'labelZh', e.target.value)}
              className="input w-full"
              placeholder="每日"
            />
          </div>

          {/* Delete */}
          <div className="pt-5">
            <button
              onClick={() => removeItem(index)}
              className="text-gray-400 hover:text-red-500 p-1"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Assigned Type Editor
// ============================================
function AssignedTypeEditor({ data, onChange }: { data: AssignedTypeItem[]; onChange: (data: AssignedTypeItem[]) => void }) {
  const { t } = useTranslation()

  const updateItem = (index: number, field: keyof AssignedTypeItem, value: any) => {
    const newData = [...data]
    newData[index] = { ...newData[index], [field]: value }
    onChange(newData)
  }

  const addItem = () => {
    onChange([...data, { value: '', label: '', labelZh: '', icon: '👥' }])
  }

  const removeItem = (index: number) => {
    onChange(data.filter((_, i) => i !== index))
  }

  const ICONS = ['👥', '👤', '📍', '🏪', '🔔', '⭐', '🎯', '📋']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{t('hygiene.assignedTypeManagement')}</h3>
        <button onClick={addItem} className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
          <Plus size={16} />
          {t('hygiene.addAssignedType')}
        </button>
      </div>

      {data.map((item, index) => (
        <div key={index} className="flex gap-3 items-start bg-gray-50 p-3 rounded-lg">
          {/* Icon */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('hygiene.icon')}</label>
            <select
              value={item.icon}
              onChange={(e) => updateItem(index, 'icon', e.target.value)}
              className="input w-16"
            >
              {ICONS.map((icon) => (
                <option key={icon} value={icon}>{icon}</option>
              ))}
            </select>
          </div>

          {/* Value */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Key</label>
            <input
              type="text"
              value={item.value}
              onChange={(e) => updateItem(index, 'value', e.target.value)}
              className="input w-full"
              placeholder="shift"
            />
          </div>

          {/* Label EN */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label (EN)</label>
            <input
              type="text"
              value={item.label}
              onChange={(e) => updateItem(index, 'label', e.target.value)}
              className="input w-full"
              placeholder="By Shift"
            />
          </div>

          {/* Label ZH */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label (ZH)</label>
            <input
              type="text"
              value={item.labelZh}
              onChange={(e) => updateItem(index, 'labelZh', e.target.value)}
              className="input w-full"
              placeholder="按班次"
            />
          </div>

          {/* Delete */}
          <div className="pt-5">
            <button
              onClick={() => removeItem(index)}
              className="text-gray-400 hover:text-red-500 p-1"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}