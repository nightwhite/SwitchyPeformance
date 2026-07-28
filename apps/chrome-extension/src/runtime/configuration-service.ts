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
  mutate(transform: (current: ConfigurationDocument) => unknown): Promise<ConfigurationDocument>;
  reapply(): Promise<ApplyConfigurationResult>;
  replace(candidate: unknown): Promise<ConfigurationDocument>;
}

export function createConfigurationService(
  dependencies: ConfigurationServiceDependencies
): ConfigurationService {
  let pendingOperation = Promise.resolve();

  return {
    async activate(profileId) {
      return mutate((current) => ({ ...current, activeProfileId: profileId }));
    },
    mutate,
    async reapply() {
      const current = await dependencies.configuration.load();
      return dependencies.apply(current);
    },
    replace
  };

  function replace(candidate: unknown): Promise<ConfigurationDocument> {
    return serialize(async () => {
      const current = await dependencies.configuration.load();
      return applyAndPersist(current, candidate);
    });
  }

  function mutate(
    transform: (current: ConfigurationDocument) => unknown
  ): Promise<ConfigurationDocument> {
    return serialize(async () => {
      const current = await dependencies.configuration.load();
      return applyAndPersist(current, transform(current));
    });
  }

  async function applyAndPersist(
    current: ConfigurationDocument,
    candidate: unknown
  ): Promise<ConfigurationDocument> {
    const next = parseCandidate(candidate);
    await dependencies.apply(next);

    try {
      return await dependencies.configuration.replace(next);
    } catch (error) {
      await restoreCurrentConfiguration(current);
      throw error;
    }
  }

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pendingOperation.then(operation, operation);
    pendingOperation = result.then(
      () => undefined,
      () => undefined
    );
    return result;
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
