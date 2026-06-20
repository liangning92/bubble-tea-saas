import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { productApi, orderApi, memberApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { formatCurrency } from '../../utils/helpers'
import { Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, User, X } from 'lucide-react'

interface CartItem {
  productId: string
  productName: string
  specId: string
  specName: string
  price: number
  quantity: number
}

const PAYMENT_METHODS = ['cash', 'gopay', 'ovo', 'dana', 'card']

export function POSPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMember, setSelectedMember] = useState<any>(null)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', 'pos'],
    queryFn: () => productApi.list({ storeId: user?.storeId, status: 'active' })
  })

  const createOrderMutation = useMutation({
    mutationFn: (data: any) => orderApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      setCart([])
      setSelectedMember(null)
      setNotes('')
      setPaymentMethod('cash')
    }
  })

  const products = productsData?.data?.list || []

  const categories = useMemo(() => {
    const cats = new Map<string, any>()
    products.forEach((p: any) => {
      if (p.category && !cats.has(p.category.id)) {
        cats.set(p.category.id, { id: p.category.id, name: p.category.name })
      }
    })
    return [{ id: 'all', name: t('common.all') }, ...Array.from(cats.values())]
  }, [products, t])

  const filteredProducts = useMemo(() => {
    return products.filter((p: any) => {
      const matchCat = !selectedCategory || selectedCategory === 'all' || p.categoryId === selectedCategory
      const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
      return matchCat && matchSearch
    })
  }, [products, selectedCategory, searchQuery])

  const searchMember = async () => {
    if (!memberSearch || memberSearch.length < 4) return
    try {
      const res = await memberApi.getByPhone(memberSearch)
      if (res.data?.data) setSelectedMember(res.data.data)
    } catch (e) { /* not found */ }
  }

  const addToCart = (product: any, spec: any) => {
    const existing = cart.find(c => c.productId === product.id && c.specId === spec.id)
    if (existing) {
      setCart(cart.map(c => c.productId === product.id && c.specId === spec.id ? { ...c, quantity: c.quantity + 1 } : c))
    } else {
      setCart([...cart, { productId: product.id, productName: product.name, specId: spec.id, specName: spec.name, price: spec.price, quantity: 1 }])
    }
  }

  const updateQuantity = (index: number, delta: number) => {
    setCart(cart.map((c, i) => i !== index ? c : { ...c, quantity: c.quantity + delta }).filter(c => c.quantity > 0))
  }

  const removeFromCart = (index: number) => setCart(cart.filter((_, i) => i !== index))

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart])

  const handleCheckout = async () => {
    if (cart.length === 0) return
    setIsProcessing(true)
    try {
      await createOrderMutation.mutateAsync({
        storeId: user?.storeId,
        memberId: selectedMember?.id,
        paymentMethod,
        items: cart.map(c => ({ productId: c.productId, specId: c.specId, quantity: c.quantity, price: c.price })),
        notes
      })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 flex flex-col">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900 mb-3">{t('pos.title')}</h1>
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t('pos.searchProduct')} className="input pl-10" />
          </div>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id === 'all' ? null : cat.id)}
              className={`px-4 py-2 rounded-full text-sm whitespace-nowrap ${(selectedCategory === cat.id || (!selectedCategory && cat.id === 'all')) ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              {cat.name}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? <div className="text-center py-8">{t('common.loading')}</div> : filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">{t('common.noData')}</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map((product: any) => (
                <div key={product.id} className="card p-3 cursor-pointer hover:shadow-md transition-shadow">
                  {product.image && <img src={product.image} alt={product.name} className="w-full h-24 object-cover rounded-lg mb-2" />}
                  <p className="font-medium text-gray-900 text-sm">{product.name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {product.specs?.slice(0, 2).map((spec: any) => (
                      <button key={spec.id} onClick={() => addToCart(product, spec)} className="text-xs px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary/20">
                        {spec.name}: {formatCurrency(spec.price)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-96 flex flex-col bg-white rounded-xl shadow-sm border">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><ShoppingCart size={20} /> {t('pos.cart')}</h2>
            <span className="text-sm text-gray-500">{cart.length} items</span>
          </div>
          {selectedMember ? (
            <div className="flex items-center gap-2 bg-primary/5 p-2 rounded-lg">
              <User size={16} className="text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">{selectedMember.name}</p>
                <p className="text-xs text-gray-500">{selectedMember.points} pts</p>
              </div>
              <button onClick={() => setSelectedMember(null)}><X size={16} /></button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input type="text" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder={t('pos.memberPhone')} className="input text-sm" />
              <button onClick={searchMember} className="btn-secondary text-sm">{t('common.search')}</button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-8 text-gray-500"><ShoppingCart size={32} className="mx-auto mb-2 opacity-50" /><p className="text-sm">{t('pos.emptyCart')}</p></div>
          ) : cart.map((item, index) => (
            <div key={index} className="flex items-start gap-3 bg-gray-50 p-3 rounded-lg">
              <div className="flex-1">
                <p className="font-medium text-gray-900 text-sm">{item.productName}</p>
                <p className="text-xs text-gray-500">{item.specName}</p>
                <p className="text-sm text-primary font-medium">{formatCurrency(item.price)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => updateQuantity(index, -1)} className="p-1 rounded hover:bg-gray-200"><Minus size={14} /></button>
                <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                <button onClick={() => updateQuantity(index, 1)} className="p-1 rounded hover:bg-gray-200"><Plus size={14} /></button>
                <button onClick={() => removeFromCart(index)} className="p-1 text-error"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t space-y-3">
          <div className="flex justify-between text-lg font-bold">
            <span>{t('common.total')}</span>
            <span className="text-primary">{formatCurrency(cartTotal)}</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {PAYMENT_METHODS.map(method => (
              <button key={method} onClick={() => setPaymentMethod(method)}
                className={`py-2 px-2 rounded-lg text-xs text-center ${paymentMethod === method ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                {method === 'cash' && 'Cash'}{method === 'gopay' && 'GoPay'}{method === 'ovo' && 'OVO'}{method === 'dana' && 'DANA'}{method === 'card' && 'Card'}
              </button>
            ))}
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('pos.notes')} className="input text-sm" rows={2} />
          <button onClick={handleCheckout} disabled={cart.length === 0 || isProcessing} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            <CreditCard size={20} />{isProcessing ? t('common.loading') : t('pos.checkout')}
          </button>
        </div>
      </div>
    </div>
  )
}