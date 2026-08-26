import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Caught by ErrorBoundary:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty-main">
          <p>Something went wrong rendering this view.</p>
          <p className="error-boundary-detail">{this.state.error.message}</p>
          <p>Try another tab from the sidebar, or reload the page.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
