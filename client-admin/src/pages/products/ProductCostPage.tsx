import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { bomApi } from '../../services/api'
import { formatCurrency } from '../../utils/helpers'
import { Calculator, Package, Loader2, TrendingUp, TrendingDown } from 'lucide-react'

interface ProductCost {
  id: string
  name: string
  code: string
  category?: string
  sellingPrice: number
  bomCost: number
  profit: number
  profitRate: number
  bomItemCount: number
}

interface ProductDetail {
  id: string
  name: string
  code: string
  specs: Array<{
    id: string
    name: string
    price: number
  }>
  bomDetails: Array<{
    inventoryId: string
    name: string
    unit: string
    quantity: number
    costPerUnit: number
    totalCost: number
  }>
  totalBomCost: number
  suggestedPrices: Array<{
    specId: string
    specName: string
    price: number
    cost: number
    profit: number
    profitRate: number
  }>
}

export function ProductCostPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [products, setProducts] = useState<ProductCost[]>([])
  const [selectedProduct, setSelectedProduct] = useState<ProductDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)

  useEffect(() => {
    loadProducts()
  }, [user])

  const loadProducts = async () => {
    setIsLoading(true)
    try {
      const response = await bomApi.getProducts()
      if (response.data?.data?.list) {
        setProducts(response.data.data.list.filter((p: any) => p.bomItemCount > 0))
      }
    } catch (error) {
      console.error('Failed to load products:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadProductDetail = async (productId: string) => {
    setIsLoadingDetail(true)
    try {
      const response = await bomApi.getProductDetail(productId)
      if (response.data?.data) {
        setSelectedProduct(response.data.data)
      }
    } catch (error) {
      console.error('Failed to load product detail:', error)
    } finally {
      setIsLoadingDetail(false)
    }
  }

  const handleSelectProduct = (product: ProductCost) => {
    loadProductDetail(product.id)
  }

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Product List */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-4 border-b">
            <h2 className="font-bold">{t('products.title')} ({products.length})</h2>
          </div>
          <div className="divide-y max-h-[600px] overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : products.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Calculator size={32} className="mx-auto mb-2 opacity-50" />
                <p>{t('common.noData')}</p>
              </div>
            ) : (
              products.map((product) => (
                <div
                  key={product.id}
                  onClick={() => handleSelectProduct(product)}
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
          <div className="p-4 border-b">
            <h2 className="font-bold">{t('products.costDetail')}</h2>
          </div>
          {isLoadingDetail ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : selectedProduct ? (
            <div className="p-4">
              <div className="mb-4">
                <h3 className="font-bold text-lg">{selectedProduct.name}</h3>
                <p className="text-gray-500">{selectedProduct.code}</p>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">{t('products.cost')}</p>
                  <p className="text-xl font-bold text-blue-600">{formatCurrency(selectedProduct.totalBomCost)}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">{t('products.sellingPrice')}</p>
                  <p className="text-xl font-bold text-green-600">{formatCurrency(selectedProduct.specs[0]?.price || 0)}</p>
                </div>
              </div>

              {/* Pricing with margins */}
              {selectedProduct.suggestedPrices && selectedProduct.suggestedPrices.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-500 mb-2">{t('products.pricing')}</h4>
                  <div className="space-y-2">
                    {selectedProduct.suggestedPrices.map((spec) => (
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
                  {t('products.bomItems')} ({selectedProduct.bomDetails.length})
                </h4>
                {selectedProduct.bomDetails.length > 0 ? (
                  <div className="space-y-2">
                    {selectedProduct.bomDetails.map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-gray-500">
                            {item.quantity} {item.unit} × {formatCurrency(item.costPerUnit)}/{item.unit}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{formatCurrency(item.totalCost)}</p>
                          <p className="text-xs text-gray-500">
                            {selectedProduct.totalBomCost > 0 ? ((item.totalCost / selectedProduct.totalBomCost) * 100).toFixed(1) : 0}%
                          </p>
                        </div>
                      </div>
                    ))}
                    {/* Total */}
                    <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg font-bold">
                      <span>{t('products.totalCost')}</span>
                      <span className="text-primary">{formatCurrency(selectedProduct.totalBomCost)}</span>
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
              <Calculator size={48} className="mb-4 opacity-50" />
              <p>{t('products.selectProduct')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}