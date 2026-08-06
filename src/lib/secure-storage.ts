import { registerPlugin } from '@capacitor/core';

export interface SecureStoragePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

export const SecureStorage = registerPlugin<SecureStoragePlugin>('SecureStorage');
