// POS API Configuration
// Stores API URL in localStorage so it persists across restarts

const API_URL_KEY = 'pos-api-url'

// Auto-detect API URL based on current host
function autoDetectApiUrl(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
  return configured.endsWith('/api') ? configured : `${configured}/api`
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
