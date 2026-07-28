import type { ConfigurationDocument } from '@switchypeformance/contracts';

import type { ApplyConfigurationResult } from './apply-configuration.ts';
import type { CurrentRouteStatus } from './current-route.ts';

export interface RoutingApplicationServiceDependencies {
  applyEffective(document: ConfigurationDocument): Promise<ApplyConfigurationResult>;
  explainEffective(document: ConfigurationDocument, url: string): Promise<CurrentRouteStatus>;
  routingDocuments: EffectiveRoutingDocumentResolver;
}

export interface RoutingApplicationService {
  apply(document: ConfigurationDocument): Promise<ApplyConfigurationResult>;
  explain(document: ConfigurationDocument, url: string): Promise<CurrentRouteStatus>;
}

export interface EffectiveRoutingDocumentResolver {
  resolve(document: ConfigurationDocument): Promise<ConfigurationDocument>;
}

export function createRoutingApplicationService(
  dependencies: RoutingApplicationServiceDependencies
): RoutingApplicationService {
  return {
    async apply(document) {
      return dependencies.applyEffective(await dependencies.routingDocuments.resolve(document));
    },
    async explain(document, url) {
      return dependencies.explainEffective(
        await dependencies.routingDocuments.resolve(document),
        url
      );
    }
  };
}
