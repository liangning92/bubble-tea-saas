/**
 * ConnectionManager - Smart API connection manager
 *
 * Features:
 * - Manages multiple API endpoints (fallback URLs)
 * - Health check polling
 * - Automatic reconnection with exponential backoff
 * - Offline-first operation
 * - Persists last working URL
 */

import { getApiUrl, setApiUrl } from '../config'

const CONNECTIVITY_CHECK_KEY = 'pos-connectivity-check'
const WORKING_URL_KEY = 'pos-working-url'
const FALLBACK_URLS_KEY = 'pos-fallback-urls'

// Default fallback URLs
const DEFAULT_FALLBACKS: string[] = [
  'https://api.aicube.online',
]

// Connection states
export type ConnectionState =
  | 'disconnected'    // No connection attempt yet
  | 'connecting'      // Attempting to connect
  | 'connected'       // Successfully connected
  | 'degraded'        // Connected but with issues
  | 'offline'         // No network

// Events emitted by ConnectionManager
export interface ConnectionEvent {
  type: ConnectionState | 'url-changed' | 'health-check'
  url?: string
  latency?: number
  error?: string
}

// Listeners callback type
type ConnectionListener = (event: ConnectionEvent) => void

class ConnectionManagerClass {
  private state: ConnectionState = 'disconnected'
  private currentUrl: string = ''
  private workingUrl: string = ''
  private fallbackUrls: string[] = [...DEFAULT_FALLBACKS]
  private listeners: Set<ConnectionListener> = new Set()

  // Retry configuration
  private retryCount: number = 0
  private maxRetries: number = 5
  private baseRetryDelay: number = 1000  // 1 second
  private maxRetryDelay: number = 60000  // 60 seconds max

  // Health check configuration
  private healthCheckInterval: number | null = null
  private healthCheckIntervalMs: number = 30000  // 30 seconds

  // Connectivity check cache
  private lastConnectivityCheck: number = 0
  private connectivityCheckCacheMs: number = 5000  // 5 seconds cache

  constructor() {
    this.loadPersistedState()
  }

  // Load persisted state from localStorage
  private loadPersistedState() {
    try {
      // Load working URL
      const savedWorkingUrl = localStorage.getItem(WORKING_URL_KEY)
      if (savedWorkingUrl) {
        this.workingUrl = savedWorkingUrl
        this.currentUrl = savedWorkingUrl
      } else {
        this.currentUrl = getApiUrl()
      }

      // Load fallback URLs
      const savedFallbacks = localStorage.getItem(FALLBACK_URLS_KEY)
      if (savedFallbacks) {
        try {
          const parsed = JSON.parse(savedFallbacks)
          if (Array.isArray(parsed)) {
            this.fallbackUrls = [...DEFAULT_FALLBACKS, ...parsed]
          }
        } catch {}
      }
    } catch {}
  }

  // Persist state
  private persistState() {
    try {
      if (this.workingUrl) {
        localStorage.setItem(WORKING_URL_KEY, this.workingUrl)
      }
    } catch {}
  }

  // Add event listener
  addListener(callback: ConnectionListener): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  // Emit event to all listeners
  private emit(event: ConnectionEvent) {
    this.listeners.forEach(cb => cb(event))
  }

  // Update connection state
  private setState(newState: ConnectionState, url?: string) {
    this.state = newState
    if (url) {
      this.currentUrl = url
    }
    this.emit({ type: newState, url: this.currentUrl })
  }

  // Get current API URL
  getCurrentUrl(): string {
    // Fallback to getApiUrl() if currentUrl is empty (initial state)
    return this.currentUrl || getApiUrl()
  }

  // Get connection state
  getState(): ConnectionState {
    return this.state
  }

  // Check if currently connected
  isConnected(): boolean {
    return this.state === 'connected' || this.state === 'degraded'
  }

  // Check if online (navigator.onLine)
  isOnline(): boolean {
    return navigator.onLine
  }

  // Add a fallback URL
  addFallbackUrl(url: string) {
    if (!this.fallbackUrls.includes(url)) {
      this.fallbackUrls.push(url)
      try {
        localStorage.setItem(FALLBACK_URLS_KEY, JSON.stringify(this.fallbackUrls))
      } catch {}
    }
  }

  // Remove a fallback URL
  removeFallbackUrl(url: string) {
    this.fallbackUrls = this.fallbackUrls.filter(u => u !== url)
    try {
      localStorage.setItem(FALLBACK_URLS_KEY, JSON.stringify(this.fallbackUrls))
    } catch {}
  }

  /**
   * Health check - ping the current API
   * Returns latency in ms, or -1 if failed
   */
  async healthCheck(): Promise<{ success: boolean; latency: number; url: string }> {
    const startTime = Date.now()
    const url = this.currentUrl

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

      const response = await fetch(`${url}/health`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-cache'
      })

      clearTimeout(timeoutId)

      const latency = Date.now() - startTime

