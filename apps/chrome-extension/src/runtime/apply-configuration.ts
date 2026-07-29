import {
  resolveProfileV2,
  type ConfigurationDocument,
  type ProfileDocument
} from '@switchypeformance/contracts';

import { buildChromeProxySetting, type ChromeProxySetting } from './proxy-setting.ts';
import { buildChromeProxySettingV2 } from './proxy-setting-v2.ts';
import { isChromeProxyControlConflict } from './chrome-proxy.ts';
import type { ProxyControlState } from './external-proxy-state.ts';

export interface CompilationMetrics {
  simpleRuleCount: number;
  complexRuleCount: number;
  indexBlockCount: number;
  dnsSensitiveRuleCount: number;
  compileDurationMs?: number;
  pacByteLength?: number;
}

export interface AutoSwitchCompilation {
  pacSource: string;
  metrics: CompilationMetrics;
}

export interface ApplyConfigurationDependencies {
  compileAutoSwitch(document: ConfigurationDocument): Promise<AutoSwitchCompilation>;
  setProxySetting(setting: ChromeProxySetting): Promise<void>;
}

export type ApplyConfigurationResult =
  | { mode: Exclude<ChromeProxySetting['mode'], 'pac_script'> }
  | { mode: 'pac_script'; metrics: CompilationMetrics }
  | { mode: 'deferred'; control: ProxyControlState };

export async function applyConfiguration(
  document: ConfigurationDocument,
  dependencies: ApplyConfigurationDependencies
): Promise<ApplyConfigurationResult> {
  const compilationDocument = autoSwitchCompilationDocument(document);
  if (!compilationDocument) {
    const setting = buildSetting(document);
    return applyProxySetting(
      setting,
      { mode: setting.mode } as Exclude<ApplyConfigurationResult, { mode: 'deferred' }>,
      dependencies.setProxySetting
    );
  }

  const compilation = await dependencies.compileAutoSwitch(compilationDocument);
  const setting = buildSetting(document, compilation.pacSource);
  return applyProxySetting(
    setting,
    { mode: 'pac_script', metrics: compilation.metrics },
    dependencies.setProxySetting
  );
}

async function applyProxySetting(
  setting: ChromeProxySetting,
  result: Exclude<ApplyConfigurationResult, { mode: 'deferred' }>,
  setProxySetting: ApplyConfigurationDependencies['setProxySetting']
): Promise<ApplyConfigurationResult> {
  try {
    await setProxySetting(setting);
    return result;
  } catch (error) {
    if (isChromeProxyControlConflict(error)) {
      return { control: error.control, mode: 'deferred' };
    }
    throw error;
  }
}

function autoSwitchCompilationDocument(
  document: ConfigurationDocument
): ConfigurationDocument | undefined {
  if (document.schemaVersion === 1) {
    const profile = activeV1Profile(document);
    return profile.kind === 'auto-switch' ? document : undefined;
  }

  const resolved = resolveProfileV2(document);
  if (resolved.profile.kind !== 'auto-switch') {
    return undefined;
  }
  return resolved.profileId === document.activeProfileId
    ? document
    : { ...document, activeProfileId: resolved.profileId };
}

function buildSetting(document: ConfigurationDocument, autoSwitchPac?: string): ChromeProxySetting {
  return document.schemaVersion === 1
    ? buildChromeProxySetting(document, autoSwitchPac)
    : buildChromeProxySettingV2(document, autoSwitchPac);
}

function activeV1Profile(document: ProfileDocument): ProfileDocument['profiles'][number] {
  const profile = document.profiles.find((candidate) => candidate.id === document.activeProfileId);
  if (!profile) {
    throw new Error(`当前配置不存在：${document.activeProfileId}`);
  }
  return profile;
}
