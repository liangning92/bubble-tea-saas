import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { budgetApi } from '../../services/api'
import { formatCurrency } from '../../utils/helpers'
import {
  Plus, Edit2, Trash2, RefreshCw, AlertCircle,
  X, TrendingUp, TrendingDown, Target, PieChart, Settings
} from 'lucide-react'

interface Budget {
  id: string
  storeId: string
  category: string
  period: string
  amount: number
  year: number
  month?: number
  createdAt: string
}

interface BudgetSummary {
  category: string
  budget: number
  actual: number
  variance: number
  variancePercent: number
}

interface BudgetCategory {
  key: string
  label: string
  labelZh: string
  labelEn: string
  color: string
  bgColor: string
}

const DEFAULT_CATEGORIES: BudgetCategory[] = [
  { key: 'rent', label: 'Sewa', labelZh: '租金', labelEn: 'Rent', color: 'text-purple-600', bgColor: 'bg-purple-100' },
  { key: 'utilities', label: 'Utilitas', labelZh: '水电费', labelEn: 'Utilities', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  { key: 'staff', label: 'Gaji Staff', labelZh: '员工工资', labelEn: 'Staff Salary', color: 'text-green-600', bgColor: 'bg-green-100' },
  { key: 'marketing', label: 'Pemasaran', labelZh: '营销', labelEn: 'Marketing', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  { key: 'supplies', label: 'Perlengkapan', labelZh: '用品', labelEn: 'Supplies', color: 'text-pink-600', bgColor: 'bg-pink-100' },
  { key: 'other', label: 'Lainnya', labelZh: '其他', labelEn: 'Other', color: 'text-gray-600', bgColor: 'bg-gray-100' }
]

export function BudgetPage() {
  const { t, i18n } = useTranslation()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>(DEFAULT_CATEGORIES)
  const [summary, setSummary] = useState<{ year: number; month?: number; summary: BudgetSummary[]; totalBudget: number; totalActual: number } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(undefined)

  const [formData, setFormData] = useState<{
    category: string
    period: string
    amount: number
    year: number
    month?: number
  }>({
    category: 'other',
    period: 'monthly',
    amount: 0,
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1
  })

  // Get localized label
  const getCategoryLabel = (cat: BudgetCategory) => {
    if (i18n.language === 'zh') return cat.labelZh || cat.label
    if (i18n.language === 'en') return cat.labelEn || cat.label
    return cat.label
  }

  // Load categories from API
  const loadCategories = async () => {
    try {
      const res = await budgetApi.getCategories()
      setCategories(res.data.data.list || DEFAULT_CATEGORIES)
    } catch (error) {
      console.error('Failed to load categories:', error)
    }
  }

  // Save categories to API
  const saveCategories = async (cats: BudgetCategory[]) => {
    try {
      await budgetApi.saveCategories(cats)
      setCategories(cats)
      setShowCategoryModal(false)
    } catch (error) {
      console.error('Failed to save categories:', error)
      alert(t('common.error'))
    }
  }

  // Get category config by key
  const getCategoryConfig = (key: string): BudgetCategory => {
    return categories.find(c => c.key === key) || { key, label: key, labelZh: key, labelEn: key, color: 'text-gray-600', bgColor: 'bg-gray-100' }
  }

  useEffect(() => {
    loadCategories()
  }, [])

  const fetchBudgets = async () => {
    try {
      setIsLoading(true)
      const params: any = { year: selectedYear }
      if (selectedMonth) params.month = selectedMonth
      const res = await budgetApi.list(params)
      setBudgets(res.data.data.list || [])
    } catch (error) {
      console.error('Failed to fetch budgets:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchSummary = async () => {
    try {
      const params: any = { year: selectedYear }
      if (selectedMonth) params.month = selectedMonth
      const res = await budgetApi.summary(selectedYear, selectedMonth)
      setSummary(res.data.data)
    } catch (error) {
      console.error('Failed to fetch budget summary:', error)
    }
  }

  useEffect(() => {
    fetchBudgets()
    fetchSummary()
  }, [selectedYear, selectedMonth])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingBudget) {
        await budgetApi.update(editingBudget.id, formData)
      } else {
        await budgetApi.create(formData)
      }
      setShowForm(false)
      setEditingBudget(null)
      resetForm()
      fetchBudgets()
      fetchSummary()
    } catch (error) {
      console.error('Failed to save budget:', error)
      alert(t('common.error'))
    }
  }

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget)
    setFormData({
      category: budget.category,
      period: budget.period,
      amount: budget.amount,
      year: budget.year,
      month: budget.month || new Date().getMonth() + 1
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('finance.confirmDelete'))) return
    try {
      await budgetApi.delete(id)
      fetchBudgets()
      fetchSummary()
    } catch (error) {
      console.error('Failed to delete budget:', error)
      alert(t('common.error'))
    }
  }

  const resetForm = () => {
    setFormData({
      category: 'other',
      period: 'monthly',
      amount: 0,
      year: selectedYear,
      month: new Date().getMonth() + 1
    })
  }

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)
  const months = [
    { value: 1, label: 'Januari' }, { value: 2, label: 'Februari' },
    { value: 3, label: 'Maret' }, { value: 4, label: 'April' },
    { value: 5, label: 'Mei' }, { value: 6, label: 'Juni' },
    { value: 7, label: 'Juli' }, { value: 8, label: 'Agustus' },
    { value: 9, label: 'September' }, { value: 10, label: 'Oktober' },
    { value: 11, label: 'November' }, { value: 12, label: 'Desember' },
  ]

  const formatVariance = (variance: number, percent: number) => {
    const isOver = variance > 0
    return (
      <div className={`text-right ${isOver ? 'text-red-600' : 'text-green-600'}`}>
        <div className="font-medium">{formatCurrency(Math.abs(variance))}</div>
        <div className="text-xs">
          {isOver ? '+' : ''}{percent.toFixed(1)}%
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('finance.budget')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('finance.budgetDesc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCategoryModal(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Settings size={18} />
            {t('finance.manageCategories')}
          </button>
          <button
            onClick={() => { resetForm(); setEditingBudget(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={18} />
            {t('finance.addBudget')}
          </button>
        </div>
      </div>

      {/* Year/Month Filter */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">{t('finance.selectYear')}:</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">{t('finance.selectMonth')}:</label>
            <select
              value={selectedMonth || ''}
              onChange={(e) => setSelectedMonth(e.target.value ? parseInt(e.target.value) : undefined)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Semua Bulan</option>
              {months.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => { fetchBudgets(); fetchSummary() }}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target size={20} className="text-primary" />
              <span className="text-sm text-gray-500">{t('finance.totalBudget')}</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(summary.totalBudget)}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <PieChart size={20} className="text-blue-600" />
              <span className="text-sm text-gray-500">{t('finance.actual')}</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(summary.totalActual)}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              {summary.totalActual <= summary.totalBudget ? (
                <TrendingDown size={20} className="text-green-600" />
              ) : (
                <TrendingUp size={20} className="text-red-600" />
              )}
              <span className="text-sm text-gray-500">{t('finance.variance')}</span>
            </div>
            <div className={`text-2xl font-bold ${summary.totalActual <= summary.totalBudget ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(Math.abs(summary.totalBudget - summary.totalActual))}
            </div>
          </div>
        </div>
      )}

      {/* Budget Table */}
      <div className="bg-white rounded-lg shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <RefreshCw className="animate-spin text-gray-400" size={24} />
          </div>
        ) : budgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500">
            <AlertCircle size={48} className="mb-3 text-gray-300" />
            <p>{t('finance.noBudgets')}</p>
            <button
              onClick={() => { resetForm(); setEditingBudget(null); setShowForm(true) }}
              className="mt-4 px-4 py-2 text-sm text-primary hover:bg-primary/5 rounded-lg"
            >
              {t('finance.addBudget')}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t('finance.budget')}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t('finance.period')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">{t('finance.totalBudget')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">{t('finance.actual')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">{t('finance.variance')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {budgets.map(budget => {
                  const catConfig = getCategoryConfig(budget.category)
                  const summaryItem = summary?.summary.find(s => s.category === budget.category)
                  return (
                    <tr key={budget.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 ${catConfig.bgColor} rounded-lg flex items-center justify-center`}>
                            <span className={`text-sm font-medium ${catConfig.color}`}>
                              {budget.category.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-900">{getCategoryLabel(catConfig)}</span>
                            <div className="text-xs text-gray-500">{budget.category}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">
                          {budget.period === 'monthly' ? 'Bulanan' :
                           budget.period === 'quarterly' ? 'Triwulanan' : 'Tahunan'}
                        </span>
                        <div className="text-xs text-gray-500">
                          {budget.year} {budget.month ? `- ${budget.month}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-medium text-gray-900">{formatCurrency(budget.amount)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-medium text-gray-600">
                          {formatCurrency(summaryItem?.actual || 0)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {summaryItem ? formatVariance(summaryItem.variance, summaryItem.variancePercent) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(budget)}
                            className="p-2 text-gray-400 hover:text-primary rounded-lg hover:bg-gray-100"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(budget.id)}
                            className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
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

      {/* Budget Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {editingBudget ? t('finance.editBudget') : t('finance.addBudget')}
              </h3>
              <button onClick={() => { setShowForm(false); setEditingBudget(null) }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kategori *
                </label>
                <select
                  value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                >
                  {categories.map(cat => (
                    <option key={cat.key} value={cat.key}>{getCategoryLabel(cat)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('finance.period')} *
                </label>
                <select
                  value={formData.period}
                  onChange={e => setFormData({ ...formData, period: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                >
                  <option value="monthly">Bulanan</option>
                  <option value="quarterly">Triwulanan</option>
                  <option value="yearly">Tahunan</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('finance.selectYear')} *
                  </label>
                  <select
                    value={formData.year}
                    onChange={e => setFormData({ ...formData, year: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    required
                  >
                    {years.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('finance.selectMonth')}
                  </label>
                  <select
                    value={formData.month?.toString() ?? ''}
                    onChange={(e) => {
                      const val = e.target.value
                      setFormData(prev => ({ ...prev, month: val ? parseInt(val) : undefined }))
                    }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">-</option>
                    {months.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('finance.totalBudget')} (Rp) *
                </label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={e => setFormData({ ...formData, amount: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  min={0}
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingBudget(null); resetForm() }}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                >
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {showCategoryModal && (
        <BudgetCategoryModal
          categories={categories}
          onSave={saveCategories}
          onClose={() => setShowCategoryModal(false)}
          t={t}
        />
      )}
    </div>
  )
}

// Budget Category Modal Component
function BudgetCategoryModal({
  categories,
  onSave,
  onClose,
  t
}: {
  categories: BudgetCategory[]
  onSave: (cats: BudgetCategory[]) => void
  onClose: () => void
  t: any
}) {
  const [cats, setCats] = useState(categories)
  const [newCat, setNewCat] = useState({ key: '', label: '', labelZh: '', labelEn: '', color: 'text-gray-600', bgColor: 'bg-gray-100' })

  const COLORS = [
    { color: 'text-purple-600', bgColor: 'bg-purple-100' },
    { color: 'text-blue-600', bgColor: 'bg-blue-100' },
    { color: 'text-green-600', bgColor: 'bg-green-100' },
    { color: 'text-orange-600', bgColor: 'bg-orange-100' },
    { color: 'text-pink-600', bgColor: 'bg-pink-100' },
    { color: 'text-gray-600', bgColor: 'bg-gray-100' },
  ]

  const handleAdd = () => {
    if (!newCat.key || !newCat.label) return
    setCats([...cats, { ...newCat, key: newCat.key.toLowerCase().replace(/\s+/g, '_') }])
    setNewCat({ key: '', label: '', labelZh: '', labelEn: '', color: 'text-gray-600', bgColor: 'bg-gray-100' })
  }

  const handleRemove = (key: string) => {
    setCats(cats.filter(c => c.key !== key))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t('finance.manageCategories')}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">{t('finance.currentTypes')}</h4>
            {cats.map(cat => (
              <div key={cat.key} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 ${cat.bgColor} rounded`} />
                  <span className="font-medium">{cat.label}</span>
                </div>
                <button onClick={() => handleRemove(cat.key)} className="text-gray-400 hover:text-red-600">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">{t('finance.addNewType')}</h4>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input placeholder="Key (e.g. rent)" value={newCat.key} onChange={e => setNewCat({...newCat, key: e.target.value})} className="px-3 py-2 border rounded text-sm" />
              <input placeholder="Label (e.g. Sewa)" value={newCat.label} onChange={e => setNewCat({...newCat, label: e.target.value})} className="px-3 py-2 border rounded text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input placeholder="中文" value={newCat.labelZh} onChange={e => setNewCat({...newCat, labelZh: e.target.value})} className="px-3 py-2 border rounded text-sm" />
              <input placeholder="English" value={newCat.labelEn} onChange={e => setNewCat({...newCat, labelEn: e.target.value})} className="px-3 py-2 border rounded text-sm" />
            </div>
            <select value={`${newCat.color}|${newCat.bgColor}`} onChange={e => { const [color, bgColor] = e.target.value.split('|'); setNewCat({...newCat, color, bgColor}) }} className="w-full px-3 py-2 border rounded text-sm mb-2">
              {COLORS.map((c, i) => <option key={i} value={`${c.color}|${c.bgColor}`}>{c.color.replace('text-', '')}</option>)}
            </select>
            <button onClick={handleAdd} className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">
              <Plus size={16} /> {t('finance.addNewType')}
            </button>
          </div>
        </div>
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-100">{t('common.cancel')}</button>
          <button onClick={() => onSave(cats)} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">{t('common.save')}</button>
        </div>
      </div>
    </div>
  )
}