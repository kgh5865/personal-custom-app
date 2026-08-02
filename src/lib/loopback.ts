import { registerPlugin } from '@capacitor/core';

export interface LoopbackCallback {
  path: string;
  code: string;
  state: string;
  error: string;
  errorDescription: string;
}

export interface LoopbackServerPlugin {
  start(options?: { port?: number }): Promise<void>;
  stop(): Promise<void>;
  addListener(
    event: 'callback',
    listener: (data: LoopbackCallback) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export const LoopbackServer = registerPlugin<LoopbackServerPlugin>('LoopbackServer');
