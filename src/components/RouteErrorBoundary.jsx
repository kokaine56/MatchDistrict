import React from 'react'

const CHUNK_RELOAD_KEY = 'md_chunk_reload_count'
const CHUNK_RELOAD_MAX = 2

export default class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, refCode: '' }
  }

  static getDerivedStateFromError() {
    const refCode = Math.random().toString(36).substring(2, 8).toUpperCase()
    return { hasError: true, refCode }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[RouteErrorBoundary]', error, errorInfo?.componentStack || errorInfo)

    const isChunkLoadFailed =
      /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed/i
        .test(error?.message || '')

    if (isChunkLoadFailed) {
      const reloadCount = parseInt(sessionStorage.getItem(CHUNK_RELOAD_KEY) || '0', 10)
      if (reloadCount < CHUNK_RELOAD_MAX) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, (reloadCount + 1).toString())
        window.location.reload()
      }
    }
  }

  handleTryAgain = () => {
    this.setState({ hasError: false, refCode: '' })
  }

  handleClearAndHome = () => {
    this.setState({ hasError: false, refCode: '' })
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-background text-on-background max-w-md mx-auto text-center">
          <p className="text-sm font-bold text-slate-800 dark:text-white">
            Something went wrong loading this page. Please try again.{this.state.refCode ? ` (Ref: ${this.state.refCode})` : ''}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={this.handleTryAgain}
              className="px-5 py-2.5 bg-primary text-on-primary rounded-xl text-xs font-bold uppercase tracking-wider"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.handleClearAndHome}
              className="px-5 py-2.5 border border-outline-variant text-slate-800 dark:text-white rounded-xl text-xs font-bold uppercase tracking-wider"
            >
              Go home
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
