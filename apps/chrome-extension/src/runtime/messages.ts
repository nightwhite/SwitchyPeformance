import type { ProfileDocument } from '@switchypeformance/contracts';

export type BackgroundRequest =
  | { type: 'state.get' }
  | { type: 'profile.activate'; profileId: string }
  | { type: 'configuration.replace'; document: unknown }
  | { type: 'diagnostics.clear' }
  | { type: 'options.open' }
  | { type: 'proxy.credentials.save'; proxyId: string; username: string; password: string }
  | { type: 'proxy.credentials.clear'; proxyId: string }
  | { type: 'proxy.credentials.delete'; credentialId: string };

export interface BackgroundState {
  configuration: ProfileDocument;
  diagnostics: readonly {
    id: string;
    timestamp: number;
    level: 'info' | 'error';
    scope: 'configuration' | 'proxy' | 'network' | 'runtime';
    message: string;
    target?: string;
    detail?: string;
  }[];
}

export type BackgroundResponse =
  { ok: true; state?: BackgroundState } | { ok: false; error: string };

export function isBackgroundRequest(input: unknown): input is BackgroundRequest {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return false;
  }
  const message = input as {
    type?: unknown;
    profileId?: unknown;
    document?: unknown;
    proxyId?: unknown;
    username?: unknown;
    password?: unknown;
    credentialId?: unknown;
  };
  return (
    message.type === 'state.get' ||
    message.type === 'diagnostics.clear' ||
    message.type === 'options.open' ||
    (message.type === 'profile.activate' && typeof message.profileId === 'string') ||
    (message.type === 'configuration.replace' && 'document' in message) ||
    (message.type === 'proxy.credentials.save' &&
      typeof message.proxyId === 'string' &&
      typeof message.username === 'string' &&
      typeof message.password === 'string') ||
    (message.type === 'proxy.credentials.clear' && typeof message.proxyId === 'string') ||
    (message.type === 'proxy.credentials.delete' && typeof message.credentialId === 'string')
  );
}
