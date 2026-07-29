export interface SourceStatusStorage {
  read(): Promise<unknown>;
  write(records: SourceStatusRecords): Promise<void>;
}

export interface SourceStatus {
  byteLength?: number;
  etag?: string;
  lastError?: string;
  lastErrorAt?: number;
  lastModified?: string;
  lastSuccessAt?: number;
  ruleCount?: number;
  sourceId: string;
  text?: string;
  url: string;
  warningCount?: number;
}

export type SourceStatusRecords = Record<string, SourceStatus>;

export interface SaveSourceContent {
  byteLength: number;
  etag?: string;
  fetchedAt: number;
  lastModified?: string;
  sourceId: string;
  text: string;
  url: string;
}

export interface SaveSourceFailure {
  error: string;
  failedAt: number;
  sourceId: string;
  url: string;
}

export interface SaveSourceNotModified {
  etag?: string;
  fetchedAt: number;
  sourceId: string;
}

export interface SaveRuleListStats {
  ruleCount: number;
  sourceId: string;
  warningCount: number;
}

export interface SourceStatusRepository {
  clear(): Promise<void>;
  get(sourceId: string): Promise<SourceStatus | undefined>;
  list(): Promise<readonly SourceStatus[]>;
  saveContent(content: SaveSourceContent): Promise<SourceStatus>;
  saveFailure(failure: SaveSourceFailure): Promise<SourceStatus>;
  saveNotModified(notModified: SaveSourceNotModified): Promise<SourceStatus | undefined>;
  saveRuleListStats(stats: SaveRuleListStats): Promise<SourceStatus | undefined>;
}

export interface SourceStatusRepositoryOptions {
  maxCacheBytes?: number;
}

const DEFAULT_MAX_CACHE_BYTES = 6 * 1_024 * 1_024;

export function createSourceStatusRepository(
  storage: SourceStatusStorage,
  options: SourceStatusRepositoryOptions = {}
): SourceStatusRepository {
  let pendingOperation = Promise.resolve();
  const maxCacheBytes = cacheByteLimit(options.maxCacheBytes);

  return {
    clear() {
      return serialize(async () => {
        await storage.write({});
      });
    },
    async get(sourceId) {
      await pendingOperation;
      const status = (await readRecords())[sourceId];
      return status ? cloneStatus(status) : undefined;
    },
    async list() {
      await pendingOperation;
      return Object.values(await readRecords())
        .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
        .map(statusMetadata);
    },
    saveContent(content) {
      return serialize(async () => {
        validateContent(content);
        const status: SourceStatus = {
          byteLength: content.byteLength,
          lastSuccessAt: content.fetchedAt,
          sourceId: content.sourceId,
          text: content.text,
          url: content.url,
          ...(content.etag === undefined ? {} : { etag: content.etag }),
          ...(content.lastModified === undefined ? {} : { lastModified: content.lastModified })
        };
        const records = await readRecords();
        const next = trimCachedContent(
          { ...records, [content.sourceId]: status },
          maxCacheBytes,
          content.sourceId
        );
        await storage.write(next);
        return cloneStatus(next[content.sourceId] ?? status);
      });
    },
    saveFailure(failure) {
      return serialize(async () => {
        validateFailure(failure);
        const records = await readRecords();
        const existing = records[failure.sourceId];
        const status =
          existing?.url === failure.url
            ? {
                ...existing,
                lastError: failure.error,
                lastErrorAt: failure.failedAt
              }
            : {
                lastError: failure.error,
                lastErrorAt: failure.failedAt,
                sourceId: failure.sourceId,
                url: failure.url
              };
        await storage.write({ ...records, [failure.sourceId]: status });
        return cloneStatus(status);
      });
    },
    saveNotModified(notModified) {
      return serialize(async () => {
        validateNotModified(notModified);
        const records = await readRecords();
        const existing = records[notModified.sourceId];
        if (!existing?.text) {
          return undefined;
        }
        const status: SourceStatus = {
          ...existing,
          lastSuccessAt: notModified.fetchedAt,
          ...(notModified.etag === undefined ? {} : { etag: notModified.etag })
        };
        delete status.lastError;
        delete status.lastErrorAt;
        await storage.write({ ...records, [notModified.sourceId]: status });
        return cloneStatus(status);
      });
    },
    saveRuleListStats(stats) {
      return serialize(async () => {
        validateRuleListStats(stats);
        const records = await readRecords();
        const existing = records[stats.sourceId];
        if (!existing) {
          return undefined;
        }
        if (
          existing.ruleCount === stats.ruleCount &&
          existing.warningCount === stats.warningCount
        ) {
          return cloneStatus(existing);
        }
        const status: SourceStatus = {
          ...existing,
          ruleCount: stats.ruleCount,
          warningCount: stats.warningCount
        };
        await storage.write({ ...records, [stats.sourceId]: status });
        return cloneStatus(status);
      });
    }
  };

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pendingOperation.then(operation, operation);
    pendingOperation = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  async function readRecords(): Promise<SourceStatusRecords> {
    return parseRecords(await storage.read());
  }
}

