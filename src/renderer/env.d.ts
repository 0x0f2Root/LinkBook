/// <reference types="vite/client" />
import type { LinkbookApi } from "@/shared/ipc";

declare global {
  interface Window {
    /** The preload bridge. The only way the page reaches the main process. */
    linkbook: LinkbookApi;
  }
}
