/// <reference types="vite/client" />

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:7072'

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
  const res = await fetch(`${API_BASE}/api/sync/status`)
  const data = await res.json()
  return data.data
}

export async function syncConnect(phone: string, password: string): Promise<SyncConnectResult> {
  const res = await fetch(`${API_BASE}/api/sync/connect`, {
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
  const res = await fetch(`${API_BASE}/api/sync/full`, {
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
