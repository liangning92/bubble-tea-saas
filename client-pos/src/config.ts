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

  // Local development: use Vite proxy
  if (host === 'localhost' || host === '127.0.0.1') {
    return '/api'
  }

  // Packaged Electron app (file:// protocol): use local Express server
  // The Windows installer bundles a local Express server (forked at startup).
  // All API calls go to the local server (127.0.0.1:7072).
  // Initial sync (/sync/connect, /sync/full) proxies through local server to cloud.
  if (!host || host === 'file' || protocol === 'file:') {
    return LOCAL_API_URL  // http://localhost:7072/api
  }

  // Remote access via cloudflare tunnel → use cloud API
  return CLOUD_API_URL  // https://api.aicube.online/api
}

export function getApiUrl(): string {
  // First check localStorage
  const stored = localStorage.getItem(API_URL_KEY)
  if (stored) return stored

  // Auto-detect based on current host
  return autoDetectApiUrl()
}

export function setApiUrl(url: string): void {
  localStorage.setItem(API_URL_KEY, url.trim())
}

export function clearApiUrl(): void {
  localStorage.removeItem(API_URL_KEY)
}

export function isDefaultApiUrl(): boolean {
  return !localStorage.getItem(API_URL_KEY)
}

// Export URL constants for use in other modules
export { LOCAL_API_URL, CLOUD_API_URL }