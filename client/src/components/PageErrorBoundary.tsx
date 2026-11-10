import { Component, ErrorInfo, ReactNode } from "react";
import { isChunkLoadError } from "../lazyWithReload";

// Catches anything that throws while rendering a page, so the app never goes blank. A page whose code couldn't load
// (usually because a new version was deployed) gets a Reload button.
export class PageErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Page error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const stale = isChunkLoadError(this.state.error);
    return (
      <main className="page" role="alert">
        <h1 className="page-title">{stale ? "This page couldn't load" : "Something went wrong"}</h1>
        <p className="page-subtitle">
          {stale ? "InterviewPal was probably just updated. Reloading gets the new version." : "Reloading usually fixes it. If it keeps happening, try again later."}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    );
  }
}
