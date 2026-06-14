import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Wallet, ArrowUpCircle, ArrowDownCircle, History, Search } from 'lucide-react'

interface BalanceLog {
  id: string
  type: 'topup' | 'refund' | 'deduct' | 'adjust'
  amount: number
  balanceBefore: number
  balanceAfter: number
  note?: string
  createdAt: string
  memberName?: string
}

interface MemberBalance {
  memberId: string
  memberName: string
  phone: string
  balance: number
}

export function MemberBalancePage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const storeId = user?.storeId || 'default'
  const queryClient = useQueryClient()

  const [searchPhone, setSearchPhone] = useState('')
  const [selectedMember, setSelectedMember] = useState<MemberBalance | null>(null)
  const [showTopup, setShowTopup] = useState(false)
  const [showDeduct, setShowDeduct] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [activeTab, setActiveTab] = useState<'search' | 'history'>('search')

  // Search member by phone
  const searchMutation = useMutation({
    mutationFn: (phone: string) => marketingApi.searchMember(phone),
    onSuccess: (data) => {
      if (data?.data?.data) {
        setSelectedMember(data.data.data)
      }
    }
  })

  // Get member balance details
  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ['member-balance', selectedMember?.memberId],
    queryFn: () => marketingApi.getMemberBalance(selectedMember!.memberId),
    enabled: !!selectedMember?.memberId
  })

  // Get balance logs
  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['balance-logs', storeId],
    queryFn: () => marketingApi.getBalanceLogs(storeId),
    enabled: activeTab === 'history'
  })

  // Topup mutation
  const topupMutation = useMutation({
    mutationFn: ({ memberId, amount, note }: { memberId: string; amount: number; note?: string }) =>
      marketingApi.memberTopup(memberId, amount, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-balance'] })
      queryClient.invalidateQueries({ queryKey: ['balance-logs'] })
      setShowTopup(false)
      setAmount('')
      setNote('')
    }
  })

  // Deduct mutation
  const deductMutation = useMutation({
    mutationFn: ({ memberId, amount, note }: { memberId: string; amount: number; note?: string }) =>
      marketingApi.memberDeduct(memberId, amount, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-balance'] })
      queryClient.invalidateQueries({ queryKey: ['balance-logs'] })
      setShowDeduct(false)
      setAmount('')
      setNote('')
    }
  })

  const handleSearch = () => {
    if (searchPhone) {
      searchMutation.mutate(searchPhone)
    }
  }

  const formatCurrency = (value: number) => `Rp ${value.toLocaleString('id-ID')}`

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'topup': return t('marketing.topup')
      case 'refund': return t('marketing.refund')
      case 'deduct': return t('marketing.deduct')
      case 'adjust': return t('marketing.adjust')
      default: return type
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'topup': return 'text-green-600'
      case 'refund': return 'text-blue-600'
      case 'deduct': return 'text-red-600'
      case 'adjust': return 'text-orange-600'
      default: return 'text-gray-600'
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Wallet size={24} className="text-primary" />
        <h1 className="text-xl font-semibold">{t('marketing.memberBalance')}</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('search')}
          className={`px-4 py-2 rounded-lg font-medium ${
            activeTab === 'search' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700'
          }`}
        >
          {t('marketing.searchMember')}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
            activeTab === 'history' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700'
          }`}
        >
          <History size={16} />
          {t('marketing.allTransactions')}
        </button>
      </div>

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          {/* Search Box */}
          <div className="card">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  placeholder={t('marketing.enterPhone')}
                  className="input pl-10"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <button onClick={handleSearch} disabled={searchMutation.isPending} className="btn-primary">
                {searchMutation.isPending ? <Loader2 className="animate-spin" /> : t('common.search')}
              </button>
            </div>
          </div>

          {/* Member Info */}
          {selectedMember && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-lg">{selectedMember.memberName}</h3>
                  <p className="text-gray-500">{selectedMember.phone}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">{t('marketing.currentBalance')}</div>
                  <div className="text-2xl font-bold text-primary">{formatCurrency(selectedMember.balance)}</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowTopup(true)}
                  className="btn-primary flex items-center gap-2"
                >
                  <ArrowUpCircle size={18} />
                  {t('marketing.topup')}
                </button>
                <button
                  onClick={() => setShowDeduct(true)}
                  className="btn-secondary flex items-center gap-2"
                >
                  <ArrowDownCircle size={18} />
                  {t('marketing.deduct')}
                </button>
              </div>

              {/* Recent Transactions */}
              {balanceLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
              ) : balanceData?.data?.data?.logs?.length > 0 ? (
                <div className="mt-6">
                  <h4 className="font-medium mb-3">{t('marketing.recentTransactions')}</h4>
                  <div className="space-y-2">
                    {balanceData?.data?.data?.logs?.map((log: BalanceLog) => (
                      <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${getTypeColor(log.type).replace('text-', 'bg-')}`} />
                          <div>
                            <div className="font-medium">{getTypeLabel(log.type)}</div>
                            {log.note && <div className="text-sm text-gray-500">{log.note}</div>}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-medium ${getTypeColor(log.type)}`}>
                            {log.amount > 0 ? '+' : ''}{formatCurrency(log.amount)}
                          </div>
                          <div className="text-sm text-gray-500">
                            {new Date(log.createdAt).toLocaleDateString('id-ID')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="card">
          {logsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
          ) : logsData?.data?.data?.length > 0 ? (
            <div className="space-y-2">
              {logsData?.data?.data?.map((log: BalanceLog) => (
                <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${getTypeColor(log.type).replace('text-', 'bg-')}`} />
                    <div>
                      <div className="font-medium">{log.memberName || t('marketing.unknownMember')}</div>
                      <div className="text-sm text-gray-500">{getTypeLabel(log.type)}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-medium ${getTypeColor(log.type)}`}>
                      {log.amount > 0 ? '+' : ''}{formatCurrency(log.amount)}
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(log.createdAt).toLocaleDateString('id-ID')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 py-8">{t('common.noData')}</p>
          )}
        </div>
      )}

      {/* Topup Modal */}
      {showTopup && selectedMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">{t('marketing.topup')}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.amount')}</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="input"
                  placeholder="100000"
                  min="1000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.note')}</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="input"
                  placeholder={t('marketing.topupNote')}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => topupMutation.mutate({ memberId: selectedMember.memberId, amount: Number(amount), note })}
                  disabled={!amount || topupMutation.isPending}
                  className="btn-primary flex-1"
                >
                  {topupMutation.isPending ? <Loader2 className="animate-spin" /> : t('common.confirm')}
                </button>
                <button onClick={() => setShowTopup(false)} className="btn-secondary">{t('common.cancel')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deduct Modal */}
      {showDeduct && selectedMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">{t('marketing.deduct')}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.amount')}</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="input"
                  placeholder="10000"
                  min="1000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.note')}</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="input"
                  placeholder={t('marketing.deductNote')}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => deductMutation.mutate({ memberId: selectedMember.memberId, amount: Number(amount), note })}
                  disabled={!amount || deductMutation.isPending}
                  className="btn-danger flex-1"
                >
                  {deductMutation.isPending ? <Loader2 className="animate-spin" /> : t('common.confirm')}
                </button>
                <button onClick={() => setShowDeduct(false)} className="btn-secondary">{t('common.cancel')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}