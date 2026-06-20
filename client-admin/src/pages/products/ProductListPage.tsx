import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { productApi, categoryApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { formatCurrency } from '../../utils/helpers'
import { Plus, Edit2, Trash2, Search, Loader2, CheckCircle, X } from 'lucide-react'

export function ProductListPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<any>(null)
  const [categoryForm, setCategoryForm] = useState({ name: '' })
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [editForm, setEditForm] = useState({ name: '', categoryId: '', price: '', description: '', status: 'active' })

  const createProduct = useMutation({
    mutationFn: (data: any) => productApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setShowEditModal(false)
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 2000)
    },
    onError: (error: any) => {
      console.error('Create product error:', error)
      const msg = error?.response?.data?.message || error?.response?.data?.error || error.message || 'Failed to create product'
      alert(msg)
    }
  })

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => productApi.list({ pageSize: 500 })
  })

  const { data: categoriesData, refetch } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoryApi.list()
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      productApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 2000)
    },
    onError: (error: any) => {
      console.error('Update status error:', error)
      alert(error?.response?.data?.message || error.message || 'Failed to update status')
    }
  })

  const deleteProduct = useMutation({
    mutationFn: (id: string) => productApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (error: any) => {
      console.error('Delete product error:', error)
      alert(error?.response?.data?.message || error.message || 'Failed to delete product')
    }
  })

  const createCategory = useMutation({
    mutationFn: (data: any) => categoryApi.create(data),
    onSuccess: () => {
      refetch()
      setShowCategoryModal(false)
      setCategoryForm({ name: '' })
    },
    onError: (error: any) => {
      console.error('Create category error:', error)
      alert(error?.response?.data?.message || error.message || 'Failed to create category')
    }
  })

  const updateCategory = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => categoryApi.update(id, data),
    onSuccess: () => {
      refetch()
      setShowCategoryModal(false)
      setEditingCategory(null)
      setCategoryForm({ name: '' })
    },
    onError: (error: any) => {
      console.error('Update category error:', error)
      alert(error?.response?.data?.message || error.message || 'Failed to update category')
    }
  })

  const deleteCategory = useMutation({
    mutationFn: (id: string) => categoryApi.delete(id),
    onSuccess: () => {
      refetch()
    },
    onError: (error: any) => {
      console.error('Delete category error:', error)
      alert(error?.response?.data?.message || error.message || 'Failed to delete category')
    }
  })

  const updateProduct = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => {
      console.log('updateProduct API called with:', id, data)
      return productApi.update(id, data).then(res => {
        console.log('updateProduct API response:', res)
        return res
      })
    },
    onSuccess: (res) => {
      console.log('Update success callback:', res)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setShowEditModal(false)
      setEditingProduct(null)
    },
    onError: (error: any) => {
      console.error('Update product error:', error)
      const msg = error?.response?.data?.message || error?.response?.data?.error || error.message || 'Failed to update product'
      alert(msg)
    }
  })

  const products = productsData?.data?.list || []
  const categories = categoriesData?.data?.list || Array.isArray(categoriesData?.data) ? categoriesData?.data : []

  const filteredProducts = products.filter((p: any) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.code?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || p.status === statusFilter
    const matchCategory = !selectedCategory || p.categoryId === selectedCategory
    return matchSearch && matchStatus && matchCategory
  })

  const getCategoryName = (categoryId: string) => {
    const cat = categories.find((c: any) => c.id === categoryId)
    return cat?.name || '-'
  }

  const getCategoryProductCount = (categoryId: string) => {
    return products.filter((p: any) => p.categoryId === categoryId).length
  }

  const calculateMargin = (product: any) => {
    const cost = product.costPrice || 0
    const price = product.specs?.[0]?.price || 0
    if (!cost || !price) return null
    return ((price - cost) / price * 100).toFixed(0)
  }

  const calculateProfit = (product: any) => {
    const cost = product.costPrice || 0
    const price = product.specs?.[0]?.price || 0
    return price - cost
  }

  const openCategoryModal = (cat?: any) => {
    if (cat) {
      setEditingCategory(cat)
      setCategoryForm({ name: cat.name })
    } else {
      setEditingCategory(null)
      setCategoryForm({ name: '' })
    }
    setShowCategoryModal(true)
  }

  const handleCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingCategory) {
      updateCategory.mutate({ id: editingCategory.id, data: categoryForm })
    } else {
      createCategory.mutate({ ...categoryForm, storeId: user?.storeId })
    }
  }

  const openEditModal = (product: any) => {
    setEditingProduct(product)
    setEditForm({
      name: product.name,
      categoryId: product.categoryId || '',
      price: product.specs?.[0]?.price || '',
      description: product.description || '',
      status: product.status || 'active'
    })
    setShowEditModal(true)
  }

  const openAddModal = () => {
    setEditingProduct(null)
    setEditForm({ name: '', categoryId: '', price: '', description: '', status: 'active' })
    setShowEditModal(true)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('=== handleEditSubmit called ===')
    console.log('editingProduct:', editingProduct)
    console.log('editForm:', editForm)

    const price = parseInt(editForm.price) || 0
    const data: any = {
      name: editForm.name,
      description: editForm.description,
      status: editForm.status
    }
    if (editForm.categoryId) {
      data.categoryId = editForm.categoryId
    }
    if (price > 0) {
      data.specs = [{ name: 'Default', price }]
    }
    console.log('Final data to submit:', data)

    if (editingProduct) {
      console.log('Calling updateProduct.mutate with id:', editingProduct.id)
      updateProduct.mutate({ id: editingProduct.id, data })
    } else {
      console.log('Calling createProduct.mutate')
      createProduct.mutate({ ...data, storeId: user?.storeId })
    }
  }

  return (
    <div className="relative">
      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50 animate-pulse">
          <CheckCircle size={18} />
          <span>{t('common.success')}</span>
        </div>
      )}

      {/* Category Kanban -看板风格 */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => openCategoryModal()}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            {t('categories.addCategory')}
          </button>
        </div>

        {/* 分类看板 */}
        <div className="flex gap-3 overflow-x-auto pb-2">
          {/* 全部 */}
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
              <p className="text-xs text-gray-400 mt-1">{products.length} {t('categories.products')}</p>
            </div>
          </div>

          {/* 分类卡片 */}
          {categories.map((cat: any) => {
            const count = getCategoryProductCount(cat.id)
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
                    <p className="text-xs text-gray-400 mt-1">{count} {t('categories.products')}</p>
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
                        if (confirm(t('common.confirmDelete'))) {
                          deleteCategory.mutate(cat.id)
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

          {/* 空状态引导添加 */}
          {categories.length === 0 && (
            <div className="flex-shrink-0 w-40 p-4 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <p className="text-sm">{t('common.noData')}</p>
             </div>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4 items-center">
        <button onClick={openAddModal} className="btn-primary flex items-center gap-2">
          <Plus size={20} /> {t('products.addProduct')}
        </button>
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')}
            className="input pl-10 w-full"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-32"
        >
          <option value="">{t('common.all')} {t('products.status')}</option>
          <option value="active">{t('products.active')}</option>
          <option value="inactive">{t('products.inactive')}</option>
        </select>
      </div>

      {/* Product Table */}
      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">{t('common.noData')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 pl-3 w-24">{t('products.code')}</th>
                  <th className="pb-3 w-40">{t('products.name')}</th>
                  <th className="pb-3 w-28">{t('products.category')}</th>
                  <th className="pb-3 text-left w-24">{t('products.cost')}</th>
                  <th className="pb-3 text-left w-24">{t('products.price')}</th>
                  <th className="pb-3 text-left w-20">{t('products.margin')}</th>
                  <th className="pb-3 text-left w-24">{t('products.profit')}</th>
                  <th className="pb-3 text-center w-20">{t('products.status')}</th>
                  <th className="pb-3 pr-3 text-center w-24">{t('common.edit')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product: any) => {
                  const margin = calculateMargin(product)
                  const profit = calculateProfit(product)
                  return (
                    <tr key={product.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 pl-3 font-mono text-sm">{product.code || '-'}</td>
                      <td className="py-3 font-medium text-gray-900">{product.name}</td>
                      <td className="py-3 text-gray-600">{getCategoryName(product.categoryId)}</td>
                      <td className="py-3 text-left font-mono">{formatCurrency(product.costPrice || 0)}</td>
                      <td className="py-3 text-left font-mono">{formatCurrency(product.specs?.[0]?.price || 0)}</td>
                      <td className="py-3 text-left">
                        {margin !== null ? (
                          <span className={`font-medium ${parseInt(margin) > 50 ? 'text-green-600' : parseInt(margin) > 30 ? 'text-orange-600' : 'text-red-600'}`}>
                            {margin}%
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-3 text-left font-mono text-gray-600">
                        {profit !== null ? formatCurrency(profit) : '-'}
                      </td>
                      <td className="py-3 text-center">
                        <button
                          onClick={() => updateStatus.mutate({ id: product.id, status: product.status === 'active' ? 'inactive' : 'active' })}
                          className={`badge cursor-pointer ${product.status === 'active' ? 'badge-success' : 'badge-error'}`}
                        >
                          {product.status === 'active' ? t('products.active') : t('products.inactive')}
                        </button>
                      </td>
                      <td className="py-3 pr-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEditModal(product)}
                            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 inline-block"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(t('common.confirmDelete') )) {
                                deleteProduct.mutate(product.id)
                              }
                            }}
                            className="p-2 rounded-lg hover:bg-red-50 text-red-600 inline-block"
                          >
                            <Trash2 size={18} />
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

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">
                {editingCategory ? t('common.edit') : t('common.add')} {t('products.category') }
              </h2>
              <button onClick={() => setShowCategoryModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCategorySubmit} className="flex gap-2">
              <input
                type="text"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ name: e.target.value })}
                placeholder={t('products.categoryName') }
                className="input flex-1"
                required
              />
              <button type="submit" className="btn-primary">
                {t('common.save')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit/Add Product Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">{editingProduct ? t('common.edit') : t('common.add')} {t('products.title')}</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('products.name') } *</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('products.category') }</label>
                <select
                  value={editForm.categoryId}
                  onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">-- {t('common.select')} --</option>
                  {categories.map((cat: any) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('products.price') }</label>
                <input
                  type="number"
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('products.description') }</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="input w-full"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('products.status') }</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="input w-full"
                >
                  <option value="active">{t('products.active') }</option>
                  <option value="inactive">{t('products.inactive') }</option>
                </select>
              </div>
                            <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={updateProduct.isPending || createProduct.isPending}
                  onClick={() => console.log('Submit button clicked, editingProduct:', editingProduct, 'form:', editForm)}
                >
                  {updateProduct.isPending || createProduct.isPending ? t('common.loading') : t('common.save')}
                </button>
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary flex-1">
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
