import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth'
import { expenseApi, reimbursementApi } from '../../services/api'
import { Plus, X, Trash2, Calendar, Tag, Upload, Download, Settings, Edit2, Check, RefreshCw, ArrowLeft } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Expense {
  id: string
  storeId: string
  type: string
  category: string
  amount: number
  description?: string
  date: string
  referenceId?: string
  referenceType?: string
  createdAt: string
}

interface ExpenseSummary {
  rent: number
  utilities: number
  supplies: number
  salary: number
  reimbursement: number
  other: number
}

interface RecurringExpense {
  id: string
  storeId: string
  name: string
  category: string
  amount: number
  frequency: 'daily' | 'weekly' | 'monthly'
  nextDueDate: string
  active: boolean
}

// Reimbursement type
interface Reimbursement {
  id: string
  staffId: string
  type: string
  amount: number
  description: string
  receiptUrls?: string
  status: string
  staff?: {
    id: string
    name: string
    employeeNumber: string
  }
  createdAt: string
}

// ExpenseCategory 类型：支持名称/颜色/是否默认均可编辑
export interface ExpenseCategory {
  key: string
  label: string  // 自定义显示名称（留空则用翻译key）
  color: string   // Tailwind颜色class
  isDefault: boolean
}

const DEFAULT_COLORS = [
  'bg-purple-100 text-purple-700',
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-gray-100 text-gray-700',
  'bg-red-100 text-red-700',
  'bg-yellow-100 text-yellow-700',
  'bg-indigo-100 text-indigo-700',
  'bg-cyan-100 text-cyan-700',
]

const DEFAULT_CATEGORY_DEFS: ExpenseCategory[] = [
  { key: 'rent', label: '', color: 'bg-purple-100 text-purple-700', isDefault: true },
  { key: 'utilities', label: '', color: 'bg-blue-100 text-blue-700', isDefault: true },
  { key: 'supplies', label: '', color: 'bg-green-100 text-green-700', isDefault: true },
  { key: 'salary', label: '', color: 'bg-orange-100 text-orange-700', isDefault: true },
  { key: 'reimbursement', label: '', color: 'bg-pink-100 text-pink-700', isDefault: true },
  { key: 'other', label: '', color: 'bg-gray-100 text-gray-700', isDefault: true },
]

