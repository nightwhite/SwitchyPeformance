import type { ConfigurationDocument } from '@switchypeformance/contracts';

export interface RoutingDocumentPipelineDependencies {
  pacSources: RoutingDocumentResolver;
  ruleLists: RoutingDocumentResolver;
  temporaryRules: TemporaryRoutingDocumentResolver;
}

export interface RoutingDocumentPipeline {
  resolve(document: ConfigurationDocument): Promise<ConfigurationDocument>;
}

interface RoutingDocumentResolver {
  resolveForApply(document: ConfigurationDocument): Promise<ConfigurationDocument>;
}

interface TemporaryRoutingDocumentResolver {
  resolve(document: ConfigurationDocument): Promise<ConfigurationDocument>;
}

export function createRoutingDocumentPipeline(
  dependencies: RoutingDocumentPipelineDependencies
): RoutingDocumentPipeline {
  return {
    async resolve(document) {
      const withTemporaryRules = await dependencies.temporaryRules.resolve(document);
      const withPacSources = await dependencies.pacSources.resolveForApply(withTemporaryRules);
      return dependencies.ruleLists.resolveForApply(withPacSources);
    }
  };
}
