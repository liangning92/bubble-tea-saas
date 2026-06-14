import { create } from 'zustand'

export interface Product {
  id: string
  name: string
  category?: { id: string; name: string }
  image?: string
  specs: { id: string; name: string; price: number }[]
  addons: { addonId: string; addon: { id: string; name: string; price: number } }[]
}

interface ProductStore {
  products: Product[]
  filter: string
  searchQuery: string
  // Actions
  setProducts: (products: Product[]) => void
  setFilter: (filter: string) => void
  setSearchQuery: (query: string) => void
  // Computed
  categories: () => string[]
  filtered: () => Product[]
}

export const useProductStore = create<ProductStore>((set, get) => ({
  products: [],
  filter: '',
  searchQuery: '',

  setProducts: (products) => set({ products }),

  setFilter: (filter) => set({ filter }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  categories: () => {
    const products = get().products
    return [...new Set(products.map(p => p.category?.name).filter((c): c is string => Boolean(c)))]
  },

  filtered: () => {
    const { products, filter, searchQuery } = get()
    return products.filter(p => {
      const matchCat = !filter || p.category?.name === filter
      const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
      return matchCat && matchSearch
    })
  }
}))