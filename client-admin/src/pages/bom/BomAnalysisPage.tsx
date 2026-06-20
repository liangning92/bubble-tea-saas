import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { bomApi } from '../../services/api'
import { formatCurrency } from '../../utils/helpers'
import { Loader2, Package, TrendingUp, TrendingDown } from 'lucide-react'

export function BomAnalysisPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'products' | 'materials'>('products')
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [forecastDays, setForecastDays] = useState(30)

  // BOM产品列表
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['bom-products'],
    queryFn: () => bomApi.getProducts()
  })

  // 产品BOM明细
  const { data: productDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['bom-product', selectedProduct?.id],
    queryFn: () => bomApi.getProductDetail(selectedProduct!.id),
    enabled: !!selectedProduct
  })

  // 原料消耗预测
  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ['bom-usage', forecastDays],
    queryFn: () => bomApi.getMaterialUsage(forecastDays)
  })

  const products = productsData?.data?.list || []
  const usageList = usageData?.data || []
  const detail = productDetail?.data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('bom.productCostAnalysis')}</h2>
        <div className="flex gap-2">
          <select
            value={forecastDays}
            onChange={(e) => setForecastDays(parseInt(e.target.value))}
            className="input w-32"
          >
            <option value={7}>{t('bom.days7')}</option>
            <option value={30}>{t('bom.days30')}</option>
            <option value={90}>{t('bom.days90')}</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'products' ? 'bg-white text-primary shadow-sm' : 'text-gray-600'
          }`}
        >
          {t('bom.productCosts')}
        </button>
        <button
          onClick={() => setActiveTab('materials')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'materials' ? 'bg-white text-primary shadow-sm' : 'text-gray-600'
          }`}
        >
          {t('bom.materialForecast')}
        </button>
      </div>

      {/* Products Tab */}
      {activeTab === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Product List */}
          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-4 border-b">
              <h2 className="font-bold">{t('bom.productCostList')} ({products.length})</h2>
            </div>
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {productsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
              ) : products.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Package size={32} className="mx-auto mb-2 opacity-50" />
                  <p>{t('common.noData')}</p>
                </div>
              ) : (
                products.map((product: any) => (
                  <div
                    key={product.id}
                    onClick={() => setSelectedProduct(product)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedProduct?.id === product.id ? 'bg-primary/5 border-l-4 border-l-primary' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-gray-500">{product.code}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">{formatCurrency(product.bomCost)}</p>
                        <p className={`text-xs ${product.profitRate > 50 ? 'text-green-600' : product.profitRate > 30 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {product.profitRate}% {t('products.margin')}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                      <span>{t('products.sellingPrice')}: {formatCurrency(product.sellingPrice)}</span>
                      <span>{t('products.profit')}: {formatCurrency(product.profit)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Product Cost Detail */}
          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-bold">{t('bom.costDetail')}</h2>
              {selectedProduct && (
                <Link
                  to={`/products/${selectedProduct.id}/recipe`}
                  className="text-sm text-primary hover:text-primary-dark flex items-center gap-1"
                >
                  <span>{t('bom.editRecipe')}</span>
                </Link>
              )}
            </div>
            {detailLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : selectedProduct && detail ? (
              <div className="p-4">
                <div className="mb-4">
                  <h3 className="font-bold text-lg">{detail.name}</h3>
                  <p className="text-gray-500">{detail.code}</p>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-sm text-gray-500">{t('products.cost')}</p>
                    <p className="text-xl font-bold text-blue-600">{formatCurrency(detail.totalBomCost)}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-sm text-gray-500">{t('products.sellingPrice')}</p>
                    <p className="text-xl font-bold text-green-600">{formatCurrency(detail.specs?.[0]?.price || 0)}</p>
                  </div>
                </div>

                {/* Pricing with margins */}
                {detail.suggestedPrices && detail.suggestedPrices.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-gray-500 mb-2">{t('products.pricing')}</h4>
                    <div className="space-y-2">
                      {detail.suggestedPrices.map((spec: any) => (
                        <div key={spec.specId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="font-medium">{spec.specName}</span>
                          <div className="text-right">
                            <div className="flex items-center gap-2">
                              <span className="font-bold">{formatCurrency(spec.price)}</span>
                              {spec.profitRate > 50 ? (
                                <TrendingUp size={16} className="text-green-600" />
                              ) : spec.profitRate < 30 ? (
                                <TrendingDown size={16} className="text-red-600" />
                              ) : null}
                            </div>
                            <div className="text-xs text-gray-500">
                              {t('products.cost')}: {formatCurrency(spec.cost)} | {t('products.profit')}: {formatCurrency(spec.profit)} ({spec.profitRate}%)
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* BOM Items */}
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-2">
                    {t('products.bomItems')} ({detail.bomDetails?.length || 0})
                  </h4>
                  {detail.bomDetails && detail.bomDetails.length > 0 ? (
                    <div className="space-y-2">
                      {detail.bomDetails.map((item: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-xs text-gray-500">
                              {item.quantity} {item.unit} × {formatCurrency(item.costPerUnit)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{formatCurrency(item.totalCost)}</p>
                            <p className="text-xs text-gray-500">
                              {detail.totalBomCost > 0 ? ((item.totalCost / detail.totalBomCost) * 100).toFixed(1) : 0}%
                            </p>
                          </div>
                        </div>
                      ))}
                      {/* Total */}
                      <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg font-bold">
                        <span>{t('products.totalCost')}</span>
                        <span className="text-primary">{formatCurrency(detail.totalBomCost)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Package size={32} className="mx-auto mb-2 opacity-50" />
                      <p>{t('products.noBom')}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <Package size={48} className="mb-4 opacity-50" />
                <p>{t('bom.selectProduct')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Materials Tab */}
      {activeTab === 'materials' && (
        <div className="card">
          <h3 className="font-semibold mb-4">{t('bom.materialForecast')} ({forecastDays}{t('bom.days')})</h3>
          {usageLoading ? (
            <div className="text-center py-8"><Loader2 className="animate-spin mx-auto" size={32} /></div>
          ) : usageList.length === 0 ? (
            <div className="text-center text-gray-500 py-8">{t('common.noData')}</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3">{t('inventory.itemName')}</th>
                  <th className="pb-3 text-right">{t('bom.currentStock')}</th>
                  <th className="pb-3 text-right">{t('bom.dailyUsage')}</th>
                  <th className="pb-3 text-right">{t('bom.totalUsage')}</th>
                  <th className="pb-3 text-right">{t('bom.daysLeft')}</th>
                  <th className="pb-3 text-right">{t('bom.suggestOrder')}</th>
                </tr>
              </thead>
              <tbody>
                {usageList.map((item: any) => (
                  <tr key={item.inventoryId} className="border-b border-border">
                    <td className="py-3">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.unit}</div>
                    </td>
                    <td className="py-3 text-right">{item.currentStock}</td>
                    <td className="py-3 text-right">{item.dailyUsage.toFixed(2)}</td>
                    <td className="py-3 text-right">{item.totalUsage}</td>
                    <td className="py-3 text-right">
                      {item.daysUntilStockOut !== null ? (
                        <span className={item.daysUntilStockOut <= 7 ? 'text-red-500 font-medium' : 'text-gray-600'}>
                          {item.daysUntilStockOut} {t('bom.days')}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="py-3 text-right">
                      {item.suggestedReorderQty ? (
                        <span className="text-orange-500 font-medium">
                          {item.suggestedReorderQty} {item.unit}
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}