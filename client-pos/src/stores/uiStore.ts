import { create } from 'zustand'
import { Product } from './productStore'

interface UiStore {
  // Modals
  showAddonModal: boolean
  showPaymentModal: boolean
  showMemberModal: boolean
  showDiscountModal: boolean
  showSuspendModal: boolean
  showShiftModal: boolean
  showChannelModal: boolean
  showScanModal: boolean
  showHistoryModal: boolean
  showCashModal: boolean
  showTasksModal: boolean
  showLogoutModal: boolean
  // Selected items
  selectedProduct: Product | null
  selectedSpec: { id: string; name: string; price: number } | null
  selectedAddonIds: string[]
  addonQty: number
  selectedSugar: string
  selectedIce: string
  // Confirm modal
  confirmModal: {
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    type?: 'warning' | 'danger' | 'info'
  }
  // Actions
  setShowAddonModal: (show: boolean) => void
  setShowPaymentModal: (show: boolean) => void
  setShowMemberModal: (show: boolean) => void
  setShowDiscountModal: (show: boolean) => void
  setShowSuspendModal: (show: boolean) => void
  setShowShiftModal: (show: boolean) => void
  setShowChannelModal: (show: boolean) => void
  setShowScanModal: (show: boolean) => void
  setShowHistoryModal: (show: boolean) => void
  setShowCashModal: (show: boolean) => void
  setShowTasksModal: (show: boolean) => void
  setShowLogoutModal: (show: boolean) => void
  setSelectedProduct: (product: Product | null) => void
  setSelectedSpec: (spec: { id: string; name: string; price: number } | null) => void
  setSelectedAddonIds: (ids: string[] | ((prev: string[]) => string[])) => void
  setAddonQty: (qty: number) => void
  setSelectedSugar: (sugar: string) => void
  setSelectedIce: (ice: string) => void
  setConfirmModal: (modal: UiStore['confirmModal']) => void
  closeAllModals: () => void
}

export const useUiStore = create<UiStore>((set) => ({
  showAddonModal: false,
  showPaymentModal: false,
  showMemberModal: false,
  showDiscountModal: false,
  showSuspendModal: false,
  showShiftModal: false,
  showChannelModal: false,
  showScanModal: false,
  showHistoryModal: false,
  showCashModal: false,
  showTasksModal: false,
  showLogoutModal: false,
  selectedProduct: null,
  selectedSpec: null,
  selectedAddonIds: [],
  addonQty: 1,
  selectedSugar: 'normal_sugar',
  selectedIce: 'normal_ice',
  confirmModal: { isOpen: false, title: '', message: '', onConfirm: () => {} },

  setShowAddonModal: (show) => set({ showAddonModal: show }),
  setShowPaymentModal: (show) => set({ showPaymentModal: show }),
  setShowMemberModal: (show) => set({ showMemberModal: show }),
  setShowDiscountModal: (show) => set({ showDiscountModal: show }),
  setShowSuspendModal: (show) => set({ showSuspendModal: show }),
  setShowShiftModal: (show) => set({ showShiftModal: show }),
  setShowChannelModal: (show) => set({ showChannelModal: show }),
  setShowScanModal: (show) => set({ showScanModal: show }),
  setShowHistoryModal: (show) => set({ showHistoryModal: show }),
  setShowCashModal: (show) => set({ showCashModal: show }),
  setShowTasksModal: (show) => set({ showTasksModal: show }),
  setShowLogoutModal: (show) => set({ showLogoutModal: show }),
  setSelectedProduct: (product) => set({ selectedProduct: product }),
  setSelectedSpec: (spec) => set({ selectedSpec: spec }),
  setSelectedAddonIds: (idsOrFn: any) => set((state: UiStore) => ({
    selectedAddonIds: typeof idsOrFn === 'function'
      ? idsOrFn(state.selectedAddonIds)
      : idsOrFn
  })),
  setAddonQty: (qty) => set({ addonQty: qty }),
  setSelectedSugar: (sugar) => set({ selectedSugar: sugar }),
  setSelectedIce: (ice) => set({ selectedIce: ice }),
  setConfirmModal: (modal) => set({ confirmModal: modal }),

  closeAllModals: () => set({
    showAddonModal: false,
    showPaymentModal: false,
    showMemberModal: false,
    showDiscountModal: false,
    showSuspendModal: false,
    showShiftModal: false,
    showChannelModal: false,
    showScanModal: false,
    showHistoryModal: false,
    showCashModal: false,
    showTasksModal: false,
    showLogoutModal: false
  })
}))