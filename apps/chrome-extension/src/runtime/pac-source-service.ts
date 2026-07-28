import {
  resolveProfileV2,
  type ConfigurationDocument,
  type PacSource,
  type ProfileDocumentV2
} from '@switchypeformance/contracts';

import type { SourceFetcher } from './source-fetcher.ts';
import type { SourceStatus, SourceStatusRepository } from './source-status-repository.ts';

const DEFAULT_MAX_PAC_BYTES = 1_024 * 1_024;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface PacSourceServiceDependencies {
  clock?: () => number;
  fetcher: Pick<SourceFetcher, 'fetch'>;
  maxBytes?: number;
  statuses: Pick<SourceStatusRepository, 'get' | 'saveContent' | 'saveFailure' | 'saveNotModified'>;
  timeoutMs?: number;
}

export interface PacSourceService {
  refreshAndResolve<T extends ConfigurationDocument>(document: T): Promise<T>;
  resolveForApply<T extends ConfigurationDocument>(document: T): Promise<T>;
}

interface ActiveRemotePac {
  profileId: string;
  source: Extract<PacSource, { kind: 'url' }>;
}

export function createPacSourceService(
  dependencies: PacSourceServiceDependencies
): PacSourceService {
  const clock = dependencies.clock ?? Date.now;
  const maxBytes = dependencies.maxBytes ?? DEFAULT_MAX_PAC_BYTES;
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async refreshAndResolve(document) {
      const activePac = activeRemotePac(document);
      if (!activePac) {
        return document;
      }
      const status = await dependencies.statuses.get(pacSourceStatusId(activePac.profileId));
      return refreshAndResolve(document, activePac, status);
    },
    async resolveForApply(document) {
      const activePac = activeRemotePac(document);
      if (!activePac) {
        return document;
      }
      const status = await dependencies.statuses.get(pacSourceStatusId(activePac.profileId));
      const cachedText = cachedTextFor(activePac, status);
      if (cachedText) {
        return withInlinePac(document, activePac.profileId, cachedText);
      }
      return refreshAndResolve(document, activePac, status);
    }
  };

  async function refreshAndResolve<T extends ConfigurationDocument>(
    document: T,
    activePac: ActiveRemotePac,
    currentStatus: SourceStatus | undefined
  ): Promise<T> {
    const sourceId = pacSourceStatusId(activePac.profileId);
    const cachedText = cachedTextFor(activePac, currentStatus);
    const etag = currentStatus?.url === activePac.source.url ? currentStatus.etag : undefined;

    try {
      const result = await dependencies.fetcher.fetch({
        headers: activePac.source.headers,
        maxBytes,
        timeoutMs,
        url: activePac.source.url,
        ...(etag === undefined ? {} : { etag })
      });
      if (result.kind === 'not-modified') {
        if (!cachedText) {
          throw new Error('PAC 服务器返回未修改，但本地没有可用缓存');
        }
        await dependencies.statuses.saveNotModified({
          fetchedAt: clock(),
          sourceId,
          ...(result.etag === undefined ? {} : { etag: result.etag })
        });
        return withInlinePac(document, activePac.profileId, cachedText);
      }

      await dependencies.statuses.saveContent({
        byteLength: result.byteLength,
        fetchedAt: clock(),
        sourceId,
        text: result.text,
        url: activePac.source.url,
        ...(result.etag === undefined ? {} : { etag: result.etag }),
        ...(result.lastModified === undefined ? {} : { lastModified: result.lastModified })
      });
      return withInlinePac(document, activePac.profileId, result.text);
    } catch (error) {
      await saveFailureWithoutMaskingFetchError({
        error: errorMessage(error),
        failedAt: clock(),
        sourceId,
        url: activePac.source.url
      });
      if (cachedText) {
        return withInlinePac(document, activePac.profileId, cachedText);
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
      // The original fetch or PAC validation failure is more useful to the caller.
    }
  }
}

export function pacSourceStatusId(profileId: string): string {
  return `pac:${profileId}`;
}

function activeRemotePac(document: ConfigurationDocument): ActiveRemotePac | undefined {
  if (document.schemaVersion !== 2) {
    return undefined;
  }
  const resolved = resolveProfileV2(document);
  if (resolved.profile.kind !== 'pac' || resolved.profile.source.kind !== 'url') {
    return undefined;
  }
  return { profileId: resolved.profileId, source: resolved.profile.source };
}

function cachedTextFor(
  activePac: ActiveRemotePac,
  status: SourceStatus | undefined
): string | undefined {
  return status?.url === activePac.source.url && status.text?.trim() ? status.text : undefined;
}

function withInlinePac<T extends ConfigurationDocument>(
  document: T,
  profileId: string,
  text: string
): T {
  if (document.schemaVersion !== 2) {
    return document;
  }
  const resolved: ProfileDocumentV2 = {
    ...document,
    profiles: document.profiles.map((profile) =>
      profile.id === profileId && profile.kind === 'pac'
        ? { ...profile, source: { kind: 'inline', text } }
        : profile
    )
  };
  return resolved as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
