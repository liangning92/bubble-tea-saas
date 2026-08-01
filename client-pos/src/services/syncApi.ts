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
  const res = await fetch(`${getSyncApiBase()}/api/sync/status`)
  const data = await res.json()
  return data.data
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
