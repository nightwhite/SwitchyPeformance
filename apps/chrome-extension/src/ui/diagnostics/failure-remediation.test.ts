import { describe, expect, it } from 'vitest';

import {
  recentDiagnosticFailures,
  remediationOptions,
  remediationView,
  recentNetworkFailures
} from './failure-remediation.ts';

describe('failure remediation', () => {
  it('recommends a direct rule when a proxy connection itself fails', () => {
    expect(
      remediationOptions({ error: 'net::ERR_PROXY_CONNECTION_FAILED', host: 'cdn.example' })
    ).toContainEqual({ action: 'add-direct-rule', label: '将此域名设为直连' });
  });

  it('keeps route inspection available for a connection timeout', () => {
    expect(
      remediationOptions({ error: 'net::ERR_CONNECTION_TIMED_OUT', host: 'api.example' })
    ).toContainEqual({ action: 'inspect-route', label: '查看路由判断' });
  });

  it('makes the Chrome loopback policy explicit instead of offering a blind proxy fix', () => {
    expect(
      remediationView({ error: 'net::ERR_CONNECTION_REFUSED', host: 'localhost' })
    ).toMatchObject({
      loopbackNotice: 'localhost 和本地回环地址通常由 Chrome 强制直连，请先查看路由判断。'
    });
  });

  it('keeps the newest distinct failed resources with their error reason and occurrence count', () => {
    expect(
      recentNetworkFailures([
        {
          error: 'net::ERR_CONNECTION_TIMED_OUT',
          phase: 'failed',
          requestId: 'one',
          tabId: 4,
          timestamp: 1,
          url: 'https://api.example.test/first'
        },
        {
          error: 'net::ERR_PROXY_CONNECTION_FAILED',
          phase: 'failed',
          requestId: 'two',
          tabId: 4,
          timestamp: 2,
          url: 'https://cdn.example.test/script.js'
        },
        {
          error: 'net::ERR_PROXY_CONNECTION_FAILED',
          phase: 'failed',
          requestId: 'three',
          tabId: 4,
          timestamp: 3,
          url: 'https://cdn.example.test/style.css'
        }
      ])
    ).toEqual([
      {
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        host: 'cdn.example.test',
        key: 'cdn.example.test\u0000net::ERR_PROXY_CONNECTION_FAILED',
        occurrences: 2,
        timestamp: 3,
        url: 'https://cdn.example.test/style.css'
      },
      {
        error: 'net::ERR_CONNECTION_TIMED_OUT',
        host: 'api.example.test',
        key: 'api.example.test\u0000net::ERR_CONNECTION_TIMED_OUT',
        occurrences: 1,
        timestamp: 1,
        url: 'https://api.example.test/first'
      }
    ]);
  });

  it('turns the default coarse failure log into an actionable failed resource', () => {
    expect(
      recentDiagnosticFailures(
        [
          {
            detail: 'net::ERR_PROXY_CONNECTION_FAILED',
            scope: 'network',
            tabId: 4,
            target: 'https://cdn.example.test/app.js',
            timestamp: 100
          },
          {
            detail: 'net::ERR_CONNECTION_TIMED_OUT',
            scope: 'network',
            tabId: 5,
            target: 'https://other.example.test/app.js',
            timestamp: 101
          }
        ],
        6,
        4
      )
    ).toEqual([
      {
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        host: 'cdn.example.test',
        key: 'cdn.example.test\u0000net::ERR_PROXY_CONNECTION_FAILED',
        occurrences: 1,
        timestamp: 100,
        url: 'https://cdn.example.test/app.js'
      }
    ]);
  });
});
