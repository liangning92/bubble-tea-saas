export const DELIVERY_PLATFORMS = ['grabfood', 'gofood', 'shopee'] as const
export type ExternalDeliveryPlatform = typeof DELIVERY_PLATFORMS[number]
export type DeliveryStatus = 'new' | 'confirmed' | 'preparing' | 'ready' | 'picked_up' | 'delivered' | 'cancelled' | 'refunded'

export interface DeliveryAdapterContext {
  storeId: string
  // A reference to server-managed credentials, not a credential sent to the UI.
  credentialReference?: string
}

export interface PlatformOrderItem {
  platformProductId: string
  platformVariantId?: string
  name: string
  quantity: number
  notes?: string
}

export interface PlatformOrder {
  platformOrderId: string
  platformStoreId: string
  items: PlatformOrderItem[]
  amounts: { subtotal: number; customerDeliveryFee: number; platformFee: number; customerPaid: number; currency: 'IDR' }
  status: DeliveryStatus
  createdAt: string
}

export interface PlatformMenuItem {
  productId: string
  variantId?: string
  platformProductId?: string
  name: string
  price: number
  available: boolean
}

export interface PlatformWebhookEvent {
  eventId: string
  platformOrderId: string
  occurredAt: string
  order?: PlatformOrder
  status?: DeliveryStatus
}

export interface PlatformConnection {
  platform: ExternalDeliveryPlatform
  status: 'not_connected'
  reason: 'API_ACCESS_PENDING'
  capabilities: { orders: boolean; accept: boolean; status: boolean; menu: boolean; webhooks: boolean }
}

// Internal contracts only. Provider request URLs, auth and payloads will be
// implemented against approved provider documentation when access is available.
export interface PlatformAdapter {
  readonly platform: ExternalDeliveryPlatform
  getConnection(): PlatformConnection
  fetchOrders(cursor?: string): Promise<{ orders: PlatformOrder[]; nextCursor?: string }>
  confirmOrder(platformOrderId: string, estimatedReadyMinutes: number): Promise<void>
  updateStatus(platformOrderId: string, status: DeliveryStatus, reason?: string): Promise<void>
  syncMenu(products: PlatformMenuItem[]): Promise<void>
  verifyWebhook(rawBody: Uint8Array, headers: Readonly<Record<string, string>>): Promise<boolean>
  parseWebhook(rawBody: Uint8Array): Promise<PlatformWebhookEvent>
}

export class DeliveryPlatformUnavailable extends Error {
  readonly code = 'DELIVERY_PLATFORM_NOT_CONNECTED'
  constructor(readonly platform: ExternalDeliveryPlatform) {
    super(`${platform} API access is pending`)
    this.name = 'DeliveryPlatformUnavailable'
  }
}

class PendingPlatformAdapter implements PlatformAdapter {
  constructor(readonly platform: ExternalDeliveryPlatform, readonly context: DeliveryAdapterContext) {}

  getConnection(): PlatformConnection {
    return {
      platform: this.platform, status: 'not_connected', reason: 'API_ACCESS_PENDING',
      capabilities: { orders: false, accept: false, status: false, menu: false, webhooks: false }
    }
  }

  async fetchOrders(_cursor?: string): Promise<{ orders: PlatformOrder[]; nextCursor?: string }> {
    throw new DeliveryPlatformUnavailable(this.platform)
  }
  async confirmOrder(_platformOrderId: string, _estimatedReadyMinutes: number): Promise<void> {
    throw new DeliveryPlatformUnavailable(this.platform)
  }
  async updateStatus(_platformOrderId: string, _status: DeliveryStatus, _reason?: string): Promise<void> {
    throw new DeliveryPlatformUnavailable(this.platform)
  }
  async syncMenu(_products: PlatformMenuItem[]): Promise<void> {
    throw new DeliveryPlatformUnavailable(this.platform)
  }
  async verifyWebhook(_rawBody: Uint8Array, _headers: Readonly<Record<string, string>>): Promise<boolean> {
    throw new DeliveryPlatformUnavailable(this.platform)
  }
  async parseWebhook(_rawBody: Uint8Array): Promise<PlatformWebhookEvent> {
    throw new DeliveryPlatformUnavailable(this.platform)
  }
}

export class GrabFoodAdapter extends PendingPlatformAdapter {
  constructor(context: DeliveryAdapterContext) { super('grabfood', context) }
}
export class GoFoodAdapter extends PendingPlatformAdapter {
  constructor(context: DeliveryAdapterContext) { super('gofood', context) }
}
export class ShopeeAdapter extends PendingPlatformAdapter {
  constructor(context: DeliveryAdapterContext) { super('shopee', context) }
}

export function createPlatformAdapter(platform: ExternalDeliveryPlatform, context: DeliveryAdapterContext): PlatformAdapter {
  switch (platform) {
    case 'grabfood': return new GrabFoodAdapter(context)
    case 'gofood': return new GoFoodAdapter(context)
    case 'shopee': return new ShopeeAdapter(context)
    default: throw new Error('Unsupported delivery platform')
  }
}

export function getPlatformConnections(context: DeliveryAdapterContext): PlatformConnection[] {
  return DELIVERY_PLATFORMS.map(platform => createPlatformAdapter(platform, context).getConnection())
}
