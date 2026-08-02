/// <reference types="vite/client" />

// Use the same API URL configuration as the rest of the POS app.
// In packaged mode (file://), getApiUrl() returns CLOUD_API_URL (api.aicube.online).
// This ensures SetupWizard works in the packaged app, not just dev mode.
import { getApiUrl } from '../config'

function getSyncApiBase(): string {
  // Remove /api suffix to get base URL for sync endpoints
  return getApiUrl().replace(/\/api$/, '')
}

export interface SyncConnectResult {
  storeId: string
  storeName: string
  tenantId: string
  token: string
  phone: string
  passwordHash: string
}

export interface SyncFullResult {
  storeName: string
  categories: number
  products: number
  specs: number
  addons: number
}

export async function checkSyncStatus(): Promise<{ isSetUp: boolean }> {
  // Retry up to 5 times with exponential backoff, in case server is still starting
  const maxRetries = 5
  const baseDelay = 500 // ms

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(`${getSyncApiBase()}/api/sync/status`, {
        signal: AbortSignal.timeout(3000) // 3s per attempt
      })
      const data = await res.json()
      return data.data
    } catch {
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt)
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }

  // All retries exhausted — treat as not set up (shows SetupWizard)
  return { isSetUp: false }
}

export async function syncConnect(phone: string, password: string): Promise<SyncConnectResult> {
  const res = await fetch(`${getSyncApiBase()}/api/sync/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password })
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.message || 'Connection failed')
  }
  return data.data
}

export async function syncFull(
  storeId: string,
  token: string,
  phone: string,
  passwordHash: string
): Promise<SyncFullResult> {
  const res = await fetch(`${getSyncApiBase()}/api/sync/full`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, token, phone, passwordHash })
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.message || 'Sync failed')
  }
  return data.data
}
