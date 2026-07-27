import type { ProfileDocument } from '@switchypeformance/contracts';

import { buildChromeProxySetting, type ChromeProxySetting } from './proxy-setting.ts';

export interface CompilationMetrics {
  simpleRuleCount: number;
  complexRuleCount: number;
  indexBlockCount: number;
  compileDurationMs?: number;
  pacByteLength?: number;
}

export interface AutoSwitchCompilation {
  pacSource: string;
  metrics: CompilationMetrics;
}

export interface ApplyConfigurationDependencies {
  compileAutoSwitch(document: ProfileDocument): Promise<AutoSwitchCompilation>;
  setProxySetting(setting: ChromeProxySetting): Promise<void>;
}

export type ApplyConfigurationResult =
  | { mode: Exclude<ChromeProxySetting['mode'], 'pac_script'> }
  | { mode: 'pac_script'; metrics: CompilationMetrics };

export async function applyConfiguration(
  document: ProfileDocument,
  dependencies: ApplyConfigurationDependencies
): Promise<ApplyConfigurationResult> {
  const activeProfile = document.profiles.find(
    (candidate) => candidate.id === document.activeProfileId
  );
  if (!activeProfile) {
    throw new Error(`Active profile does not exist: ${document.activeProfileId}`);
  }

  if (activeProfile.kind !== 'auto-switch') {
    const setting = buildChromeProxySetting(document);
    await dependencies.setProxySetting(setting);
    return { mode: setting.mode } as ApplyConfigurationResult;
  }

  const compilation = await dependencies.compileAutoSwitch(document);
  const setting = buildChromeProxySetting(document, compilation.pacSource);
  await dependencies.setProxySetting(setting);
  return { mode: 'pac_script', metrics: compilation.metrics };
}
