import {
  migrateV1Document,
  type ConfigurationDocument,
  type ProfileDocumentV2
} from '@switchypeformance/contracts';

import type { SourceStatus } from './source-status-repository.ts';

export const CONFIGURATION_EXPORT_FORMAT = 'switchypeformance-configuration';
export const CONFIGURATION_EXPORT_FORMAT_VERSION = 1;

export interface PortableSourceStatus {
  lastSuccessAt?: number;
  ruleCount?: number;
  sourceId: string;
  url: string;
  warningCount?: number;
}

export interface ConfigurationExport {
  configuration: ProfileDocumentV2;
  exportedAt: number;
  format: typeof CONFIGURATION_EXPORT_FORMAT;
  formatVersion: typeof CONFIGURATION_EXPORT_FORMAT_VERSION;
  sourceStatuses: readonly PortableSourceStatus[];
}

/**
 * Produces a portable backup. Credentials, their local bindings, request logs,
 * and downloaded rule caches deliberately never enter the exported payload.
 */
export function exportConfiguration(
  document: ConfigurationDocument,
  sourceStatuses: readonly SourceStatus[] = [],
  exportedAt = Date.now()
): ConfigurationExport {
  return {
    configuration: portableConfiguration(document),
    exportedAt,
    format: CONFIGURATION_EXPORT_FORMAT,
    formatVersion: CONFIGURATION_EXPORT_FORMAT_VERSION,
    sourceStatuses: sourceStatuses.map(portableSourceStatus)
  };
}

export function portableConfiguration(document: ConfigurationDocument): ProfileDocumentV2 {
  const normalized = document.schemaVersion === 2 ? document : migrateV1Document(document).value;
  const cloned = structuredClone(normalized);
  return {
    activeProfileId: cloned.activeProfileId,
    profiles: cloned.profiles,
    proxyServers: cloned.proxyServers.map(({ credentialId: _credentialId, ...proxy }) => proxy),
    ruleSources: cloned.ruleSources,
    schemaVersion: 2,
    settings: cloned.settings
  };
}

function portableSourceStatus(status: SourceStatus): PortableSourceStatus {
  return {
    sourceId: status.sourceId,
    url: status.url,
    ...(status.lastSuccessAt === undefined ? {} : { lastSuccessAt: status.lastSuccessAt }),
    ...(status.ruleCount === undefined ? {} : { ruleCount: status.ruleCount }),
    ...(status.warningCount === undefined ? {} : { warningCount: status.warningCount })
  };
}
