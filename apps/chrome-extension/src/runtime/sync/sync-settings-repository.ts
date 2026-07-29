export type SyncProviderConfiguration =
  | { kind: 'chrome-sync' }
  | { fileName: string; gistId?: string; kind: 'gist' }
  | { kind: 'webdav'; url: string; username: string };

export interface SyncMetadata {
  lastSyncedAt?: number;
  lastSyncedDigest?: string;
  provider?: SyncProviderConfiguration;
  revision: number;
}

export interface SyncSecrets {
  gistToken?: string;
  webDavPassword?: string;
}

export interface SyncValueStorage {
  read(): Promise<unknown>;
  write(value: unknown): Promise<void>;
}

export interface SyncMetadataRepository {
  clear(): Promise<void>;
  load(): Promise<SyncMetadata>;
  save(value: SyncMetadata): Promise<void>;
}

export interface SyncSecretsRepository {
  clear(): Promise<void>;
  load(): Promise<SyncSecrets>;
  save(value: SyncSecrets): Promise<void>;
}

export function createSyncMetadataRepository(storage: SyncValueStorage): SyncMetadataRepository {
  return {
    async clear() {
      await storage.write({ revision: 0 });
    },
    async load() {
      return parseMetadata(await storage.read());
    },
    async save(value) {
      await storage.write(parseMetadata(value));
    }
  };
}

export function createSyncSecretsRepository(storage: SyncValueStorage): SyncSecretsRepository {
  return {
    async clear() {
      await storage.write({});
    },
    async load() {
      return parseSecrets(await storage.read());
    },
    async save(value) {
      await storage.write(parseSecrets(value));
    }
  };
}

export function normalizeSyncProviderConfiguration(input: unknown): SyncProviderConfiguration {
  if (!isRecord(input) || typeof input.kind !== 'string') {
    throw new Error('同步方式无效');
  }
  switch (input.kind) {
    case 'chrome-sync':
      return { kind: 'chrome-sync' };
    case 'gist': {
      const fileName = normalizedString(input.fileName);
      const gistId = optionalString(input.gistId);
      if (!fileName) {
        throw new Error('Gist 文件名不能为空');
      }
      return { fileName, ...(gistId ? { gistId } : {}), kind: 'gist' };
    }
    case 'webdav': {
      const url = normalizedString(input.url);
      const username = normalizedString(input.username);
      if (!url || !username) {
        throw new Error('WebDAV 地址和账号不能为空');
      }
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('WebDAV 地址只能使用 HTTP 或 HTTPS');
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('只能使用')) {
          throw error;
        }
        throw new Error('WebDAV 地址无效');
      }
      return { kind: 'webdav', url, username };
    }
    default:
      throw new Error('同步方式无效');
  }
}

function parseMetadata(value: unknown): SyncMetadata {
  if (!isRecord(value)) {
    return { revision: 0 };
  }
  let provider: SyncProviderConfiguration | undefined;
  try {
    provider =
      value.provider === undefined ? undefined : normalizeSyncProviderConfiguration(value.provider);
  } catch {
    provider = undefined;
  }
  const revision = isNonNegativeInteger(value.revision) ? value.revision : 0;
  const lastSyncedAt = isPositiveInteger(value.lastSyncedAt) ? value.lastSyncedAt : undefined;
  const lastSyncedDigest = isDigest(value.lastSyncedDigest) ? value.lastSyncedDigest : undefined;
  return {
    ...(lastSyncedAt === undefined ? {} : { lastSyncedAt }),
    ...(lastSyncedDigest === undefined ? {} : { lastSyncedDigest }),
    ...(provider === undefined ? {} : { provider }),
    revision
  };
}

function parseSecrets(value: unknown): SyncSecrets {
  if (!isRecord(value)) {
    return {};
  }
  const gistToken = optionalString(value.gistToken);
  const webDavPassword = optionalString(value.webDavPassword);
  return {
    ...(gistToken ? { gistToken } : {}),
    ...(webDavPassword ? { webDavPassword } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalString(value: unknown): string | undefined {
  return normalizedString(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
