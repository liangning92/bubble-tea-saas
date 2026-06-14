import { useTranslation } from 'react-i18next'
import { ShoppingCart, Minus, Plus, Trash2, Tag } from 'lucide-react'
import { formatCurrency } from '../utils/helpers'

interface CartItem {
  id: string
  productName: string
  specName: string
  unitPrice: number
  quantity: number
  addons: { id: string; name: string; price: number }[]
}

interface CartProps {
  items: CartItem[]
  subtotal: number
  ppn: number
  total: number
  discount?: number
  onUpdateQuantity: (itemId: string, delta: number) => void
  onRemove: (itemId: string) => void
  onClear: () => void
  onCheckout: () => void
  onDiscount?: () => void
}

export function Cart({
  items,
  subtotal,
  ppn,
  total,
  discount = 0,
  onUpdateQuantity,
  onRemove,
  onClear,
  onCheckout,
  onDiscount
}: CartProps) {
  const { t } = useTranslation()

  return (
    <div className="w-80 bg-white border-l border-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="font-semibold flex items-center gap-2">
          <ShoppingCart size={18} />
          {t('pos.cart')} ({items.length})
        </h2>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <ShoppingCart size={48} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('pos.emptyCart')}</p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="cart-item">
              <div className="flex-1">
                <p className="font-medium text-sm">{item.productName}</p>
                <p className="text-xs text-gray-500">{item.specName}</p>
                {item.addons.length > 0 && (
                  <p className="text-xs text-gray-400">
                    + {item.addons.map((a) => a.name).join(', ')}
                  </p>
                )}
                <p className="text-sm font-semibold text-primary mt-1">
                  {formatCurrency(item.unitPrice * item.quantity)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onUpdateQuantity(item.id, -1)}
                  className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors touch-target"
                >
                  <Minus size={16} />
                </button>
                <span className="font-medium w-8 text-center text-lg">{item.quantity}</span>
                <button
                  onClick={() => onUpdateQuantity(item.id, 1)}
                  className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-hover transition-colors touch-target"
                >
                  <Plus size={16} />
                </button>
                <button
                  onClick={() => onRemove(item.id)}
                  className="w-12 h-12 rounded-full text-red-500 flex items-center justify-center hover:bg-red-50 transition-colors touch-target"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Totals & Checkout */}
      <div className="p-4 border-t border-border bg-gray-50">
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">{t('pos.subtotal')}</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">{t('pos.ppn')}</span>
            <span>{formatCurrency(ppn)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>{t('pos.discount') || 'Discount'}</span>
              <span>-{formatCurrency(discount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg pt-2 border-t">
            <span>{t('pos.total')}</span>
            <span className="text-primary">{formatCurrency(total)}</span>
          </div>
        </div>

        {onDiscount && items.length > 0 && (
          <button
            onClick={onDiscount}
            className="w-full py-2 mb-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:bg-gray-50 flex items-center justify-center gap-1"
          >
            <Tag size={14} />
            {t('pos.addDiscount') || 'Add Discount'}
          </button>
        )}

        <button
          onClick={onCheckout}
          disabled={items.length === 0}
          className="btn-pay w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('pos.checkout')}
        </button>

        {items.length > 0 && (
          <button onClick={onClear} className="btn-secondary w-full mt-2">
            {t('pos.clearCart')}
          </button>
        )}
      </div>
    </div>
  )
}