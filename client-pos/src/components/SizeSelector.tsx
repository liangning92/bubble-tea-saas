import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Plus, Minus } from 'lucide-react'
import { formatCurrency } from '../utils/helpers'

interface Spec {
  id: string
  name: string
  price: number
}

interface Addon {
  addonId: string
  addon: {
    id: string
    name: string
    price: number
  }
}

interface Product {
  id: string
  name: string
  image?: string
  specs: Spec[]
  addons?: Addon[]
}

interface SizeSelectorProps {
  isOpen: boolean
  product: Product | null
  onClose: () => void
  onAdd: (quantity: number, specId: string, addonIds: string[]) => void
}

export function SizeSelector({ isOpen, product, onClose, onAdd }: SizeSelectorProps) {
  const { t } = useTranslation()
  const [quantity, setQuantity] = useState(1)
  const [selectedSpec, setSelectedSpec] = useState<Spec | null>(null)
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([])

  // Reset state when product changes
  const resetState = () => {
    setQuantity(1)
    setSelectedAddonIds([])
  }

  if (!isOpen || !product) return null

  const handleSpecSelect = (spec: Spec) => {
    setSelectedSpec(spec)
  }

  const handleAddonToggle = (addonId: string) => {
    setSelectedAddonIds((prev) =>
      prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId]
    )
  }

  const calculateTotal = () => {
    const specPrice = selectedSpec?.price || 0
    const addonsPrice = (product.addons || [])
      .filter((pa) => selectedAddonIds.includes(pa.addonId))
      .reduce((sum, pa) => sum + (pa.addon?.price || 0), 0)
    return (specPrice + addonsPrice) * quantity
  }

  const handleAdd = () => {
    if (!selectedSpec) return
    onAdd(quantity, selectedSpec.id, selectedAddonIds)
    resetState()
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="bg-white w-full rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-bold">{product.name}</h3>
            {product.image && (
              <img
                src={product.image}
                alt={product.name}
                className="w-16 h-16 object-cover rounded-lg mt-2"
              />
            )}
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {/* Quantity Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('pos.quantity')}
          </label>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors touch-target"
            >
              <Minus size={22} />
            </button>
            <span className="text-3xl font-bold w-14 text-center">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-hover transition-colors touch-target"
            >
              <Plus size={22} />
            </button>
          </div>
        </div>

        {/* Size Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('pos.size')} *
          </label>
          <div className="flex flex-wrap gap-3">
            {product.specs.map((spec) => (
              <button
                key={spec.id}
                onClick={() => handleSpecSelect(spec)}
                className={`spec-btn touch-target ${selectedSpec?.id === spec.id ? 'selected' : ''}`}
              >
                <span className="font-medium">{spec.name}</span>
                <span className="text-sm text-gray-500">{formatCurrency(spec.price)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Addons Selection */}
        {product.addons && product.addons.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('pos.addons')}
            </label>
            <div className="flex flex-wrap gap-2">
              {product.addons.map((pa) => (
                <button
                  key={pa.addonId}
                  onClick={() => handleAddonToggle(pa.addonId)}
                  className={`addon-chip touch-target ${
                    selectedAddonIds.includes(pa.addonId) ? 'selected' : ''
                  }`}
                >
                  <span>{pa.addon?.name}</span>
                  <span className="text-sm opacity-75">
                    +{formatCurrency(pa.addon?.price || 0)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Add Button */}
        <button
          onClick={handleAdd}
          disabled={!selectedSpec}
          className="btn-primary w-full py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed touch-target"
        >
          {t('pos.addToCart')} - {formatCurrency(calculateTotal())}
        </button>
      </div>
    </div>
  )
}