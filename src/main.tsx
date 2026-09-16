import { initSentry } from './lib/observability/sentry.init'
initSentry()

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { captureError } from './lib/observability/capture'

// Sentry's own GlobalHandlers integration already listens for
// window.onerror/unhandledrejection when Sentry is configured — these
// listeners exist so the structured log line (captureError always writes
// one, Sentry or not) is recorded even with no DSN set.
window.addEventListener('error', (event) => {
  captureError(event.error ?? new Error(event.message), { event: 'app.window_error' })
})
window.addEventListener('unhandledrejection', (event) => {
  captureError(event.reason, { event: 'app.unhandled_rejection' })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
