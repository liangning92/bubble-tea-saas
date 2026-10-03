import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { bomApi } from '../../services/api'
import { formatCurrency, formatItemName } from '../../utils/helpers'
import { Loader2, Package, Search, Edit3 } from 'lucide-react'

export function BomAnalysisPage() {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState<'products' | 'materials'>('products')
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [forecastDays, setForecastDays] = useState(30)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // BOM products list
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['bom-products'],
    queryFn: () => bomApi.getProducts()
  })

  // Selected product BOM detail
  const { data: productDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['bom-product', selectedProduct?.id],
    queryFn: () => bomApi.getProductDetail(selectedProduct!.id),
    enabled: !!selectedProduct?.id
  })

  // Material usage forecast
  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ['bom-usage', forecastDays],
    queryFn: () => bomApi.getMaterialUsage(forecastDays)
  })

  const products = useMemo(() => productsData?.data?.data?.list || [], [productsData])
  const usageList = usageData?.data?.data || []
  const detail = productDetail?.data?.data

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

  // Auto-select first product
  useEffect(() => {
    if (!selectedProduct && filteredProducts.length > 0) {
      setSelectedProduct(filteredProducts[0])
    }
  }, [filteredProducts, selectedProduct])

  const sellingPrice = detail?.specs?.[0]?.price || selectedProduct?.sellingPrice || 0
  const bomCost = detail?.totalBomCost || selectedProduct?.bomCost || 0
  const grossProfit = sellingPrice - bomCost
  const profitRate = sellingPrice > 0 ? Math.round((grossProfit / sellingPrice) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {t('products.recipeAndCost')}
          </h1>
        </div>

        {activeTab === 'materials' && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600">{t('bom.forecastPeriod')}:</span>
            <select
              value={forecastDays}
              onChange={(e) => setForecastDays(parseInt(e.target.value))}
              className="input w-36"
            >
              <option value={7}>{t('bom.days7')}</option>
              <option value={30}>{t('bom.days30')}</option>
              <option value={90}>{t('bom.days90')}</option>
            </select>
          </div>
        )}
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm inline-flex overflow-x-auto max-w-full">
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'products' ? 'bg-primary text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {t('bom.productCosts')}
        </button>
        <button
          onClick={() => setActiveTab('materials')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'materials' ? 'bg-primary text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {t('bom.materialForecast')}
        </button>
      </div>

      {/* Products Tab Content */}
      {activeTab === 'products' && (
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
                  const isSelected = selectedProduct?.id === product.id
                  const hasBom = product.bomItemCount > 0

                  return (
                    <div
                      key={product.id}
                      onClick={() => setSelectedProduct(product)}
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
            {selectedProduct && (
              <div className="card p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {selectedProduct.name}
                  </h2>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">
                    {t('bom.productCode')}: {selectedProduct.code}
                  </p>
                </div>

                <Link
                  to={`/products/${selectedProduct.id}/recipe`}
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                >
                  <Edit3 size={16} />
                  <span>{t('bom.editRecipe')}</span>
                </Link>
              </div>
            )}

            {detailLoading ? (
              <div className="card flex justify-center py-24">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : selectedProduct && detail ? (
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
                        to={`/products/${selectedProduct.id}/recipe`}
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

      {/* Materials Forecast Tab Content */}
      {activeTab === 'materials' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900">
              {t('bom.materialForecast')} ({forecastDays} {t('bom.days')})
            </h3>
          </div>

          {usageLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : usageList.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              {t('common.noData')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b">
                    <th className="pb-3 font-medium min-w-[200px]">{t('inventory.itemName')}</th>
                    <th className="pb-3 font-medium whitespace-nowrap text-right">{t('inventory.currentStock')}</th>
                    <th className="pb-3 font-medium whitespace-nowrap text-right">{t('bom.dailyUsage')}</th>
                    <th className="pb-3 font-medium whitespace-nowrap text-right">{t('bom.totalUsage')}</th>
                    <th className="pb-3 font-medium whitespace-nowrap text-right">{t('bom.daysLeft')}</th>
                    <th className="pb-3 font-medium whitespace-nowrap text-right">{t('bom.suggestOrder')}</th>
                  </tr>
                </thead>
                <tbody>
                  {usageList.map((item: any, idx: number) => (
                    <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 text-sm font-medium text-gray-900">
                        {formatItemName(item.name, i18n.language)}
                      </td>
                      <td className="py-3 text-sm text-right whitespace-nowrap">
                        {item.currentStock} {item.unit}
                      </td>
                      <td className="py-3 text-sm text-right whitespace-nowrap text-gray-600">
                        {item.dailyUsage} {item.unit}
                      </td>
                      <td className="py-3 text-sm text-right whitespace-nowrap font-medium text-gray-900">
                        {item.totalUsage} {item.unit}
                      </td>
                      <td className="py-3 text-sm text-right whitespace-nowrap">
                        <span className={`badge ${item.daysLeft <= 7 ? 'badge-error' : item.daysLeft <= 15 ? 'badge-warning' : 'badge-success'}`}>
                          {item.daysLeft} {t('bom.days')}
                        </span>
                      </td>
                      <td className="py-3 text-sm text-right whitespace-nowrap font-medium text-primary">
                        {item.suggestedOrder > 0 ? `${item.suggestedOrder} ${item.unit}` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}