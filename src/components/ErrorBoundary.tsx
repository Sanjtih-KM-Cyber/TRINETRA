import * as React from "react";

// React ships without bundled types in this repo (untyped module import),
// so extend via `any` — the runtime base (React.Component) is what matters.
const Base: any = (React as any).Component;

interface ErrorBoundaryProps {
  title?: string;
  children?: any;
}

/** Catches render crashes and shows the message instead of a blank screen. */
export class ErrorBoundary extends Base {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, info: any): void {
    // eslint-disable-next-line no-console
    console.error(`[${(this.props as ErrorBoundaryProps).title || "view"}] render failed:`, error, info && info.componentStack);
  }

  render(): any {
    if ((this.state as any).error) {
      const err = (this.state as any).error as Error;
      const title = (this.props as ErrorBoundaryProps).title || "View";
      return (
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 space-y-2 m-4">
          <div className="font-bold text-sm">{title} failed to render</div>
          <div className="font-mono break-all">{String((err as Error).message)}</div>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
          >
            Retry
          </button>
        </div>
      );
    }
    return (this.props as ErrorBoundaryProps).children;
  }
}

export default ErrorBoundary;
