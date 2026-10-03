'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  /** Shown above the error message, e.g. "The 3D view could not start." */
  title: string
  children: ReactNode
  /** Changing this value clears a caught error (e.g. a new project revision). */
  resetKey?: unknown
}

type State = { error: Error | null; resetKey: unknown }

/**
 * Keeps one failing view (WebGL unavailable, a drawing that throws) from
 * blanking the whole designer. Error boundaries still require a class.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return Object.is(props.resetKey, state.resetKey) ? null : { error: null, resetKey: props.resetKey }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface in devtools; there is no server to report to (local-first app).
    console.error(error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="view-error" role="alert">
        <strong>{this.props.title}</strong>
        <p>{this.state.error.message}</p>
      </div>
    )
  }
}
