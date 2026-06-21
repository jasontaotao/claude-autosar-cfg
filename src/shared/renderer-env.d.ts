import type { AutosarApi } from '../preload/index.js';

declare global {
  interface Window {
    autosarApi: AutosarApi;
  }
}

export {};
