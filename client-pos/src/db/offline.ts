import Dexie, { Table } from 'dexie'
import { connectionManager } from '../services/ConnectionManager'

export interface LocalProduct {
  id: string
  name: string
  description?: string
  image?: string
  categoryId: string
  categoryName: string
  specs: { id: string; name: string; price: number }[]
  addons: { id: string; name: string; price: number }[]
  updatedAt: Date
}

export interface LocalOrder {
  id?: number
  localId: string
  serverId?: string
  storeId: string
  staffId: string
  memberId?: string
  items: any[]
  subtotal: number
  ppn: number
  totalAmount: number
  finalAmount: number
  discountAmount: number
  paymentMethod: string
  status: 'pending' | 'syncing' | 'synced' | 'failed'
  syncAttempts: number
  createdAt: Date
  syncedAt?: Date
  error?: string
}

export interface SyncQueueItem {
  id?: number
  type: 'order' | 'attendance'
  localId: string
  data: any
  createdAt: Date
  attempts: number
  lastError?: string
}

export interface LocalConfig {
  key: string
  value: any
  updatedAt: Date
}

class POSDatabase extends Dexie {
  products!: Table<LocalProduct>
  orders!: Table<LocalOrder>
  syncQueue!: Table<SyncQueueItem>
  config!: Table<LocalConfig>

  constructor() {
    super('POSOffline')
    this.version(1).stores({
      products: 'id, categoryId, name, updatedAt',
      orders: '++id, localId, serverId, status, createdAt',
      syncQueue: '++id, type, localId, createdAt',
      config: 'key'
    })
  }
}

export const db = new POSDatabase()

// Sync Manager - handles offline data synchronization
export class SyncManager {
  private isOnline = navigator.onLine
  private syncInterval: number | null = null
  private isSyncing = false
  private listeners: Set<(event: SyncEvent) => void> = new Set()
  private boundOnlineHandler = () => this.handleOnline()
  private boundOfflineHandler = () => this.handleOffline()

  constructor() {
    window.addEventListener('online', this.boundOnlineHandler)
    window.addEventListener('offline', this.boundOfflineHandler)
  }

  // Destroy - cleanup listeners and intervals
  destroy() {
    window.removeEventListener('online', this.boundOnlineHandler)
    window.removeEventListener('offline', this.boundOfflineHandler)
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
    this.listeners.clear()
  }

