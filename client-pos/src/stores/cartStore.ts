import { create } from 'zustand'

export interface CartItem {
  id: string
  productId: string
  productName: string
  specId: string
  specName: string
  sugarLevel?: string
  sugarLevelName?: string
  iceLevel?: string
  iceLevelName?: string
  unitPrice: number
  quantity: number
  addons: { id: string; name: string; price: number; qty: number }[]
}

interface CartStore {
  items: CartItem[]
  discountAmount: number
  member: any | null
  pointsToRedeem: number
  // Actions
  addItem: (item: CartItem) => void
  removeItem: (index: number) => void
  updateQty: (index: number, qty: number) => void
  clearCart: () => void
  setDiscount: (amount: number) => void
  setMember: (member: any | null) => void
  setPointsToRedeem: (points: number) => void
  // Computed
  subtotal: () => number
  totalAddons: () => number
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  discountAmount: 0,
  member: null,
  pointsToRedeem: 0,

  addItem: (item) => set((state) => ({
    items: [...state.items, item]
  })),

  removeItem: (index) => set((state) => ({
    items: state.items.filter((_, i) => i !== index)
  })),

  updateQty: (index, qty) => set((state) => ({
    items: state.items.map((item, i) =>
      i === index ? { ...item, quantity: Math.max(0, qty) } : item
    )
  })),

  clearCart: () => set({
    items: [],
    discountAmount: 0,
    member: null,
    pointsToRedeem: 0
  }),

  setDiscount: (amount) => set({ discountAmount: amount }),

  setMember: (member) => set({ member }),

  setPointsToRedeem: (points) => set({ pointsToRedeem: points }),

  subtotal: () => get().items.reduce((sum, item) => {
    const addonsTotal = item.addons.reduce((a, addon) => a + addon.price * addon.qty, 0)
    return sum + (item.unitPrice + addonsTotal) * item.quantity
  }, 0),

  totalAddons: () => get().items.reduce((sum, item) =>
    sum + item.addons.reduce((a, addon) => a + addon.price * addon.qty, 0), 0)
}))