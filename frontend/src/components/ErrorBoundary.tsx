"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean; error: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div style={{ padding: "2rem", color: "#ef4444", background: "#0a0a0f", minHeight: "50vh" }}>
            <h2 style={{ marginBottom: "1rem" }}>Something went wrong</h2>
            <pre style={{ fontSize: "0.85rem", color: "#8888a0", whiteSpace: "pre-wrap" }}>
              {this.state.error}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{ marginTop: "1rem", padding: "0.5rem 1rem", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}
            >
              Reload
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