export function ExpenseListPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [summary, setSummary] = useState<ExpenseSummary>({
    rent: 0,
    utilities: 0,
    supplies: 0,
    salary: 0,
    reimbursement: 0,
    other: 0
  })
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const [showRecurringModal, setShowRecurringModal] = useState(false)
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [importProgress, setImportProgress] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)

  // Sub-tab: expenses / reimbursements
  const [expenseSubTab, setExpenseSubTab] = useState<'expenses' | 'reimbursements'>('expenses')

  // Reimbursements state
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([])
  const [_isLoadingReimbursements, setIsLoadingReimbursements] = useState(false)
  const [selectedReimbursement, setSelectedReimbursement] = useState<Reimbursement | null>(null)
  const [reimbActionType, setReimbActionType] = useState<'approve' | 'reject' | 'paid' | null>(null)
  const [reimbRejectReason, setReimbRejectReason] = useState('')

  // Custom expense types
  const [expenseTypes, setExpenseTypes] = useState<ExpenseCategory[]>(DEFAULT_CATEGORY_DEFS)
  const [newTypeName, setNewTypeName] = useState('')

  // Recurring expenses
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([])

  // Filters
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')

  // Form
  const [formData, setFormData] = useState({
    category: 'other',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    type: 'operational'
  })

  // Recurring form
  const [recurringForm, setRecurringForm] = useState({
    name: '',
    category: 'other',
    amount: '',
    frequency: 'monthly' as 'daily' | 'weekly' | 'monthly',
    nextDueDate: new Date().toISOString().split('T')[0]
  })

  useEffect(() => {
    loadData()
    loadReimbursements()
    loadRecurringExpenses()
    loadCustomTypes()
  }, [user, filterCategory, filterStartDate, filterEndDate])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const params: any = {}
      if (filterCategory) params.category = filterCategory
      if (filterStartDate) params.startDate = filterStartDate
      if (filterEndDate) params.endDate = filterEndDate

      const storeId = user?.storeId as string | undefined
      if (storeId) params.storeId = storeId

      const [expensesRes, summaryRes] = await Promise.all([
        expenseApi.list(params),
        expenseApi.summary(30)
      ])

      setExpenses(expensesRes.data?.data?.list || [])
      if (summaryRes.data?.data) {
        const data = summaryRes.data.data
        // Handle both old format (byCategory array) and new format (flat)
        if (data.byCategory) {
          const newSummary: ExpenseSummary = { rent: 0, utilities: 0, supplies: 0, salary: 0, reimbursement: 0, other: 0 }
          data.byCategory.forEach((item: { category: string; amount: number }) => {
            if (item.category in newSummary) {
              newSummary[item.category as keyof ExpenseSummary] = item.amount
            }
          })
          setSummary(newSummary)
        } else {
          setSummary({ rent: data.rent || 0, utilities: data.utilities || 0, supplies: data.supplies || 0, salary: data.salary || 0, reimbursement: data.reimbursement || 0, other: data.other || 0 })
        }
      }
    } catch (error) {
      console.error('Failed to load expenses:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Load reimbursements (pending and approved for action, not paid which are done)
  const loadReimbursements = async () => {
    setIsLoadingReimbursements(true)
    try {
      const params: any = {}
      params.storeId = user?.storeId
      // Load all, filter client-side to show pending + approved (for action)
      const response = await reimbursementApi.list(params)
      const all = response.data?.data || []
      // Filter to show pending and approved (for action), hide paid/cancelled/rejected
      setReimbursements(all.filter((r: any) => r.status === 'pending' || r.status === 'approved'))
    } catch (error) {
      console.error('Failed to load reimbursements:', error)
    } finally {
      setIsLoadingReimbursements(false)
    }
  }

  // Handle approve reimbursement - only updates status, expense created on "mark paid"
  const handleReimbApprove = async (id: string) => {
    try {
      await reimbursementApi.approve(id)
      alert(t('reimbursement.approved'))
      setSelectedReimbursement(null)
      setReimbActionType(null)
      loadReimbursements()
    } catch (error) {
      console.error('Failed to approve:', error)
      alert(t('common.error'))
    }
  }

  // Handle reject reimbursement
  const handleReimbReject = async (id: string) => {
    if (!reimbRejectReason) {
      alert(t('reimbursement.fillRejectReason'))
      return
    }
    try {
      await reimbursementApi.reject(id, reimbRejectReason)
      alert(t('reimbursement.rejected'))
      setSelectedReimbursement(null)
      setReimbActionType(null)
      setReimbRejectReason('')
      loadReimbursements()
    } catch (error) {
      console.error('Failed to reject:', error)
      alert(t('common.error'))
    }
  }

  // Handle mark as paid
  const handleReimbMarkPaid = async (id: string) => {
    try {
      await reimbursementApi.markPaid(id)
      alert(t('reimbursement.markedPaid'))
      setSelectedReimbursement(null)
      setReimbActionType(null)
      loadReimbursements()
    } catch (error) {
      console.error('Failed to mark paid:', error)
      alert(t('common.error'))
    }
  }

  const loadRecurringExpenses = async () => {
    try {
      // Use localStorage for recurring expenses (could be API-backed later)
      const stored = localStorage.getItem(`recurring_expenses_${user?.storeId}`)
      if (stored) {
        setRecurringExpenses(JSON.parse(stored))
      }
    } catch (error) {
      console.error('Failed to load recurring expenses:', error)
    }
  }

  const loadCustomTypes = async () => {
    try {
      const res = await expenseApi.getCategories()
      setExpenseTypes(res.data.data.list || DEFAULT_CATEGORY_DEFS)
    } catch (error) {
      console.error('Failed to load expense categories:', error)
      // Fallback to defaults
      setExpenseTypes(DEFAULT_CATEGORY_DEFS)
    }
  }

  const saveCustomTypes = async (types: ExpenseCategory[]) => {
    try {
      await expenseApi.saveCategories(types)
      setExpenseTypes(types)
    } catch (error) {
      console.error('Failed to save expense categories:', error)
      alert(t('common.error'))
    }
  }

  const saveRecurringExpenses = (items: RecurringExpense[]) => {
    localStorage.setItem(`recurring_expenses_${user?.storeId}`, JSON.stringify(items))
    setRecurringExpenses(items)
  }

  const handleSave = async () => {
    try {
      if (!formData.amount || parseFloat(formData.amount) <= 0) {
        alert(t('common.required'))
        return
      }

      // Validate: prevent future dates
      const today = new Date().toISOString().split('T')[0]
      if (formData.date > today) {
        alert(t('expense.noFutureDate'))
        return
      }

      setIsSaving(true)
      // Parse amount - remove thousand separators before converting to number
      const rawAmount = formData.amount.replace(/,/g, '')
      const data = {
        storeId: user?.storeId,
        type: formData.type,
        category: formData.category,
        amount: Math.round(parseFloat(rawAmount || '0') * 100),
        description: formData.description,
        date: formData.date
      }

      if (selectedExpense) {
        await expenseApi.update(selectedExpense.id, data)
      } else {
        await expenseApi.create(data)
      }

      setShowModal(false)
      resetForm()
      loadData()
    } catch (error) {
      console.error('Failed to save expense:', error)
      alert(t('common.error'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('expense.confirmDelete'))) return
    try {
      await expenseApi.delete(id)
      loadData()
    } catch (error) {
      console.error('Failed to delete expense:', error)
    }
  }

  const handleExport = async () => {
    try {
      const params: any = {}
      if (filterCategory) params.category = filterCategory
      if (filterStartDate) params.startDate = filterStartDate
      if (filterEndDate) params.endDate = filterEndDate

      const response = await expenseApi.export(params)
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `expenses_${new Date().toISOString().split('T')[0]}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export expenses:', error)
      alert(t('common.error'))
    }
  }

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportProgress(t('expense.importing'))
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[]

        const expenses: any[] = []
        for (const row of jsonData) {
          const dateStr = row.Date || row.Tanggal || row.date
          const category = row.Category || row.Kategori || row.category || 'other'
          const amount = row.Amount || row.Jumlah || row.amount
          const description = row.Description || row.Deskripsi || row.description || ''
          const type = row.Type || row.Tipe || row.type || 'operational'

          if (dateStr && amount) {
            expenses.push({
              type,
              category: category.toLowerCase(),
              amount: Math.round(parseFloat(amount) * 100),
              description: String(description),
              date: new Date(dateStr).toISOString()
            })
          }
        }

        if (expenses.length > 0) {
          setImportProgress(t('expense.importingCount', { count: expenses.length }))
          await expenseApi.bulkImport(expenses)
          setImportProgress('')
          loadData()
          alert(t('expense.importSuccess', { count: expenses.length }))
        } else {
          setImportProgress('')
          alert(t('expense.importNoData'))
        }
      } catch (error) {
        console.error('Failed to import:', error)
        setImportProgress('')
        alert(t('expense.importFailed'))
      }
    }
    reader.readAsArrayBuffer(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSaveRecurring = () => {
    if (!recurringForm.name || !recurringForm.amount) {
      alert(t('common.required'))
      return
    }

    // Parse amount - remove thousand separators before converting to number
    const rawAmount = recurringForm.amount.replace(/,/g, '')
    const newItem: RecurringExpense = {
      id: Date.now().toString(),
      storeId: user?.storeId || '',
      name: recurringForm.name,
      category: recurringForm.category,
      amount: Math.round(parseFloat(rawAmount || '0') * 100),
      frequency: recurringForm.frequency,
      nextDueDate: recurringForm.nextDueDate,
      active: true
    }

    const updated = [...recurringExpenses, newItem]
    saveRecurringExpenses(updated)
    setShowRecurringModal(false)
    setRecurringForm({
      name: '',
      category: 'other',
      amount: '',
      frequency: 'monthly',
      nextDueDate: new Date().toISOString().split('T')[0]
    })
  }

  const handleToggleRecurring = (id: string) => {
    const updated = recurringExpenses.map(r =>
      r.id === id ? { ...r, active: !r.active } : r
    )
    saveRecurringExpenses(updated)
  }

  const handleDeleteRecurring = (id: string) => {
    if (!confirm(t('expense.confirmDelete'))) return
    const updated = recurringExpenses.filter(r => r.id !== id)
    saveRecurringExpenses(updated)
  }

  const handleAddType = () => {
    if (!newTypeName.trim()) return
    const key = newTypeName.trim().toLowerCase().replace(/\s+/g, '_')
    if (expenseTypes.find(t => t.key === key)) return // duplicate
    saveCustomTypes([...expenseTypes, {
      key,
      label: newTypeName.trim(),
      color: DEFAULT_COLORS[expenseTypes.length % DEFAULT_COLORS.length],
      isDefault: false
    }])
    setNewTypeName('')
  }

  const handleRemoveType = (key: string) => {
    if (!confirm(t('expense.confirmDelete'))) return
    const updated = expenseTypes.filter(t => t.key !== key)
    saveCustomTypes(updated)
  }

  const resetForm = () => {
    setFormData({
      category: 'other',
      amount: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      type: 'operational'
    })
    setSelectedExpense(null)
  }

  const openAddModal = () => {
    resetForm()
    setShowModal(true)
  }

  const openEditModal = (expense: Expense) => {
    setSelectedExpense(expense)
    // Format amount with thousand separators for display
    const displayAmount = (expense.amount / 100).toLocaleString('id-ID')
    setFormData({
      category: expense.category,
      amount: displayAmount,
      description: expense.description || '',
      date: expense.date.split('T')[0],
      type: expense.type
    })
    setShowModal(true)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount / 100)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  const getTotalSummary = () => {
    return Object.values(summary).reduce((sum, val) => sum + val, 0)
  }

  // Helper: get category display label (custom label or translated default)
  const getCategoryLabel = (key: string) => {
    const cat = expenseTypes.find(c => c.key === key)
    if (cat?.label) return cat.label
    // fallback to translation key
    const keyMap: Record<string, string> = {
      rent: 'expense.categoryRent',
      utilities: 'expense.categoryUtilities',
      supplies: 'expense.categorySupplies',
      salary: 'expense.categorySalary',
      reimbursement: 'expense.categoryReimbursement',
      other: 'expense.categoryOther'
    }
    return keyMap[key] ? t(keyMap[key]) : key
  }

  // Helper: get category color
  const getCategoryColor = (key: string) => {
    return expenseTypes.find(c => c.key === key)?.color || 'bg-gray-100 text-gray-700'
  }

  // Helper: get category icon background class (strip text class for bg-only use)
  const getCategoryBg = (key: string) => {
    const color = getCategoryColor(key)
    return color.split(' ')[0]
  }

  // Reimbursement helpers
  const getReimbTypeLabel = (type: string) => {
    switch (type) {
      case 'transportation': return t('reimbursement.typeTransportation')
      case 'meals': return t('reimbursement.typeMeals')
      case 'communication': return t('reimbursement.typeCommunication')
      case 'medical': return t('reimbursement.typeMedical')
      case 'other': return t('reimbursement.typeOther')
      default: return type
    }
  }

  const getReimbActionTitle = () => {
    switch (reimbActionType) {
      case 'approve': return t('reimbursement.approveTitle')
      case 'reject': return t('reimbursement.rejectTitle')
      case 'paid': return t('reimbursement.markPaidTitle')
      default: return ''
    }
  }

  const getReimbActionLabel = () => {
    switch (reimbActionType) {
      case 'approve': return t('reimbursement.approve')
      case 'reject': return t('reimbursement.reject')
      case 'paid': return t('reimbursement.markPaid')
      default: return ''
    }
  }

  const formatReimbCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount / 100)
  }

  const formatReimbDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  const pendingReimbCount = reimbursements.filter(r => r.status === 'pending').length

  const categories = expenseTypes

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/finance" className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-lg font-bold text-gray-900">{t('expense.title')}</h1>
          </div>

          {/* Sub-tabs: Expenses / Reimbursements */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setExpenseSubTab('expenses')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                expenseSubTab === 'expenses' ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('expense.expenses')}
            </button>
            <button
              onClick={() => setExpenseSubTab('reimbursements')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                expenseSubTab === 'reimbursements' ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('reimbursement.title')}
              {pendingReimbCount > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingReimbCount}</span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTypeModal(true)}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              title={t('expense.manageTypes')}
            >
              <Settings size={20} />
            </button>
            <button
              onClick={() => setShowRecurringModal(true)}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              title={t('expense.recurring')}
            >
              <RefreshCw size={20} />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImport}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-1 text-sm"
            >
              <Upload size={18} />
              {t('expense.import')}
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-1 text-sm"
            >
              <Download size={18} />
              {t('common.export')}
            </button>
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover text-sm font-medium flex items-center gap-1"
            >
              <Plus size={18} />
              {t('expense.addExpense')}
            </button>
          </div>
        </div>
        {importProgress && (
          <div className="mt-2 text-sm text-blue-600">{importProgress}</div>
        )}
      </header>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-gray-400" />
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="p-2 border border-gray-200 rounded-lg text-sm"
              placeholder={t('expense.filterByDate')}
            />
            <span className="text-gray-400">-</span>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="p-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="p-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">{t('expense.filterByCategory')}</option>
            {expenseTypes.map((cat) => (
              <option key={cat.key} value={cat.key}>{getCategoryLabel(cat.key)}</option>
            ))}
          </select>

          {(filterStartDate || filterEndDate || filterCategory) && (
            <button
              onClick={() => {
                setFilterStartDate('')
                setFilterEndDate('')
                setFilterCategory('')
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {t('common.all')}
            </button>
          )}
        </div>
      </div>

      {/* Recurring Expenses Banner */}
      {recurringExpenses.length > 0 && (
        <div className="bg-blue-50 border-b border-blue-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw size={16} className="text-blue-600" />
              <span className="text-sm text-blue-700">
                {recurringExpenses.filter(r => r.active).length} {t('expense.recurringActive')}
              </span>
            </div>
            <button
              onClick={() => setShowRecurringModal(true)}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              {t('common.view')}
            </button>
          </div>
        </div>
      )}

      {/* Expenses Tab Content */}
      {expenseSubTab === 'expenses' && (
        <>
          {/* Summary Cards */}
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {categories.map((cat) => (
                <div key={cat.key} className="bg-white rounded-xl shadow-sm p-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${getCategoryBg(cat.key)}`}>
                    <Tag size={18} className={getCategoryColor(cat.key)} />
                  </div>
                  <p className="text-xs text-gray-500">{getCategoryLabel(cat.key)}</p>
                  <p className="font-bold text-gray-900">{formatCurrency(summary[cat.key as keyof ExpenseSummary] || 0)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="px-4">
            <div className="mt-4 bg-primary/10 rounded-xl p-4">
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-700">{t('expense.totalAmount')}</span>
                <span className="text-2xl font-bold text-primary">{formatCurrency(getTotalSummary())}</span>
              </div>
            </div>
          </div>

          {/* Expense List */}
          <div className="p-4 space-y-3">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl">
                <p className="text-gray-500">{t('expense.noExpenses')}</p>
                <button
                  onClick={openAddModal}
                  className="mt-2 text-primary hover:text-primary-hover flex items-center gap-1 mx-auto"
                >
                  <Plus size={16} />
                  {t('expense.addFirst')}
                </button>
              </div>
            ) : (
              expenses.map((expense) => {
                const catColor = getCategoryColor(expense.category)
                const catLabel = getCategoryLabel(expense.category)

                return (
                  <div
                    key={expense.id}
                    className="bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => openEditModal(expense)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${catColor}`}>
                            {catLabel}
                          </span>
                          <span className="text-xs text-gray-400">{formatDate(expense.date)}</span>
                        </div>
                        {expense.description && (
                          <p className="text-sm text-gray-600 mt-1">{expense.description}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg text-gray-900">{formatCurrency(expense.amount)}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              openEditModal(expense)
                            }}
                            className="text-blue-500 hover:bg-blue-50 p-1 rounded"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(expense.id)
                            }}
                            className="text-red-500 hover:bg-red-50 p-1 rounded"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}

      {/* Reimbursements Tab Content */}
      {expenseSubTab === 'reimbursements' && (
        <div className="p-4 space-y-4">
          {reimbursements.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl">
              <p className="text-gray-500">{t('reimbursement.noRequests')}</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b bg-gray-50">
                    <th className="p-4 font-medium">{t('reimbursement.staff')}</th>
                    <th className="p-4 font-medium">{t('reimbursement.type')}</th>
                    <th className="p-4 font-medium">{t('reimbursement.amount')}</th>
                    <th className="p-4 font-medium">{t('reimbursement.description')}</th>
                    <th className="p-4 font-medium">{t('reimbursement.status')}</th>
                    <th className="p-4 font-medium">{t('reimbursement.date')}</th>
                    <th className="p-4 font-medium">{t('reimbursement.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {reimbursements.map((reimb) => (
                    <tr key={reimb.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="p-4">
                        <p className="font-medium">{reimb.staff?.name || '-'}</p>
                        <p className="text-xs text-gray-400">{reimb.staff?.employeeNumber}</p>
                      </td>
                      <td className="p-4 text-sm">{getReimbTypeLabel(reimb.type)}</td>
                      <td className="p-4 font-bold">{formatReimbCurrency(reimb.amount)}</td>
                      <td className="p-4 text-sm max-w-xs truncate">{reimb.description}</td>
                      <td className="p-4">
                        <span className={`badge ${
                          reimb.status === 'pending' ? 'badge-warning' :
                          reimb.status === 'approved' ? 'badge-success' :
                          reimb.status === 'paid' ? 'badge-info' : 'badge-error'
                        }`}>{reimb.status}</span>
                      </td>
                      <td className="p-4 text-sm">{formatReimbDate(reimb.createdAt)}</td>
                      <td className="p-4">
                        {reimb.status === 'pending' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setSelectedReimbursement(reimb); setReimbActionType('approve') }}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                              title={t('reimbursement.approve')}
                            >
                              <Check size={18} />
                            </button>
                            <button
                              onClick={() => { setSelectedReimbursement(reimb); setReimbActionType('reject') }}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                              title={t('reimbursement.reject')}
                            >
                              <X size={18} />
                            </button>
                          </div>
                        )}
                        {reimb.status === 'approved' && (
                          <button
                            onClick={() => { setSelectedReimbursement(reimb); setReimbActionType('paid') }}
                            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            {t('reimbursement.markPaid')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-xl p-6 mx-4 pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">
                {selectedExpense ? t('expense.editExpense') : t('expense.addExpense')}
              </h2>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('expense.type')}
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                >
                  <option value="operational">{t('expense.typeOperational')}</option>
                  <option value="asset">{t('expense.typeAsset')}</option>
                  <option value="asset_disposal">{t('expense.typeDisposal')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('expense.category')}
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                >
                  {categories.map((cat) => (
                    <option key={cat.key} value={cat.key}>{getCategoryLabel(cat.key)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('expense.amount')}
                </label>
                <input
                  type="text"
                  value={formData.amount}
                  onChange={(e) => {
                    // Remove non-numeric characters except dots and commas
                    const raw = e.target.value.replace(/[^\d]/g, '')
                    if (raw === '') {
                      setFormData({ ...formData, amount: '' })
                      return
                    }
                    // Format with thousand separators
                    const num = parseInt(raw, 10)
                    const formatted = num.toLocaleString('id-ID')
                    setFormData({ ...formData, amount: formatted })
                  }}
                  onBlur={(e) => {
                    // Ensure we store raw number on blur
                    const raw = e.target.value.replace(/[^\d]/g, '')
                    if (raw) {
                      setFormData({ ...formData, amount: raw })
                    }
                  }}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('expense.date')}
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('expense.description')}
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  rows={3}
                  placeholder={t('expense.description')}
                />
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="flex-1 py-3 border border-gray-200 rounded-xl"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 py-3 bg-primary text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recurring Expenses Modal */}
      {showRecurringModal && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-lg rounded-xl p-6 mx-4 max-h-[80vh] overflow-y-auto pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">{t('expense.recurring')}</h2>
              <button
                onClick={() => setShowRecurringModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* Add New */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <h3 className="font-medium mb-3">{t('expense.addRecurring')}</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={recurringForm.name}
                  onChange={(e) => setRecurringForm({ ...recurringForm, name: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder={t('expense.recurringName')}
                />
                <select
                  value={recurringForm.category}
                  onChange={(e) => setRecurringForm({ ...recurringForm, category: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                >
                  {categories.map((cat) => (
                    <option key={cat.key} value={cat.key}>{getCategoryLabel(cat.key)}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={recurringForm.amount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g, '')
                    if (raw === '') {
                      setRecurringForm({ ...recurringForm, amount: '' })
                      return
                    }
                    const num = parseInt(raw, 10)
                    const formatted = num.toLocaleString('id-ID')
                    setRecurringForm({ ...recurringForm, amount: formatted })
                  }}
                  onBlur={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g, '')
                    if (raw) {
                      setRecurringForm({ ...recurringForm, amount: raw })
                    }
                  }}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder={t('expense.amount')}
                />
                <select
                  value={recurringForm.frequency}
                  onChange={(e) => setRecurringForm({ ...recurringForm, frequency: e.target.value as any })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                >
                  <option value="daily">{t('expense.frequencyDaily')}</option>
                  <option value="weekly">{t('expense.frequencyWeekly')}</option>
                  <option value="monthly">{t('expense.frequencyMonthly')}</option>
                </select>
                <input
                  type="date"
                  value={recurringForm.nextDueDate}
                  onChange={(e) => setRecurringForm({ ...recurringForm, nextDueDate: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                />
                <button
                  onClick={handleSaveRecurring}
                  className="w-full py-3 bg-primary text-white rounded-xl font-medium"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>

            {/* List */}
            <div className="space-y-2">
              {recurringExpenses.length === 0 ? (
                <p className="text-center text-gray-500 py-4">{t('expense.noRecurring')}</p>
              ) : (
                recurringExpenses.map((item) => (
                  <div key={item.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggleRecurring(item.id)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${item.active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}
                      >
                        <Check size={20} />
                      </button>
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-gray-500">
                          {formatCurrency(item.amount)} • {t(`expense.frequency${item.frequency.charAt(0).toUpperCase() + item.frequency.slice(1)}`)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteRecurring(item.id)}
                      className="text-red-500 hover:bg-red-50 p-2 rounded-lg"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expense Type Management Modal */}
      {showTypeModal && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-xl p-6 mx-4 pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">{t('expense.manageTypes')}</h2>
              <button
                onClick={() => setShowTypeModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* Add New Type */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                className="flex-1 p-3 border border-gray-200 rounded-xl"
                placeholder={t('expense.newTypePlaceholder')}
              />
              <button
                onClick={handleAddType}
                className="px-4 py-3 bg-primary text-white rounded-xl"
              >
                <Plus size={20} />
              </button>
            </div>

            {/* Type List */}
            <div className="space-y-2">
              {expenseTypes.map((type) => (
                <div key={type.key} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <span className="font-medium">{type.label || t(`expense.category${type.key.charAt(0).toUpperCase() + type.key.slice(1)}`) || type.key}</span>
                  {!type.isDefault && (
                    <button
                      onClick={() => handleRemoveType(type.key)}
                      className="text-red-500 hover:bg-red-50 p-1 rounded"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Reimbursement Action Modal */}
      {selectedReimbursement && reimbActionType && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 mx-4 pointer-events-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">{getReimbActionTitle()}</h2>

            <div className="mb-4 p-4 bg-gray-50 rounded-xl">
              <p className="font-medium">{selectedReimbursement.staff?.name}</p>
              <p className="text-sm text-gray-500">
                {getReimbTypeLabel(selectedReimbursement.type)} - {formatReimbCurrency(selectedReimbursement.amount)}
              </p>
              <p className="text-sm text-gray-500">{selectedReimbursement.description}</p>
            </div>

            {reimbActionType === 'reject' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('reimbursement.rejectReason')}
                </label>
                <textarea
                  value={reimbRejectReason}
                  onChange={(e) => setReimbRejectReason(e.target.value)}
                  rows={3}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder={t('reimbursement.rejectReasonPlaceholder')}
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedReimbursement(null)
                  setReimbActionType(null)
                  setReimbRejectReason('')
                }}
                className="flex-1 py-3 border border-gray-200 rounded-xl"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  if (reimbActionType === 'approve') handleReimbApprove(selectedReimbursement.id)
                  else if (reimbActionType === 'reject') handleReimbReject(selectedReimbursement.id)
                  else handleReimbMarkPaid(selectedReimbursement.id)
                }}
                className={`flex-1 py-3 rounded-xl text-white ${
                  reimbActionType === 'approve' ? 'bg-green-600 hover:bg-green-700'
                    : reimbActionType === 'reject' ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {getReimbActionLabel()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}