      if (response.ok) {
        return { success: true, latency, url }
      } else {
        return { success: false, latency: -1, url }
      }
    } catch (error: any) {
      return { success: false, latency: -1, url }
    }
  }

  /**
   * Check API URL from server config (set by Admin)
   * This allows Admin to change the API URL remotely
   * Call this after login to check if URL was changed
   */
  async checkServerConfigApiUrl(): Promise<string | null> {
    try {
      const token = localStorage.getItem('pos-auth')
      if (!token) return null

      const { state } = JSON.parse(token)
      if (!state?.token || !state?.user?.storeId) return null

      const storeId = state.user.storeId

      // Use absolute URL to avoid /api/api/... double-prefix issue
      // When file:// protocol, window.location.origin is "null"/"file://", so use getApiUrl() instead
      let baseUrl: string
      if (this.currentUrl.startsWith('http')) {
        baseUrl = this.currentUrl
      } else if (window.location.origin && window.location.origin.startsWith('http')) {
        baseUrl = window.location.origin
      } else {
        // file:// protocol or invalid origin - use configured API URL
        baseUrl = getApiUrl().replace(/\/api$/, '')
      }
      const response = await fetch(`${baseUrl}/api/config/${storeId}/pos_api_url`, {
        headers: {
          Authorization: `Bearer ${state.token}`
        },
        cache: 'no-cache'
      })

      if (response.ok) {
        const data = await response.json()
        if (data.data?.value) {
          return data.data.value
        }
      }
    } catch {}
    return null
  }

  /**
   * Check and update API URL if changed by Admin
   * Call this after login or periodically
   */
  async checkForUrlUpdate(): Promise<boolean> {
    const newUrl = await this.checkServerConfigApiUrl()
    if (newUrl && newUrl !== this.currentUrl) {
      this.currentUrl = newUrl
      this.workingUrl = newUrl
      this.emit({ type: 'url-changed', url: newUrl })
      this.persistState()
      return true
    }
    return false
  }

  /**
   * Connect to API with automatic failover
   * Returns the working URL
   */
  async connect(): Promise<string> {
    this.setState('connecting')

    // First try the current URL
    const health = await this.healthCheck()

    if (health.success) {
      this.workingUrl = health.url
      this.currentUrl = health.url
      this.retryCount = 0
      this.setState('connected', health.url)
      this.emit({ type: 'connected', url: health.url, latency: health.latency })
      this.persistState()
      return health.url
    }

    // Try fallback URLs
    for (const url of this.fallbackUrls) {
      if (url === this.currentUrl) continue

      try {
        const response = await fetch(`${url}/health`, {
          method: 'GET',
          cache: 'no-cache'
        })

        if (response.ok) {
          this.workingUrl = url
          this.currentUrl = url
          this.retryCount = 0
          this.setState('connected', url)
          this.emit({ type: 'connected', url })
          this.persistState()
          return url
        }
      } catch {}
    }

    // No URL worked - go to offline/degraded mode
    this.setState('offline')
    this.emit({ type: 'offline', error: 'No API endpoints reachable' })
    return this.currentUrl
  }

  /**
   * Retry connection with exponential backoff
   */
  async retryWithBackoff(): Promise<string> {
    if (this.retryCount >= this.maxRetries) {
      this.emit({ type: 'offline', error: 'Max retries exceeded' })
      return this.currentUrl
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.baseRetryDelay * Math.pow(2, this.retryCount),
      this.maxRetryDelay
    )

    this.retryCount++
    this.setState('connecting')

    this.emit({ type: 'connecting', error: `Retry ${this.retryCount}/${this.maxRetries}, waiting ${delay}ms` })

    // Wait for backoff period
    await new Promise(resolve => setTimeout(resolve, delay))

    // Try to connect again
    return this.connect()
  }

  /**
   * Start periodic health checks
   */
  startHealthCheck(intervalMs?: number) {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    this.healthCheckIntervalMs = intervalMs || this.healthCheckIntervalMs

    this.healthCheckInterval = window.setInterval(async () => {
      // Don't check if offline
      if (!navigator.onLine) {
        this.setState('offline')
        return
      }

      const health = await this.healthCheck()

      if (health.success) {
        if (this.state !== 'connected') {
          this.setState('connected', health.url)
          this.emit({ type: 'health-check', url: health.url, latency: health.latency })
        }
        this.retryCount = 0  // Reset retry count on success
      } else {
        // Connection lost - try to reconnect
        if (this.state === 'connected') {
          this.emit({ type: 'degraded', url: this.currentUrl })
        }

        // Try to reconnect with backoff
        await this.retryWithBackoff()
      }
    }, this.healthCheckIntervalMs)

    // Also listen for online/offline events
    window.addEventListener('online', () => {
      this.emit({ type: 'health-check', url: this.currentUrl })
      this.connect()
    })

    window.addEventListener('offline', () => {
      this.setState('offline')
    })
  }

  /**
   * Stop health checks
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }

  /**
   * Force reconnect - useful when user wants to manually reconnect
   */
  async forceReconnect(): Promise<string> {
    this.retryCount = 0
    return this.connect()
  }

  /**
   * Get all known URLs (current + fallbacks)
   */
  getAllUrls(): string[] {
    return [this.currentUrl, ...this.fallbackUrls.filter(u => u !== this.currentUrl)]
  }

  /**
   * Clear all stored URLs and reset
   */
  reset() {
    this.stopHealthCheck()
    this.currentUrl = getApiUrl()
    this.workingUrl = ''
    this.fallbackUrls = [...DEFAULT_FALLBACKS]
    this.state = 'disconnected'
    this.retryCount = 0

    try {
      localStorage.removeItem(WORKING_URL_KEY)
      localStorage.removeItem(FALLBACK_URLS_KEY)
    } catch {}
  }
}

// Singleton instance
export const connectionManager = new ConnectionManagerClass()

export default connectionManager