import { describe, expect, it } from 'vitest';

import { parseRouteExplanation, parseV2RouteExplanation } from './route-explainer.ts';

describe('parseRouteExplanation', () => {
  it('parses a route explanation from the Rust boundary', () => {
    expect(
      parseRouteExplanation(
        JSON.stringify({
          matchedRuleId: 'proxy-example',
          reason: 'indexed-rule',
          route: { kind: 'proxy', proxyId: 'edge' }
        })
      )
    ).toEqual({
      matchedRuleId: 'proxy-example',
      reason: 'indexed-rule',
      route: { kind: 'proxy', proxyId: 'edge' }
    });
  });

  it('rejects malformed route explanations', () => {
    expect(() => parseRouteExplanation('{"reason":"indexed-rule"}')).toThrow('WASM 路由结果无效');
  });
});

describe('parseV2RouteExplanation', () => {
  it('keeps the V2 resolved route, uncertainty, and compiler metrics from Rust', () => {
    expect(
      parseV2RouteExplanation(
        JSON.stringify({
          activeProfileId: 'auto-alias',
          activeResolvedProfileId: 'auto',
          routeProfileId: 'proxy-alias',
          resolvedRouteProfileId: 'proxy',
          routeKind: 'fixed-proxy',
          matchedRuleId: null,
          pendingRuleId: 'private-network',
          reason: 'requires-pac-dns',
          definitive: false,
          warnings: ['requires-pac-dns'],
          metrics: {
            indexedRuleCount: 861,
            complexRuleCount: 3,
            indexBlockCount: 2,
            dnsSensitiveRuleCount: 1
          }
        })
      )
    ).toEqual({
      activeProfileId: 'auto-alias',
      activeResolvedProfileId: 'auto',
      routeProfileId: 'proxy-alias',
      resolvedRouteProfileId: 'proxy',
      routeKind: 'fixed-proxy',
      pendingRuleId: 'private-network',
      reason: 'requires-pac-dns',
      definitive: false,
      warnings: ['requires-pac-dns'],
      metrics: {
        indexedRuleCount: 861,
        complexRuleCount: 3,
        indexBlockCount: 2,
        dnsSensitiveRuleCount: 1
      }
    });
  });

  it('rejects malformed V2 explanations', () => {
    expect(() => parseV2RouteExplanation('{"routeKind":"fixed-proxy"}')).toThrow(
      'WASM V2 路由结果无效'
    );
  });
});
