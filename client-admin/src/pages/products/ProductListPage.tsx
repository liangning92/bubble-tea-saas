import { notifyAdmin, confirmAdmin } from '../../components/AdminFeedback'
import { AdminDialog } from '../../components/AdminDialog'
import { Link, useNavigate } from 'react-router-dom'
import { ProductImageEditor, ProductPicture } from '../../components/ProductImageEditor'
import { mediaApi } from '../../services/media'
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { productApi, categoryApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { formatCurrency } from '../../utils/helpers'
import { Plus, Edit2, Trash2, Search, Loader2, CheckCircle, } from 'lucide-react'

export function ProductListPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [imagesUploading,setImagesUploading]=useState(false)
  const initialEditState=useRef('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<any>(null)
  const [categoryForm, setCategoryForm] = useState({ name: '' })
  const [images,setImages]=useState<ProductPicture[]>([])
  const [imagesChanged,setImagesChanged]=useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [editForm, setEditForm] = useState({ code: '', name: '', categoryId: '', price: '', description: '', status: 'active' })

  const finishProductSave = async (response: any) => {
    const productId=response.data.data.id
    await Promise.all([['products'],['product',productId],['bom-products'],['bom-product',productId],['display-product-catalog'],['tv-standby-products']].map(queryKey=>queryClient.invalidateQueries({queryKey})))
    setShowEditModal(false)
    setImages([]);setImagesChanged(false);setEditingProduct(null)
    navigate(`/products/recipes?productId=${encodeURIComponent(productId)}`)
  }

  const createProduct = useMutation({
    mutationFn: (data: any) => productApi.create(data),
    onSuccess: finishProductSave,
    onError: (error: any) => {
      console.error('Create product error:', error)
      const msg = error?.response?.data?.message || error?.response?.data?.error || error.message || 'Failed to create product'
      notifyAdmin(msg)
    }
  })

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {await mediaApi.list('product',{pageSize:1});return productApi.list({ pageSize: 500 })}
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
      notifyAdmin(error?.response?.data?.message || error.message || 'Failed to update status')
    }
  })

  const deleteProduct = useMutation({
    mutationFn: (id: string) => productApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (error: any) => {
      console.error('Delete product error:', error)
      notifyAdmin(error?.response?.data?.message || error.message || 'Failed to delete product')
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
      notifyAdmin(error?.response?.data?.message || error.message || 'Failed to create category')
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
      notifyAdmin(error?.response?.data?.message || error.message || 'Failed to update category')
    }
  })

  const deleteCategory = useMutation({
    mutationFn: (id: string) => categoryApi.delete(id),
    onSuccess: () => {
      refetch()
    },
    onError: (error: any) => {
      console.error('Delete category error:', error)
      notifyAdmin(error?.response?.data?.message || error.message || 'Failed to delete category')
    }
  })

  const updateProduct = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => {
      return productApi.update(id, data).then(res => {
        return res
      })
    },
    onSuccess: finishProductSave,
    onError: (error: any) => {
      console.error('Update product error:', error)
      const msg = error?.response?.data?.message || error?.response?.data?.error || error.message || 'Failed to update product'
      notifyAdmin(msg)
    }
  })

  // API: axios response.data = { code, data: { list } }, so data.data.data.list = array
  const products = productsData?.data?.data?.list || []
  const categories = categoriesData?.data?.data || []

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
    return ((price - cost) / price * 100).toFixed(1)
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
    setImages(product.images?.length?product.images:product.image?[{url:product.image}]:[])
    setImagesChanged(false)
    setEditingProduct(product)
    const loadedEditForm = {
      code: product.code || '',
      name: product.name,
      categoryId: product.categoryId || '',
      price: product.specs?.[0]?.price || '',
      description: product.description || '',
      status: product.status || 'active'
    }
    setEditForm(loadedEditForm)
    initialEditState.current=JSON.stringify(loadedEditForm)
    setShowEditModal(true)
  }

  const openAddModal = () => {
    setImages([])
    setImagesChanged(false)
    setEditingProduct(null)
    setEditForm({ code: '', name: '', categoryId: '', price: '', description: '', status: 'active' })
    setShowEditModal(true)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (imagesUploading || updateProduct.isPending || createProduct.isPending) return
    if (editingProduct && imagesChanged && initialEditState.current===JSON.stringify(editForm)) {
      updateProduct.mutate({id:editingProduct.id,data:{mediaIds:images.map(image=>image.mediaId).filter(Boolean)}})
      return
    }

    const price = parseInt(editForm.price) || 0
    const data: any = {
      name: editForm.name,
      description: editForm.description,
      status: editForm.status,
      ...(imagesChanged?{mediaIds:images.map(i=>i.mediaId).filter(Boolean)}:{})
    }
    if (editForm.code?.trim()) {
      data.code = editForm.code.trim().toUpperCase()
    }
    if (editForm.categoryId) {
      data.categoryId = editForm.categoryId
    }
    if (price > 0) {
      const existingSpecs = editingProduct?.specs || []
      data.specs = existingSpecs.length ? existingSpecs.map((spec:any,index:number)=>({
        id:spec.id,name:spec.name || 'Default',price:index===0?price:spec.price,
        priceAdjustment:spec.priceAdjustment ?? 0,isDefault:spec.isDefault
      })) : [{name:'Default',price}]
    }

    if (editingProduct) {
      updateProduct.mutate({ id: editingProduct.id, data })
    } else {
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
                ? 'bg-white border-primary shadow-sm'
                : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'
            }`}
          >
            <div className="text-center">
              <p className={`text-lg font-bold ${selectedCategory === null ? 'text-primary' : 'text-gray-700'}`}>
                {t('common.all')}
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
                    ? 'bg-white border-primary shadow-sm'
                    : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold truncate ${selectedCategory === cat.id ? 'text-primary' : 'text-gray-700'}`}>
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
                      onClick={async (e) => {
                        e.stopPropagation();
                        // Check if there are products in this category
                        const productsInCategory = products.filter((p: any) => p.categoryId === cat.id)
                        if (productsInCategory.length > 0) {
                          notifyAdmin(`${t('categories.hasProducts')} (${productsInCategory.length} ${t('categories.products')})`)
                          return
                        }
                        if (await confirmAdmin(t('common.confirmDelete'))) {
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
            <table className="admin-responsive-table admin-responsive-table w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 pl-3 w-24">{t('products.code')}</th>
                  <th className="pb-3 w-40">{t('products.name')}</th>
                  <th className="pb-3 w-28">{t('products.category')}</th>
                  <th className="text-right tabular-nums pb-3 text-left w-24">{t('products.cost')}</th>
                  <th className="text-right tabular-nums pb-3 text-left w-24">{t('products.price')}</th>
                  <th className="text-right tabular-nums pb-3 text-left w-20">{t('products.margin')}</th>
                  <th className="text-right tabular-nums pb-3 text-left w-24">{t('products.profit')}</th>
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
                      <td className="py-3 pl-3 font-mono text-sm" data-label={t('products.code')}>{product.code || '-'}</td>
                      <td className="py-3 font-medium text-gray-900" data-label={t('products.name')}><Link className="hover:text-primary" to={`/products/recipes?productId=${product.id}`}>{product.name}</Link></td>
                      <td className="py-3 text-gray-600" data-label={t('products.category')}>{getCategoryName(product.categoryId)}</td>
                      <td className="text-right tabular-nums text-right tabular-nums text-right tabular-nums py-3 text-left font-mono" data-label={t('products.cost')}>{formatCurrency(product.costPrice || 0)}</td>
                      <td className="text-right tabular-nums text-right tabular-nums text-right tabular-nums py-3 text-left font-mono" data-label={t('products.price')}>{formatCurrency(product.specs?.[0]?.price || 0)}</td>
                      <td className="text-right tabular-nums text-right tabular-nums py-3 text-left" data-label={t('products.margin')}>
                        {margin !== null ? (
                          <span className={`font-medium ${parseInt(margin) > 50 ? 'text-green-600' : parseInt(margin) > 30 ? 'text-orange-600' : 'text-red-600'}`}>
                            {margin}%
                          </span>
                        ) : '-'}
                      </td>
                      <td className="text-right tabular-nums text-right tabular-nums text-right tabular-nums py-3 text-left font-mono text-gray-600" data-label={t('products.profit')}>
                        {profit !== null ? formatCurrency(profit) : '-'}
                      </td>
                      <td className="py-3 text-center" data-label={t('products.status')}>
                        <button
                          onClick={() => updateStatus.mutate({ id: product.id, status: product.status === 'active' ? 'inactive' : 'active' })}
                          className={`badge cursor-pointer ${product.status === 'active' ? 'badge-success' : 'badge-error'}`}
                        >
                          {product.status === 'active' ? t('products.active') : t('products.inactive')}
                        </button>
                      </td>
                      <td className="py-3 pr-3 text-center" data-label={t('common.edit')}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            aria-label={t('common.edit')}
                            onClick={() => openEditModal(product)}
                            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 inline-block"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={async () => {
                              if (await confirmAdmin(t('common.confirmDelete') )) {
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
        <AdminDialog title={[editingCategory ? t('common.edit') : t('common.add'), t('products.category')].join(" ")} onClose={() => setShowCategoryModal(false)} className="max-w-sm" busy={false} trackChanges chrome>

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
          </AdminDialog>
      )}

      {/* Edit/Add Product Modal */}
      {showEditModal && (
        <AdminDialog title={[editingProduct ? t('common.edit') : t('common.add'), t('products.title')].join(" ")} onClose={() => setShowEditModal(false)} className="max-w-md" busy={Boolean(imagesUploading || updateProduct.isPending || createProduct.isPending)} trackChanges chrome>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('products.name')} *</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('products.code')}</label>
                  <input
                    type="text"
                    value={editForm.code}
                    onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })}
                    className="input w-full"
                    placeholder={editingProduct ? '' : t('products.codePlaceholder')}
                  />
                </div>
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
              <ProductImageEditor onUploadingChange={setImagesUploading} images={images} onChange={next=>{setImages(next);setImagesChanged(true)}} />
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
                            <div className="admin-dialog-footer flex gap-3 mt-6">
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary flex-1" data-dialog-close="true">
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={imagesUploading || updateProduct.isPending || createProduct.isPending}
                >
                  {imagesUploading || updateProduct.isPending || createProduct.isPending ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </AdminDialog>
      )}
    </div>
  )
}
