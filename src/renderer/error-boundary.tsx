import { Component, type ErrorInfo, type ReactNode } from "react";

function ErrorScreen({ title, detail, error }: { title: string; detail: string; error: unknown }) {
  return (
    <div role="alert" className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center font-[Arial,Helvetica,sans-serif]">
      <img src="/logo.svg" alt="" className="size-14" />
      <h1 className="text-base font-medium">{title}</h1>
      <p className="max-w-md text-sm opacity-70">{detail}</p>
      <pre className="max-w-xl overflow-auto rounded-md bg-black/5 p-2 text-left text-xs opacity-70 dark:bg-white/10">{String(error)}</pre>
      <button type="button" onClick={() => window.location.reload()} className="cursor-pointer rounded-md bg-[#2563eb] px-3 py-1.5 text-sm text-white">
        Reload
      </button>
    </div>
  );
}

/** Shown when the library couldn't be loaded at all, for example if the main process failed to answer. */
export function StartupError({ error }: { error: unknown }) {
  return <ErrorScreen title="LinkBook couldn't open your bookmarks" detail="Your saved bookmarks are untouched. Reload to try again." error={error} />;
}

/** Catches a crash in the UI so the window shows a way back instead of going blank. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("LinkBook hit an error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <ErrorScreen title="Something went wrong" detail="Your bookmarks are saved. Reload the window to continue." error={this.state.error} />;
    }
    return this.props.children;
  }
}
