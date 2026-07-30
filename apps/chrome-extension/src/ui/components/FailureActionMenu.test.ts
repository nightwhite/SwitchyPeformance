import { describe, expect, it } from 'vitest';

import { failureActionMenuView } from './FailureActionMenu.tsx';

describe('failureActionMenuView', () => {
  it('shows the matched route before actions and disables proxy actions without a selected proxy target', () => {
    expect(
      failureActionMenuView({
        failure: {
          error: 'net::ERR_PROXY_CONNECTION_FAILED',
          host: 'cdn.example.test',
          key: 'cdn.example.test\u0000net::ERR_PROXY_CONNECTION_FAILED',
          occurrences: 1,
          timestamp: 100,
          url: 'https://cdn.example.test/app.js'
        },
        matchedRule: 'rule-cdn',
        proxyActionAvailable: false,
        ruleActionAvailable: false,
        routeLabel: '工作代理'
      })
    ).toEqual({
      actions: [
        { action: 'add-direct-rule', disabled: true, label: '将此域名设为直连' },
        { action: 'inspect-route', disabled: false, label: '查看路由判断' },
        { action: 'add-proxy-rule', disabled: true, label: '将此域名设为代理' },
        { action: 'add-temporary-direct-rule', disabled: true, label: '临时设为直连' },
        { action: 'add-temporary-proxy-rule', disabled: true, label: '临时设为代理' }
      ],
      matchedRule: 'rule-cdn',
      routeLabel: '工作代理'
    });
  });
});
