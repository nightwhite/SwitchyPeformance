import {
  resolveProfileV2,
  type ConfigurationDocument,
  type ProfileDocument
} from '@switchypeformance/contracts';

import { buildChromeProxySetting, type ChromeProxySetting } from './proxy-setting.ts';
import { buildChromeProxySettingV2 } from './proxy-setting-v2.ts';

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
  | { mode: 'pac_script'; metrics: CompilationMetrics };

export async function applyConfiguration(
  document: ConfigurationDocument,
  dependencies: ApplyConfigurationDependencies
): Promise<ApplyConfigurationResult> {
  const compilationDocument = autoSwitchCompilationDocument(document);
  if (!compilationDocument) {
    const setting = buildSetting(document);
    await dependencies.setProxySetting(setting);
    return { mode: setting.mode } as ApplyConfigurationResult;
  }

  const compilation = await dependencies.compileAutoSwitch(compilationDocument);
  const setting = buildSetting(document, compilation.pacSource);
  await dependencies.setProxySetting(setting);
  return { mode: 'pac_script', metrics: compilation.metrics };
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
