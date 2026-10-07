/// <reference types="vite/client" />

// Use the same API URL configuration as the rest of the POS app.
// In packaged mode (file://), getApiUrl() returns CLOUD_API_URL (api.aicube.online).
// This ensures SetupWizard works in the packaged app, not just dev mode.
import { getApiUrl, LOCAL_API_URL } from '../config'

function getSyncApiBase(): string {
  // Remove /api suffix to get base URL for sync endpoints
  if (window.location.protocol === 'file:') {
    return LOCAL_API_URL.replace(/\/api$/, '')
  }
  return getApiUrl().replace(/\/api$/, '')
}

export interface SyncConnectResult {
  storeId: string
  storeName: string
  tenantId: string
  syncTicket: string
  receiptSyncTicket: string
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
  syncTicket: string
): Promise<SyncFullResult> {
  const res = await fetch(`${getSyncApiBase()}/api/sync/full`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, syncTicket })
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.message || 'Sync failed')
  }
  return data.data
}

export interface LocalSetupResult {
  storeId: string
  storeName: string
  phone: string
  categories: number
  products: number
}

// POST /api/setup/local — creates local store, admin user, and sample products
export async function localSetup(
  storeName: string,
  phone: string,
  password: string
): Promise<LocalSetupResult> {
  const res = await fetch(`${getSyncApiBase()}/api/setup/local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeName, phone, password })
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.message || 'Local setup failed')
  }
  return data.data
}

// Short-lived ticket and current local login only; never persist cloud credentials.
export async function sendReceiptBatch(token: string, ticket: string, cursor?: string): Promise<{ results: Array<{id:string;status:string;error?:string}>; nextCursor:string|null }> {
  const res=await fetch(`${getSyncApiBase()}/api/sync/receipts/send`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({ticket,...(cursor?{cursor}:{})})})
  const data=await res.json()
  if(!res.ok)throw new Error(data.message||'RECEIPT_SEND_FAILED')
  return data.data
}
