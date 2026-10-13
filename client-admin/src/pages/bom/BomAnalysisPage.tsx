import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ProductImageGallery } from '../../components/ProductImageGallery'
import { bomApi } from '../../services/api'
import { formatCurrency, formatItemName } from '../../utils/helpers'
import { Loader2, Package, Search, Edit3 } from 'lucide-react'

export function BomAnalysisPage() {
  const { t, i18n } = useTranslation()
  const [searchParams,setSearchParams]=useSearchParams()
  const requestedProductId=searchParams.get('productId')
  const [specId,setSpecId]=useState('')
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // BOM products list
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['bom-products'],
    queryFn: () => bomApi.getProducts()
  })

  // Selected product BOM detail
  const { data: productDetail, isLoading: detailLoading, isError: detailError, refetch: refetchDetail } = useQuery({
    queryKey: ['bom-product', requestedProductId||selectedProduct?.id],
    queryFn: () => bomApi.getProductDetail(requestedProductId||selectedProduct!.id),
    enabled: !!(requestedProductId||selectedProduct?.id)
  })

  const products = useMemo(() => productsData?.data?.data?.list || [], [productsData])
  const detail = productDetail?.data?.data
  const currentProduct=requestedProductId?(selectedProduct?.id===requestedProductId?selectedProduct:detail?.id===requestedProductId?detail:null):selectedProduct

  // Extract all categories
  const categories = useMemo(() => {
    const set = new Set<string>()
    products.forEach((p: any) => {
      if (p.category) set.add(p.category)
    })
    return Array.from(set)
  }, [products])

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter((p: any) => {
      const matchSearch =
        !searchTerm.trim() ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code?.toLowerCase().includes(searchTerm.toLowerCase())
      const matchCategory = selectedCategory === 'all' || p.category === selectedCategory
      return matchSearch && matchCategory
    })
  }, [products, searchTerm, selectedCategory])

  useEffect(() => {
    const requested=searchParams.get('productId')
    const match=products.find((p:any)=>p.id===requested)
    if(requested) setSelectedProduct(match||null)
    else if(!selectedProduct || !filteredProducts.some((p:any)=>p.id===selectedProduct.id))setSelectedProduct(filteredProducts[0]||null)
  },[filteredProducts,searchParams])
  useEffect(()=>{setSpecId('')},[selectedProduct?.id])
  const images=detail?.images?.length?detail.images:detail?.image?[{url:detail.image}]:[]
  const selectedSpec=detail?.specs?.find((s:any)=>s.id===specId)||detail?.specs?.find((s:any)=>s.isDefault)||detail?.specs?.[0]
  const sellingPrice = selectedSpec?.price ?? currentProduct?.sellingPrice ?? 0
  const bomCost = detail?.totalBomCost ?? currentProduct?.bomCost ?? 0
  const grossProfit = sellingPrice - bomCost
  const profitRate = sellingPrice > 0 ? Math.round((grossProfit / sellingPrice) * 100) : 0

  return (
    <div className="space-y-6">
      {detailError&&<p className="text-red-600" role="alert">{t('media.failed')} <button type="button" className="btn" onClick={()=>refetchDetail()}>{t('media.retry')}</button></p>}
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {t('products.recipeAndCost')}
          </h1>
        </div>

      </div>

      {/* Products Tab Content */}
      {(
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Product List */}
          <div className="lg:col-span-4 space-y-4">
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">
                  {t('bom.productList')} ({filteredProducts.length}/{products.length})
                </span>
                <span className="text-xs text-gray-500">
                  {products.filter((p: any) => p.bomItemCount > 0).length} {t('bom.configuredCount')}
                </span>
              </div>

              {/* Search */}
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('common.search')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input pl-10 w-full"
                />
              </div>

              {/* Categories */}
              <div className="flex gap-1 overflow-x-auto pb-1 text-xs">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                    selectedCategory === 'all'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {t('common.all')}
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                      selectedCategory === cat
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Items List */}
            <div className="card p-0 overflow-hidden divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
              {productsLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Package size={36} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{t('bom.noMatchingProduct')}</p>
                </div>
              ) : (
                filteredProducts.map((product: any) => {
                  const isSelected = currentProduct?.id === product.id
                  const hasBom = product.bomItemCount > 0

                  return (
                    <div
                      key={product.id}
                      onClick={() => {setSelectedProduct(product);setSearchParams({productId:product.id})}}
                      className={`p-4 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-primary/10 border-l-4 border-l-primary'
                          : 'hover:bg-gray-50 border-l-4 border-l-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">
                            {product.name}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="font-mono text-xs text-gray-500">
                              {product.code}
                            </span>
                            {hasBom ? (
                              <span className="badge badge-success text-[11px]">
                                {product.bomItemCount} {t('bom.items')}
                              </span>
                            ) : (
                              <span className="badge text-[11px]">
                                {t('bom.unconfigured')}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-gray-900 text-sm">
                            {formatCurrency(product.sellingPrice)}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {t('bom.cost')}: <span className="font-medium text-gray-900">{formatCurrency(product.bomCost)}</span>
                          </p>
                          <p className="text-xs font-medium text-green-600 mt-0.5">
                            {t('bom.profitMargin')}: {product.profitRate}%
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Right Column: Recipe Details */}
          <div className="lg:col-span-8 space-y-6">
            {currentProduct && (
              <div className="card p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {currentProduct.name}
                  </h2>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">
                    {t('bom.productCode')}: {currentProduct.code}
                  </p>
                </div>

                <Link
                  to={`/products/${currentProduct.id}/recipe`}
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                >
                  <Edit3 size={16} />
                  <span>{t('bom.editRecipe')}</span>
                </Link>
              </div>
            )}

            {currentProduct && <div className="card space-y-3">
              {images.length ? <ProductImageGallery key={currentProduct.id} images={images} name={currentProduct.name} /> : <p className="text-sm text-gray-400">{detailLoading ? t('common.loading') : t('media.noImage')}</p>}
              {!!detail?.specs?.length && <select aria-label={t('insights.specs')} className="input w-auto" value={selectedSpec?.id||''} onChange={e=>setSpecId(e.target.value)}>{detail.specs.map((spec:any)=><option key={spec.id} value={spec.id}>{spec.name}</option>)}</select>}
              <Link className="text-primary text-sm" to={`/products/${currentProduct.id}/edit`}>{t('common.edit')}</Link>
            </div>}

            {detailLoading ? (
              <div className="card flex justify-center py-24">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : currentProduct && detail ? (
              <div className="space-y-6">
                {/* 3 Standard KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="card p-4">
                    <p className="text-sm text-gray-500 font-medium">{t('bom.totalBomCost')}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {formatCurrency(detail.totalBomCost)}
                    </p>
                  </div>

                  <div className="card p-4">
                    <p className="text-sm text-gray-500 font-medium">{t('bom.sellingPrice')}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {formatCurrency(sellingPrice)}
                    </p>
                  </div>

                  <div className="card p-4">
                    <p className="text-sm text-gray-500 font-medium">{t('bom.grossProfit')}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {formatCurrency(grossProfit)} <span className="text-sm font-normal text-green-600">({profitRate}%)</span>
                    </p>
                  </div>
                </div>

                {/* Recipe Ingredients Table */}
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-gray-900">
                      {t('bom.recipeIngredients')}
                    </h3>
                    <span className="badge badge-info">
                      {detail.bomDetails?.length || 0} {t('bom.items')}
                    </span>
                  </div>

                  {detail.bomDetails && detail.bomDetails.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-sm text-gray-500 border-b">
                            <th className="pb-3 font-medium min-w-[200px]">{t('inventory.itemName')}</th>
                            <th className="pb-3 font-medium whitespace-nowrap">{t('inventory.category')}</th>
                            <th className="pb-3 font-medium whitespace-nowrap text-right">{t('bom.quantity')}</th>
                            <th className="pb-3 font-medium whitespace-nowrap text-right">{t('bom.costPerUnit')}</th>
                            <th className="pb-3 font-medium whitespace-nowrap text-right">{t('bom.totalItemCost')}</th>
                            <th className="pb-3 font-medium whitespace-nowrap text-right">{t('bom.costRatio')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.bomDetails.map((item: any, idx: number) => {
                            const ratio =
                              detail.totalBomCost > 0
                                ? ((item.totalCost / detail.totalBomCost) * 100).toFixed(1)
                                : '0'
                            const isSemi = item.inventoryType === 'semi_finished'

                            return (
                              <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                                <td className="py-3 text-sm font-medium text-gray-900">
                                  {formatItemName(item.name, i18n.language)}
                                </td>
                                <td className="py-3 text-sm whitespace-nowrap">
                                  <span className={`badge ${isSemi ? 'badge-success' : 'badge-info'}`}>
                                    {isSemi ? t('inventory.semiFinished') : t('inventory.rawMaterial')}
                                  </span>
                                </td>
                                <td className="py-3 text-sm text-right whitespace-nowrap font-medium">
                                  {item.quantity} {item.unit}
                                </td>
                                <td className="py-3 text-sm text-right whitespace-nowrap text-gray-500">
                                  {formatCurrency(item.costPerUnit)}/{item.unit}
                                </td>
                                <td className="py-3 text-sm text-right whitespace-nowrap font-medium text-gray-900">
                                  {formatCurrency(item.totalCost)}
                                </td>
                                <td className="py-3 text-sm text-right whitespace-nowrap">
                                  <span className="font-medium text-gray-700">{ratio}%</span>
                                  <div className="w-12 bg-gray-100 rounded-full h-1.5 inline-block ml-2 overflow-hidden align-middle">
                                    <div
                                      className="bg-primary h-full rounded-full"
                                      style={{ width: `${ratio}%` }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t font-bold text-gray-900 text-sm">
                            <td colSpan={4} className="py-3 text-right pr-4">
                              {t('bom.totalCost')}:
                            </td>
                            <td className="py-3 text-right">
                              {formatCurrency(detail.totalBomCost)}
                            </td>
                            <td className="py-3 text-right">100%</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <p className="text-sm">{t('bom.noMaterials')}</p>
                      <Link
                        to={`/products/${currentProduct.id}/recipe`}
                        className="btn btn-primary btn-sm mt-3 inline-flex items-center gap-1.5"
                      >
                        <Edit3 size={16} />
                        <span>{t('bom.editRecipe')}</span>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="card text-center py-16 text-gray-500">
                <Package size={48} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">{t('bom.selectProductHint')}</p>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
