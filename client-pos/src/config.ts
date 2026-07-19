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

  // Local development: use Vite proxy
  if (host === 'localhost' || host === '127.0.0.1') {
    return '/api'
  }

  // Electron app (file:// protocol) or other local file access: use local API server
  // When loaded via file://, hostname is empty string
  if (!host || host === 'file') {
    return '/api'
  }

  // Remote access via cloudflare tunnel → use api.aicube.online/api
  return 'https://api.aicube.online/api'
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