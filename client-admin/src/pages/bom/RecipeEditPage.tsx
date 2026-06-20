import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { bomApi, inventoryApi, productApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { formatCurrency } from '../../utils/helpers'
import {
  ArrowLeft, Plus, Trash2, Loader2, ChevronDown, ChevronRight,
  AlertCircle, AlertTriangle, Package, CheckCircle
} from 'lucide-react'

// 原料类型
type InventoryType = 'raw_material' | 'semi_finished' | 'all'

interface BOMItem {
  id?: string
  inventoryId: string
  quantity: number
  quantityStr: string
  name: string
  unit: string
  cost: number
  type?: InventoryType
  currentStock?: number
  safetyStock?: number
  // 成本分解（用于 semi_finished）
  costBreakdown?: {
    type: string
    cost: number
    breakdown: Array<{
      inventoryId: string
      name: string
      unit: string
      quantity: number
      costPerUnit: number
      totalCost: number
    }> | null
    processRecipeId?: string
    processRecipeName?: string
    outputQuantity?: number
  }
  // 验证错误
  error?: string
}

export function RecipeEditPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  const [filterType, setFilterType] = useState<InventoryType>('all')
  const [bomItems, setBomItems] = useState<BOMItem[]>([])
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set())
  const [isDirty, setIsDirty] = useState(false)

  // 获取产品详情
  const { data: productData, isLoading: productLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productApi.get(id!),
    enabled: !!id
  })

  // 获取产品BOM明细
  const { data: bomData, isLoading: bomLoading } = useQuery({
    queryKey: ['bom-product', id],
    queryFn: () => bomApi.getProductDetail(id!),
    enabled: !!id
  })

  // 获取库存列表
  const { data: inventoryData, isLoading: inventoryLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => inventoryApi.list({ pageSize: 500 })
  })

  const inventoryList = inventoryData?.data?.list || []

  // 按类型分组的库存
  const groupedInventory = useMemo(() => {
    const raw: any[] = []
    const semi: any[] = []
    for (const inv of inventoryList) {
      if (inv.type === 'raw_material' || !inv.type) raw.push(inv)
      else if (inv.type === 'semi_finished') semi.push(inv)
    }
    return { raw, semi }
  }, [inventoryList])

  // 更新BOM的mutation
  const updateBomMutation = useMutation({
    mutationFn: (data: any) => productApi.updateBom(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bom-product', id] })
      queryClient.invalidateQueries({ queryKey: ['bom-products'] })
      setIsDirty(false)
      alert(t('bom.saveSuccess'))
    },
    onError: (error: any) => {
      alert(error?.response?.data?.message || error.message || 'Save failed')
    }
  })

  useEffect(() => {
    if (productData?.data) {
      setSelectedProduct(productData.data.data)
    }
  }, [productData])

  useEffect(() => {
    if (bomData?.data) {
      const items = (bomData.data.data.bomDetails || []).map((item: any) => ({
        ...item,
        quantityStr: item.quantity?.toString() || '',
        type: item.inventoryType || item.type || 'raw_material',
        currentStock: item.currentStock,
        safetyStock: item.safetyStock
      }))
      setBomItems(items)
    }
  }, [bomData])

  // 离开页面时提示未保存更改
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  // 获取 semi_finished 项的成本分解
  const fetchCostBreakdown = useCallback(async (index: number, inventoryId: string, quantity: number) => {
    try {
      const res = await bomApi.getInventoryBreakdown(inventoryId, quantity)
      if (res.data.code === 200) {
        setBomItems(prev => prev.map((item, i) =>
          i === index ? { ...item, costBreakdown: res.data.data } : item
        ))
      }
    } catch (e) {
      console.error('Failed to fetch cost breakdown:', e)
    }
  }, [])

  const handleAddItem = () => {
    setBomItems(prev => [...prev, {
      inventoryId: '',
      quantity: 0,
      quantityStr: '',
      name: '',
      unit: '',
      cost: 0
    }])
    setIsDirty(true)
  }

  const handleRemoveItem = (index: number) => {
    setBomItems(prev => {
      const newItems = prev.filter((_, i) => i !== index)
      // 重新索引 expandedItems
      const newExpanded = new Set<number>()
      expandedItems.forEach(v => {
        if (v < index) newExpanded.add(v)
        else if (v > index) newExpanded.add(v - 1)
      })
      setExpandedItems(newExpanded)
      return newItems
    })
    setIsDirty(true)
  }

  const handleInventoryChange = (index: number, inventoryId: string) => {
    const inventory = inventoryList.find((i: any) => i.id === inventoryId)
    if (inventory) {
      setBomItems(prev => prev.map((item, i) => {
        if (i !== index) return item
        const newItem = {
          ...item,
          inventoryId,
          name: inventory.name,
          unit: inventory.unit,
          cost: inventory.avgCost || 0,
          type: inventory.type || 'raw_material',
          currentStock: inventory.currentStock,
          safetyStock: inventory.safetyStock,
          costBreakdown: undefined,
          error: undefined
        }
        // 如果是 semi_finished，自动获取成本分解
        if (inventory.type === 'semi_finished') {
          const qty = parseFloat(newItem.quantityStr) || 1
          fetchCostBreakdown(index, inventoryId, qty)
        }
        return newItem
      }))
      setIsDirty(true)
    }
  }

  const handleQuantityChange = (index: number, value: string) => {
    // 只允许数字和小数点
    const cleanValue = value.replace(/[^0-9.]/g, '')
    // 防止多个小数点
    const parts = cleanValue.split('.')
    const finalValue = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleanValue

    setBomItems(prev => prev.map((item, i) => {
      if (i !== index) return item
      const newItem = { ...item, quantityStr: finalValue }
      // 如果是 semi_finished，重新计算成本分解
      if (newItem.type === 'semi_finished' && newItem.inventoryId) {
        const qty = parseFloat(finalValue) || 1
        fetchCostBreakdown(index, newItem.inventoryId, qty)
      }
      return newItem
    }))
    setIsDirty(true)
  }

  const toggleExpand = (index: number) => {
    setExpandedItems(prev => {
      const newExpanded = new Set(prev)
      if (newExpanded.has(index)) newExpanded.delete(index)
      else newExpanded.add(index)
      return newExpanded
    })
  }

  // 验证所有项
  const validateItems = (): { valid: boolean; errors: string[] } => {
    const errors: string[] = []
    bomItems.forEach((item, index) => {
      if (!item.inventoryId) {
        errors.push(`Row ${index + 1}: ${t('bom.validationSelectMaterial')}`)
      }
      const qty = parseFloat(item.quantityStr)
      if (isNaN(qty) || qty <= 0) {
        errors.push(`Row ${index + 1}: ${t('bom.validationPositiveQty')}`)
      }
    })
    return { valid: errors.length === 0, errors }
  }

  const handleSave = () => {
    const { valid, errors } = validateItems()
    if (!valid) {
      alert(errors.join('\n'))
      return
    }

    const validItems = bomItems.filter(item => item.inventoryId && parseFloat(item.quantityStr) > 0)
    updateBomMutation.mutate({
      bomItems: validItems.map(item => ({
        inventoryId: item.inventoryId,
        quantity: parseFloat(item.quantityStr) || 0
      }))
    })
  }

  const handleCancel = () => {
    if (isDirty && !confirm(t('bom.unsavedChanges'))) {
      return
    }
    navigate(-1)
  }

  // 计算总成本（考虑 semi_finished 的实际成本）
  const totalCost = useMemo(() => {
    return bomItems.reduce((sum, item) => {
      if (!item.inventoryId) return sum
      const qty = parseFloat(item.quantityStr) || 0
      if (item.costBreakdown) {
        return sum + item.costBreakdown.cost
      }
      return sum + (qty * item.cost)
    }, 0)
  }, [bomItems])

  // 库存不足的项目数量
  const lowStockCount = useMemo(() => {
    return bomItems.filter(item => {
      if (!item.inventoryId || !item.currentStock) return false
      const qty = parseFloat(item.quantityStr) || 0
      return item.currentStock < qty
    }).length
  }, [bomItems])

  // 根据筛选类型过滤可选库存（用于筛选模式不是 "all" 时）
  const filteredInventory = useMemo(() => {
    if (filterType === 'all') return inventoryList
    if (filterType === 'raw_material') return groupedInventory.raw
    return groupedInventory.semi
  }, [filterType, inventoryList, groupedInventory])

  if (productLoading || bomLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!selectedProduct) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">{t('bom.productNotFound')}</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={handleCancel} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold">{t('bom.editRecipe')}</h1>
          <p className="text-sm text-gray-500">{selectedProduct.name}</p>
        </div>
        {isDirty && (
          <span className="ml-auto px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded-full">
            {t('bom.unsaved')}
          </span>
        )}
      </div>

      {/* 原料类型筛选 */}
      <div className="card">
        <div className="flex items-center gap-4 mb-4">
          <span className="text-sm font-medium text-gray-700">{t('bom.filterByType')}：</span>
          <div className="flex gap-2">
            {(['all', 'raw_material', 'semi_finished'] as InventoryType[]).map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                  filterType === type
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {type === 'all' ? t('bom.typeAll') :
                 type === 'raw_material' ? t('bom.typeRaw') :
                 t('bom.typeSemi')}
              </button>
            ))}
          </div>
          {lowStockCount > 0 && (
            <div className="ml-auto flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle size={16} />
              <span>{lowStockCount} {t('bom.itemsLowStock')}</span>
            </div>
          )}
        </div>
      </div>

      {/* BOM Items */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('bom.materials')}</h2>
          <button onClick={handleAddItem} className="btn-secondary flex items-center gap-2">
            <Plus size={18} />
            {t('bom.addMaterial')}
          </button>
        </div>

        {inventoryLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {!inventoryLoading && bomItems.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Package size={48} className="mx-auto mb-4 text-gray-300" />
            <p>{t('bom.noMaterials')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {bomItems.map((item, index) => (
              <div key={index} className={`border rounded-lg overflow-hidden ${
                item.error ? 'border-red-300' : 'border-gray-200'
              }`}>
                {/* 主行 */}
                <div className="flex items-center gap-3 p-3 bg-gray-50">
                  {/* 原料类型标签 */}
                  <span className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 ${
                    item.type === 'semi_finished'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {item.type === 'semi_finished'
                      ? t('bom.typeSemi')
                      : t('bom.typeRaw')}
                  </span>

                  {/* 原料选择 */}
                  <div className="flex-1 min-w-0">
                    <select
                      value={item.inventoryId}
                      onChange={(e) => handleInventoryChange(index, e.target.value)}
                      className={`input w-full ${item.error ? 'input-error' : ''}`}
                    >
                      <option value="">{t('common.select')} --</option>
                      {filterType === 'all' ? (
                        <>
                          <optgroup label={`${t('bom.typeRaw')} (${groupedInventory.raw.length})`}>
                            {groupedInventory.raw.length === 0 ? (
                              <option disabled>{t('bom.noRawMaterials')}</option>
                            ) : groupedInventory.raw.map((inv: any) => (
                              <option key={inv.id} value={inv.id}>
                                {inv.name} ({inv.unit})
                             </option>
                            ))}
                          </optgroup>
                          <optgroup label={`${t('bom.typeSemi')} (${groupedInventory.semi.length})`}>
                            {groupedInventory.semi.length === 0 ? (
                              <option disabled>{t('bom.noProcessed')}</option>
                            ) : groupedInventory.semi.map((inv: any) => (
                              <option key={inv.id} value={inv.id}>
                                {inv.name} ({inv.unit})
                              </option>
                            ))}
                          </optgroup>
                        </>
                      ) : (
                        filteredInventory.map((inv: any) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.name} ({inv.unit})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* 用量 */}
                  <div className="w-28 flex-shrink-0">
                    <input
                      type="text"
                      value={item.quantityStr}
                      onChange={(e) => handleQuantityChange(index, e.target.value)}
                      className={`input w-full text-right ${item.error ? 'input-error' : ''}`}
                      placeholder="0"
                      inputMode="decimal"
                      style={{ appearance: 'textfield' }}
                    />
                  </div>

                  {/* 单位 */}
                  <div className="w-16 text-gray-500 text-sm text-center flex-shrink-0">
                    {item.unit || '-'}
                  </div>

                  {/* 小计 */}
                  <div className="w-28 text-right font-medium text-sm flex-shrink-0">
                    {item.inventoryId
                      ? formatCurrency(
                          item.costBreakdown
                            ? item.costBreakdown.cost
                            : (parseFloat(item.quantityStr) || 0) * item.cost
                        )
                      : '-'}
                  </div>

                  {/* 库存状态 */}
                  {item.inventoryId && item.currentStock !== undefined && (
                    <div className={`w-20 text-xs text-center flex-shrink-0 ${
                      item.currentStock < (parseFloat(item.quantityStr) || 0)
                        ? 'text-red-600 font-medium'
                        : 'text-gray-500'
                    }`}>
                     <div>{t('bom.stock')}</div>
                      <div>{item.currentStock}{item.unit}</div>
                    </div>
                  )}

                  {/* 展开/折叠按钮（仅 semi_finished） */}
                  {item.type === 'semi_finished' && item.inventoryId && (
                    <button
                      onClick={() => toggleExpand(index)}
                      className="p-2 hover:bg-gray-200 rounded-lg text-gray-500 flex-shrink-0"
                      title={t('bom.viewBreakdown')}
                    >
                      {expandedItems.has(index) ? (
                        <ChevronDown size={18} />
                      ) : (
                        <ChevronRight size={18} />
                      )}
                    </button>
                  )}

                  {/* 删除 */}
                  <button
                    onClick={() => handleRemoveItem(index)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded flex-shrink-0"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                {/* 错误提示 */}
                {item.error && (
                  <div className="px-3 py-2 bg-red-50 text-red-600 text-sm flex items-center gap-2">
                    <AlertCircle size={14} />
                    {item.error}
                  </div>
                )}

                {/* 成本分解展开行（仅 semi_finished 且已展开） */}
                {item.type === 'semi_finished' && item.inventoryId && expandedItems.has(index) && (
                  <div className="bg-amber-50 border-t border-amber-100 p-3">
                    {item.costBreakdown ? (
                      <>
                        <div className="flex items-center gap-2 mb-2 text-sm text-amber-800">
                          <AlertCircle size={14} />
                          <span className="font-medium">
                            {t('bom.breakdown')}：
                            {item.costBreakdown.processRecipeName || t('bom.processedRecipe')}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {item.costBreakdown.breakdown?.map((b, bi) => (
                            <div key={bi} className="flex items-center justify-between text-sm pl-4">
                              <span className="text-gray-600">
                                → {b.name}：{b.quantity}{b.unit}
                              </span>
                              <span className="text-gray-500">
                                {formatCurrency(b.totalCost)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-end mt-2 pt-2 border-t border-amber-200">
                          <span className="text-sm text-amber-800">
                            {t('bom.totalCost')}：{formatCurrency(item.costBreakdown.cost)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-amber-700">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('bom.loadingBreakdown')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Total Cost */}
        <div className="flex justify-between items-center mt-6 pt-4 border-t">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{t('bom.totalCost')}</span>
            {bomItems.length > 0 && (
              <span className="text-sm text-gray-500">
                ({bomItems.length} {t('bom.items')})
              </span>
            )}
          </div>
          <span className="text-xl font-bold text-primary">{formatCurrency(totalCost)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <button onClick={handleCancel} className="btn-secondary">
          {t('common.cancel')}
        </button>
        <button
          onClick={handleSave}
          disabled={updateBomMutation.isPending || bomItems.length === 0}
          className="btn-primary flex items-center gap-2"
        >
          {updateBomMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle size={18} />
          )}
          {t('common.save')}
        </button>
      </div>
    </div>
  )
}