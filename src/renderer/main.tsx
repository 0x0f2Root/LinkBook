import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initLibrary, initSettings } from "@/lib/bookmarks";
import { App } from "./App";
import { ErrorBoundary, StartupError } from "./error-boundary";
import "./globals.css";

const container = document.getElementById("root");
if (!container) throw new Error("The page is missing its #root element");
const root = createRoot(container);

async function boot() {
  try {
    // The library and settings come from disk through the main process before the first render,
    // so the board never shows sample data or a wrong theme first.
    const data = await window.linkbook.bootstrap();
    initLibrary(data.library, { offline: data.offline });
    initSettings(data.settings);
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App recovery={data.recovery} />
        </ErrorBoundary>
      </StrictMode>,
    );
  } catch (error) {
    console.error("LinkBook couldn't load its data", error);
    root.render(<StartupError error={error} />);
  }
}

void boot();
