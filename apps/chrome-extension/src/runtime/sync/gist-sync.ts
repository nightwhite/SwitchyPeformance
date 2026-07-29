import { parseSyncEnvelope, type SyncEnvelope } from '@switchypeformance/contracts';

import type { RemoteSyncValue } from './webdav-sync.ts';

export interface GistSyncClientOptions {
  fetch(url: string, request: RequestInit): Promise<Response>;
  fileName: string;
  gistId?: string;
  token: string;
}

export interface GistSaveExpectation {
  etag?: string;
}

export interface GistSyncClient {
  load(): Promise<RemoteSyncValue | undefined>;
  save(
    envelope: SyncEnvelope,
    expectation?: GistSaveExpectation
  ): Promise<{ etag?: string; gistId: string }>;
}

const GITHUB_API_ROOT = 'https://api.github.com';

export function createGistSyncClient(options: GistSyncClientOptions): GistSyncClient {
  if (!options.fileName.trim()) {
    throw new Error('Gist 文件名不能为空');
  }
  if (!options.token.trim()) {
    throw new Error('GitHub 令牌不能为空');
  }
  let gistId = options.gistId?.trim() || undefined;

  return {
    async load() {
      if (!gistId) {
        return undefined;
      }
      const response = await options.fetch(
        `${GITHUB_API_ROOT}/gists/${encodeURIComponent(gistId)}`,
        {
          credentials: 'omit',
          headers: requestHeaders(options.token),
          method: 'GET'
        }
      );
      if (response.status === 404) {
        return undefined;
      }
      if (!response.ok) {
        throw new Error(`Gist 读取失败（HTTP ${response.status}）`);
      }
      const content = await readGistFile(
        await response.json(),
        options.fileName,
        options.fetch,
        requestHeaders(options.token)
      );
      const parsed = parseEnvelopeText(content);
      const etag = response.headers.get('etag');
      return etag ? { envelope: parsed, etag } : { envelope: parsed };
    },

    async save(envelope, expectation) {
      const parsed = parseSyncEnvelope(envelope);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      const headers = requestHeaders(options.token);
      if (expectation?.etag) {
        headers.set('If-Match', expectation.etag);
      }
      const response = await options.fetch(
        gistId
          ? `${GITHUB_API_ROOT}/gists/${encodeURIComponent(gistId)}`
          : `${GITHUB_API_ROOT}/gists`,
        {
          body: JSON.stringify({
            description: 'SwitchyPeformance configuration',
            files: { [options.fileName]: { content: JSON.stringify(parsed.value) } },
            public: false
          }),
          credentials: 'omit',
          headers,
          method: gistId ? 'PATCH' : 'POST'
        }
      );
      if (response.status === 409 || response.status === 412) {
        throw new Error('远端配置已变化，请先查看差异后再决定。');
      }
      if (!response.ok) {
        throw new Error(`Gist 保存失败（HTTP ${response.status}）`);
      }
      const nextId = readGistId(await response.json());
      gistId = nextId;
      const etag = response.headers.get('etag');
      return etag ? { etag, gistId: nextId } : { gistId: nextId };
    }
  };
}

function requestHeaders(token: string): Headers {
  return new Headers({
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28'
  });
}

async function readGistFile(
  payload: unknown,
  fileName: string,
  fetcher: GistSyncClientOptions['fetch'],
  headers: Headers
): Promise<string> {
  if (!isRecord(payload) || !isRecord(payload.files) || !isRecord(payload.files[fileName])) {
    throw new Error('Gist 中没有找到同步配置文件');
  }
  const file = payload.files[fileName];
  if (file.truncated === true) {
    const rawUrl = typeof file.raw_url === 'string' ? file.raw_url : undefined;
    if (!rawUrl || !isTrustedGistRawUrl(rawUrl)) {
      throw new Error('Gist 同步文件过大，无法安全读取');
    }
    const response = await fetcher(rawUrl, {
      credentials: 'omit',
      headers,
      method: 'GET',
      redirect: 'error'
    });
    if (!response.ok) {
      throw new Error(`Gist 大文件读取失败（HTTP ${response.status}）`);
    }
    return response.text();
  }
  if (typeof file.content !== 'string') {
    throw new Error('Gist 同步文件无效');
  }
  return file.content;
}

function isTrustedGistRawUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'gist.githubusercontent.com';
  } catch {
    return false;
  }
}

function readGistId(payload: unknown): string {
  if (!isRecord(payload) || typeof payload.id !== 'string' || !payload.id.trim()) {
    throw new Error('Gist 保存成功但未返回标识');
  }
  return payload.id;
}

function parseEnvelopeText(text: string): SyncEnvelope {
  try {
    const parsed = parseSyncEnvelope(JSON.parse(text) as unknown);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    return parsed.value;
  } catch {
    throw new Error('Gist 同步数据无效');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
