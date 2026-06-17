// POS API Configuration
// Stores API URL in localStorage so it persists across restarts

const API_URL_KEY = 'pos-api-url'

// Default to relative path (uses Vite proxy in dev)
const DEFAULT_API_URL = '/api'

// Auto-detect API URL based on current host
function autoDetectApiUrl(): string {
  const host = window.location.hostname

  // Vercel production URL - proxy through Vercel's rewrite
  if (host.includes('vercel.app')) {
    return '/api'
  }

  // Tunnel URL mappings
  const tunnelMappings: Record<string, string> = {
    'vercel.app': '',  // Vercel handles API proxy
  }

  // Check if accessed via tunnel
  for (const [posHost, apiHost] of Object.entries(tunnelMappings)) {
    if (host.includes(posHost)) {
      return apiHost || '/api'
    }
  }

  // Default to Vercel proxy
  return '/api'
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