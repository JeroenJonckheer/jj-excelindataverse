/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Called when the user clicks "Reload" - usually a dataset refresh. */
  onReload?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time errors so a single bad cell or column can no longer blank
 * the whole control to a white screen. It shows the error inline with a Reload
 * button (which re-reads the dataset), and surfaces the message so it can be
 * reported. Without this, a thrown error unmounts the entire React tree.
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface it for diagnosis; the host console keeps the full stack.
    console.error("JJ - Excel in Dataverse: render error", error, info);
  }

  private handleReload = (): void => {
    this.setState({ error: null });
    this.props.onReload?.();
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="jj-sheet-error-boundary" role="alert">
          <div className="jj-sheet-error-title">
            Something went wrong rendering the grid.
          </div>
          <div className="jj-sheet-error-detail">{this.state.error.message}</div>
          <button
            type="button"
            className="jj-sheet-error-reload"
            onClick={this.handleReload}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
