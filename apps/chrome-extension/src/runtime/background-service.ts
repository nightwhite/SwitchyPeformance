import { parseProfileDocument, type ProfileDocument } from '@switchypeformance/contracts';

import type { ApplyConfigurationResult } from './apply-configuration.ts';
import type { ConfigurationRepository } from './configuration-repository.ts';
import type { DiagnosticEvent, DiagnosticsRepository } from './diagnostics-repository.ts';

export interface BackgroundServiceDependencies {
  apply(document: ProfileDocument): Promise<ApplyConfigurationResult>;
  configuration: ConfigurationRepository;
  diagnostics: Pick<DiagnosticsRepository, 'append' | 'clear' | 'list'>;
}

export interface BackgroundSnapshot {
  configuration: ProfileDocument;
  diagnostics: readonly DiagnosticEvent[];
}

export interface BackgroundService {
  activateProfile(profileId: string): Promise<ProfileDocument>;
  clearDiagnostics(): Promise<void>;
  recordProxyError(message: string, detail?: string): Promise<void>;
  reapplyCurrent(): Promise<ApplyConfigurationResult>;
  replaceConfiguration(candidate: unknown): Promise<ProfileDocument>;
  snapshot(): Promise<BackgroundSnapshot>;
}

export function createBackgroundService(
  dependencies: BackgroundServiceDependencies
): BackgroundService {
  async function applyWithDiagnostics(
    document: ProfileDocument
  ): Promise<ApplyConfigurationResult> {
    try {
      const result = await dependencies.apply(document);
      await dependencies.diagnostics.append({
        level: 'info',
        scope: 'configuration',
        message: appliedConfigurationMessage(result)
      });
      return result;
    } catch (error) {
      await recordFailure('configuration', error);
      throw error;
    }
  }

  async function updateConfiguration(candidate: unknown): Promise<ProfileDocument> {
    const document = validateConfiguration(candidate);
    await applyWithDiagnostics(document);
    return dependencies.configuration.replace(document);
  }

  return {
    async activateProfile(profileId) {
      const current = await dependencies.configuration.load();
      return updateConfiguration({ ...current, activeProfileId: profileId });
    },
    async clearDiagnostics() {
      await dependencies.diagnostics.clear();
    },
    async recordProxyError(message, detail) {
      await dependencies.diagnostics.append({
        level: 'error',
        scope: 'proxy',
        message,
        ...(detail === undefined ? {} : { detail })
      });
    },
    async reapplyCurrent() {
      const document = await dependencies.configuration.load();
      return applyWithDiagnostics(document);
    },
    replaceConfiguration: updateConfiguration,
    async snapshot() {
      const [configuration, diagnostics] = await Promise.all([
        dependencies.configuration.load(),
        dependencies.diagnostics.list()
      ]);
      return { configuration, diagnostics };
    }
  };

  async function recordFailure(scope: 'configuration' | 'runtime', error: unknown): Promise<void> {
    try {
      await dependencies.diagnostics.append({
        level: 'error',
        scope,
        message: errorMessage(error)
      });
    } catch {
      // Diagnostics must never replace the original routing failure.
    }
  }
}

function validateConfiguration(candidate: unknown): ProfileDocument {
  const result = parseProfileDocument(candidate);
  if (!result.ok) {
    throw new Error('Configuration is invalid');
  }
  return result.value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function appliedConfigurationMessage(result: ApplyConfigurationResult): string {
  if (result.mode !== 'pac_script') {
    return `Applied ${result.mode} proxy configuration`;
  }
  const { metrics } = result;
  const details = [
    `${metrics.simpleRuleCount} indexed rules, ${metrics.complexRuleCount} complex rules`,
    ...(metrics.pacByteLength === undefined ? [] : [`${metrics.pacByteLength} bytes`]),
    ...(metrics.compileDurationMs === undefined ? [] : [`${metrics.compileDurationMs} ms`])
  ];
  return `Applied automatic routing: ${details.join('; ')}.`;
}
