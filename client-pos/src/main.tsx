import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ErrorBoundary from './components/ErrorBoundary'
import App from './App'
import {useAuthStore} from './stores/auth'
import {backendIdentity,currentBackendIdentity} from './utils/backendIdentity'
import { ToastProvider } from './components/ui/Toast'
import './index.css'
import './i18n'
import { connectionManager } from './services/ConnectionManager'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1
    }
  }
})

async function start(){
  try {
    const raw=await window.electronAPI?.consumeUpgradeSession?.()
    if(raw){
      const restored=JSON.parse(raw)
      if(restored.state?.isAuthenticated && backendIdentity(restored.state.apiUrl)===currentBackendIdentity()){
        sessionStorage.setItem('pos-auth',raw)
        await useAuthStore.persist.rehydrate()
      }
    }
  }catch{/* Unavailable or expired handoffs use the normal login screen. */}
  if (import.meta.env.PROD && window.location.protocol === 'https:' && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register('/pos-sw.js').catch(error => console.warn('[OfflineShell] Cache installation failed', error))
  }
  connectionManager.addListener(event => {
    if ((event.type === 'connected' || event.type === 'health-check') && useAuthStore.getState().token) {
      window.dispatchEvent(new Event('pos-session-restored'))
    }
  })
  connectionManager.startHealthCheck(30000)
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary><QueryClientProvider client={queryClient}><HashRouter>
        <ToastProvider><App /></ToastProvider>
      </HashRouter></QueryClientProvider></ErrorBoundary>
    </React.StrictMode>
  )
}
void start()
