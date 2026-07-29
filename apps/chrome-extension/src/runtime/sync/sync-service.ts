import type {
  ConfigurationDocument,
  ProfileDocumentV2,
  SyncEnvelope
} from '@switchypeformance/contracts';

import type { ConfigurationImportPreview } from '../configuration-import-service.ts';
import { resolveSyncConflict, type SyncConflictResolution } from './conflict-resolution.ts';
import { createSyncEnvelope, verifySyncEnvelope } from './sync-envelope.ts';
import {
  normalizeSyncProviderConfiguration,
  type SyncMetadata,
  type SyncMetadataRepository,
  type SyncProviderConfiguration,
  type SyncSecrets,
  type SyncSecretsRepository
} from './sync-settings-repository.ts';

export type { SyncMetadata, SyncProviderConfiguration } from './sync-settings-repository.ts';

export interface SyncRemoteValue {
  envelope: SyncEnvelope;
  etag?: string;
}

export interface SyncWriteExpectation {
  createOnly?: boolean;
  etag?: string;
}

export interface SyncRemoteStore {
  /** Servers with a remote document need an ETag before an overwrite is safe. */
  requiresVersionTagForOverwrite?: boolean;
  load(): Promise<SyncRemoteValue | undefined>;
  save(
    envelope: SyncEnvelope,
    expectation: SyncWriteExpectation
  ): Promise<{ etag?: string; gistId?: string }>;
}

export interface SyncRemoteFactory {
  create(configuration: SyncProviderConfiguration, secrets: SyncSecrets): SyncRemoteStore;
}

export interface SyncServiceDependencies {
  commit(document: ProfileDocumentV2): Promise<unknown>;
  loadConfiguration(): Promise<ConfigurationDocument>;
  metadata: SyncMetadataRepository;
  now?(): number;
  preview(input: unknown): ConfigurationImportPreview;
  remoteFactory: SyncRemoteFactory;
  secrets: SyncSecretsRepository;
}

export interface SyncStatus {
  configured: boolean;
  credentialConfigured: boolean;
  lastSyncedAt?: number;
  lastSyncedDigest?: string;
  provider?: SyncProviderConfiguration;
  revision: number;
}

export interface SyncInspection {
  local: SyncEnvelope;
  remote?: SyncEnvelope;
  remotePreview?: ConfigurationImportPreview;
  resolution: SyncConflictResolution;
}

export interface SyncOperationResult {
  outcome: 'applied-remote' | 'no-op' | 'pushed-local';
  status: SyncStatus;
}

export interface SyncExportPair {
  local: SyncEnvelope;
  remote?: SyncEnvelope;
}

export interface SyncConfigurationInput {
  configuration: SyncProviderConfiguration;
  /** Write-only provider credential. Omit it to keep the previously stored value. */
  secret?: string;
}

export interface SyncService {
  configure(input: SyncConfigurationInput): Promise<SyncStatus>;
  disconnect(): Promise<SyncStatus>;
  exportBoth(): Promise<SyncExportPair>;
  inspect(): Promise<SyncInspection>;
  keepLocal(): Promise<SyncOperationResult>;
  status(): Promise<SyncStatus>;
  useRemote(): Promise<SyncOperationResult>;
}

/**
 * Coordinates explicit sync decisions. It deliberately never calls `save` or
 * `commit` from inspection, so merely opening the settings page cannot change
 * a local or remote configuration.
 */
