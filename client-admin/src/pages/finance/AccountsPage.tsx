import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { accountApi } from '../../services/api'
import { formatCurrency, formatDate } from '../../utils/helpers'
import {
  Plus, Edit2, Trash2, RefreshCw, AlertCircle, ArrowRightLeft,
  Settings, X, Search, Check, FileText,
  Wallet, Building2, CreditCard, TrendingUp, Package, TrendingDown
} from 'lucide-react'

interface FinanceAccount {
  id: string
  storeId: string
  code: string
  name: string
  type: string
  balance: number
  parentCode?: string
  sortOrder: number
  createdAt: string
}

interface Transfer {
  id: string
  fromAccountId: string
  toAccountId: string
  fromAccount?: FinanceAccount
  toAccount?: FinanceAccount
  amount: number
  note?: string
  date: string
  createdAt: string
}

interface AccountType {
  key: string
  label: string
  labelZh: string
  labelEn: string
  icon: string
  color: string
  bgColor: string
}

type ViewTab = 'accounts' | 'transfers'

// Icon mapping
const ICON_MAP: Record<string, any> = {
  Wallet,
  Building2,
  CreditCard,
  FileText,
  TrendingUp,
  Package,
  TrendingDown
}

export function AccountsPage() {
  const { t, i18n } = useTranslation()
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [viewTab, setViewTab] = useState<ViewTab>('accounts')
  const [showForm, setShowForm] = useState(false)
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [editingAccount, setEditingAccount] = useState<FinanceAccount | null>(null)
  const [filterType, setFilterType] = useState<string>('')
  const [searchKeyword, setSearchKeyword] = useState('')

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'expense',
    parentCode: '',
    sortOrder: 0
  })

  const [transferData, setTransferData] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: 0,
    note: '',
    date: new Date().toISOString().slice(0, 10)
  })

  // Get localized label for account type
  const getTypeLabel = (type: AccountType) => {
    if (i18n.language === 'zh') return type.labelZh || type.label
    if (i18n.language === 'en') return type.labelEn || type.label
    return type.label
  }

  // Get type config by key
  const getTypeConfig = (typeKey: string) => {
    const type = accountTypes.find(t => t.key === typeKey)
    if (!type) return { label: typeKey, icon: FileText, color: 'text-gray-600', bgColor: 'bg-gray-100' }
    const Icon = ICON_MAP[type.icon] || FileText
    return { label: getTypeLabel(type), icon: Icon, color: type.color, bgColor: type.bgColor }
  }

  const loadAccountTypes = async () => {
    try {
      const res = await accountApi.getTypes()
      setAccountTypes(res.data.data.list || [])
    } catch (error) {
      console.error('Failed to load account types:', error)
    }
  }

  const saveAccountTypes = async (types: AccountType[]) => {
    try {
      await accountApi.saveTypes(types)
      setAccountTypes(types)
      setShowTypeModal(false)
    } catch (error) {
      console.error('Failed to save account types:', error)
      alert(t('common.error'))
    }
  }

  const fetchAccounts = async () => {
    try {
      setIsLoading(true)
      const params: any = {}
      if (filterType) params.type = filterType
      const res = await accountApi.list(params)
      setAccounts(res.data.data.list || [])
    } catch (error) {
      console.error('Failed to fetch accounts:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchTransfers = async () => {
    try {
      setIsLoading(true)
      const res = await accountApi.transfers()
      setTransfers(res.data.data.list || [])
    } catch (error) {
      console.error('Failed to fetch transfers:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadAccountTypes()
  }, [])

  useEffect(() => {
    if (viewTab === 'accounts') {
      fetchAccounts()
    } else {
      fetchTransfers()
    }
  }, [viewTab, filterType])

  const handleSeedDefaults = async () => {
    if (!confirm(t('finance.seedConfirmMessage'))) return
    try {
      await accountApi.seed()
      fetchAccounts()
      alert(t('common.success'))
    } catch (error) {
      console.error('Failed to seed accounts:', error)
      alert(t('common.error'))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingAccount) {
        await accountApi.update(editingAccount.id, formData)
      } else {
        await accountApi.create(formData)
      }
      setShowForm(false)
      setEditingAccount(null)
      resetForm()
      fetchAccounts()
    } catch (error) {
      console.error('Failed to save account:', error)
      alert(t('common.error'))
    }
  }

  const handleEdit = (account: FinanceAccount) => {
    setEditingAccount(account)
    setFormData({
      code: account.code,
      name: account.name,
      type: account.type,
      parentCode: account.parentCode || '',
      sortOrder: account.sortOrder
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    const account = accounts.find(a => a.id === id)
    if (!account) return
    if (!confirm(t('finance.confirmDelete') + `?\n${account.name}`)) return
    try {
      await accountApi.delete(id)
      fetchAccounts()
    } catch (error) {
      console.error('Failed to delete account:', error)
      alert(t('common.error'))
    }
  }

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await accountApi.transfer(transferData)
      setShowTransferForm(false)
      resetTransferForm()
      fetchAccounts()
      fetchTransfers()
      alert(t('common.success'))
    } catch (error: any) {
      console.error('Failed to transfer:', error)
      alert(error.response?.data?.message || t('common.error'))
    }
  }

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      type: 'expense',
      parentCode: '',
      sortOrder: 0
    })
  }

  const resetTransferForm = () => {
    setTransferData({
      fromAccountId: '',
      toAccountId: '',
      amount: 0,
      note: '',
      date: new Date().toISOString().slice(0, 10)
    })
  }

  // Filter accounts
  const filteredAccounts = accounts.filter(account => {
    const matchesType = !filterType || account.type === filterType
    const matchesSearch = !searchKeyword ||
      account.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      account.code.toLowerCase().includes(searchKeyword.toLowerCase())
    return matchesType && matchesSearch
  })

  // Calculate totals by type
  const totalsByType = accounts.reduce((totals, account) => {
    const type = account.type || 'other'
    totals[type] = (totals[type] || 0) + account.balance
    return totals
  }, {} as Record<string, number>)

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('finance.chartOfAccounts')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('finance.accountsDesc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTypeModal(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Settings size={18} />
            {t('finance.manageTypes')}
          </button>
          <button
            onClick={() => { resetTransferForm(); setShowTransferForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ArrowRightLeft size={18} />
            {t('finance.transfer')}
          </button>
          <button
            onClick={handleSeedDefaults}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={18} />
            {t('finance.seedDefaults')}
          </button>
          <button
            onClick={() => { resetForm(); setEditingAccount(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={18} />
            {t('finance.chartAddAccount')}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {accountTypes.slice(0, 4).map(type => {
          const Icon = ICON_MAP[type.icon] || FileText
          const total = totalsByType[type.key] || 0
          return (
            <div key={type.key} className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 ${type.bgColor} rounded-lg flex items-center justify-center`}>
                  <Icon size={16} className={type.color} />
                </div>
                <span className="text-sm text-gray-500">{getTypeLabel(type)}</span>
              </div>
              <div className={`text-xl font-semibold ${type.color}`}>
                {formatCurrency(total)}
              </div>
            </div>
          )
        })}
      </div>

      {/* View Tabs */}
      <div className="flex gap-4 mb-4 border-b">
        <button
          onClick={() => setViewTab('accounts')}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            viewTab === 'accounts'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('finance.chartOfAccounts')}
        </button>
        <button
          onClick={() => setViewTab('transfers')}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            viewTab === 'transfers'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('finance.recentTransfers')}
        </button>
      </div>

      {/* Filters */}
      {viewTab === 'accounts' && (
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Search size={18} className="text-gray-400" />
            <input
              type="text"
              placeholder={t('common.search')}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="">{t('common.all')}</option>
            {accountTypes.map(type => (
              <option key={type.key} value={type.key}>{getTypeLabel(type)}</option>
            ))}
          </select>
        </div>
      )}

      {/* Content */}
      {viewTab === 'accounts' ? (
        <div className="bg-white rounded-lg shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <RefreshCw className="animate-spin text-gray-400" size={24} />
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-500">
              <AlertCircle size={48} className="mb-3 text-gray-300" />
              <p>{t('finance.noAccounts')}</p>
              <button
                onClick={handleSeedDefaults}
                className="mt-4 px-4 py-2 text-sm text-primary hover:bg-primary/5 rounded-lg"
              >
                {t('finance.seedDefaults')}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t('finance.chartAccountCode')}</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t('finance.chartAccountName')}</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t('finance.chartAccountType')}</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">{t('finance.totalBalance')}</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredAccounts.map(account => {
                    const typeConfig = getTypeConfig(account.type)
                    const Icon = typeConfig.icon
                    return (
                      <tr key={account.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="font-mono font-medium text-gray-900">{account.code}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 ${typeConfig.bgColor} rounded-lg flex items-center justify-center`}>
                              <Icon size={16} className={typeConfig.color} />
                            </div>
                            <span className="font-medium text-gray-900">{account.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${typeConfig.bgColor} ${typeConfig.color}`}>
                            {typeConfig.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-medium ${account.balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                            {formatCurrency(account.balance)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEdit(account)}
                              className="p-2 text-gray-400 hover:text-primary rounded-lg hover:bg-gray-100"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(account.id)}
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
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td colSpan={3} className="px-4 py-3">
                      <span className="font-bold text-gray-900">{t('common.total')}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-gray-900">{formatCurrency(totalBalance)}</span>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <RefreshCw className="animate-spin text-gray-400" size={24} />
            </div>
          ) : transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-500">
              <ArrowRightLeft size={48} className="mb-3 text-gray-300" />
              <p>{t('finance.noTransfers')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t('finance.fromAccount')}</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t('finance.toAccount')}</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">{t('finance.totalBalance')}</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t('common.period')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transfers.map(transfer => (
                    <tr key={transfer.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">
                          {transfer.fromAccount?.code} - {transfer.fromAccount?.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">
                          {transfer.toAccount?.code} - {transfer.toAccount?.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(transfer.amount)}
                        </span>
                        {transfer.note && (
                          <div className="text-xs text-gray-500 mt-1">{transfer.note}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(transfer.date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Account Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {editingAccount ? t('finance.chartEditAccount') : t('finance.chartAddAccount')}
              </h3>
              <button onClick={() => { setShowForm(false); setEditingAccount(null) }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('finance.chartAccountCode')} *
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={e => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder={t('common.placeholderAccountCode')}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('finance.chartAccountName')} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder={t('finance.chartAccountName')}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('finance.chartAccountType')} *
                </label>
                <select
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                >
                  {accountTypes.map(type => (
                    <option key={type.key} value={type.key}>{getTypeLabel(type)}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingAccount(null); resetForm() }}
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

      {/* Transfer Form Modal */}
      {showTransferForm && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t('finance.transfer')}</h3>
              <button onClick={() => { setShowTransferForm(false); resetTransferForm() }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleTransfer} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('finance.fromAccount')} *
                </label>
                <select
                  value={transferData.fromAccountId}
                  onChange={e => setTransferData({ ...transferData, fromAccountId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                >
                  <option value="">-- {t('common.select')} --</option>
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name} ({formatCurrency(account.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-center">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                  <ArrowRightLeft size={16} className="text-gray-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('finance.toAccount')} *
                </label>
                <select
                  value={transferData.toAccountId}
                  onChange={e => setTransferData({ ...transferData, toAccountId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                >
                  <option value="">-- {t('common.select')} --</option>
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name} ({formatCurrency(account.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('finance.totalBalance')} (Rp) *
                </label>
                <input
                  type="number"
                  value={transferData.amount}
                  onChange={e => setTransferData({ ...transferData, amount: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  min={1}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('common.period')}
                </label>
                <input
                  type="date"
                  value={transferData.date}
                  onChange={e => setTransferData({ ...transferData, date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('finance.transferNote')}
                </label>
                <textarea
                  value={transferData.note}
                  onChange={e => setTransferData({ ...transferData, note: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  rows={2}
                  placeholder={t('finance.counterpartyPlaceholder')}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowTransferForm(false); resetTransferForm() }}
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

      {/* Account Types Management Modal */}
      {showTypeModal && (
        <AccountTypeModal
          types={accountTypes}
          onSave={saveAccountTypes}
          onClose={() => setShowTypeModal(false)}
          t={t}
        />
      )}
    </div>
  )
}

// Account Type Management Modal Component
function AccountTypeModal({
  types,
  onSave,
  onClose,
  t
}: {
  types: AccountType[]
  onSave: (types: AccountType[]) => void
  onClose: () => void
  t: any
}) {
  const [editingTypes, setEditingTypes] = useState<AccountType[]>(types)
  const [newType, setNewType] = useState({ key: '', label: '', labelZh: '', labelEn: '', icon: 'FileText', color: 'text-gray-600', bgColor: 'bg-gray-100' })

  const COLORS = [
    { color: 'text-green-600', bgColor: 'bg-green-100' },
    { color: 'text-blue-600', bgColor: 'bg-blue-100' },
    { color: 'text-purple-600', bgColor: 'bg-purple-100' },
    { color: 'text-orange-600', bgColor: 'bg-orange-100' },
    { color: 'text-pink-600', bgColor: 'bg-pink-100' },
    { color: 'text-gray-600', bgColor: 'bg-gray-100' },
    { color: 'text-red-600', bgColor: 'bg-red-100' },
    { color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
    { color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
    { color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
  ]

  const ICONS = ['Wallet', 'Building2', 'CreditCard', 'FileText', 'TrendingUp', 'TrendingDown', 'Package']

  const handleAddType = () => {
    if (!newType.key || !newType.label) return
    setEditingTypes([...editingTypes, { ...newType, key: newType.key.toLowerCase().replace(/\s+/g, '_') }])
    setNewType({ key: '', label: '', labelZh: '', labelEn: '', icon: 'FileText', color: 'text-gray-600', bgColor: 'bg-gray-100' })
  }

  const handleRemoveType = (key: string) => {
    setEditingTypes(editingTypes.filter(t => t.key !== key))
  }

  const handleSave = () => {
    onSave(editingTypes)
  }

  return (
    <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col pointer-events-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t('finance.manageTypes')}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {/* Existing Types */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 mb-3">{t('finance.currentTypes')}</h4>
            <div className="space-y-2">
              {editingTypes.map(type => (
                <div key={type.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 ${type.bgColor} rounded-lg flex items-center justify-center`}>
                      <span className={`text-sm font-medium ${type.color}`}>{type.label.charAt(0)}</span>
                    </div>
                    <div>
                      <span className="font-medium">{type.label}</span>
                      <span className="text-xs text-gray-500 ml-2">({type.key})</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveType(type.key)}
                    className="p-1 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Add New Type */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">{t('finance.addNewType')}</h4>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder={t('finance.typeKey') + ' (e.g. cash)'}
                value={newType.key}
                onChange={e => setNewType({ ...newType, key: e.target.value })}
                className="px-3 py-2 border rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder={t('finance.typeLabel') + ' (e.g. Tunai)'}
                value={newType.label}
                onChange={e => setNewType({ ...newType, label: e.target.value })}
                className="px-3 py-2 border rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder="中文名称"
                value={newType.labelZh}
                onChange={e => setNewType({ ...newType, labelZh: e.target.value })}
                className="px-3 py-2 border rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder="English Label"
                value={newType.labelEn}
                onChange={e => setNewType({ ...newType, labelEn: e.target.value })}
                className="px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div className="flex gap-2 mt-3">
              <select
                value={newType.icon}
                onChange={e => setNewType({ ...newType, icon: e.target.value })}
                className="px-3 py-2 border rounded-lg text-sm"
              >
                {ICONS.map(icon => (
                  <option key={icon} value={icon}>{icon}</option>
                ))}
              </select>
              <select
                value={`${newType.color}|${newType.bgColor}`}
                onChange={e => {
                  const [color, bgColor] = e.target.value.split('|')
                  setNewType({ ...newType, color, bgColor })
                }}
                className="px-3 py-2 border rounded-lg text-sm"
              >
                {COLORS.map((c, i) => (
                  <option key={i} value={`${c.color}|${c.bgColor}`}>{c.color.replace('text-', '')}</option>
                ))}
              </select>
              <button
                onClick={handleAddType}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-100"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2"
          >
            <Check size={16} />
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
