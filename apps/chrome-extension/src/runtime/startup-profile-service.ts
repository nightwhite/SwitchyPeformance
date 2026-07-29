import type { ConfigurationDocument } from '@switchypeformance/contracts';

import {
  decideExternalProxyConflict,
  type ExternalProxyDecision,
  type ProxyControlState
} from './external-proxy-state.ts';

export interface StartupProfileServiceDependencies {
  activate(profileId: string): Promise<ConfigurationDocument>;
  loadConfiguration(): Promise<ConfigurationDocument>;
  readProxyControl(): Promise<ProxyControlState>;
  reportExternalControl(
    controlledBy: ProxyControlState['controlledBy'],
    action: Exclude<ExternalProxyDecision['action'], 'apply-startup-profile'>
  ): Promise<unknown>;
}

export type StartupProfileResult =
  | { action: 'apply-startup-profile'; profileId: string }
  | { action: 'leave-unchanged' }
  | { action: 'show-conflict' };

export interface StartupProfileService {
  applyStartupProfile(): Promise<StartupProfileResult>;
}

export function createStartupProfileService(
  dependencies: StartupProfileServiceDependencies
): StartupProfileService {
  return {
    async applyStartupProfile() {
      const [document, proxyControl] = await Promise.all([
        dependencies.loadConfiguration(),
        dependencies.readProxyControl()
      ]);
      const decision = decideExternalProxyConflict(proxyControl, {
        onExternalConflict:
          document.schemaVersion === 2 ? (document.settings.onExternalConflict ?? 'warn') : 'warn'
      });
      if (decision.action !== 'apply-startup-profile') {
        await reportExternalControl(proxyControl.controlledBy, decision.action);
        return decision;
      }

      const profileId =
        document.schemaVersion === 2
          ? document.settings.startupProfileId
          : document.activeProfileId;
      await dependencies.activate(profileId);
      return { action: 'apply-startup-profile', profileId };
    }
  };

  async function reportExternalControl(
    controlledBy: ProxyControlState['controlledBy'],
    action: Exclude<ExternalProxyDecision['action'], 'apply-startup-profile'>
  ): Promise<void> {
    try {
      await dependencies.reportExternalControl(controlledBy, action);
    } catch {
      // A failed diagnostic must not turn an intentionally skipped startup apply into an error.
    }
  }
}
