// POS API Configuration
// Stores API URL in localStorage so it persists across restarts

const API_URL_KEY = 'pos-api-url'

// API URLs for different modes
const LOCAL_API_URL = 'http://localhost:7072/api'
const CLOUD_API_URL = 'https://api.aicube.online/api'

// Default to relative path (uses Vite proxy in dev)
const DEFAULT_API_URL = '/api'

// Auto-detect API URL based on current host
function autoDetectApiUrl(): string {
  const host = window.location.hostname
  const protocol = window.location.protocol

  // Local web development: use Vite proxy
  if (host === 'localhost' || host === '127.0.0.1') {
    return '/api'
  }

  // Packaged Electron app (file:// protocol) or remote access:
  // All store accounts and product catalogs are managed on the Cloud PostgreSQL database (api.aicube.online).
  // Returning CLOUD_API_URL ensures initial login and product queries fetch real store data from the Cloud DB.
  // The client automatically caches fetched products into local IndexedDB for offline operation.
  return CLOUD_API_URL
}

export function normalizeApiUrl(url: string): string {
  let trimmed = (url || '').trim()
  if (!trimmed) return '/api'
  // Strip trailing slashes
  trimmed = trimmed.replace(/\/+$/, '')
  // If URL does not end with /api, append /api
  if (!trimmed.endsWith('/api')) {
    trimmed += '/api'
  }
  return trimmed
}

export function getApiUrl(): string {
  // First check localStorage
  const stored = localStorage.getItem(API_URL_KEY)
  if (stored) {
    return normalizeApiUrl(stored)
  }

  // Auto-detect based on current host
  return normalizeApiUrl(autoDetectApiUrl())
}

export function setApiUrl(url: string): void {
  const normalized = normalizeApiUrl(url)
  localStorage.setItem(API_URL_KEY, normalized)
}

export function clearApiUrl(): void {
  localStorage.removeItem(API_URL_KEY)
}

export function isDefaultApiUrl(): boolean {
  return !localStorage.getItem(API_URL_KEY)
}

// Export URL constants for use in other modules
export { LOCAL_API_URL, CLOUD_API_URL }