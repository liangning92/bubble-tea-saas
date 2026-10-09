import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { staffApi, trainingApi } from '../../services/api'
import {
  Plus,
  Edit2,
  Trash2,
  BookOpen,
  RefreshCw,
  Settings,
  X,
  Search,
  CheckCircle2,
  Clock,
  Award,
  Users,
  FileText,
  Lightbulb,
  AlertTriangle,
  Eye,
  CheckSquare
} from 'lucide-react'
import { TrainingFormModal } from './TrainingFormModal'
import { CourseEditModal } from './CourseEditModal'
import {
  TRAINING_MODULES,
  CHECKLISTS,
  TrainingModule,
  tr
} from '../../data/trainingContent'

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
  scheduled: 'bg-blue-50 text-blue-700 border border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border border-amber-200',
  completed: 'bg-green-50 text-green-700 border border-green-200',
  cancelled: 'bg-gray-100 text-gray-600 border border-gray-200'
}

export function TrainingListPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuthStore()

  // Tab: 'records' | 'courses' | 'checklists'
  const [activeTab, setActiveTab] = useState<'records' | 'courses' | 'checklists'>('records')

  // Records state
  const [records, setRecords] = useState<TrainingRecord[]>([])
  const [staffList, setStaffList] = useState<any[]>([])
  const [categories, setCategories] = useState<TrainingCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Courses state (dynamic & editable)
  const [courses, setCourses] = useState<TrainingModule[]>(TRAINING_MODULES)
  const [editingCourse, setEditingCourse] = useState<TrainingModule | null>(null)
  const [showCourseEditModal, setShowCourseEditModal] = useState(false)
  const [loadingCourses, setLoadingCourses] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [filterStaff, setFilterStaff] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Modals
  const [showForm, setShowForm] = useState(false)
  const [editingRecord, setEditingRecord] = useState<TrainingRecord | null>(null)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [categoryForm, setCategoryForm] = useState<TrainingCategory[]>([])
  const [selectedCourse, setSelectedCourse] = useState<TrainingModule | null>(null)

  const loadCourses = async () => {
    setLoadingCourses(true)
    try {
      const response = await trainingApi.getCourses()
      if (response.data?.data && Array.isArray(response.data.data) && response.data.data.length > 0) {
        setCourses(response.data.data)
      }
    } catch (error) {
      console.error('Failed to load courses from server, using local fallback:', error)
    } finally {
      setLoadingCourses(false)
    }
  }

  const handleCreateCourse = () => {
    setEditingCourse(null)
    setShowCourseEditModal(true)
  }

  const handleEditCourse = (mod: TrainingModule) => {
    setEditingCourse(mod)
    setShowCourseEditModal(true)
  }

  const handleSaveCourse = async (courseToSave: TrainingModule) => {
    if (editingCourse) {
      await trainingApi.updateCourse(editingCourse.key, courseToSave)
    } else {
      await trainingApi.createCourse(courseToSave)
    }
    await loadCourses()
  }

  const handleDeleteCourse = async (mod: TrainingModule) => {
    if (!confirm(`确定要删除课程【${tr(mod.title, i18n.language)}】吗？此操作无法撤销。`)) return
    try {
      await trainingApi.deleteCourse(mod.key)
      await loadCourses()
    } catch (error) {
      console.error('Failed to delete course:', error)
      alert(t('common.error'))
    }
  }

  const handleResetCourses = async () => {
    if (!confirm('确定要恢复为官方最新标准教程体系吗？当前所有自定义修改将被重置。')) return
    try {
      await trainingApi.resetCourses()
      await loadCourses()
      alert('已成功恢复为官方标准中印双语配方与实操教程！')
    } catch (error) {
      console.error('Failed to reset courses:', error)
      alert(t('common.error'))
    }
  }

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
      const [staffResponse, trainingResponse] = await Promise.all([
        staffApi.list({ storeId: user?.storeId, status: 'active' }),
        trainingApi.getAll()
      ])

      const staffData = staffResponse.data?.data?.list || staffResponse.data?.data || []
      setStaffList(staffData)
      await Promise.all([loadCategories(), loadCourses()])

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

  const parseAttachments = (attachmentsStr?: string) => {
    if (!attachmentsStr) return []
    try {
      const parsed = JSON.parse(attachmentsStr)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  const filteredRecords = records.filter(r => {
    if (search) {
      const q = search.toLowerCase()
      const matchName = (r.staffName || '').toLowerCase().includes(q)
      const matchTitle = (r.title || '').toLowerCase().includes(q)
      const matchProvider = (r.provider || '').toLowerCase().includes(q)
      if (!matchName && !matchTitle && !matchProvider) return false
    }
    if (filterStaff && r.staffId !== filterStaff) return false
    if (filterType && r.trainingType !== filterType) return false
    if (filterStatus && r.status !== filterStatus) return false
    return true
  })

  // Category management
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
        alert(t('common.success'))
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

  // Summary statistics
  const totalCount = records.length
  const completedCount = records.filter(r => r.status === 'completed').length
  const inProgressCount = records.filter(r => r.status === 'in_progress').length
  const passedCount = records.filter(r => r.passed).length
  const passRate = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 100

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="text-primary" size={26} />
            {t('staff.trainingTitle', '员工培训与课程管理')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('staff.trainingDescription', '标准化门店 SOP 课程体系与员工培训考核档案')}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadData}
            className="p-2 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
            disabled={isLoading}
            title={t('common.refresh', '刷新')}
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowCategoryModal(true)}
            className="p-2 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
            title={t('training.categoryManagement', '分类设置')}
          >
            <Settings size={18} />
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-sm shadow-sm"
          >
            <Plus size={18} />
            {t('staff.addTraining', '添加培训记录')}
          </button>
        </div>
      </div>

      {/* Overview Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card bg-white p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
            <BookOpen size={24} />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">{t('training.totalRecords', '培训总人次')}</div>
            <div className="text-2xl font-bold text-gray-900 mt-0.5">{totalCount}</div>
          </div>
        </div>

        <div className="card bg-white p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center shrink-0">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">{t('staff.completed', '已完成培训')}</div>
            <div className="text-2xl font-bold text-green-600 mt-0.5">{completedCount}</div>
          </div>
        </div>

        <div className="card bg-white p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
            <Clock size={24} />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">{t('staff.inProgress', '正在进行中')}</div>
            <div className="text-2xl font-bold text-amber-600 mt-0.5">{inProgressCount}</div>
          </div>
        </div>

        <div className="card bg-white p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center shrink-0">
            <Award size={24} />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">{t('training.passRate', '考核通过率')}</div>
            <div className="text-2xl font-bold text-purple-600 mt-0.5">{passRate}%</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('records')}
            className={`pb-3 text-sm font-semibold transition-colors relative flex items-center gap-2 ${
              activeTab === 'records'
                ? 'text-primary'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users size={16} />
            {t('training.recordsTab', '员工培训档案')} ({totalCount})
            {activeTab === 'records' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('courses')}
            className={`pb-3 text-sm font-semibold transition-colors relative flex items-center gap-2 ${
              activeTab === 'courses'
                ? 'text-primary'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <BookOpen size={16} />
            {t('training.coursesTab', 'SOP 课程标准库')} ({TRAINING_MODULES.length})
            {activeTab === 'courses' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('checklists')}
            className={`pb-3 text-sm font-semibold transition-colors relative flex items-center gap-2 ${
              activeTab === 'checklists'
                ? 'text-primary'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <CheckSquare size={16} />
            {t('training.checklistsTab', '开闭店规范标准')} ({CHECKLISTS.length})
            {activeTab === 'checklists' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        </div>
      </div>

      {/* Tab 1: Records Table */}
      {activeTab === 'records' && (
        <div className="space-y-4">
          {/* Filters Card */}
          <div className="card bg-white p-4">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex-1 min-w-[200px] relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('common.search', '搜索员工姓名、课程名称、提供机构...')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input pl-10 py-2 text-sm w-full"
                />
              </div>

              <div className="w-44">
                <select
                  value={filterStaff}
                  onChange={(e) => setFilterStaff(e.target.value)}
                  className="input py-2 text-sm w-full"
                >
                  <option value="">{t('staff.allStaff', '全部员工')}</option>
                  {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="w-40">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="input py-2 text-sm w-full"
                >
                  <option value="">{t('staff.allTypes', '全部培训类型')}</option>
                  {categories.map(cat => <option key={cat.key} value={cat.key}>{getTypeLabel(cat.key)}</option>)}
                </select>
              </div>

              <div className="w-36">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="input py-2 text-sm w-full"
                >
                  <option value="">{t('common.all', '全部状态')}</option>
                  <option value="scheduled">{t('staff.scheduled', '已安排')}</option>
                  <option value="in_progress">{t('staff.inProgress', '进行中')}</option>
                  <option value="completed">{t('staff.completed', '已完成')}</option>
                  <option value="cancelled">{t('staff.cancelled', '已取消')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table Card */}
          <div className="card p-0 overflow-hidden bg-white shadow-sm border border-gray-200">
            {isLoading ? (
              <div className="flex justify-center py-16">
                <RefreshCw size={24} className="animate-spin text-primary" />
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <BookOpen size={40} className="mx-auto mb-3 text-gray-300" />
                <p className="font-medium text-sm">{t('common.noData', '暂无培训记录')}</p>
                <p className="text-xs text-gray-400 mt-1">可点击右上角“添加培训记录”录入员工培训结果</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">{t('staff.name', '员工姓名')}</th>
                      <th className="px-4 py-3.5">{t('staff.type', '培训分类')}</th>
                      <th className="px-4 py-3.5">{t('staff.title', '课程名称')}</th>
                      <th className="px-4 py-3.5">{t('staff.provider', '提供机构')}</th>
                      <th className="px-4 py-3.5">{t('staff.date', '培训时间')}</th>
                      <th className="px-4 py-3.5">{t('staff.duration', '课时')}</th>
                      <th className="px-4 py-3.5">{t('staff.score', '考核成绩')}</th>
                      <th className="px-4 py-3.5">{t('staff.status', '培训状态')}</th>
                      <th className="px-5 py-3.5 text-right">{t('common.actions', '操作')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {filteredRecords.map((record) => {
                      const attachments = parseAttachments(record.attachments)
                      return (
                        <tr key={record.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-gray-900 whitespace-nowrap">
                            {record.staffName || record.staffId}
                          </td>
                          <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">
                            <span className="px-2.5 py-1 rounded-md text-xs bg-gray-100 text-gray-700">
                              {getTypeLabel(record.trainingType)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 font-medium text-gray-800">
                            {record.title}
                            {record.certificate && (
                              <span className="block text-xs text-amber-600 mt-0.5">
                                📜 {record.certificate}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">
                            {record.provider || '-'}
                          </td>
                          <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">
                            {new Date(record.date).toLocaleDateString('zh-CN', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit'
                            })}
                          </td>
                          <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">
                            {record.duration ? `${record.duration}h` : '-'}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {record.score !== null && record.score !== undefined ? (
                              <span className={`font-semibold ${record.passed ? 'text-green-600' : 'text-red-500'}`}>
                                {record.score}分 {record.passed ? '✓' : '✗'}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[record.status] || ''}`}>
                              {t(`staff.${record.status}`, record.status)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {attachments.length > 0 && (
                                <a
                                  href={attachments[0].url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors"
                                  title={attachments[0].name}
                                >
                                  <FileText size={16} />
                                </a>
                              )}
                              <button
                                onClick={() => handleEdit(record)}
                                className="p-1.5 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors"
                                title={t('common.edit', '编辑')}
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => handleDelete(record)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title={t('common.delete', '删除')}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Standard Course Library */}
      {activeTab === 'courses' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border border-blue-200/80 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <BookOpen size={20} />
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span>门店标准化操作指南（SOP）与中印双语配方课程体系</span>
                  <span className="text-[11px] font-semibold text-blue-700 bg-white/80 border border-blue-200 px-2 py-0.5 rounded-full">
                    共 {courses.length} 门核心必修课
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-0.5">
                  所有课程均已打通云端同步，支持随时在线编辑修改配方、章节流程、红线禁令与测验题；员工移动端实时同步最新标准。
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleResetCourses}
                className="px-3.5 py-2 bg-white text-gray-700 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50 flex items-center gap-1.5 shadow-xs transition-colors"
                title="一键恢复为官方最新标准教程体系"
              >
                <RefreshCw size={14} className={loadingCourses ? 'animate-spin' : ''} />
                <span>恢复官方标准</span>
              </button>

              <button
                onClick={handleCreateCourse}
                className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/90 flex items-center gap-1.5 shadow-xs transition-all"
              >
                <Plus size={15} />
                <span>新建培训课程</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {courses.map((mod) => (
              <div
                key={mod.key}
                className="card bg-white hover:shadow-md transition-all border border-gray-200 flex flex-col justify-between overflow-hidden group relative"
              >
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-gradient-to-br ${mod.color} text-white shadow-xs`}>
                      {mod.icon}
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">
                        ⏱️ {mod.minutes} {t('training.minutes', '分钟')}
                      </span>
                      <button
                        onClick={() => handleEditCourse(mod)}
                        className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="编辑此课程"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteCourse(mod)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="删除此课程"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <h3 className="font-bold text-gray-900 text-base mb-1 group-hover:text-primary transition-colors line-clamp-1">
                    {tr(mod.title, i18n.language)}
                  </h3>
                  <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-4 min-h-[2rem]">
                    {tr(mod.subtitle, i18n.language)}
                  </p>
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center gap-3">
                    <span>📖 {mod.sections.length} 个章节</span>
                    <span>✍️ {mod.quiz.length} 道测验题</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditCourse(mod)}
                      className="text-gray-600 hover:text-primary font-medium flex items-center gap-0.5"
                    >
                      <Edit2 size={13} />
                      编辑
                    </button>
                    <button
                      onClick={() => setSelectedCourse(mod)}
                      className="text-primary font-semibold hover:underline flex items-center gap-0.5"
                    >
                      <Eye size={14} />
                      查看大纲
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Checklists */}
      {activeTab === 'checklists' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {CHECKLISTS.map((list) => (
            <div key={list.key} className="card bg-white p-5 border border-gray-200">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                <h3 className="font-bold text-gray-900 text-base">
                  {tr(list.title, i18n.language)}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                  共 {list.items.length} 条检查项
                </span>
              </div>

              <div className="space-y-3">
                {list.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-gray-50/70 rounded-xl text-xs text-gray-800 flex items-start gap-3 border border-gray-100/70"
                  >
                    <span className="w-5 h-5 rounded-full bg-white text-gray-500 border border-gray-200 font-bold flex items-center justify-center shrink-0 text-[10px]">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed mt-0.5">
                      {tr(item, i18n.language)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Course Detail Modal for Admin */}
      {selectedCourse && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scale-up">
            <div className={`p-5 text-white bg-gradient-to-r ${selectedCourse.color} flex items-center justify-between shrink-0`}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{selectedCourse.icon}</span>
                <div>
                  <h3 className="text-lg font-bold">
                    {tr(selectedCourse.title, i18n.language)}
                  </h3>
                  <p className="text-xs text-white/80 mt-0.5">
                    {tr(selectedCourse.subtitle, i18n.language)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCourse(null)}
                className="p-1.5 bg-black/20 hover:bg-black/30 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Sections */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                  课程章节与标准流程（SOP）
                </h4>
                <div className="space-y-4">
                  {selectedCourse.sections.map((sec, sIdx) => (
                    <div key={sIdx} className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                          {sIdx + 1}
                        </span>
                        <h5 className="font-bold text-sm text-gray-900">
                          {tr(sec.title, i18n.language)}
                        </h5>
                      </div>
                      <ul className="space-y-1.5 text-xs text-gray-700 pl-2">
                        {sec.points.map((pt, pIdx) => (
                          <li key={pIdx} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                            <span>{tr(pt, i18n.language)}</span>
                          </li>
                        ))}
                      </ul>

                      {sec.tip && (
                        <div className="bg-amber-50 rounded-lg p-2.5 flex items-start gap-2 text-xs text-amber-800 border border-amber-200/50 mt-2">
                          <Lightbulb size={15} className="text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold mr-1">技巧要点:</span>
                            {tr(sec.tip, i18n.language)}
                          </div>
                        </div>
                      )}

                      {sec.warning && (
                        <div className="bg-red-50 rounded-lg p-2.5 flex items-start gap-2 text-xs text-red-800 border border-red-200/50 mt-2">
                          <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold mr-1">红线禁令:</span>
                            {tr(sec.warning, i18n.language)}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Quiz Questions */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                  考核测验题库与参考答案 ({selectedCourse.quiz.length} 题)
                </h4>
                <div className="space-y-3">
                  {selectedCourse.quiz.map((q, qIdx) => (
                    <div key={qIdx} className="bg-gray-50 rounded-xl p-3.5 border border-gray-100 text-xs">
                      <p className="font-bold text-gray-900 mb-2">
                        {qIdx + 1}. {tr(q.q, i18n.language)}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {q.options.map((opt, oIdx) => (
                          <div
                            key={oIdx}
                            className={`p-2 rounded-lg border ${
                              oIdx === q.answer
                                ? 'bg-green-50 border-green-300 text-green-800 font-bold'
                                : 'bg-white border-gray-200 text-gray-600'
                            }`}
                          >
                            <span className="mr-1.5 font-bold">
                              {String.fromCharCode(65 + oIdx)}.
                            </span>
                            {tr(opt, i18n.language)}
                            {oIdx === q.answer && <span className="ml-1 text-green-600">✓ (正确答案)</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  const courseToEdit = selectedCourse
                  setSelectedCourse(null)
                  handleEditCourse(courseToEdit)
                }}
                className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/90 flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Edit2 size={14} />
                编辑本课程
              </button>
              <button
                type="button"
                onClick={() => setSelectedCourse(null)}
                className="btn-secondary px-5 py-2 text-xs font-semibold"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <TrainingFormModal
          staffList={staffList}
          editData={editingRecord}
          onClose={handleFormClose}
        />
      )}

      {/* Category Management Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="font-bold text-gray-900 text-lg">
                {t('training.categoryManagement', '培训分类管理')}
              </h3>
              <button onClick={() => setShowCategoryModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-3 pr-1">
              {categoryForm.map((cat, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                  <div className="w-24">
                    <span className="text-xs text-gray-400 block mb-0.5">Key</span>
                    <input
                      type="text"
                      value={cat.key}
                      disabled
                      className="input py-1 px-2 text-xs bg-gray-100 w-full"
                    />
                  </div>
                  <div className="flex-1">
                    <span className="text-xs text-gray-400 block mb-0.5">中文标签</span>
                    <input
                      type="text"
                      value={cat.labelZh || ''}
                      onChange={(e) => handleCategoryChange(idx, 'labelZh', e.target.value)}
                      className="input py-1 px-2 text-xs w-full"
                      placeholder="中文名称"
                    />
                  </div>
                  <div className="flex-1">
                    <span className="text-xs text-gray-400 block mb-0.5">英文标签</span>
                    <input
                      type="text"
                      value={cat.label}
                      onChange={(e) => handleCategoryChange(idx, 'label', e.target.value)}
                      className="input py-1 px-2 text-xs w-full"
                      placeholder="English label"
                    />
                  </div>
                  <div className="flex-1">
                    <span className="text-xs text-gray-400 block mb-0.5">印尼文标签</span>
                    <input
                      type="text"
                      value={cat.labelId || ''}
                      onChange={(e) => handleCategoryChange(idx, 'labelId', e.target.value)}
                      className="input py-1 px-2 text-xs w-full"
                      placeholder="Bahasa Indonesia"
                    />
                  </div>
                  <button
                    onClick={() => handleRemoveCategory(idx)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg mt-4"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t mt-4 flex items-center justify-between">
              <button
                onClick={handleAddCategory}
                className="btn-secondary px-3 py-1.5 text-xs font-semibold flex items-center gap-1"
              >
                <Plus size={14} /> 添加新分类
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCategoryModal(false)}
                  className="btn-secondary px-4 py-2 text-xs font-semibold"
                >
                  {t('common.cancel', '取消')}
                </button>
                <button
                  onClick={handleSaveCategories}
                  className="btn-primary px-4 py-2 text-xs font-semibold"
                >
                  {t('common.save', '保存设置')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Course Edit Modal */}
      {showCourseEditModal && (
        <CourseEditModal
          isOpen={showCourseEditModal}
          course={editingCourse}
          onClose={() => setShowCourseEditModal(false)}
          onSave={handleSaveCourse}
        />
      )}
    </div>
  )
}