import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, Home, RefreshCw } from 'lucide-react'

import { getTranslation } from '@/i18n/translations'
import { isLanguageSupported, type LanguageCode } from '@/i18n/types'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  renderError?: (error: Error, errorInfo: ErrorInfo, retry: () => void) => ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  name?: string
  showRetry?: boolean
  onRetry?: () => void
  quiet?: boolean
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  retryCount: number
}

const STORAGE_KEY = 'arxiv-chronicle-language-preference'

function resolveLanguage(): LanguageCode {
  if (typeof window === 'undefined') return 'zh'

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return 'zh'
    const parsed = JSON.parse(raw) as { primary?: string }
    if (parsed.primary && isLanguageSupported(parsed.primary)) {
      return parsed.primary
    }
  } catch {
    // Ignore malformed language preference storage.
  }

  return 'zh'
}

function tr(key: string, fallback: string) {
  return getTranslation(key, resolveLanguage(), fallback)
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { onError, name } = this.props

    this.setState({ errorInfo })
    onError?.(error, errorInfo)

    const prefix = name ? `[ErrorBoundary: ${name}]` : '[ErrorBoundary]'
    console.error(`${prefix} render error:`, error)
    console.error(`${prefix} component stack:`, errorInfo.componentStack)

    this.reportError(error, errorInfo)
  }

  private reportError(error: Error, errorInfo: ErrorInfo): void {
    const report = {
      timestamp: new Date().toISOString(),
      name: this.props.name || 'Unknown',
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      url: typeof window !== 'undefined' ? window.location.href : '',
    }

    try {
      const existing = JSON.parse(sessionStorage.getItem('error_reports') || '[]')
      existing.push(report)
      sessionStorage.setItem('error_reports', JSON.stringify(existing.slice(-20)))
    } catch {
      // Ignore storage failures.
    }
  }

  handleRetry = (): void => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prev.retryCount + 1,
    }))

    this.props.onRetry?.()
  }

  handleGoHome = (): void => {
    window.location.href = '/'
  }

  handleGoBack = (): void => {
    window.history.back()
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.renderError) {
        return this.props.renderError(this.state.error, this.state.errorInfo!, this.handleRetry)
      }

      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <DefaultErrorPage
          error={this.state.error}
          onRetry={this.handleRetry}
          onGoHome={this.handleGoHome}
          onGoBack={this.handleGoBack}
          showRetry={this.props.showRetry ?? true}
        />
      )
    }

    return this.props.children
  }
}

interface DefaultErrorPageProps {
  error: Error
  onRetry: () => void
  onGoHome: () => void
  onGoBack: () => void
  showRetry: boolean
}

const DefaultErrorPage: React.FC<DefaultErrorPageProps> = ({
  error,
  onRetry,
  onGoHome,
  onGoBack,
  showRetry,
}) => {
  const isNetworkError = error.message.includes('fetch') || error.message.toLowerCase().includes('network')
  const isChunkError =
    error.message.includes('ChunkLoadError') || error.message.includes('Loading chunk')

  const title = isChunkError
    ? tr('error.chunkTitle', 'Page Updated')
    : isNetworkError
      ? tr('error.networkTitle', 'Network Connection Error')
      : tr('error.defaultTitle', 'Content Failed to Load')

  const description = isChunkError
    ? tr('error.chunkDescription', 'A newer version of this page is available. Refresh to load the latest content.')
    : isNetworkError
      ? tr('error.networkDescription', 'The app could not reach the server. Check your connection and try again.')
      : tr('error.defaultDescription', 'An unexpected error occurred while rendering this page.')

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
        </div>

        <h1 className="mb-2 text-xl font-semibold text-neutral-900">{title}</h1>
        <p className="mb-6 text-sm text-neutral-500">{description}</p>

        {import.meta.env.DEV && (
          <details className="mb-6 text-left">
            <summary className="mb-2 cursor-pointer text-xs text-neutral-400 hover:text-neutral-600">
              {tr('error.details', 'Error Details')}
            </summary>
            <pre className="max-h-40 overflow-auto rounded-lg bg-red-50 p-3 text-xs text-red-500">
              {error.message}
              {'\n\n'}
              {error.stack?.slice(0, 500)}
            </pre>
          </details>
        )}

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          {isChunkError ? (
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
            >
              <RefreshCw className="h-4 w-4" />
              {tr('error.refreshPage', 'Refresh Page')}
            </button>
          ) : (
            <>
              {showRetry && (
                <button
                  onClick={onRetry}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
                >
                  <RefreshCw className="h-4 w-4" />
                  {tr('common.retry', 'Retry')}
                </button>
              )}
              <button
                onClick={onGoBack}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-100 px-5 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-200"
              >
                <ArrowLeft className="h-4 w-4" />
                {tr('common.back', 'Back')}
              </button>
              <button
                onClick={onGoHome}
                className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
              >
                <Home className="h-4 w-4" />
                {tr('nav.home', 'Home')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

interface InlineFallbackProps {
  message?: string
  onRetry?: () => void
  className?: string
}

export const InlineFallback: React.FC<InlineFallbackProps> = ({
  message,
  onRetry,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center px-4 py-8 text-center ${className}`}>
      <AlertTriangle className="mb-2 h-6 w-6 text-neutral-300" />
      <p className="text-sm text-neutral-400">
        {message || tr('error.inlineDefault', 'Content failed to load')}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-700"
        >
          {tr('common.retry', 'Retry')}
        </button>
      )}
    </div>
  )
}

export const SkeletonFallback: React.FC<{ className?: string; lines?: number }> = ({
  className = '',
  lines = 3,
}) => {
  const widths = [75, 100, 85, 90, 70, 95, 80, 65, 88, 92]

  return (
    <div className={`animate-pulse space-y-3 ${className}`}>
      <div className="h-6 w-3/4 rounded-lg bg-neutral-100" />
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="h-4 rounded bg-neutral-100"
          style={{ width: `${widths[index % widths.length]}%` }}
        />
      ))}
    </div>
  )
}

export default ErrorBoundary