  // Add sync status listener
  addListener(callback: (event: SyncEvent) => void) {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  private emit(event: SyncEvent) {
    this.listeners.forEach(cb => cb(event))
  }

  private handleOnline() {
    this.isOnline = true
    this.emit({ type: 'online' })
    // Sync pending orders when coming back online
    this.syncPendingOrders()
  }

  private handleOffline() {
    this.isOnline = false
    this.emit({ type: 'offline' })
  }

  // Get auth token from localStorage
  private getToken(): string {
    try {
      const stored = localStorage.getItem('pos-auth')
      if (stored) {
        const parsed = JSON.parse(stored)
        return parsed.state?.token || ''
      }
    } catch { }
    return ''
  }

  // Sync all pending orders
  async syncPendingOrders() {
    if (!this.isOnline || this.isSyncing) return

    this.isSyncing = true
    this.emit({ type: 'sync:start' })

    try {
      const pendingOrders = await db.orders
        .where('status')
        .equals('pending')
        .toArray()

      let syncedCount = 0
      let failedCount = 0

      for (const order of pendingOrders) {
        try {
          // Update status to syncing
          await db.orders.update(order.id!, { status: 'syncing', syncAttempts: order.syncAttempts + 1 })

          const apiUrl = connectionManager.getCurrentUrl()
          const response = await fetch(`${apiUrl}/orders`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.getToken()}`
            },
            body: JSON.stringify({
              storeId: order.storeId,
              staffId: order.staffId,
              memberId: order.memberId,
              items: order.items,
              paymentMethod: order.paymentMethod,
              discountAmount: order.discountAmount
            })
          })

          if (response.ok) {
            const data = await response.json()
            await db.orders.update(order.id!, {
              status: 'synced',
              serverId: data.data?.id,
              syncedAt: new Date()
            })
            syncedCount++
            this.emit({
              type: 'sync:success',
              orderId: order.localId,
              serverId: data.data?.id
            })
          } else {
            const errorText = await response.text()
            await db.orders.update(order.id!, {
              status: 'failed',
              error: `HTTP ${response.status}: ${errorText}`
            })
            failedCount++
          }
        } catch (error: any) {
          // Network error - keep as pending for retry
          await db.orders.update(order.id!, {
            status: 'pending',
            error: error.message
          })
          failedCount++
        }
      }

      this.emit({
        type: 'sync:complete',
        syncedCount,
        failedCount
      })
    } catch (error) {
      this.emit({ type: 'sync:error', error: String(error) })
    } finally {
      this.isSyncing = false
    }
  }

  // Start periodic sync
  startSync(intervalMs = 30000) {
    if (this.syncInterval) clearInterval(this.syncInterval)
    this.syncInterval = window.setInterval(() => {
      if (this.isOnline) this.syncPendingOrders()
    }, intervalMs)

    // Initial sync
    if (this.isOnline) this.syncPendingOrders()
  }

  // Stop sync
  stopSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
  }

  // Get sync status
  getStatus() {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing
    }
  }

  // Get pending orders count
  async getPendingCount() {
    return db.orders.where('status').equals('pending').count()
  }

  // Get all orders for display
  async getAllOrders() {
    return db.orders.orderBy('createdAt').reverse().toArray()
  }
}

export interface SyncEvent {
  type: 'online' | 'offline' | 'sync:start' | 'sync:complete' | 'sync:success' | 'sync:error'
  orderId?: string
  serverId?: string
  syncedCount?: number
  failedCount?: number
  error?: string
}

export const syncManager = new SyncManager()

// Product cache manager
export class ProductCache {
  private static VERSION_KEY = 'products_version'

  // Save products to local cache
  async saveProducts(products: LocalProduct[]) {
    await db.products.clear()
    await db.products.bulkPut(products.map(p => ({
      ...p,
      updatedAt: new Date()
    })))
  }

  // Get all cached products
  async getProducts(): Promise<LocalProduct[]> {
    return db.products.toArray()
  }

  // Save product version timestamp
  async saveProductsVersion(timestamp: string) {
    await db.config.put({ key: ProductCache.VERSION_KEY, value: timestamp, updatedAt: new Date() })
  }

  // Get stored product version timestamp
  async getProductsVersion(): Promise<string | null> {
    const config = await db.config.get(ProductCache.VERSION_KEY)
    return config?.value || null
  }

  // Check if server has newer products
  async hasNewerProducts(serverTimestamp: string | null): Promise<boolean> {
    if (!serverTimestamp) return false
    const localVersion = await this.getProductsVersion()
    if (!localVersion) return true  // No local cache, need to sync
    return new Date(serverTimestamp) > new Date(localVersion)
  }

  // Get products by category
  async getProductsByCategory(categoryId: string): Promise<LocalProduct[]> {
    return db.products.where('categoryId').equals(categoryId).toArray()
  }

  // Get single product
  async getProduct(id: string): Promise<LocalProduct | undefined> {
    return db.products.get(id)
  }

  // Search products
  async searchProducts(query: string): Promise<LocalProduct[]> {
    const lowerQuery = query.toLowerCase()
    const all = await db.products.toArray()
    return all.filter(p =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.categoryName.toLowerCase().includes(lowerQuery)
    )
  }

  // Get categories from cached products
  async getCategories(): Promise<string[]> {
    const products = await db.products.toArray()
    return Array.from(new Set(products.map(p => p.categoryId)))
  }

  // Check if cache is fresh (less than 1 hour old)
  async isCacheFresh(): Promise<boolean> {
    const firstProduct = await db.products.toCollection().first()
    if (!firstProduct) return false

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    return firstProduct.updatedAt > oneHourAgo
  }

  // Clear all cached data
  async clearCache() {
    await db.products.clear()
  }
}

export const productCache = new ProductCache()