function parseRecords(value: unknown): SourceStatusRecords {
  if (!isRecord(value)) {
    return {};
  }

  const records: SourceStatusRecords = {};
  for (const [sourceId, candidate] of Object.entries(value)) {
    const status = parseStatus(candidate);
    if (status && status.sourceId === sourceId) {
      records[sourceId] = status;
    }
  }
  return records;
}

function parseStatus(value: unknown): SourceStatus | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.sourceId) || !isNonEmptyString(value.url)) {
    return undefined;
  }
  if (
    !isOptionalString(value.text) ||
    !isOptionalString(value.etag) ||
    !isOptionalString(value.lastModified) ||
    !isOptionalString(value.lastError) ||
    !isOptionalTimestamp(value.lastSuccessAt) ||
    !isOptionalTimestamp(value.lastErrorAt) ||
    !isOptionalByteLength(value.byteLength) ||
    !isOptionalNonNegativeInteger(value.ruleCount) ||
    !isOptionalNonNegativeInteger(value.warningCount)
  ) {
    return undefined;
  }

  return {
    sourceId: value.sourceId,
    url: value.url,
    ...(value.text === undefined ? {} : { text: value.text }),
    ...(value.etag === undefined ? {} : { etag: value.etag }),
    ...(value.lastModified === undefined ? {} : { lastModified: value.lastModified }),
    ...(value.lastError === undefined ? {} : { lastError: value.lastError }),
    ...(value.lastSuccessAt === undefined ? {} : { lastSuccessAt: value.lastSuccessAt }),
    ...(value.lastErrorAt === undefined ? {} : { lastErrorAt: value.lastErrorAt }),
    ...(value.byteLength === undefined ? {} : { byteLength: value.byteLength }),
    ...(value.ruleCount === undefined ? {} : { ruleCount: value.ruleCount }),
    ...(value.warningCount === undefined ? {} : { warningCount: value.warningCount })
  };
}

function validateContent(content: SaveSourceContent): void {
  if (
    !isNonEmptyString(content.sourceId) ||
    !isNonEmptyString(content.url) ||
    typeof content.text !== 'string' ||
    !Number.isInteger(content.byteLength) ||
    content.byteLength < 0 ||
    !isTimestamp(content.fetchedAt)
  ) {
    throw new Error('来源成功状态无效');
  }
}

function validateFailure(failure: SaveSourceFailure): void {
  if (
    !isNonEmptyString(failure.sourceId) ||
    !isNonEmptyString(failure.url) ||
    !isNonEmptyString(failure.error) ||
    !isTimestamp(failure.failedAt)
  ) {
    throw new Error('来源失败状态无效');
  }
}

function validateNotModified(notModified: SaveSourceNotModified): void {
  if (!isNonEmptyString(notModified.sourceId) || !isTimestamp(notModified.fetchedAt)) {
    throw new Error('来源未修改状态无效');
  }
}

function validateRuleListStats(stats: SaveRuleListStats): void {
  if (
    !isNonEmptyString(stats.sourceId) ||
    !isNonNegativeInteger(stats.ruleCount) ||
    !isNonNegativeInteger(stats.warningCount)
  ) {
    throw new Error('规则列表统计无效');
  }
}

function cloneStatus(status: SourceStatus): SourceStatus {
  return { ...status };
}

function statusMetadata(status: SourceStatus): SourceStatus {
  const metadata = cloneStatus(status);
  delete metadata.text;
  delete metadata.etag;
  delete metadata.lastModified;
  return metadata;
}

function cacheByteLimit(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_MAX_CACHE_BYTES;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('来源缓存大小限制无效');
  }
  return value;
}

function trimCachedContent(
  records: SourceStatusRecords,
  maxCacheBytes: number,
  newestSourceId: string
): SourceStatusRecords {
  let totalBytes = cachedByteLength(records);
  if (totalBytes <= maxCacheBytes) {
    return records;
  }

  const candidates = Object.values(records)
    .filter((status) => status.text !== undefined)
    .sort((left, right) => {
      const leftNewest = left.sourceId === newestSourceId ? 1 : 0;
      const rightNewest = right.sourceId === newestSourceId ? 1 : 0;
      if (leftNewest !== rightNewest) {
        return leftNewest - rightNewest;
      }
      return (left.lastSuccessAt ?? 0) - (right.lastSuccessAt ?? 0);
    });
  const trimmed = { ...records };
  for (const candidate of candidates) {
    if (totalBytes <= maxCacheBytes) {
      break;
    }
    totalBytes -= utf8ByteLength(candidate.text ?? '');
    trimmed[candidate.sourceId] = withoutCachedContent(candidate);
  }
  return trimmed;
}

function cachedByteLength(records: SourceStatusRecords): number {
  return Object.values(records).reduce(
    (total, status) => total + utf8ByteLength(status.text ?? ''),
    0
  );
}

function withoutCachedContent(status: SourceStatus): SourceStatus {
  const next = { ...status };
  delete next.text;
  delete next.etag;
  delete next.lastModified;
  return next;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isOptionalTimestamp(value: unknown): value is number | undefined {
  return value === undefined || isTimestamp(value);
}

function isOptionalByteLength(value: unknown): value is number | undefined {
  return (
    value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= 0)
  );
}

function isOptionalNonNegativeInteger(value: unknown): value is number | undefined {
  return value === undefined || isNonNegativeInteger(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
