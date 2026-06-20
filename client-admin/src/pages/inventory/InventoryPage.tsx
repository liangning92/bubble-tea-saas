import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { inventoryApi, configApi, processRecipeApi } from '../../services/api'
import { formatCurrency } from '../../utils/helpers'
import { AlertTriangle, TrendingUp, TrendingDown, Search, Loader2, Package, Plus, Edit2, Trash2, X } from 'lucide-react'

const DEFAULT_CATEGORIES = [
  { id: 'raw_material', name: 'Raw Material', code: 'raw_material' },
  { id: 'packaging', name: 'Packaging', code: 'packaging' },
  { id: 'finished_goods', name: 'Finished Goods', code: 'finished_goods' },
]

export function InventoryPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
   const [showStockIn, setShowStockIn] = useState(false)
  const [showStockOut, setShowStockOut] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [showEditItem, setShowEditItem] = useState(false)
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [stockForm, setStockForm] = useState({ quantity: '', unitCost: '', note: '' })
  const [addForm, setAddForm] = useState({ name: '', category: 'raw_material', type: 'raw_material', unit: 'kg', avgCost: '', safetyStock: '', processRecipeId: '' })
  const [search, setSearch] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<any>(null)
  const [categoryForm, setCategoryForm] = useState({ name: '', code: '', description: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => inventoryApi.list({ pageSize: 500 })
  })

  const { data: alertsData } = useQuery({
    queryKey: ['inventory-alerts'],
    queryFn: () => inventoryApi.alerts()
  })

  // Fetch dynamic categories
  const { data: configData } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const resp = await configApi.get()
      return resp.data
    }
  })

  // Fetch process recipes for semi_finished type
  const { data: recipesData } = useQuery({
    queryKey: ['process-recipes'],
    queryFn: () => processRecipeApi.list()
  })
  const recipes = recipesData?.data?.list || []

  // Update categories when config loads
  useEffect(() => {
    if (configData?.data) {
      const cats = configData.data.inventory_categories || configData.data['inventory_categories']
      if (cats?.length > 0) {
        setCategories(cats)
      }
    }
  }, [configData])

  const stockInMutation = useMutation({
    mutationFn: (data: any) => inventoryApi.stockIn(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-alerts'] })
      setShowStockIn(false)
      setSelectedItem(null)
      setStockForm({ quantity: '', unitCost: '', note: '' })
    }
  })

  const stockOutMutation = useMutation({
    mutationFn: (data: any) => inventoryApi.stockOut(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-alerts'] })
      setShowStockOut(false)
      setSelectedItem(null)
      setStockForm({ quantity: '', unitCost: '', note: '' })
    }
  })

  const addItemMutation = useMutation({
    mutationFn: (data: any) => inventoryApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setShowAddItem(false)
      setAddForm({ name: '', category: 'raw_material', type: 'raw_material', unit: 'kg', avgCost: '', safetyStock: '', processRecipeId: '' })
    },
    onError: (error: any) => {
      console.error('Add inventory error:', error)
      alert(error?.response?.data?.message || error.message || 'Failed to add item')
    }
  })

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => inventoryApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setShowEditItem(false)
      setSelectedItem(null)
    },
    onError: (error: any) => {
      console.error('Update inventory error:', error)
      alert(error?.response?.data?.message || error.message || 'Update failed')
    }
  })

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => inventoryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
    onError: (error: any) => {
      console.error('Delete inventory error:', error)
      alert(error?.response?.data?.message || error.message || 'Failed to delete')
    }
  })

  const saveCategoryMutation = useMutation({
    mutationFn: async (cats: any[]) => {
      await configApi.set(user?.storeId || '', 'inventory_categories', cats, 'inventory')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
      setShowCategoryModal(false)
      setEditingCategory(null)
      setCategoryForm({ name: '', code: '', description: '' })
    },
    onError: (error: any) => {
      console.error('Save category error:', error)
      alert(error?.response?.data?.message || error.message || 'Failed to save category')
    }
  })

  const openCategoryModal = (cat?: any) => {
    if (cat) {
      setEditingCategory(cat)
      setCategoryForm({ name: cat.name, code: cat.code, description: cat.description || '' })
    } else {
      setEditingCategory(null)
      setCategoryForm({ name: '', code: '', description: '' })
    }
    setShowCategoryModal(true)
  }

  const handleCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault()
    let newCategories: any[]
    if (editingCategory) {
      newCategories = categories.map(c =>
        c.id === editingCategory.id ? { ...categoryForm, id: categoryForm.code } : c
      )
    } else {
      newCategories = [...categories, { ...categoryForm, id: categoryForm.code }]
    }
    saveCategoryMutation.mutate(newCategories)
  }

  const handleDeleteCategory = (id: string) => {
    const newCategories = categories.filter(c => c.id !== id)
    saveCategoryMutation.mutate(newCategories)
  }

  const getCategoryItemCount = (categoryId: string) => {
    return inventory.filter((item: any) => item.category === categoryId || item.category === categories.find(c => c.id === categoryId)?.code).length
  }

  // API returns { code, data: { list } } but axios wraps it: data.data.data.list = array
  const inventory = data?.data?.data?.list || []
  const alerts = alertsData?.data || []

  const filteredInventory = inventory.filter((item: any) => {
    const matchSearch = !search || item.name?.toLowerCase().includes(search.toLowerCase())
    const matchLowStock = !lowStockOnly || item.isLowStock
    const matchCategory = !selectedCategory || item.category === selectedCategory || item.category === categories.find(c => c.id === selectedCategory)?.code
    return matchSearch && matchLowStock && matchCategory
  })

  const handleStockIn = () => {
    if (!selectedItem) return
    stockInMutation.mutate({
      inventoryId: selectedItem.id,
      storeId: user?.storeId,
      quantity: parseFloat(stockForm.quantity),
      unitCost: parseInt(stockForm.unitCost) || selectedItem.avgCost,
      note: stockForm.note
    })
  }

  const handleStockOut = () => {
    if (!selectedItem) return
    stockOutMutation.mutate({
      inventoryId: selectedItem.id,
      storeId: user?.storeId,
      quantity: parseFloat(stockForm.quantity),
      reason: 'adjust',
      note: stockForm.note
    })
  }

  const handleAddItem = () => {
    addItemMutation.mutate({
      storeId: user?.storeId,
      name: addForm.name,
      category: addForm.category,
      type: addForm.type,
      unit: addForm.unit,
      avgCost: parseInt(addForm.avgCost) || 0,
      safetyStock: parseInt(addForm.safetyStock) || 0,
      processRecipeId: addForm.type === 'semi_finished' ? addForm.processRecipeId || null : null
    })
  }

  const handleUpdateItem = () => {
    if (!selectedItem) return
    const data = {
      name: selectedItem.name,
      category: selectedItem.category,
      unit: selectedItem.unit,
      currentStock: parseInt(selectedItem.currentStock) || 0,
      avgCost: parseInt(selectedItem.avgCost) || 0,
      safetyStock: parseInt(selectedItem.safetyStock) || 0
    }
    console.log('Updating inventory:', selectedItem.id, data)
    updateItemMutation.mutate({
      id: selectedItem.id,
      data
    })
  }

  const handleDeleteItem = (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return
    deleteItemMutation.mutate(id)
  }

  const getCategoryName = (code: string) => {
    const cat = categories.find(c => c.code === code || c.id === code)
    return cat?.name || code
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setShowAddItem(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          {t('inventory.addItem')}
        </button>
      </div>

      {/* 分类看板 */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        <div
          onClick={() => setSelectedCategory(null)}
          className={`flex-shrink-0 w-40 p-4 rounded-xl cursor-pointer transition-all border-2 ${
            selectedCategory === null
              ? 'bg-white border-error shadow-sm'
              : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'
          }`}
        >
          <div className="text-center">
            <p className={`text-lg font-bold ${selectedCategory === null ? 'text-error' : 'text-gray-700'}`}>
              All
            </p>
            <p className="text-xs text-gray-400 mt-1">{inventory.length} {t('inventory.items')}</p>
          </div>
        </div>

        {categories.map((cat) => {
          const count = getCategoryItemCount(cat.id)
          return (
            <div
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex-shrink-0 w-40 p-4 rounded-xl cursor-pointer transition-all border-2 ${
                selectedCategory === cat.id
                  ? 'bg-white border-error shadow-sm'
                  : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${selectedCategory === cat.id ? 'text-error' : 'text-gray-700'}`}>
                    {cat.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{count} {t('inventory.items')}</p>
                </div>
                <div className="flex flex-col gap-1 ml-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); openCategoryModal(cat) }}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(t('inventory.deleteCategoryConfirm'))) {
                        handleDeleteCategory(cat.id)
                      }
                    }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {/* 添加分类按钮 */}
        <div
          onClick={() => openCategoryModal()}
          className="flex-shrink-0 w-40 p-4 rounded-xl cursor-pointer transition-all border-2 border-dashed border-gray-200 hover:border-gray-300 hover:shadow-sm flex items-center justify-center"
        >
          <div className="text-center text-gray-400">
            <Plus size={18} className="mx-auto mb-1" />
            <p className="text-xs">{t('inventory.addCategory')}</p>
          </div>
        </div>
      </div>

      {/* Low Stock Alert */}
      {alerts.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center gap-2 text-red-800 font-medium mb-2">
            <AlertTriangle size={20} />
            {t('inventory.lowStockAlert')} ({alerts.length} {t('inventory.items')})
          </div>
          <div className="flex flex-wrap gap-2">
            {alerts.slice(0, 10).map((item: any) => (
              <span key={item.id} className="badge badge-error">
                {item.name}: {item.currentStock} {item.unit}
              </span>
            ))}
            {alerts.length > 10 && <span className="text-red-600 text-sm">+{alerts.length - 10} {t('inventory.moreItems')}</span>}
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search') || 'Search...'}
            className="input pl-10 w-full"
          />
        </div>
        <button
          onClick={() => setLowStockOnly(!lowStockOnly)}
          className={`btn-secondary flex items-center gap-2 ${lowStockOnly ? 'bg-red-50 border-red-200 text-red-600' : ''}`}
        >
          <AlertTriangle size={18} />
          {t('inventory.lowStock') || 'Low Stock'}
        </button>
      </div>

      {/* Inventory Table */}
      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        ) : filteredInventory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <Package size={48} className="mb-2 opacity-50" />
            <p>{t('common.noData')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">{t('inventory.itemName') || 'Name'}</th>
                  <th className="pb-3 font-medium">{t('inventory.category') || 'Category'}</th>
                  <th className="pb-3 font-medium text-right">{t('inventory.currentStock') || 'Current Stock'}</th>
                  <th className="pb-3 font-medium text-right">{t('inventory.unit') || 'Unit'}</th>
                  <th className="pb-3 font-medium text-right">{t('inventory.avgCost') || 'Avg Cost'}</th>
                  <th className="pb-3 font-medium text-right">{t('inventory.safetyStock') || 'Safety Stock'}</th>
                  <th className="pb-3 font-medium text-center">{t('common.actions') || 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((item: any) => {
                  const isLow = item.isLowStock || item.currentStock <= (item.safetyStock || 0)
                  return (
                    <tr key={item.id} className={`border-b last:border-0 hover:bg-gray-50 ${isLow ? 'bg-red-50/30' : ''}`}>
                      <td className="py-3">
                        <span className="font-medium text-gray-900">{item.name}</span>
                        {isLow && <AlertTriangle size={16} className="inline ml-2 text-red-500" />}
                      </td>
                      <td className="py-3 text-gray-600">{getCategoryName(item.category)}</td>
                      <td className="py-3 text-right">
                        <span className={`font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>
                          {item.currentStock}
                        </span>
                      </td>
                      <td className="py-3 text-gray-600">{item.unit}</td>
                      <td className="py-3 text-right">{formatCurrency(item.avgCost)}</td>
                      <td className="py-3 text-right text-gray-500">{item.safetyStock || 0}</td>
                      <td className="py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => { setSelectedItem(item); setShowStockIn(true) }}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                            title={t('inventory.stockIn') || 'Stock In'}
                          >
                            <TrendingUp size={16} />
                          </button>
                          <button
                            onClick={() => { setSelectedItem(item); setShowStockOut(true) }}
                            className="p-1.5 text-orange-600 hover:bg-orange-50 rounded"
                            title={t('inventory.stockOut') || 'Stock Out'}
                          >
                            <TrendingDown size={16} />
                          </button>
                          <button
                            onClick={() => { setSelectedItem({ ...item }); setShowEditItem(true) }}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                            title={t('common.edit') || 'Edit'}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                            title={t('common.delete') || 'Delete'}
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

      {/* Add Item Modal */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{t('inventory.addItem')}</h3>
              <button onClick={() => setShowAddItem(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('inventory.itemName') || 'Item Name'} *</label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm({...addForm, name: e.target.value})}
                  className="input w-full"
                  placeholder={t('inventory.namePlaceholder') || 'e.g. Cream, Syrup'}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('inventory.category') || 'Category'}</label>
                  <select
                    value={addForm.category}
                    onChange={(e) => setAddForm({...addForm, category: e.target.value})}
                    className="input w-full"
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.code || cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('inventory.materialType') || 'Material Type'}</label>
                  <select
                    value={addForm.type}
                    onChange={(e) => setAddForm({...addForm, type: e.target.value})}
                    className="input w-full"
                  >
                    <option value="raw_material">原料(直接使用)</option>
                    <option value="semi_finished">半成品(需加工)</option>
                    <option value="finished_goods">成品</option>
                  </select>
                </div>
              </div>
              {addForm.type === 'semi_finished' && (
                <div>
                  <label className="block text-sm font-medium mb-1">关联加工配方</label>
                  <select
                    value={addForm.processRecipeId}
                    onChange={(e) => setAddForm({...addForm, processRecipeId: e.target.value})}
                    className="input w-full"
                  >
                    <option value="">{t('inventory.selectRecipe') || 'Select Recipe'}</option>
                    {recipes.map((r: any) => (
                      <option key={r.id} value={r.id}>{r.name} → {r.outputName}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('inventory.avgCost') || 'Avg Cost'} (Rp)</label>
                  <input
                    type="number"
                    value={addForm.avgCost}
                    onChange={(e) => setAddForm({...addForm, avgCost: e.target.value})}
                    className="input w-full"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('inventory.safetyStock') || 'Safety Stock'}</label>
                  <input
                    type="number"
                    value={addForm.safetyStock}
                    onChange={(e) => setAddForm({...addForm, safetyStock: e.target.value})}
                    className="input w-full"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleAddItem} className="btn-primary flex-1" disabled={!addForm.name || addItemMutation.isPending}>
                {addItemMutation.isPending ? t('common.loading') : t('common.save')}
              </button>
              <button onClick={() => setShowAddItem(false)} className="btn-secondary flex-1">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {showEditItem && selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{t('common.edit') || 'Edit Item'}</h3>
              <button onClick={() => setShowEditItem(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('inventory.itemName') || 'Item Name'}</label>
                <input
                  type="text"
                  value={selectedItem.name}
                  onChange={(e) => setSelectedItem({...selectedItem, name: e.target.value})}
                  className="input w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('inventory.category') || 'Category'}</label>
                  <select
                    value={selectedItem.category}
                    onChange={(e) => setSelectedItem({...selectedItem, category: e.target.value})}
                    className="input w-full"
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.code || cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('inventory.unit') || 'Unit'}</label>
                  <select
                    value={selectedItem.unit}
                    onChange={(e) => setSelectedItem({...selectedItem, unit: e.target.value})}
                    className="input w-full"
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="L">L</option>
                    <option value="ml">ml</option>
                    <option value="pcs">pcs</option>
                    <option value="bottle">bottle</option>
                    <option value="roll">roll</option>
                    <option value="pack">pack</option>
                    <option value="box">box</option>
                    <option value="set">set</option>
                    <option value="cup">cup</option>
                    <option value="item">item</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('inventory.currentStock') || 'Current Stock'}</label>
                  <input
                    type="number"
                    value={selectedItem.currentStock}
                    onChange={(e) => setSelectedItem({...selectedItem, currentStock: e.target.value})}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('inventory.avgCost') || 'Avg Cost'} (Rp)</label>
                  <input
                    type="number"
                    value={selectedItem.avgCost}
                    onChange={(e) => setSelectedItem({...selectedItem, avgCost: e.target.value})}
                    className="input w-full"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('inventory.safetyStock') || 'Safety Stock'}</label>
                  <input
                    type="number"
                    value={selectedItem.safetyStock}
                    onChange={(e) => setSelectedItem({...selectedItem, safetyStock: e.target.value})}
                    className="input w-full"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleUpdateItem} className="btn-primary flex-1" disabled={updateItemMutation.isPending}>
                {updateItemMutation.isPending ? t('common.loading') : t('common.save')}
              </button>
              <button onClick={() => setShowEditItem(false)} className="btn-secondary flex-1">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock In Modal */}
      {showStockIn && selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{t('inventory.stockIn') || 'Stock In'} - {selectedItem.name}</h3>
              <button onClick={() => setShowStockIn(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('inventory.quantity') || 'Quantity'} ({selectedItem.unit}) *</label>
                <input
                  type="number"
                  value={stockForm.quantity}
                  onChange={(e) => setStockForm({...stockForm, quantity: e.target.value})}
                  className="input w-full"
                  step="0.01"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('inventory.unitCost') || 'Unit Cost'} (Rp)</label>
                <input
                  type="number"
                  value={stockForm.unitCost}
                  onChange={(e) => setStockForm({...stockForm, unitCost: e.target.value})}
                  className="input w-full"
                  placeholder={selectedItem.avgCost}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.note') || 'Note'}</label>
                <input
                  type="text"
                  value={stockForm.note}
                  onChange={(e) => setStockForm({...stockForm, note: e.target.value})}
                  className="input w-full"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleStockIn} className="btn-primary flex-1" disabled={!stockForm.quantity || stockInMutation.isPending}>
                {stockInMutation.isPending ? t('common.loading') : t('inventory.stockIn')}
              </button>
              <button onClick={() => setShowStockIn(false)} className="btn-secondary flex-1">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Out Modal */}
      {showStockOut && selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{t('inventory.stockOut') || 'Stock Out'} - {selectedItem.name}</h3>
              <button onClick={() => setShowStockOut(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('inventory.quantity') || 'Quantity'} ({selectedItem.unit}) *</label>
                <input
                  type="number"
                  value={stockForm.quantity}
                  onChange={(e) => setStockForm({...stockForm, quantity: e.target.value})}
                  className="input w-full"
                  step="0.01"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.note') || 'Note'}</label>
                <input
                  type="text"
                  value={stockForm.note}
                  onChange={(e) => setStockForm({...stockForm, note: e.target.value})}
                  className="input w-full"
                />
              </div>
            </div>
             <div className="flex gap-3 mt-6">
              <button onClick={handleStockOut} className="btn-primary flex-1" disabled={!stockForm.quantity || stockOutMutation.isPending}>
                {stockOutMutation.isPending ? t('common.loading') : t('inventory.stockOut')}
              </button>
              <button onClick={() => setShowStockOut(false)} className="btn-secondary flex-1">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">
                {editingCategory ? t('inventory.editCategory') : t('inventory.addCategory')}
              </h2>
              <button onClick={() => setShowCategoryModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCategorySubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.categoryName')} *
                </label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="input w-full"
                  placeholder={t('inventory.categoryNamePlaceholder')}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.categoryCode')} *
                </label>
                <input
                  type="text"
                  value={categoryForm.code}
                  onChange={(e) => setCategoryForm({ ...categoryForm, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  className="input w-full"
                  placeholder={t('inventory.categoryCodePlaceholder')}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.description')}
                </label>
                <input
                  type="text"
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  className="input w-full"
                  placeholder={t('inventory.descriptionPlaceholder')}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="btn-primary flex-1" disabled={saveCategoryMutation.isPending}>
                  {saveCategoryMutation.isPending ? t('common.loading') : t('common.save')}
                </button>
                <button type="button" onClick={() => setShowCategoryModal(false)} className="btn-secondary flex-1">
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}