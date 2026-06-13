import type { AutosarApi } from '../preload/index';

declare global {
  interface Window {
    autosarApi: AutosarApi;
  }
}

export {};