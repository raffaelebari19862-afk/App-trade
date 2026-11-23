import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  override componentDidCatch(error: unknown) {
    console.error("Application ErrorBoundary caught:", error);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#070B12] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-2xl border border-red-500/30 bg-[#101826] p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h1 className="font-display text-base font-bold">
                Si è verificato un errore imprevisto
              </h1>
            </div>
            <p className="text-xs text-slate-300 font-mono break-words bg-black/30 p-3 rounded-xl border border-white/10">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Ricarica Terminale
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
