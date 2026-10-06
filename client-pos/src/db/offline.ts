import { confirmRetriedCheckout } from '../utils/checkoutIntent'
import Dexie, { Table } from 'dexie'
import { orderSyncPayload } from '../utils/orderSyncPayload'
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
  shiftSessionId?: string
  memberId?: string
  channelId?: string  // 订单渠道：DINE_IN, GOFOOD, GRAB, SHOPEE, POS
  recoveredConfirmation?: {serverId: string; orderNumber: string; receivedAt: Date}
  recoveryAcknowledged?: {actorId: string; at: Date}
  quarantineAudit?: {actorId: string; at: Date}
  checkoutRequest?: Record<string, any>
  checkoutResolution?: 'accepted' | 'rejected' | 'discarded' | 'review' | 'quarantined'
  items: any[]
  subtotal: number
  ppn: number
  totalAmount: number
  finalAmount: number
  discountAmount: number
  paymentMethod: string
  taxEnabled: boolean
  pointsRedeemed: number
  orderNumber: string
  pickupNumber?: string
  customerCount: number
  status: 'pending' | 'syncing' | 'synced' | 'failed' | 'prepared' | 'sending' | 'review'
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

  // Auth tokens are session-only and are not retained for offline use.
  private getToken(): string {
    try {
      const stored = sessionStorage.getItem('pos-auth')
      if (stored) {
        const parsed = JSON.parse(stored)
        return parsed.state?.token || ''
      }
    } catch (e) {
      console.warn('[SyncManager] Failed to get token:', e)
    }
    return ''
  }

  // A claimed row is never uploaded by another tab. Review requires an explicit retry.
  async syncPendingOrders(review = false) {
    if (!this.isOnline || this.isSyncing) return
    let auth: any
    try { auth = JSON.parse(sessionStorage.getItem('pos-auth') || '{}').state } catch { return }
    if (!auth?.token || !auth.user?.storeId || !['admin', 'manager', 'cashier'].includes(auth.user.role)) return
    this.isSyncing = true
    this.emit({ type: 'sync:start' })
    const claimed: LocalOrder[] = []
    try {
      await db.transaction('rw', db.orders, async () => {
        const rows = await db.orders.where('status').equals(review ? 'review' : 'pending').and(o => o.storeId === auth.user.storeId).toArray()
        for (const order of rows) {
          try { orderSyncPayload(order) } catch {
            await db.orders.update(order.id!, { status: 'review', error: 'CHECKOUT_SNAPSHOT_REQUIRED' })
            continue
          }
          await db.orders.update(order.id!, { status: 'syncing', syncAttempts: order.syncAttempts + 1 })
          claimed.push(order)
        }
      })
      if (!claimed.length) return
      const bulk = claimed.length > 1
      const apiUrl = connectionManager.getCurrentUrl()
      const currentAuth = JSON.parse(sessionStorage.getItem('pos-auth') || '{}').state
      if (currentAuth?.token !== auth.token || currentAuth?.user?.storeId !== auth.user.storeId) throw new Error('CHECKOUT_AUTH_CHANGED')
      const response = await fetch(`${apiUrl}/orders${bulk ? '/bulk-sync' : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify(bulk ? { orders: claimed.map(orderSyncPayload) } : orderSyncPayload(claimed[0]))
      })
      const body = await response.json().catch(() => null)
      let syncedCount = 0
      for (const [index, order] of claimed.entries()) {
        const item = bulk ? body?.data?.results?.[index] : { success: response.ok, data: body?.data }
        const accepted = (bulk ? response.status === 200 : response.status === 201) && item?.success && typeof item.data?.id === 'string' && item.data?.orderNumber === order.orderNumber
        if (accepted) await confirmRetriedCheckout(order, item.data)
        else await db.orders.update(order.id!, {status:'review',error:String(item?.error || body?.message || `HTTP ${response.status}`)})
        if (accepted) { syncedCount++; this.emit({ type: 'sync:success', orderId: order.localId, serverId: item.data.id }) }
      }
      // Fresh 201 confirmation atomically removes its own barrier; never print from recovery upload.
      this.emit({ type: 'sync:complete', syncedCount, failedCount: claimed.length - syncedCount })
    } catch (error) {
      // No bulk-to-single fallback after response loss: the first write may have committed.
      for (const order of claimed) {
        try { await db.orders.update(order.id!, { status: 'review', error: String(error) }) } catch { /* durable syncing row remains a recovery barrier */ }
      }
      this.emit({ type: 'sync:error', error: String(error) })
    } finally { this.isSyncing = false }
  }

  // Start periodic order upload. Full catalog sync requires a fresh credential
  // exchange and is performed during online setup/login only.
  startSync(intervalMs = 30000) {
    // The singleton survives POS route unmounts; restore listeners without duplicates.
    window.removeEventListener('online', this.boundOnlineHandler)
    window.removeEventListener('offline', this.boundOfflineHandler)
    window.addEventListener('online', this.boundOnlineHandler)
    window.addEventListener('offline', this.boundOfflineHandler)
    this.isOnline = navigator.onLine
    if (this.syncInterval) clearInterval(this.syncInterval)
    this.syncInterval = window.setInterval(() => {
      if (this.isOnline) this.syncPendingOrders()
    }, intervalMs)

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

  // Get demo products (used when no server and no cache)
  getDemoProducts(): LocalProduct[] {
    return [
      {
        id: 'demo-1',
        name: 'Milk Tea',
        description: 'Classic milk tea with boba',
        categoryId: 'drinks',
        categoryName: 'Drinks',
        specs: [
          { id: 's-1', name: 'Regular', price: 15000 },
          { id: 's-2', name: 'Large', price: 20000 }
        ],
        addons: [
          { id: 'a-1', name: 'Boba', price: 3000 },
          { id: 'a-2', name: 'Pearl', price: 3000 }
        ],
        updatedAt: new Date()
      },
      {
        id: 'demo-2',
        name: 'Brown Sugar',
        description: 'Brown sugar milk tea',
        categoryId: 'drinks',
        categoryName: 'Drinks',
        specs: [
          { id: 's-3', name: 'Regular', price: 18000 },
          { id: 's-4', name: 'Large', price: 23000 }
        ],
        addons: [
          { id: 'a-1', name: 'Boba', price: 3000 }
        ],
        updatedAt: new Date()
      },
      {
        id: 'demo-3',
        name: 'Green Tea',
        description: 'Japanese green tea',
        categoryId: 'drinks',
        categoryName: 'Drinks',
        specs: [
          { id: 's-5', name: 'Regular', price: 14000 },
          { id: 's-6', name: 'Large', price: 19000 }
        ],
        addons: [],
        updatedAt: new Date()
      },
      {
        id: 'demo-4',
        name: 'Taro Milk',
        description: 'Taro bubble milk tea',
        categoryId: 'drinks',
        categoryName: 'Drinks',
        specs: [
          { id: 's-7', name: 'Regular', price: 17000 },
          { id: 's-8', name: 'Large', price: 22000 }
        ],
        addons: [
          { id: 'a-3', name: 'Cream', price: 5000 }
        ],
        updatedAt: new Date()
      },
      {
        id: 'demo-5',
        name: 'Coffee',
        description: 'Vietnamese coffee',
        categoryId: 'drinks',
        categoryName: 'Drinks',
        specs: [
          { id: 's-9', name: 'Regular', price: 16000 },
          { id: 's-10', name: 'Large', price: 21000 }
        ],
        addons: [],
        updatedAt: new Date()
      }
    ]
  }
}

export const productCache = new ProductCache()

// Lock Screen PIN - stored locally for offline unlock
const LOCK_SCREEN_PIN_KEY = 'lockScreenPin'

export async function saveLockScreenPin(pin: string): Promise<void> {
  await db.config.put({ key: LOCK_SCREEN_PIN_KEY, value: pin, updatedAt: new Date() })
}

export async function getLockScreenPin(): Promise<string | null> {
  const config = await db.config.get(LOCK_SCREEN_PIN_KEY)
  return config?.value || null
}

// Offline Credentials - stored for offline login
const OFFLINE_CREDS_KEY = 'offlineCredentials'

export interface OfflineCredentials {
  phone: string
  passwordHash: string
  user: {
    id: string
    phone: string
    role: string
    storeId: string | null
    staff: { id: string; name: string; employeeNumber?: string; position?: string } | null
  }
  cachedAt: Date
}

export async function saveOfflineCredentials(creds: OfflineCredentials): Promise<void> {
  await db.config.put({
    key: OFFLINE_CREDS_KEY,
    value: JSON.stringify(creds),
    updatedAt: new Date()
  })
}

export async function getOfflineCredentials(): Promise<OfflineCredentials | null> {
  const config = await db.config.get(OFFLINE_CREDS_KEY)
  if (!config?.value) return null
  try {
    return JSON.parse(config.value)
  } catch {
    return null
  }
}

export async function clearOfflineCredentials(): Promise<void> {
  await db.config.delete(OFFLINE_CREDS_KEY)
}
