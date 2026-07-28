import { describe, expect, it } from 'vitest';

import { parseRouteExplanation } from './route-explainer.ts';

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
