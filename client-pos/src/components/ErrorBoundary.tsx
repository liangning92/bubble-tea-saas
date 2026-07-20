import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo })
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '24px', maxWidth: '448px', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '9999px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle style={{ width: '24px', height: '24px', color: '#dc2626' }} />
              </div>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#111827' }}>Error</h2>
                <p style={{ fontSize: '14px', color: '#6b7280' }}>Something went wrong</p>
              </div>
            </div>

            <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
              <p style={{ fontSize: '14px', fontFamily: 'monospace', color: '#dc2626', wordBreak: 'break-all' }}>
                {this.state.error?.message || 'Unknown error'}
              </p>
            </div>

            <button
              onClick={this.handleReload}
              style={{ width: '100%', padding: '8px 16px', background: '#3b82f6', color: 'white', borderRadius: '8px', fontWeight: 500 }}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