export function createSyncService(dependencies: SyncServiceDependencies): SyncService {
  const now = dependencies.now ?? (() => Date.now());

  return {
    async configure(input) {
      const configuration = normalizeSyncProviderConfiguration(input.configuration);
      const [metadata, currentSecrets] = await Promise.all([
        dependencies.metadata.load(),
        dependencies.secrets.load()
      ]);
      const nextSecrets = updateSecrets(configuration, currentSecrets, input.secret);
      await Promise.all([
        dependencies.metadata.save({ ...metadata, provider: configuration }),
        dependencies.secrets.save(nextSecrets)
      ]);
      return statusFor({ ...metadata, provider: configuration }, nextSecrets);
    },

    async disconnect() {
      await Promise.all([dependencies.metadata.clear(), dependencies.secrets.clear()]);
      return { configured: false, credentialConfigured: false, revision: 0 };
    },

    async exportBoth() {
      const metadata = await dependencies.metadata.load();
      const local = await localEnvelope(metadata);
      const remote = await loadRemote(metadata);
      return {
        local,
        ...(remote === undefined ? {} : { remote: remote.envelope })
      };
    },

    async inspect() {
      const metadata = await dependencies.metadata.load();
      const local = await localEnvelope(metadata);
      const remote = await loadRemote(metadata);
      const resolution = resolveSyncConflict({
        localRevision: local.revision,
        remoteRevision: remote?.envelope.revision,
        sameDigest: remote?.envelope.digest === local.digest
      });
      if (!remote || resolution.action !== 'require-user-choice') {
        return {
          local,
          ...(remote === undefined ? {} : { remote: remote.envelope }),
          resolution
        };
      }
      return {
        local,
        remote: remote.envelope,
        remotePreview: dependencies.preview(remote.envelope.document),
        resolution
      };
    },

    async keepLocal() {
      const metadata = await dependencies.metadata.load();
      const local = await localEnvelope(metadata);
      const remoteStore = await providerStore(metadata);
      const remote = await loadVerified(remoteStore);
      if (remote?.envelope.digest === local.digest) {
        const nextMetadata = metadataForEnvelope(metadata, remote.envelope);
        await dependencies.metadata.save(nextMetadata);
        return { outcome: 'no-op', status: await currentStatus(nextMetadata) };
      }
      if (remote && remoteStore.requiresVersionTagForOverwrite && !remote.etag) {
        throw new Error('远端没有提供版本标记，无法安全覆盖；请先导出两份配置。');
      }

      const nextRevision = remote
        ? Math.max(local.revision, remote.envelope.revision) + 1
        : local.revision;
      const outgoing =
        nextRevision === local.revision
          ? local
          : { ...local, revision: nextRevision, updatedAt: now() };
      const expectation = remote?.etag ? { etag: remote.etag } : remote ? {} : { createOnly: true };
      const saved = await remoteStore.save(outgoing, expectation);
      const nextMetadata = metadataForEnvelope(metadata, outgoing, saved.gistId);
      await dependencies.metadata.save(nextMetadata);
      return { outcome: 'pushed-local', status: await currentStatus(nextMetadata) };
    },

    async status() {
      const [metadata, secrets] = await Promise.all([
        dependencies.metadata.load(),
        dependencies.secrets.load()
      ]);
      return statusFor(metadata, secrets);
    },

    async useRemote() {
      const metadata = await dependencies.metadata.load();
      const remote = await loadRemote(metadata);
      if (!remote) {
        throw new Error('远端还没有同步配置，无法使用远端版本');
      }
      const local = await localEnvelope(metadata);
      if (remote.envelope.digest === local.digest) {
        const nextMetadata = metadataForEnvelope(metadata, remote.envelope);
        await dependencies.metadata.save(nextMetadata);
        return { outcome: 'no-op', status: await currentStatus(nextMetadata) };
      }
      const preview = dependencies.preview(remote.envelope.document);
      await dependencies.commit(preview.document);
      const nextMetadata = metadataForEnvelope(metadata, remote.envelope);
      await dependencies.metadata.save(nextMetadata);
      return { outcome: 'applied-remote', status: await currentStatus(nextMetadata) };
    }
  };

  async function localEnvelope(metadata: SyncMetadata): Promise<SyncEnvelope> {
    const current = await dependencies.loadConfiguration();
    const baseRevision = Math.max(1, metadata.revision);
    const candidate = await createSyncEnvelope(current, baseRevision, now());
    const revision =
      metadata.lastSyncedDigest === undefined || candidate.digest === metadata.lastSyncedDigest
        ? baseRevision
        : baseRevision + 1;
    return revision === candidate.revision ? candidate : { ...candidate, revision };
  }

  async function loadRemote(metadata: SyncMetadata): Promise<SyncRemoteValue | undefined> {
    return loadVerified(await providerStore(metadata));
  }

  async function providerStore(metadata: SyncMetadata): Promise<SyncRemoteStore> {
    if (!metadata.provider) {
      throw new Error('请先选择同步方式');
    }
    const secrets = await dependencies.secrets.load();
    assertProviderCredential(metadata.provider, secrets);
    return dependencies.remoteFactory.create(metadata.provider, secrets);
  }

  async function currentStatus(metadata: SyncMetadata): Promise<SyncStatus> {
    return statusFor(metadata, await dependencies.secrets.load());
  }
}

async function loadVerified(store: SyncRemoteStore): Promise<SyncRemoteValue | undefined> {
  const remote = await store.load();
  if (!remote) {
    return undefined;
  }
  return {
    envelope: await verifySyncEnvelope(remote.envelope),
    ...(remote.etag === undefined ? {} : { etag: remote.etag })
  };
}

function metadataForEnvelope(
  current: SyncMetadata,
  envelope: SyncEnvelope,
  gistId?: string
): SyncMetadata {
  const provider =
    current.provider?.kind === 'gist' && gistId
      ? { ...current.provider, gistId }
      : current.provider;
  return {
    lastSyncedAt: envelope.updatedAt,
    lastSyncedDigest: envelope.digest,
    ...(provider === undefined ? {} : { provider }),
    revision: envelope.revision
  };
}

function statusFor(metadata: SyncMetadata, secrets: SyncSecrets): SyncStatus {
  const provider = metadata.provider;
  return {
    configured: provider !== undefined,
    credentialConfigured:
      provider?.kind === 'chrome-sync' ||
      (provider?.kind === 'gist' && Boolean(secrets.gistToken)) ||
      (provider?.kind === 'webdav' && Boolean(secrets.webDavPassword)) ||
      false,
    ...(metadata.lastSyncedAt === undefined ? {} : { lastSyncedAt: metadata.lastSyncedAt }),
    ...(metadata.lastSyncedDigest === undefined
      ? {}
      : { lastSyncedDigest: metadata.lastSyncedDigest }),
    ...(provider === undefined ? {} : { provider }),
    revision: metadata.revision
  };
}

function updateSecrets(
  configuration: SyncProviderConfiguration,
  current: SyncSecrets,
  incoming: string | undefined
): SyncSecrets {
  const secret = incoming?.trim();
  switch (configuration.kind) {
    case 'chrome-sync':
      return current;
    case 'gist':
      if (!secret && !current.gistToken) {
        throw new Error('请填写 GitHub 令牌');
      }
      return { ...current, ...(secret ? { gistToken: secret } : {}) };
    case 'webdav':
      if (!secret && !current.webDavPassword) {
        throw new Error('请填写 WebDAV 密码');
      }
      return { ...current, ...(secret ? { webDavPassword: secret } : {}) };
  }
}

function assertProviderCredential(
  configuration: SyncProviderConfiguration,
  secrets: SyncSecrets
): void {
  if (configuration.kind === 'gist' && !secrets.gistToken) {
    throw new Error('请填写 GitHub 令牌');
  }
  if (configuration.kind === 'webdav' && !secrets.webDavPassword) {
    throw new Error('请填写 WebDAV 密码');
  }
}
