import { Component, type ErrorInfo, type ReactNode } from 'react'
import { captureError } from '../lib/observability/capture'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
}

/**
 * Root-level render error boundary — this app had none before (any React
 * render error crashed to a blank white screen). Never shows the stack to
 * the user; the stack goes to Sentry (captureError) if configured, and to
 * the structured console log either way.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, {
      event: 'app.root_error_boundary',
      extra: { component_stack: info.componentStack?.slice(0, 2000) ?? null },
    })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
        <div className="card" style={{ textAlign: 'center', maxWidth: 360 }}>
          <h2>Algo deu errado.</h2>
          <p className="description">Tente novamente.</p>
          <button type="button" onClick={() => this.setState({ error: null })}>
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }
}
