import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { staffApi, trainingApi } from '../../services/api'
import { Plus, Edit2, Trash2, BookOpen, RefreshCw, Settings, X } from 'lucide-react'
import { TrainingFormModal } from './TrainingFormModal'

interface TrainingRecord {
  id: string
  staffId: string
  staffName?: string
  trainingType: string
  title: string
  provider: string
  date: string
  duration: number
  certificate?: string
  status: string
  score?: number
  passed?: boolean
  notes?: string
  attachments?: string
}

interface TrainingCategory {
  key: string
  label: string
  labelZh?: string
  labelId?: string
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500'
}

export function TrainingListPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuthStore()
  const [records, setRecords] = useState<TrainingRecord[]>([])
  const [staffList, setStaffList] = useState<any[]>([])
  const [categories, setCategories] = useState<TrainingCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterStaff, setFilterStaff] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingRecord, setEditingRecord] = useState<TrainingRecord | null>(null)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [categoryForm, setCategoryForm] = useState<TrainingCategory[]>([])

  const loadCategories = async () => {
    try {
      const response = await trainingApi.getCategories()
      if (response.data?.data) {
        setCategories(response.data.data)
        setCategoryForm(response.data.data)
      }
    } catch (error) {
      console.error('Failed to load categories:', error)
    }
  }

  const loadData = async () => {
    setIsLoading(true)
    try {
      // 批量获取所有数据（一次API调用替代 N+1）
      const [staffResponse, trainingResponse] = await Promise.all([
        staffApi.list({ storeId: user?.storeId, status: 'active' }),
        trainingApi.getAll()
      ])

      const staffData = staffResponse.data?.data?.list || staffResponse.data?.data || []
      setStaffList(staffData)
      await loadCategories()

      const allRecords: TrainingRecord[] = Array.isArray(trainingResponse.data?.data) ? trainingResponse.data.data : []

      allRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setRecords(allRecords)
    } catch (error) {
      console.error('Failed to load training data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  const handleEdit = (record: TrainingRecord) => {
    setEditingRecord(record)
    setShowForm(true)
  }

   const handleDelete = async (record: TrainingRecord) => {
    if (!confirm(t('common.confirm') + '?')) return
    try {
      await trainingApi.delete(record.id)
      loadData()
    } catch (error) {
      console.error('Failed to delete:', error)
      alert(t('common.error'))
    }
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditingRecord(null)
    loadData()
  }

  const getTypeLabel = (type: string) => {
    const cat = categories.find(c => c.key === type)
    if (!cat) return type
    const lang = i18n.language
    if (lang === 'zh') return cat.labelZh || cat.label
    if (lang === 'id') return cat.labelId || cat.label
    return cat.label
  }

  const filteredRecords = records.filter(r => {
    if (filterStaff && r.staffId !== filterStaff) return false
    if (filterType && r.trainingType !== filterType) return false
    if (filterStatus && r.status !== filterStatus) return false
    return true
  })

  // 类别管理
  const handleSaveCategories = async () => {
    try {
      const response = await fetch('/api/training/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${useAuthStore.getState().token}`
        },
        body: JSON.stringify({ categories: categoryForm })
      })
      if (response.ok) {
        setCategories(categoryForm)
        setShowCategoryModal(false)
        alert(t('common.success') || 'Saved successfully')
      }
    } catch (error) {
      console.error('Failed to save categories:', error)
      alert(t('common.error'))
    }
  }

  const handleAddCategory = () => {
    const newKey = 'custom_' + Date.now()
    setCategoryForm(prev => [...prev, { key: newKey, label: 'New Category', labelZh: '新类别', labelId: 'Kategori Baru' }])
  }

  const handleRemoveCategory = (index: number) => {
    setCategoryForm(prev => prev.filter((_, i) => i !== index))
  }

  const handleCategoryChange = (index: number, field: keyof TrainingCategory, value: string) => {
    setCategoryForm(prev => prev.map((cat, i) => i === index ? { ...cat, [field]: value } : cat))
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BookOpen size={28} className="text-primary" />
          <div />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadData} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50" disabled={isLoading}>
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowCategoryModal(true)} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50" title={t('training.categoryManagement')}>
            <Settings size={20} />
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={20} />
            {t('staff.addTraining')}
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <select value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)} className="input w-48">
          <option value="">{t('staff.allStaff')}</option>
          {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input w-40">
          <option value="">{t('staff.allTypes')}</option>
          {categories.map(cat => <option key={cat.key} value={cat.key}>{getTypeLabel(cat.key)}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input w-40">
          <option value="">{t('common.all')}</option>
          <option value="scheduled">{t('staff.scheduled')}</option>
          <option value="in_progress">{t('staff.inProgress')}</option>
          <option value="completed">{t('staff.completed')}</option>
          <option value="cancelled">{t('staff.cancelled')}</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-gray-400" />
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-12 text-gray-500">{t('common.noData')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{t('staff.name')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{t('staff.type')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{t('staff.title')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{t('staff.provider')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{t('staff.date')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{t('staff.duration')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{t('staff.score')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{t('staff.status')}</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-4 py-3 text-sm">{record.staffName}</td>
                    <td className="px-4 py-3 text-sm">{getTypeLabel(record.trainingType)}</td>
                    <td className="px-4 py-3 text-sm">{record.title}</td>
                    <td className="px-4 py-3 text-sm">{record.provider}</td>
                    <td className="px-4 py-3 text-sm">{(new Date(record.date).getTime() && !isNaN(new Date(record.date).getTime())) ? new Date(record.date).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}</td>
                    <td className="px-4 py-3 text-sm">{record.duration}h</td>
                    <td className="px-4 py-3 text-sm">{record.score || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[record.status] || ''}`}>
                        {t(`staff.${record.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleEdit(record)} className="p-1 hover:bg-gray-100 rounded">
                        <Edit2 size={16} className="text-gray-500" />
                      </button>
                      <button onClick={() => handleDelete(record)} className="p-1 hover:bg-gray-100 rounded ml-1">
                        <Trash2 size={16} className="text-red-500" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <TrainingFormModal staffList={staffList} editData={editingRecord} onClose={handleFormClose} />
      )}

      {/* 类别管理弹窗 */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCategoryModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{t('training.categoryManagement')}</h3>
              <button onClick={() => setShowCategoryModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 mb-4">
              {categoryForm.map((cat, index) => (
                <div key={index} className="grid grid-cols-4 gap-2 items-center">
                  <input
                    type="text"
                    value={cat.label}
                    onChange={(e) => handleCategoryChange(index, 'label', e.target.value)}
                    className="input text-sm"
                    placeholder="Label (EN)"
                  />
                  <input
                    type="text"
                    value={cat.labelZh || ''}
                    onChange={(e) => handleCategoryChange(index, 'labelZh', e.target.value)}
                    className="input text-sm"
                    placeholder="中文"
                  />
                  <input
                    type="text"
                    value={cat.labelId || ''}
                    onChange={(e) => handleCategoryChange(index, 'labelId', e.target.value)}
                    className="input text-sm"
                    placeholder="Bahasa"
                  />
                  <button onClick={() => handleRemoveCategory(index)} className="p-2 hover:bg-gray-100 rounded text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <button onClick={handleAddCategory} className="btn-secondary w-full mb-4">
              <Plus size={16} className="inline mr-1" />
              {t('training.addCategory')}
            </button>

            <div className="flex gap-3">
              <button onClick={handleSaveCategories} className="btn-primary flex-1">
                {t('common.save')}
              </button>
              <button onClick={() => setShowCategoryModal(false)} className="btn-secondary flex-1">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}