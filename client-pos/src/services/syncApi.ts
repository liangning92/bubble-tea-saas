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

export async function registerStore(name: string, phone: string, password: string, storeName: string) {
  // Step 1: Create store via API
  const storeRes = await fetch(`${API_BASE}/api/stores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: storeName || name + "'s Store" })
  })
  const storeData = await storeRes.json()
  if (!storeRes.ok) {
    throw new Error(storeData.message || 'Failed to create store')
  }
  const storeId = storeData.data?.id
  if (!storeId) {
    throw new Error('Failed to create store: no storeId returned')
  }

  // Step 2: Register user with store
  const regRes = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password, name, storeId, role: 'admin' })
  })
  const regData = await regRes.json()

  if (regRes.ok || regData.code === 201 || regData.token) {
    return { success: true }
  }
  throw new Error(regData.message || 'Registration failed')
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
