// POS API Configuration
// Stores API URL in localStorage so it persists across restarts

const API_URL_KEY = 'pos-api-url'

// Default to relative path (uses Vite proxy in dev)
const DEFAULT_API_URL = '/api'

export function getApiUrl(): string {
  return localStorage.getItem(API_URL_KEY) || DEFAULT_API_URL
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