import { parseSyncEnvelope, type SyncEnvelope } from '@switchypeformance/contracts';

export interface ChromeSyncStorage {
  get(keys: readonly string[]): Promise<Record<string, unknown>>;
  remove(keys: readonly string[]): Promise<void>;
  set(values: Record<string, unknown>): Promise<void>;
}

export interface ChromeSyncStoreOptions {
  /** Kept below Chrome's per-item storage.sync quota after key and metadata overhead. */
  chunkCharacterLimit?: number;
  maxTotalBytes?: number;
}

export interface ChromeSyncStore {
  clear(): Promise<void>;
  load(): Promise<SyncEnvelope | undefined>;
  save(envelope: SyncEnvelope): Promise<void>;
}

interface ChromeSyncManifest {
  chunkCount: number;
  digest: string;
  generation: string;
  schemaVersion: 1;
}

const MANIFEST_KEY = 'switchypeformance.sync.chrome.manifest.v1';
const CHUNK_KEY_PREFIX = 'switchypeformance.sync.chrome.chunk';
const DEFAULT_CHUNK_BYTE_LIMIT = 7_500;
const DEFAULT_MAX_TOTAL_BYTES = 95_000;

/**
 * Chrome sync has small per-record limits. Chunks are written before the
 * manifest, so an interrupted write leaves the last complete generation live.
 */
export function createChromeSyncStore(
  storage: ChromeSyncStorage,
  options: ChromeSyncStoreOptions = {}
): ChromeSyncStore {
  const chunkByteLimit = options.chunkCharacterLimit ?? DEFAULT_CHUNK_BYTE_LIMIT;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  assertPositiveInteger(chunkByteLimit, 'Chrome 同步分片大小无效');
  assertPositiveInteger(maxTotalBytes, 'Chrome 同步总大小限制无效');

  return {
    async clear() {
      const manifestValue = (await storage.get([MANIFEST_KEY]))[MANIFEST_KEY];
      const manifest = manifestValue === undefined ? undefined : tryParseManifest(manifestValue);
      const keys = [
        MANIFEST_KEY,
        ...(manifest
          ? Array.from({ length: manifest.chunkCount }, (_, index) =>
              chunkKey(manifest.generation, index)
            )
          : [])
      ];
      await storage.remove(keys);
    },

    async load() {
      const manifestValue = (await storage.get([MANIFEST_KEY]))[MANIFEST_KEY];
      if (manifestValue === undefined) {
        return undefined;
      }
      const manifest = parseManifest(manifestValue);
      const keys = Array.from({ length: manifest.chunkCount }, (_, index) =>
        chunkKey(manifest.generation, index)
      );
      const chunks = await storage.get(keys);
      const serialized = keys
        .map((key) => chunks[key])
        .map(readChunk)
        .join('');

      let unknownEnvelope: unknown;
      try {
        unknownEnvelope = JSON.parse(serialized) as unknown;
      } catch {
        throw new Error('Chrome 同步数据损坏，请重新上传本地配置。');
      }
      const parsed = parseSyncEnvelope(unknownEnvelope);
      if (!parsed.ok || parsed.value.digest !== manifest.digest) {
        throw new Error('Chrome 同步数据损坏，请重新上传本地配置。');
      }
      return parsed.value;
    },

    async save(envelope) {
      const parsed = parseSyncEnvelope(envelope);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      const serialized = JSON.stringify(parsed.value);
      const byteLength = new TextEncoder().encode(serialized).byteLength;
      if (byteLength > maxTotalBytes) {
        throw new Error(`同步配置超过 Chrome 同步上限（${maxTotalBytes} 字节）`);
      }
      const chunks = splitTextByUtf8Bytes(serialized, chunkByteLimit);
      const existing = (await storage.get([MANIFEST_KEY]))[MANIFEST_KEY];
      const previous = existing === undefined ? undefined : tryParseManifest(existing);
      const generation = createGeneration();
      const nextChunks = Object.fromEntries(
        chunks.map((chunk, index) => [chunkKey(generation, index), chunk])
      );
      const manifest: ChromeSyncManifest = {
        chunkCount: chunks.length,
        digest: parsed.value.digest,
        generation,
        schemaVersion: 1
      };

      await storage.set(nextChunks);
      await storage.set({ [MANIFEST_KEY]: manifest });
      if (previous) {
        await storage.remove(
          Array.from({ length: previous.chunkCount }, (_, index) =>
            chunkKey(previous.generation, index)
          )
        );
      }
    }
  };
}

function parseManifest(value: unknown): ChromeSyncManifest {
  const parsed = tryParseManifest(value);
  if (!parsed) {
    throw new Error('Chrome 同步数据损坏，请重新上传本地配置。');
  }
  return parsed;
}

function tryParseManifest(value: unknown): ChromeSyncManifest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (
    value.schemaVersion !== 1 ||
    !isPositiveInteger(value.chunkCount) ||
    typeof value.generation !== 'string' ||
    !value.generation ||
    typeof value.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.digest)
  ) {
    return undefined;
  }
  return {
    chunkCount: value.chunkCount,
    digest: value.digest,
    generation: value.generation,
    schemaVersion: 1
  };
}

function readChunk(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('同步数据不完整，请重新上传本地配置。');
  }
  return value;
}

function splitTextByUtf8Bytes(text: string, byteLimit: number): readonly string[] {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const character of text) {
    const characterBytes = encoder.encode(character).byteLength;
    if (characterBytes > byteLimit) {
      throw new Error('Chrome 同步分片大小过小');
    }
    if (currentBytes + characterBytes > byteLimit) {
      chunks.push(current);
      current = character;
      currentBytes = characterBytes;
    } else {
      current += character;
      currentBytes += characterBytes;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function chunkKey(generation: string, index: number): string {
  return `${CHUNK_KEY_PREFIX}.${generation}.${index}`;
}

function createGeneration(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function assertPositiveInteger(value: number, error: string): void {
  if (!isPositiveInteger(value)) {
    throw new Error(error);
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
