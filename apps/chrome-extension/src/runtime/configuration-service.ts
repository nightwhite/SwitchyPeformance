import {
  parseConfigurationDocument,
  type ConfigurationDocument
} from '@switchypeformance/contracts';

import type { ApplyConfigurationResult } from './apply-configuration.ts';
import type { ConfigurationRepository } from './configuration-repository.ts';

export interface ConfigurationServiceDependencies {
  apply(document: ConfigurationDocument): Promise<ApplyConfigurationResult>;
  configuration: ConfigurationRepository;
}

export interface ConfigurationService {
  activate(profileId: string): Promise<ConfigurationDocument>;
  reapply(): Promise<ApplyConfigurationResult>;
  replace(candidate: unknown): Promise<ConfigurationDocument>;
}

export function createConfigurationService(
  dependencies: ConfigurationServiceDependencies
): ConfigurationService {
  return {
    async activate(profileId) {
      const current = await dependencies.configuration.load();
      return replace({ ...current, activeProfileId: profileId });
    },
    async reapply() {
      const current = await dependencies.configuration.load();
      return dependencies.apply(current);
    },
    replace
  };

  async function replace(candidate: unknown): Promise<ConfigurationDocument> {
    const current = await dependencies.configuration.load();
    const next = parseCandidate(candidate);
    await dependencies.apply(next);

    try {
      return await dependencies.configuration.replace(next);
    } catch (error) {
      await restoreCurrentConfiguration(current);
      throw error;
    }
  }

  async function restoreCurrentConfiguration(current: ConfigurationDocument): Promise<void> {
    try {
      await dependencies.apply(current);
    } catch {
      // Keep the original persistence error; callers can still reapply manually.
    }
  }
}

function parseCandidate(candidate: unknown): ConfigurationDocument {
  const result = parseConfigurationDocument(candidate);
  if (!result.ok) {
    throw new Error('配置无效');
  }
  return result.value;
}
