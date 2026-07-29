import { parseProfileDocumentV2, type ProfileDocumentV2 } from '../config/document.ts';

/** A portable, credential-free configuration snapshot shared between devices. */
export interface SyncEnvelope {
  schemaVersion: 2;
  revision: number;
  updatedAt: number;
  digest: string;
  document: ProfileDocumentV2;
}

export type SyncEnvelopeParseResult =
  { ok: true; value: SyncEnvelope } | { ok: false; error: string };

/**
 * Validates untrusted sync input before any caller can show it as a preview or
 * apply it to the active Chrome configuration.
 */
export function parseSyncEnvelope(input: unknown): SyncEnvelopeParseResult {
  if (!isRecord(input)) {
    return { ok: false, error: '同步数据格式无效' };
  }
  if (input.schemaVersion !== 2) {
    return { ok: false, error: '同步数据版本不受支持' };
  }
  if (!isRevision(input.revision)) {
    return { ok: false, error: '同步数据修订号无效' };
  }
  if (!isTimestamp(input.updatedAt)) {
    return { ok: false, error: '同步数据时间无效' };
  }
  if (typeof input.digest !== 'string' || !/^[a-f0-9]{64}$/.test(input.digest)) {
    return { ok: false, error: '同步数据摘要无效' };
  }

  const document = parseProfileDocumentV2(input.document);
  if (!document.ok) {
    return { ok: false, error: '同步配置无效' };
  }

  return {
    ok: true,
    value: {
      digest: input.digest,
      document: document.value,
      revision: input.revision,
      schemaVersion: 2,
      updatedAt: input.updatedAt
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
