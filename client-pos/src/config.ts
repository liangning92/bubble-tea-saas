// POS API Configuration
// Stores API URL in localStorage so it persists across restarts

const API_URL_KEY = 'pos-api-url'

// Default to relative path (uses Vite proxy in dev)
const DEFAULT_API_URL = '/api'

// Auto-detect API URL based on current host
function autoDetectApiUrl(): string {
  const host = window.location.hostname

  // Tunnel URL mappings - update these when tunnels restart
  const tunnelMappings: Record<string, string> = {
    'thick-hands-hug.loca.lt': 'https://thick-hands-hug.loca.lt',
  }

  // Check if accessed via tunnel
  for (const [posHost, apiHost] of Object.entries(tunnelMappings)) {
    if (host.includes(posHost) || host.includes('loca.lt') || host.includes('serveo') || host.includes('trycloudflare')) {
      // Return the corresponding API URL
      return apiHost
    }
  }

  return DEFAULT_API_URL
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