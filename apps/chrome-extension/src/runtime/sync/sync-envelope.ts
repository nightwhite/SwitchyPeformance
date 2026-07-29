import {
  parseSyncEnvelope,
  type ConfigurationDocument,
  type ProfileDocumentV2,
  type SyncEnvelope
} from '@switchypeformance/contracts';

import { portableConfiguration } from '../configuration-export.ts';

/** Creates a portable V2 snapshot and binds it to a deterministic SHA-256 digest. */
export async function createSyncEnvelope(
  document: ConfigurationDocument | ProfileDocumentV2,
  revision: number,
  updatedAt = Date.now()
): Promise<SyncEnvelope> {
  const portable = portableConfiguration(document);
  return {
    digest: await digestProfileDocument(portable),
    document: portable,
    revision,
    schemaVersion: 2,
    updatedAt
  };
}

/** Validates both the shape and the content digest of data received from another device. */
export async function verifySyncEnvelope(input: unknown): Promise<SyncEnvelope> {
  const parsed = parseSyncEnvelope(input);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const digest = await digestProfileDocument(parsed.value.document);
  if (digest !== parsed.value.digest) {
    throw new Error('同步数据摘要不匹配，已拒绝应用远端配置。');
  }
  return parsed.value;
}

export async function digestProfileDocument(document: ProfileDocumentV2): Promise<string> {
  if (!crypto.subtle) {
    throw new Error('当前浏览器不支持配置同步校验');
  }
  const source = new TextEncoder().encode(canonicalJson(document));
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', source));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalJson(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) {
        throw new Error('同步配置包含无效数值');
      }
      return JSON.stringify(value);
    case 'object': {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
        .join(',')}}`;
    }
    default:
      throw new Error('同步配置包含不支持的数据');
  }
}
