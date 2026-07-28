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
  sourceId: string;
  text?: string;
  url: string;
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

export interface SourceStatusRepository {
  get(sourceId: string): Promise<SourceStatus | undefined>;
  saveContent(content: SaveSourceContent): Promise<SourceStatus>;
  saveFailure(failure: SaveSourceFailure): Promise<SourceStatus>;
  saveNotModified(notModified: SaveSourceNotModified): Promise<SourceStatus | undefined>;
}

export function createSourceStatusRepository(storage: SourceStatusStorage): SourceStatusRepository {
  let pendingOperation = Promise.resolve();

  return {
    async get(sourceId) {
      await pendingOperation;
      const status = (await readRecords())[sourceId];
      return status ? cloneStatus(status) : undefined;
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
        await storage.write({ ...records, [content.sourceId]: status });
        return cloneStatus(status);
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
    !isOptionalByteLength(value.byteLength)
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
    ...(value.byteLength === undefined ? {} : { byteLength: value.byteLength })
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

function cloneStatus(status: SourceStatus): SourceStatus {
  return { ...status };
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
