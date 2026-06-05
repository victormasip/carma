'use client'

import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

type Props = { children: ReactNode; fallback?: ReactNode; label?: string }
type State = { hasError: boolean }

/**
 * Component-level error boundary. Isolates a failing subtree (e.g. the rich-text
 * editor or the Theme Studio) so one broken component can't white-screen the
 * whole app. Route-level crashes are still caught by app/error.tsx.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[Carma] Component error:', error)
  }

  reset = () => this.setState({ hasError: false })

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback) return this.props.fallback
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl border border-danger/20 bg-danger-soft text-center">
        <div className="w-11 h-11 rounded-xl bg-danger-soft text-danger flex items-center justify-center">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <p className="text-sm font-semibold text-text">
          {this.props.label ?? 'Aquesta secció ha tingut un error'}
        </p>
        <button
          onClick={this.reset}
          className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-text text-bg-elevated hover:opacity-90 text-xs font-semibold transition-opacity"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reintentar
        </button>
      </div>
    )
  }
}
