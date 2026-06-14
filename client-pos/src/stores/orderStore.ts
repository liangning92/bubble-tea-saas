import { create } from 'zustand'

interface SuspendedOrder {
  id: string
  cart: any[]
  channel: any
  time: string
}

interface OrderStore {
  // Suspended orders
  suspendedOrders: SuspendedOrder[]
  // Payment
  paymentMethod: string
  paidAmount: string
  // Member
  member: any | null
  memberPhone: string
  pointsToRedeem: number
  // Current order
  orderSuccess: string
  paymentModalOrderNum: string
  // Loading states
  isCheckingOut: boolean
  isSearchingMember: boolean
  // Actions
  addSuspendedOrder: (order: SuspendedOrder) => void
  removeSuspendedOrder: (id: string) => void
  setSuspendedOrders: (orders: SuspendedOrder[] | ((prev: SuspendedOrder[]) => SuspendedOrder[])) => void
  setPaymentMethod: (method: string) => void
  setPaidAmount: (amount: string | ((prev: string) => string)) => void
  setMember: (member: any | null) => void
  setMemberPhone: (phone: string | ((prev: string) => string)) => void
  setPointsToRedeem: (points: number) => void
  setOrderSuccess: (orderNum: string) => void
  setPaymentModalOrderNum: (orderNum: string) => void
  setIsCheckingOut: (checking: boolean) => void
  setIsSearchingMember: (searching: boolean) => void
  clearOrderState: () => void
}

export const useOrderStore = create<OrderStore>((set) => ({
  suspendedOrders: [],
  paymentMethod: 'cash',
  paidAmount: '',
  member: null,
  memberPhone: '',
  pointsToRedeem: 0,
  orderSuccess: '',
  paymentModalOrderNum: '',
  isCheckingOut: false,
  isSearchingMember: false,

  addSuspendedOrder: (order) => set((state) => ({
    suspendedOrders: [...state.suspendedOrders, order]
  })),

  removeSuspendedOrder: (id) => set((state) => ({
    suspendedOrders: state.suspendedOrders.filter(o => o.id !== id)
  })),

  setSuspendedOrders: (ordersOrFn: any) => set((state: OrderStore) => ({
    suspendedOrders: typeof ordersOrFn === 'function'
      ? ordersOrFn(state.suspendedOrders)
      : ordersOrFn
  })),

  setPaymentMethod: (method) => set({ paymentMethod: method }),

  setPaidAmount: (amountOrFn: any) => set((state: OrderStore) => ({
    paidAmount: typeof amountOrFn === 'function'
      ? amountOrFn(state.paidAmount)
      : amountOrFn
  })),

  setMember: (member) => set({ member }),

  setMemberPhone: (phoneOrFn: any) => set((state: OrderStore) => ({
    memberPhone: typeof phoneOrFn === 'function'
      ? phoneOrFn(state.memberPhone)
      : phoneOrFn
  })),

  setPointsToRedeem: (points) => set({ pointsToRedeem: points }),

  setOrderSuccess: (orderNum) => set({ orderSuccess: orderNum }),

  setPaymentModalOrderNum: (orderNum) => set({ paymentModalOrderNum: orderNum }),

  setIsCheckingOut: (checking) => set({ isCheckingOut: checking }),

  setIsSearchingMember: (searching) => set({ isSearchingMember: searching }),

  clearOrderState: () => set({
    paymentMethod: 'cash',
    paidAmount: '',
    member: null,
    memberPhone: '',
    pointsToRedeem: 0,
    orderSuccess: '',
    paymentModalOrderNum: ''
  })
}))