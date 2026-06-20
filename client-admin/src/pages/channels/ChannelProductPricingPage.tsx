import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { channelApi } from '../../services/api'
import { formatCurrency } from '../../utils/helpers'
import { Loader2, Search, Settings } from 'lucide-react'

export function ChannelProductPricingPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [selectedChannel, setSelectedChannel] = useState<string>('')
  const [search, setSearch] = useState('')

  // Get all channels
  const { data: channelsData } = useQuery({
    queryKey: ['channels', user?.storeId],
    queryFn: () => channelApi.list(user?.storeId ?? undefined)
  })

  const channels = channelsData?.data?.data?.list || []

  // Get products with channel prices
  const { data: productsData, isLoading } = useQuery({
    queryKey: ['channel-products', selectedChannel],
    queryFn: () => channelApi.getProductPrices(selectedChannel),
    enabled: !!selectedChannel
  })

  const products = productsData?.data?.data?.list || []

  const updateMutation = useMutation({
    mutationFn: ({ productId, priceAdjustment, enabled }: any) =>
      channelApi.setProductPrice(selectedChannel, productId, { priceAdjustment, enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-products', selectedChannel] })
    }
  })

  const bulkAdjustMutation = useMutation({
    mutationFn: (percent: number) =>
      channelApi.bulkAdjust(selectedChannel, { percent }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-products', selectedChannel] })
    }
  })

  const filteredProducts = products.filter((p: any) =>
    !search ||
    p.productName?.toLowerCase().includes(search.toLowerCase()) ||
    p.productCode?.toLowerCase().includes(search.toLowerCase())
  )

  const handleToggle = (productId: string, currentEnabled: boolean, currentAdj: number) => {
    updateMutation.mutate({ productId, priceAdjustment: currentAdj, enabled: !currentEnabled })
  }

  const handleAdjustmentChange = (productId: string, newAdj: number, currentEnabled: boolean) => {
    updateMutation.mutate({ productId, priceAdjustment: newAdj, enabled: currentEnabled })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        <select
          value={selectedChannel}
          onChange={(e) => setSelectedChannel(e.target.value)}
          className="input w-64"
        >
          <option value="">{t('channels.selectChannel') || 'Select Channel'}</option>
          {channels.map((ch: any) => (
            <option key={ch.id} value={ch.id}>
              {ch.icon} {ch.name} ({(ch.commission * 100).toFixed(0)}% {t('channels.commission') || 'commission'})
            </option>
          ))}
        </select>
      </div>

      {selectedChannel && (
        <>
          {/* Bulk Actions */}
          <div className="card mb-4 bg-blue-50 border border-blue-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings size={20} className="text-blue-600" />
                <span className="font-medium text-blue-700">{t('channels.bulkAdjust') || 'Bulk Adjust'}</span>
              </div>
              <div className="flex items-center gap-2">
                {[-20, -10, -5, 5, 10, 20].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => bulkAdjustMutation.mutate(pct)}
                    className="px-3 py-1 bg-white border border-blue-300 rounded-lg text-sm hover:bg-blue-100"
                    disabled={bulkAdjustMutation.isPending}
                  >
                    {pct > 0 ? '+' : ''}{pct}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="mb-4">
            <div className="relative max-w-md">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('common.search') || 'Search products...'}
                className="input pl-10 w-full"
              />
            </div>
          </div>
        </>
      )}

      {/* Products Table */}
      <div className="card">
        {!selectedChannel ? (
          <div className="text-center py-12 text-gray-500">
            {t('channels.selectChannelPrompt') || 'Please select a channel to manage product pricing'}
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {t('common.noData') || 'No products found'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">{t('products.code') || 'Code'}</th>
                  <th className="pb-3 font-medium">{t('products.name') || 'Product'}</th>
                  <th className="pb-3 font-medium">{t('products.category') || 'Category'}</th>
                  <th className="pb-3 font-medium text-right">{t('products.price') || 'Base Price'}</th>
                  <th className="pb-3 font-medium text-right">{t('channels.adjustment') || 'Adjustment'}</th>
                  <th className="pb-3 font-medium text-right">{t('channels.finalPrice') || 'Final Price'}</th>
                  <th className="pb-3 font-medium text-center">{t('products.status') || 'Status'}</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product: any) => (
                  <tr key={product.productId} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-mono text-sm text-gray-500">
                      {product.productCode || '-'}
                    </td>
                    <td className="py-3 font-medium text-gray-900">
                      {product.productName}
                    </td>
                    <td className="py-3 text-gray-500">
                      {product.category || '-'}
                    </td>
                    <td className="py-3 text-right font-mono">
                      {formatCurrency(product.basePrice || 0)}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          value={(product.priceAdjustment * 100).toFixed(0)}
                          onChange={(e) => handleAdjustmentChange(
                            product.productId,
                            parseInt(e.target.value) / 100 || 1,
                            product.enabled
                          )}
                          className="input w-20 text-right"
                          step="5"
                        />
                        <span className="text-gray-400">%</span>
                      </div>
                    </td>
                    <td className="py-3 text-right font-mono font-bold text-primary">
                      {formatCurrency(product.finalPrice || 0)}
                    </td>
                    <td className="py-3 text-center">
                      <button
                        onClick={() => handleToggle(product.productId, product.enabled, product.priceAdjustment)}
                        className={`px-3 py-1 rounded-lg text-sm font-medium ${
                          product.enabled
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {product.enabled ? t('products.active') : t('products.inactive')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
