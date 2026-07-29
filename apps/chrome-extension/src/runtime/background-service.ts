import type { ConfigurationDocument } from '@switchypeformance/contracts';

import type { ApplyConfigurationResult } from './apply-configuration.ts';
import type { ConfigurationRepository } from './configuration-repository.ts';
import { createConfigurationService } from './configuration-service.ts';
import type { DiagnosticEvent, DiagnosticsRepository } from './diagnostics-repository.ts';
import type { ChromeProxySetting } from './proxy-setting.ts';
import type { SourceStatus, SourceStatusRepository } from './source-status-repository.ts';

export interface BackgroundServiceDependencies {
  apply(document: ConfigurationDocument): Promise<ApplyConfigurationResult>;
  configuration: ConfigurationRepository;
  diagnostics: Pick<DiagnosticsRepository, 'append' | 'clear' | 'list'>;
  sources?: Pick<SourceStatusRepository, 'list'>;
}

export interface BackgroundSnapshot {
  configuration: ConfigurationDocument;
  diagnostics: readonly DiagnosticEvent[];
  sourceStatuses: readonly SourceStatus[];
}

export interface BackgroundService {
  activateProfile(profileId: string): Promise<ConfigurationDocument>;
  clearDiagnostics(): Promise<void>;
  mutateConfiguration(
    transform: (current: ConfigurationDocument) => unknown
  ): Promise<ConfigurationDocument>;
  recordProxyError(message: string, detail?: string): Promise<void>;
  reapplyCurrent(): Promise<ApplyConfigurationResult>;
  replaceConfiguration(candidate: unknown): Promise<ConfigurationDocument>;
  snapshot(): Promise<BackgroundSnapshot>;
}

export function createBackgroundService(
  dependencies: BackgroundServiceDependencies
): BackgroundService {
  async function applyWithDiagnostics(
    document: ConfigurationDocument
  ): Promise<ApplyConfigurationResult> {
    const result = await dependencies.apply(document);
    await dependencies.diagnostics.append({
      level: 'info',
      scope: 'configuration',
      message: appliedConfigurationMessage(result)
    });
    return result;
  }

  const configurationService = createConfigurationService({
    apply: applyWithDiagnostics,
    configuration: dependencies.configuration
  });

  async function runConfigurationOperation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      await recordFailure('configuration', error);
      throw error;
    }
  }

  return {
    async activateProfile(profileId) {
      return runConfigurationOperation(() => configurationService.activate(profileId));
    },
    async clearDiagnostics() {
      await dependencies.diagnostics.clear();
    },
    async mutateConfiguration(transform) {
      return runConfigurationOperation(() => configurationService.mutate(transform));
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
      return runConfigurationOperation(() => configurationService.reapply());
    },
    async replaceConfiguration(candidate) {
      return runConfigurationOperation(() => configurationService.replace(candidate));
    },
    async snapshot() {
      const [configuration, diagnostics, sourceStatuses] = await Promise.all([
        dependencies.configuration.load(),
        dependencies.diagnostics.list(),
        dependencies.sources?.list() ?? []
      ]);
      return { configuration, diagnostics, sourceStatuses };
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function appliedConfigurationMessage(result: ApplyConfigurationResult): string {
  if (result.mode === 'deferred') {
    return deferredProxyControlMessage(result.control);
  }
  if (result.mode !== 'pac_script') {
    return `已应用${proxyModeLabel(result.mode)}代理配置`;
  }
  const { metrics } = result;
  const ruleDetails = [
    `${metrics.simpleRuleCount} 条索引规则`,
    `${metrics.complexRuleCount} 条复杂规则`,
    ...(metrics.dnsSensitiveRuleCount > 0
      ? [`${metrics.dnsSensitiveRuleCount} 条可能触发 DNS 的规则`]
      : [])
  ];
  const details = [
    ruleDetails.join('，'),
    ...(metrics.pacByteLength === undefined ? [] : [`${metrics.pacByteLength} 字节`]),
    ...(metrics.compileDurationMs === undefined ? [] : [`${metrics.compileDurationMs} 毫秒`])
  ];
  return `已应用自动切换：${details.join('；')}。`;
}

function deferredProxyControlMessage(
  control: Extract<ApplyConfigurationResult, { mode: 'deferred' }>['control']
): string {
  return control.controlledBy === 'other_extension'
    ? '已保存配置，但 Chrome 代理正由其他扩展控制。恢复控制权后，请重新应用当前配置。'
    : '已保存配置，但 Chrome 代理受系统策略控制。恢复控制权后，请重新应用当前配置。';
}

function proxyModeLabel(mode: Exclude<ChromeProxySetting['mode'], 'pac_script'>): string {
  switch (mode) {
    case 'direct':
      return '直连';
    case 'system':
      return '系统';
    case 'fixed_servers':
      return '固定服务器';
    case 'auto_detect':
      return '自动检测';
  }
}
