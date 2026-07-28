import type { ConfigurationDocument } from '@switchypeformance/contracts';

import { profileSwitchRefreshTabId, shouldReloadAfterProfileChange } from './shortcut-service.ts';

export interface ProfileActivationTab {
  id?: number | undefined;
  url?: string | undefined;
}

export interface ProfileActivationServiceDependencies {
  activate(profileId: string): Promise<ConfigurationDocument>;
  queryActiveTab(): Promise<ProfileActivationTab | undefined>;
  reloadTab(tabId: number): Promise<void>;
  reportRefreshFailure(message: string, detail: string): Promise<unknown>;
}

export interface ProfileActivationService {
  activate(profileId: string, currentTab?: ProfileActivationTab): Promise<ConfigurationDocument>;
}

export function createProfileActivationService(
  dependencies: ProfileActivationServiceDependencies
): ProfileActivationService {
  return {
    async activate(profileId, currentTab) {
      const document = await dependencies.activate(profileId);
      if (!shouldReloadAfterProfileChange(document)) {
        return document;
      }

      const tab = currentTab ?? (await activeTabOrReport());
      const tabId = profileSwitchRefreshTabId(tab, true);
      if (tabId === undefined) {
        return document;
      }

      try {
        await dependencies.reloadTab(tabId);
      } catch (error) {
        await reportFailure('刷新当前标签页失败', errorMessage(error));
      }
      return document;
    }
  };

  async function activeTabOrReport(): Promise<ProfileActivationTab | undefined> {
    try {
      return await dependencies.queryActiveTab();
    } catch (error) {
      await reportFailure('读取当前标签页失败', errorMessage(error));
      return undefined;
    }
  }

  async function reportFailure(message: string, detail: string): Promise<void> {
    try {
      await dependencies.reportRefreshFailure(message, detail);
    } catch {
      // A diagnostic write must not turn a completed profile change into a failure.
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
