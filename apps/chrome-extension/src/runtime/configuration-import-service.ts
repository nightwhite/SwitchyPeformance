import {
  importProfileDocument,
  migrateV1Document,
  parseConfigurationDocument,
  parseProfileDocumentV2,
  type ProfileDocumentV2
} from '@switchypeformance/contracts';

import {
  CONFIGURATION_EXPORT_FORMAT,
  CONFIGURATION_EXPORT_FORMAT_VERSION,
  portableConfiguration
} from './configuration-export.ts';

export type ConfigurationImportSource = 'legacy' | 'switchypeformance-v1' | 'switchypeformance-v2';

export interface ConfigurationImportCounts {
  profiles: number;
  proxyServers: number;
  rules: number;
  skipped: number;
}

export interface ConfigurationImportPreview {
  counts: ConfigurationImportCounts;
  document: ProfileDocumentV2;
  source: ConfigurationImportSource;
  warnings: readonly string[];
}

export interface ConfigurationImportServiceDependencies {
  /** Applies and persists the candidate through the existing atomic configuration service. */
  commit(document: ProfileDocumentV2): Promise<ProfileDocumentV2>;
}

export interface ConfigurationImportService {
  commitPreview(preview?: ConfigurationImportPreview): Promise<ProfileDocumentV2>;
  preview(input: unknown): ConfigurationImportPreview;
}

export function createConfigurationImportService(
  dependencies: ConfigurationImportServiceDependencies
): ConfigurationImportService {
  let pendingPreview: ConfigurationImportPreview | undefined;

  return {
    async commitPreview(preview) {
      const selected = preview ?? pendingPreview;
      if (!selected) {
        throw new Error('没有可确认的导入预览');
      }
      const document = verifyV2Document(selected.document);
      const committed = await dependencies.commit(document);
      pendingPreview = undefined;
      return committed;
    },
    preview(input) {
      const next = previewConfigurationImport(input);
      pendingPreview = clonePreview(next);
      return clonePreview(next);
    }
  };
}

/** A side-effect-free import preview for sync and other trusted callers. */
export function previewConfigurationImport(input: unknown): ConfigurationImportPreview {
  return clonePreview(buildPreview(input));
}

/** Parses file contents only. File extensions such as .bak are intentionally irrelevant. */
export function parseConfigurationImportText(text: string): unknown {
  const normalized = text.replace(/^\uFEFF/, '').trim();
  if (!normalized) {
    throw new Error('配置文件为空，无法读取有效 JSON');
  }
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    throw new Error('配置文件不是有效 JSON');
  }
}

function buildPreview(input: unknown): ConfigurationImportPreview {
  const candidate = extractExportedConfiguration(input);
  const parsed = parseConfigurationDocument(candidate);
  const warnings: string[] = [];
  let source: ConfigurationImportSource;
  let document: ProfileDocumentV2;

  if (parsed.ok) {
    if (parsed.value.schemaVersion === 2) {
      source = 'switchypeformance-v2';
      document = parsed.value;
    } else {
      source = 'switchypeformance-v1';
      const migration = migrateV1Document(parsed.value);
      document = migration.value;
      warnings.push(...migration.warnings);
    }
  } else {
    const legacy = importProfileDocument(candidate);
    if (!legacy.ok) {
      throw new Error(legacy.error);
    }
    source = 'legacy';
    const migration = migrateV1Document(legacy.value);
    document = applyLegacyRuleInsertPreference(migration.value, candidate);
    warnings.push(...legacy.warnings, ...migration.warnings);
  }

  const credentialBindings = document.proxyServers.filter(
    (proxy) => proxy.credentialId !== undefined
  ).length;
  if (credentialBindings > 0) {
    warnings.push(`已移除 ${credentialBindings} 个本地账号密码引用；请在本机重新填写。`);
  }
  const portable = portableConfiguration(document);
  return {
    counts: previewCounts(portable, warnings),
    document: portable,
    source,
    warnings
  };
}

function extractExportedConfiguration(input: unknown): unknown {
  if (!isRecord(input) || input.format !== CONFIGURATION_EXPORT_FORMAT) {
    return input;
  }
  if (
    input.formatVersion !== CONFIGURATION_EXPORT_FORMAT_VERSION ||
    !Object.hasOwn(input, 'configuration')
  ) {
    throw new Error('配置备份版本不受支持');
  }
  return input.configuration;
}

function applyLegacyRuleInsertPreference(
  document: ProfileDocumentV2,
  input: unknown
): ProfileDocumentV2 {
  if (!isRecord(input) || typeof input['-addConditionsToBottom'] !== 'boolean') {
    return document;
  }
  return {
    ...document,
    settings: {
      ...document.settings,
      ruleInsertPosition: input['-addConditionsToBottom'] ? 'last' : 'first'
    }
  };
}

function previewCounts(
  document: ProfileDocumentV2,
  warnings: readonly string[]
): ConfigurationImportCounts {
  return {
    profiles: document.profiles.length,
    proxyServers: document.proxyServers.length,
    rules: document.profiles.reduce(
      (count, profile) => count + (profile.kind === 'auto-switch' ? profile.rules.length : 0),
      0
    ),
    skipped: warnings.filter(isSkippedWarning).length
  };
}

function isSkippedWarning(warning: string): boolean {
  return warning.includes('跳过') || warning.includes('移除');
}

function verifyV2Document(candidate: unknown): ProfileDocumentV2 {
  const parsed = parseProfileDocumentV2(candidate);
  if (!parsed.ok) {
    throw new Error('导入预览中的配置已失效');
  }
  return portableConfiguration(parsed.value);
}

function clonePreview(preview: ConfigurationImportPreview): ConfigurationImportPreview {
  return structuredClone(preview);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
