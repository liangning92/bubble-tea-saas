import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ErrorBoundary from './components/ErrorBoundary'
import App from './App'
import './index.css'
import './i18n'

// Create query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1
    }
  }
})

// Log startup
console.log('[POS] Starting application...')
console.log('[POS] Root element:', document.getElementById('root'))

// Render app
const rootElement = document.getElementById('root')
if (rootElement) {
  console.log('[POS] Rendering React app...')
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <HashRouter>
            <App />
          </HashRouter>
        </QueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>
  )
  console.log('[POS] Render called')
} else {
  console.error('[POS] Root element not found!')
}
