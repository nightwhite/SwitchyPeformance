import type { ConfigurationDocument } from '@switchypeformance/contracts';

import { overlayTemporaryRules, type TemporaryRule } from './temporary-rule-service.ts';

export interface TemporaryRuleReader {
  list(document: ConfigurationDocument): Promise<readonly TemporaryRule[]>;
}

export interface TemporaryRoutingDocumentService {
  resolve<T extends ConfigurationDocument>(document: T): Promise<T>;
}

export interface TemporaryRoutingDocumentDependencies {
  clock?: () => number;
  temporaryRules: TemporaryRuleReader;
}

export function createTemporaryRoutingDocumentService(
  dependencies: TemporaryRoutingDocumentDependencies
): TemporaryRoutingDocumentService {
  const clock = dependencies.clock ?? Date.now;

  return {
    async resolve<T extends ConfigurationDocument>(document: T): Promise<T> {
      const rules = await dependencies.temporaryRules.list(document);
      return overlayTemporaryRules(document, rules, clock()) as T;
    }
  };
}
