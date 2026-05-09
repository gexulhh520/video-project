/// <reference types="vite/client" />

import type { DesktopApi } from "../../main/types/app.types";

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}

export {};
