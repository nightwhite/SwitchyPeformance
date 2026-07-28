import type { SourceRequestHeader } from '@switchypeformance/contracts';

import type { SourceContentKind, SourceFetcher } from './source-fetcher.ts';
import type { SourceStatus, SourceStatusRepository } from './source-status-repository.ts';

const DEFAULT_MAX_BYTES = 1_024 * 1_024;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface RemoteTextSource {
  headers: readonly SourceRequestHeader[];
  sourceId: string;
  url: string;
}

export interface RemoteTextSourceServiceDependencies {
  clock?: () => number;
  contentKind: SourceContentKind;
  fetcher: Pick<SourceFetcher, 'fetch'>;
  maxBytes?: number;
  statuses: Pick<SourceStatusRepository, 'get' | 'saveContent' | 'saveFailure' | 'saveNotModified'>;
  timeoutMs?: number;
}

export interface RemoteTextSourceService {
  refresh(source: RemoteTextSource): Promise<string>;
  resolveForApply(source: RemoteTextSource): Promise<string>;
}

export function createRemoteTextSourceService(
  dependencies: RemoteTextSourceServiceDependencies
): RemoteTextSourceService {
  const clock = dependencies.clock ?? Date.now;
  const maxBytes = dependencies.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async refresh(source) {
      const status = await dependencies.statuses.get(source.sourceId);
      return refresh(source, status);
    },
    async resolveForApply(source) {
      const status = await dependencies.statuses.get(source.sourceId);
      return cachedTextFor(source, status) ?? refresh(source, status);
    }
  };

  async function refresh(
    source: RemoteTextSource,
    status: SourceStatus | undefined
  ): Promise<string> {
    const cachedText = cachedTextFor(source, status);
    const etag = status?.url === source.url ? status.etag : undefined;
    try {
      const result = await dependencies.fetcher.fetch({
        contentKind: dependencies.contentKind,
        headers: source.headers,
        maxBytes,
        timeoutMs,
        url: source.url,
        ...(etag === undefined ? {} : { etag })
      });
      if (result.kind === 'not-modified') {
        if (!cachedText) {
          throw new Error('来源服务器返回未修改，但本地没有可用缓存');
        }
        await dependencies.statuses.saveNotModified({
          fetchedAt: clock(),
          sourceId: source.sourceId,
          ...(result.etag === undefined ? {} : { etag: result.etag })
        });
        return cachedText;
      }

      await dependencies.statuses.saveContent({
        byteLength: result.byteLength,
        fetchedAt: clock(),
        sourceId: source.sourceId,
        text: result.text,
        url: source.url,
        ...(result.etag === undefined ? {} : { etag: result.etag }),
        ...(result.lastModified === undefined ? {} : { lastModified: result.lastModified })
      });
      return result.text;
    } catch (error) {
      await saveFailureWithoutMaskingFetchError({
        error: errorMessage(error),
        failedAt: clock(),
        sourceId: source.sourceId,
        url: source.url
      });
      if (cachedText) {
        return cachedText;
      }
      throw error;
    }
  }

  async function saveFailureWithoutMaskingFetchError(
    failure: Parameters<SourceStatusRepository['saveFailure']>[0]
  ): Promise<void> {
    try {
      await dependencies.statuses.saveFailure(failure);
    } catch {
      // The original download or source validation error is more useful to the caller.
    }
  }
}

function cachedTextFor(
  source: RemoteTextSource,
  status: SourceStatus | undefined
): string | undefined {
  return status?.url === source.url && status.text?.trim() ? status.text : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
