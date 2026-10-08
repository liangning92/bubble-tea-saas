import { assertCheckoutBackend, currentBackendIdentity, readBackendAuth } from '../utils/backendIdentity'
import { confirmRetriedCheckout } from '../utils/checkoutIntent'
import { withCheckoutSyncLock, checkoutSyncLeaseMs } from '../utils/checkoutSyncClaim'
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
  backendUrl?: string
  paymentReportedAt?: Date
  cashTender?: {receivedCash:number;changeGiven:number}
  cloudJournalId?: string
  locallyAcceptedAt?: Date
  occurredAt?: Date
  cloudReceipt?: Record<string, unknown>
  cacheEvidence?: {activityRules?:unknown; activityVersion?:string; activityFetchedAt?:Date; backendUrl:string; catalogVersion:string; catalogFetchedAt:Date; quotedProducts:unknown[]; paymentConfig:unknown; shiftConfig:unknown}
  manualPayment?: {kind: 'qris_manual'; actorId: string; at: Date; evidence: 'customer_success_photo'; bankConfirmed: false}
  serverId?: string
  storeId: string
  staffId: string
  shiftSessionId?: string
  memberId?: string
  channelId?: string  // 订单渠道：DINE_IN, GOFOOD, GRAB, SHOPEE, POS
  syncClaim?: {id: string; expiresAt: number}
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
  qrisExternalId?: string
  paymentEvidenceId?: string
  taxEnabled: boolean
  pointsRedeemed: number
  orderNumber: string
  pickupNumber?: string
  customerCount: number
  status: 'pending' | 'syncing' | 'synced' | 'failed' | 'prepared' | 'sending' | 'review' | 'quarantined'
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
  private resyncRequested = false
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
    if (!this.isOnline) return
    if (this.isSyncing) { this.resyncRequested = true; return }
    let auth: any
    try { auth = JSON.parse(sessionStorage.getItem('pos-auth') || '{}').state } catch { return }
    if (!auth?.token || !auth.user?.storeId || !['admin', 'manager', 'cashier'].includes(auth.user.role)) return
    this.isSyncing = true
    try { await withCheckoutSyncLock(auth.user.storeId, () => this.uploadClaimedOrders(auth, review)) }
    catch (error) { this.emit({type:'sync:error',error:String(error)}) }
    finally {
      this.isSyncing = false
      if (this.resyncRequested) { this.resyncRequested = false; void this.syncPendingOrders() }
    }
  }

  private async uploadClaimedOrders(auth: any, review: boolean) {
    this.emit({type:'sync:start'})
    let syncedCount = 0, failedCount = 0
    const rows = await db.orders.where('status').anyOf(review ? ['review'] : ['pending','syncing']).and(row=>row.storeId===auth.user.storeId).toArray()
    for (const candidate of rows) {
      // Web Locks prove that a previous document no longer owns a request. Without
      // them, lease expiry is needed before retrying a locally accepted UUID.
      if (candidate.status==='syncing' && (!candidate.locallyAcceptedAt || (!navigator.locks && (candidate.syncClaim?.expiresAt || 0)>Date.now()))) continue
      if (candidate.backendUrl && candidate.backendUrl !== currentBackendIdentity()) continue
      let order: LocalOrder | undefined
      try {
        orderSyncPayload(candidate)
        assertCheckoutBackend(candidate.backendUrl,candidate.storeId)
        await db.transaction('rw',db.orders,async()=> {
          const current = await db.orders.get(candidate.id!)
          if (!current || current.status!==candidate.status || current.syncClaim?.id!==candidate.syncClaim?.id) return
          const syncClaim = {id:crypto.randomUUID(),expiresAt:Date.now()+checkoutSyncLeaseMs}
          await db.orders.update(current.id!,{status:'syncing',syncAttempts:current.syncAttempts+1,syncClaim})
          order = {...current,syncClaim}
        })
        if (!order) continue
        const target = assertCheckoutBackend(order.backendUrl,order.storeId)
        const currentAuth = readBackendAuth()
        if (currentAuth.token!==auth.token || currentAuth.apiUrl!==auth.apiUrl || currentAuth.user?.storeId!==auth.user.storeId) throw new Error('CHECKOUT_AUTH_CHANGED')
        if ((order.locallyAcceptedAt || order.paymentReportedAt) && !order.cloudJournalId) {
          const journal = await fetch(`${target}/orders/received-receipts`, {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth.token}`},body:JSON.stringify({orderNumber:order.orderNumber,occurredAt:new Date(order.occurredAt || order.paymentReportedAt || order.locallyAcceptedAt!).toISOString(),grandTotal:order.finalAmount,cashTender:order.cashTender,request:orderSyncPayload(order)})})
          const receipt = await journal.json().catch(()=>null)
          if (journal.status!==201 || !receipt?.data?.id || receipt.data.orderNumber!==order.orderNumber) throw new Error(receipt?.message || 'RECEIVED_RECEIPT_SAVE_FAILED')
          await db.orders.update(order.id!,{cloudJournalId:receipt.data.id})
        }
        const response = await fetch(`${target}/orders${order.locallyAcceptedAt ? '/bulk-sync' : ''}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth.token}`},body:JSON.stringify(order.locallyAcceptedAt ? {orders:[orderSyncPayload(order)]} : orderSyncPayload(order))})
        const body = await response.json().catch(()=>null)
        const result = order.locallyAcceptedAt ? body?.data?.results?.[0] : {success:response.status===201,data:body?.data}
        if ((order.locallyAcceptedAt ? response.status===200 : response.status===201) && result?.success && typeof result.data?.id==='string' && result.data.orderNumber===order.orderNumber) {
          await confirmRetriedCheckout(order,result.data)
          if ((await db.orders.get(order.id!))?.status !== 'synced') { failedCount++; continue }
          syncedCount++
          this.emit({type:'sync:success',orderId:order.localId,serverId:result.data.id})
        } else {
          if (response.status === 401) {
            const {useAuthStore} = await import('../stores/auth')
            const current = readBackendAuth()
            if (current.token === auth.token && current.apiUrl === auth.apiUrl && current.user?.storeId === auth.user.storeId) useAuthStore.getState().expireCloudSession()
          }
          const definite = [400,401,403,404,409,422].includes(response.status) || (response.status===200 && result?.success===false)
          await this.releaseClaim(order,String(result?.error || body?.message || `HTTP ${response.status}`),!definite)
          failedCount++
        }
      } catch (error) {
        failedCount++
        if (order) await this.releaseClaim(order,String(error),true).catch(()=>{})
        else if (!candidate.backendUrl || !candidate.checkoutRequest || (error instanceof Error && error.message === 'CHECKOUT_SNAPSHOT_REQUIRED')) await db.orders.update(candidate.id!,{status:'review',error:'CHECKOUT_BACKEND_EVIDENCE_REQUIRED'})
        this.emit({type:'sync:error',error:String(error)})
      }
    }
    this.emit({type:'sync:complete',syncedCount,failedCount})
  }

  private async releaseClaim(order: LocalOrder, error: string, retry: boolean) {
    await db.transaction('rw',db.orders,async()=> {
      const current = await db.orders.get(order.id!)
      if (current?.status==='syncing' && order.syncClaim && current.syncClaim?.id===order.syncClaim.id) {
        await db.orders.update(order.id!,{status:retry && current.locallyAcceptedAt ? 'pending' : 'review',error})
      }
    })
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
  apiUrl?: string
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
