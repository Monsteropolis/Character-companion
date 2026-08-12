import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorNotice } from '../ui/primitives';

/**
 * Route-level error boundary.
 *
 * A render crash in one panel must not blank the whole app -- especially mid-session, when a
 * player's character sheet is the thing they need. Recovery is offered in place rather than by
 * telling the user to reload, because a reload during play feels like data loss even when it
 * isn't.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; fallbackLabel?: string },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[boundary] render failed', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <ErrorNotice
          title={this.props.fallbackLabel ?? 'This view failed to load'}
          message={this.state.error.message}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
