import { MarketingDialog } from '../../components/marketing/MarketingDialog'
import { MarketingError, useMarketingCopy } from '../../components/marketing/MarketingLayout'
import { ResourcePicker } from '../../components/marketing/ResourcePicker'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { activitiesApi, rewardApi } from '../../services/api'
import { expenseCalendarDate } from '../../utils/expenseInput'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Plus, Edit2, Trash2, X, Gift } from 'lucide-react'

interface Reward {
  productId?: string
  addonId?: string
  id: string
  name: string
  description?: string
  type: string
  pointsCost: number
  value: number
  stock?: number
  validFrom: string
  validUntil: string
  isActive: boolean
}

const REWARD_TYPES = [
  { key: 'product', labelKey: 'marketing.product' },
  { key: 'addon', labelKey: 'marketing.addon' },
  { key: 'voucher', labelKey: 'marketing.voucher' },
  { key: 'gift', labelKey: 'marketing.gift' }
]

const DEFAULT_FORM = {
  productId: '',
  addonId: '',
  name: '',
  description: '',
  type: 'product',
  pointsCost: 500,
  value: 0,
  stock: null as number | null,
  validFrom: expenseCalendarDate(),
  validUntil: expenseCalendarDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
  isActive: true
}

export function RewardCatalogPage() {
  const { t } = useTranslation()
  const l = useMarketingCopy()
  const [error,setError] = useState('')
  const [search,setSearch] = useState('')
  const { user } = useAuthStore()
  const storeId = user?.storeId
  const queryClient = useQueryClient()

  const [showModal, setShowModal] = useState(false)
  const [editingReward, setEditingReward] = useState<Reward | null>(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: rewardsData, isLoading, isError, refetch } = useQuery({
    queryKey: ['rewards'],
    queryFn: () => rewardApi.list()
  })

  const resources = useQuery({queryKey:['activity-resources'],queryFn:()=>activitiesApi.resources().then(response=>response.data.data),enabled:showModal})
  const onError=(error:any)=>setError(error.response?.data?.message||error.message)
  const createMutation = useMutation({
    mutationFn: (payload: any) => rewardApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rewards'] })
      closeModal()
      queryClient.invalidateQueries({queryKey:['activity-resources']})
    }, onError
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => rewardApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rewards'] })
      closeModal()
      queryClient.invalidateQueries({queryKey:['activity-resources']})
    }, onError
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => rewardApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rewards'] })
      setDeleteId(null)
      queryClient.invalidateQueries({queryKey:['activity-resources']})
    }, onError
  })

  const rewards: Reward[] = (rewardsData?.data?.data?.list || []).filter((reward:Reward)=>reward.name.toLowerCase().includes(search.toLowerCase()))

  const closeModal = () => {
    setError('')
    setShowModal(false)
    setEditingReward(null)
    setForm(DEFAULT_FORM)
  }

  const openEdit = (reward: Reward) => {
    setError('')
    setEditingReward(reward)
    setForm({
      productId: reward.productId||'',
      addonId: reward.addonId||'',
      name: reward.name,
      description: reward.description || '',
      type: reward.type,
      pointsCost: reward.pointsCost,
      value: reward.value,
      stock: reward.stock ?? null,
      validFrom: reward.validFrom ? expenseCalendarDate(reward.validFrom) : '',
      validUntil: reward.validUntil ? expenseCalendarDate(reward.validUntil) : '',
      isActive: reward.isActive
    })
    setShowModal(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if(form.type==='product'&&!form.productId||form.type==='addon'&&!form.addonId){setError(l('请选择关联商品或小料','Select the linked product or topping','Pilih produk atau topping terkait'));return}
    const payload = { ...form, storeId,productId:form.type==='product'?form.productId:null,addonId:form.type==='addon'?form.addonId:null }
    if (editingReward) {
      updateMutation.mutate({ id: editingReward.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const formatDate = (d: string) => {
    return d ? new Date(d).toLocaleDateString('id-ID') : '-'
  }

  if(isError) return <MarketingError retry={()=>refetch()}/>
  return (
    <div>
      <div className="marketing-toolbar mb-4">
        <button onClick={() => {setError('');setShowModal(true)}} className="btn-primary flex items-center gap-2">
          <Plus size={20} /> {t('marketing.addReward')}
        </button>
      </div>

      {error&&<div role="alert" className="rounded-lg bg-red-50 text-red-700 p-3 mb-4 text-sm">{error}</div>}
      <p className="text-sm text-gray-500 mb-4">{l('兑换目录同时提供活动赠品。关联商品或小料后，兑现时可核对库存。','This catalog also supplies activity gifts. Link products or toppings for inventory checks at fulfilment.','Katalog ini juga menyediakan hadiah aktivitas. Tautkan produk atau topping untuk pemeriksaan stok saat penyerahan.')}</p>
      <input className="input mb-4 sm:max-w-sm" aria-label={l('搜索赠品','Search rewards','Cari hadiah')} value={search} onChange={event=>setSearch(event.target.value)} placeholder={l('搜索赠品名称','Search reward names','Cari nama hadiah')}/>
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
      ) : rewards.length === 0 ? (
        <div className="card text-center py-12">
          <Gift size={48} className="mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500 mb-4">{t('common.noData')}</p>
          <button onClick={() => {setError('');setShowModal(true)}} className="btn-primary">
            {t('marketing.addReward')}
          </button>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3">{t('marketing.rewardName')}</th>
                <th className="pb-3">{t('marketing.type')}</th>
                <th className="pb-3">{t('marketing.pointsCost')}</th>
                <th className="pb-3">{t('marketing.couponValue')}</th>
                <th className="pb-3">{t('marketing.stock')}</th>
                <th className="pb-3">{t('marketing.validity')}</th>
                <th className="pb-3">{t('common.status')}</th>
                <th className="pb-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rewards.map(r => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-3">
                    <div className="font-medium">{r.name}</div>
                    {r.description && <div className="text-sm text-gray-500">{r.description}</div>}
                  </td>
                  <td className="py-3">
                    <span className="badge badge-gray">
                      {t(REWARD_TYPES.find(rewardType => rewardType.key === r.type)?.labelKey || 'marketing.' + r.type)}
                    </span>
                  </td>
                  <td className="py-3 font-medium text-primary">{r.pointsCost}</td>
                  <td className="py-3">Rp {r.value?.toLocaleString()}</td>
                  <td className="py-3">{r.stock ?? '∞'}</td>
                  <td className="py-3 text-sm text-gray-500">
                    {formatDate(r.validFrom)} - {formatDate(r.validUntil)}
                  </td>
                  <td className="py-3">
                    <span className={"badge " + (r.isActive ? 'badge-success' : 'badge-gray')}>
                      {r.isActive ? t('common.active') : t('common.inactive')}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(r)} className="btn-ghost text-sm"><Edit2 size={14} /></button>
                      <button onClick={() => setDeleteId(r.id)} className="btn-ghost text-red-500 text-sm"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <MarketingDialog onClose={closeModal}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {editingReward ? t('marketing.editReward') : t('marketing.addReward')}
              </h3>
              <button onClick={closeModal} className="p-1 rounded hover:bg-gray-100"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.rewardName')} *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.type')}</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="input"
                >
                  {REWARD_TYPES.map(rewardType => (
                    <option key={rewardType.key} value={rewardType.key}>{t(rewardType.labelKey)}</option>
                  ))}
                </select>
              </div>
              {form.type==='product'&&<ResourcePicker single label={l('关联商品','Linked product','Produk terkait')} options={(resources.data?.products||[]).map((p:any)=>({id:p.id,name:p.name,subtitle:p.code,group:p.category?.name}))} value={form.productId?[form.productId]:[]} onChange={ids=>setForm(f=>({...f,productId:ids[0]||''}))}/>}
              {form.type==='addon'&&<ResourcePicker single label={l('关联小料','Linked topping','Topping terkait')} options={Array.from(new Map((resources.data?.products||[]).flatMap((p:any)=>(p.addons||[]).map((a:any)=>[a.addon.id,{id:a.addon.id,name:a.addon.name}] as const))).values()) as {id:string;name:string}[]} value={form.addonId?[form.addonId]:[]} onChange={ids=>setForm(f=>({...f,addonId:ids[0]||''}))}/>}
              {resources.isError&&<MarketingError retry={()=>resources.refetch()}/>}
              {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.pointsCost')} *</label>
                  <input
                    type="number"
                    value={form.pointsCost}
                    onChange={e => setForm(f => ({ ...f, pointsCost: Number(e.target.value) }))}
                    className="input"
                    min={0}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.rewardValue')}</label>
                  <input
                    type="number"
                    value={form.value}
                    onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
                    className="input"
                    min={0}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.stock')}</label>
                <input
                  type="number"
                  value={form.stock ?? ''}
                  onChange={e => setForm(f => ({ ...f, stock: e.target.value ? Number(e.target.value) : null }))}
                  className="input"
                  placeholder={t('marketing.unlimitedQuantityPlaceholder')}
                  min={0}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.validFrom')}</label>
                  <input
                    type="date"
                    value={form.validFrom}
                    onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.validUntil')}</label>
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))}
                    className="input"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={16} className="animate-spin" />}
                  {t('common.save')}
                </button>
                <button type="button" onClick={closeModal} className="btn-secondary">{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </MarketingDialog>
      )}

      {deleteId && (
        <MarketingDialog onClose={()=>setDeleteId(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm pointer-events-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">{t('common.delete')}</h3>
            <p className="text-gray-600 mb-6">{t('marketing.deleteRewardConfirm')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
                className="btn-danger flex-1 flex items-center justify-center gap-2"
              >
                {deleteMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                {t('common.delete')}
              </button>
              <button onClick={() => setDeleteId(null)} className="btn-secondary flex-1">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </MarketingDialog>
      )}
    </div>
  )
}
