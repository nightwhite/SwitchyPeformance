import {
  resolveProfileV2,
  type ConfigurationDocument,
  type PacSource,
  type ProfileDocumentV2
} from '@switchypeformance/contracts';

import { createRemoteTextSourceService } from './remote-text-source-service.ts';
import type { SourceFetcher } from './source-fetcher.ts';
import type { SourceStatusRepository } from './source-status-repository.ts';

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
  const sources = createRemoteTextSourceService({
    contentKind: 'pac',
    fetcher: dependencies.fetcher,
    maxBytes: dependencies.maxBytes ?? DEFAULT_MAX_PAC_BYTES,
    statuses: dependencies.statuses,
    timeoutMs: dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ...(dependencies.clock === undefined ? {} : { clock: dependencies.clock })
  });

  return {
    async refreshAndResolve(document) {
      const activePac = activeRemotePac(document);
      if (!activePac) {
        return document;
      }
      return withInlinePac(
        document,
        activePac.profileId,
        await sources.refresh(remoteSource(activePac))
      );
    },
    async resolveForApply(document) {
      const activePac = activeRemotePac(document);
      if (!activePac) {
        return document;
      }
      return withInlinePac(
        document,
        activePac.profileId,
        await sources.resolveForApply(remoteSource(activePac))
      );
    }
  };
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

function remoteSource(activePac: ActiveRemotePac) {
  return {
    headers: activePac.source.headers,
    sourceId: pacSourceStatusId(activePac.profileId),
    url: activePac.source.url
  };
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
