import { parseSyncEnvelope, type SyncEnvelope } from '@switchypeformance/contracts';

export interface WebDavSyncClientOptions {
  fetch(url: string, request: RequestInit): Promise<Response>;
  password: string;
  url: string;
  username: string;
}

export interface RemoteSyncValue {
  envelope: SyncEnvelope;
  etag?: string;
}

export interface WebDavSaveExpectation {
  createOnly?: boolean;
  etag?: string;
}

export interface WebDavSyncClient {
  load(): Promise<RemoteSyncValue | undefined>;
  save(envelope: SyncEnvelope, expectation?: WebDavSaveExpectation): Promise<{ etag?: string }>;
}

export function createWebDavSyncClient(options: WebDavSyncClientOptions): WebDavSyncClient {
  assertHttpUrl(options.url, 'WebDAV 地址无效');

  return {
    async load() {
      const response = await options.fetch(options.url, {
        credentials: 'omit',
        headers: requestHeaders(options),
        method: 'GET'
      });
      if (response.status === 404) {
        return undefined;
      }
      if (!response.ok) {
        throw new Error(`WebDAV 读取失败（HTTP ${response.status}）`);
      }
      const parsed = parseEnvelopeText(await response.text(), 'WebDAV 同步数据无效');
      const etag = response.headers.get('etag');
      return etag ? { envelope: parsed, etag } : { envelope: parsed };
    },

    async save(envelope, expectation) {
      const parsed = parseSyncEnvelope(envelope);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      const headers = requestHeaders(options);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      if (expectation?.etag) {
        headers.set('If-Match', expectation.etag);
      } else if (expectation?.createOnly) {
        headers.set('If-None-Match', '*');
      }
      const response = await options.fetch(options.url, {
        body: JSON.stringify(parsed.value),
        credentials: 'omit',
        headers,
        method: 'PUT'
      });
      if (response.status === 409 || response.status === 412) {
        throw new Error('远端配置已变化，请先查看差异后再决定。');
      }
      if (!response.ok) {
        throw new Error(`WebDAV 保存失败（HTTP ${response.status}）`);
      }
      const etag = response.headers.get('etag');
      return etag ? { etag } : {};
    }
  };
}

function requestHeaders(options: WebDavSyncClientOptions): Headers {
  return new Headers({
    Accept: 'application/json',
    Authorization: `Basic ${toBase64(`${options.username}:${options.password}`)}`
  });
}

function parseEnvelopeText(text: string, error: string): SyncEnvelope {
  try {
    const parsed = parseSyncEnvelope(JSON.parse(text) as unknown);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    return parsed.value;
  } catch {
    throw new Error(error);
  }
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function assertHttpUrl(value: string, error: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(error);
    }
  } catch (caught) {
    if (caught instanceof Error && caught.message === error) {
      throw caught;
    }
    throw new Error(error);
  }
}
