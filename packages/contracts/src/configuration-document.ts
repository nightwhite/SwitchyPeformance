import {
  parseProfileDocument,
  type ProfileDocument,
  type ProfileDocumentIssue
} from './profile-document.ts';
import {
  parseProfileDocumentV2,
  type ProfileDocumentV2,
  type ProfileDocumentV2Issue
} from './config/document.ts';

export type ConfigurationDocument = ProfileDocument | ProfileDocumentV2;

export type ConfigurationDocumentIssue =
  | ProfileDocumentIssue
  | ProfileDocumentV2Issue
  | { code: 'unsupported-schema-version'; path: 'schemaVersion' };

export type ConfigurationDocumentParseResult =
  | { ok: true; value: ConfigurationDocument }
  | { ok: false; issues: readonly ConfigurationDocumentIssue[] };

export function parseConfigurationDocument(input: unknown): ConfigurationDocumentParseResult {
  if (!isRecord(input) || (input.schemaVersion !== 1 && input.schemaVersion !== 2)) {
    return {
      ok: false,
      issues: [{ code: 'unsupported-schema-version', path: 'schemaVersion' }]
    };
  }

  return input.schemaVersion === 1 ? parseProfileDocument(input) : parseProfileDocumentV2(input);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
