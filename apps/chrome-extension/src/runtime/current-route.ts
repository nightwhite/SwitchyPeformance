import type {
  ConfigurationDocument,
  ProfileDocument,
  ProfileDocumentV2
} from '@switchypeformance/contracts';

import type { RouteExplanation, V2RouteExplanation } from './route-explainer.ts';
import { explainRouteWithWasm, explainV2RouteWithWasm } from './wasm-runtime.ts';

export interface CurrentRouteStatus {
  activeProfileId: string;
  matchedRuleId?: string;
  reason: string;
  resolvedProfileId: string;
  routeKind: string;
  routeTargetId?: string;
  warnings: readonly string[];
}

export interface CurrentRouteExplainerDependencies {
  explainV1(document: ProfileDocument, url: string): Promise<RouteExplanation>;
  explainV2(document: ProfileDocumentV2, url: string): Promise<V2RouteExplanation>;
}

export function createCurrentRouteExplainer(
  dependencies: CurrentRouteExplainerDependencies
): (document: ConfigurationDocument, url: string) => Promise<CurrentRouteStatus> {
  return async (document, url) => {
    if (document.schemaVersion === 1) {
      return legacyStatus(document, await dependencies.explainV1(document, url));
    }
    return v2Status(await dependencies.explainV2(document, url));
  };
}

export const explainCurrentRoute = createCurrentRouteExplainer({
  explainV1: explainRouteWithWasm,
  explainV2: explainV2RouteWithWasm
});

function legacyStatus(
  document: ProfileDocument,
  explanation: RouteExplanation
): CurrentRouteStatus {
  const target = explanation.route;
  return {
    activeProfileId: document.activeProfileId,
    ...(explanation.matchedRuleId === undefined
      ? {}
      : { matchedRuleId: explanation.matchedRuleId }),
    reason: explanation.reason,
    resolvedProfileId: document.activeProfileId,
    routeKind: target.kind === 'proxy' ? 'proxy' : target.kind,
    ...(target.kind === 'proxy' ? { routeTargetId: target.proxyId } : {}),
    warnings: []
  };
}

function v2Status(explanation: V2RouteExplanation): CurrentRouteStatus {
  return {
    activeProfileId: explanation.activeProfileId,
    ...(explanation.matchedRuleId === undefined
      ? {}
      : { matchedRuleId: explanation.matchedRuleId }),
    reason: explanation.reason,
    resolvedProfileId: explanation.activeResolvedProfileId,
    routeKind: explanation.routeKind,
    ...(explanation.resolvedRouteProfileId === undefined && explanation.routeProfileId === undefined
      ? {}
      : { routeTargetId: explanation.resolvedRouteProfileId ?? explanation.routeProfileId }),
    warnings: explanation.warnings
  };
}
