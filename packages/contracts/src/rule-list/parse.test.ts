import { describe, expect, it } from 'vitest';

import { parseRuleList } from './parse.ts';

describe('parseRuleList', () => {
  it('parses sequential AutoProxy rules and exclusions without executing text', () => {
    const result = parseRuleList(
      [
        '! AutoProxy comments are ignored',
        '||example.com',
        '@@||internal.example.com^',
        '|https://login.example.com/path',
        '/ads\\d+/'
      ].join('\n'),
      'auto-proxy'
    );

    expect(result.rules).toEqual([
      {
        condition: { type: 'host-wildcard', pattern: '*.example.com' },
        exclusive: false,
        line: 2
      },
      {
        condition: { type: 'host-wildcard', pattern: '*.internal.example.com' },
        exclusive: true,
        line: 3
      },
      {
        condition: { type: 'url-wildcard', pattern: 'https://login.example.com/path*' },
        exclusive: false,
        line: 4
      },
      {
        condition: { type: 'url-regex', pattern: 'ads\\d+' },
        exclusive: false,
        line: 5
      }
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('decodes a Base64 AutoProxy list before parsing it', () => {
    const result = parseRuleList(btoa('! comment\n||base64.example\n'), 'auto-proxy');

    expect(result.rules).toEqual([
      {
        condition: { type: 'host-wildcard', pattern: '*.base64.example' },
        exclusive: false,
        line: 2
      }
    ]);
    expect(result.decodedBase64).toBe(true);
  });

  it('parses Switchy conditions, exclusions, aliases, and result profile names', () => {
    const result = parseRuleList(
      [
        '[SwitchyOmega Conditions]',
        '; comments are ignored',
        '@note Use the work profile',
        '@with result',
        '*.example.com +工作代理',
        '!*.internal.example.com',
        'UW: https://assets.example.com/* +资源代理',
        'HostRegex: ^api\\.example\\.com$ +接口代理',
        '* +直连'
      ].join('\n'),
      'switchy'
    );

    expect(result.resultProfilesEnabled).toBe(true);
    expect(result.rules).toEqual([
      {
        condition: { type: 'host-wildcard', pattern: '*.example.com' },
        exclusive: false,
        line: 5,
        resultProfileName: '工作代理'
      },
      {
        condition: { type: 'host-wildcard', pattern: '*.internal.example.com' },
        exclusive: true,
        line: 6
      },
      {
        condition: { type: 'url-wildcard', pattern: 'https://assets.example.com/*' },
        exclusive: false,
        line: 7,
        resultProfileName: '资源代理'
      },
      {
        condition: { type: 'host-regex', pattern: '^api\\.example\\.com$' },
        exclusive: false,
        line: 8,
        resultProfileName: '接口代理'
      },
      {
        condition: { type: 'host-wildcard', pattern: '*' },
        exclusive: false,
        line: 9,
        resultProfileName: '直连'
      }
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('parses advanced condition aliases without turning bypass patterns into global matches', () => {
    const result = parseRuleList(
      [
        '[SwitchyOmega Conditions]',
        'True',
        'False',
        'HRegex: ^api\\.example\\.com$',
        'UWild: https://assets.example.com/*',
        'HWild: *.internal.example',
        'Wildcard: 192.168.10.*',
        'Bypass: <local>',
        'HostLevels: 0-2',
        'Levels: >=3',
        'Weekday: mon-fri',
        'Time: 09:30-17:15'
      ].join('\n'),
      'switchy'
    );

    expect(result.rules).toEqual([
      { condition: { type: 'always' }, exclusive: false, line: 2 },
      { condition: { type: 'never' }, exclusive: false, line: 3 },
      {
        condition: { type: 'host-regex', pattern: '^api\\.example\\.com$' },
        exclusive: false,
        line: 4
      },
      {
        condition: { type: 'url-wildcard', pattern: 'https://assets.example.com/*' },
        exclusive: false,
        line: 5
      },
      {
        condition: { type: 'host-wildcard', pattern: '*.internal.example' },
        exclusive: false,
        line: 6
      },
      {
        condition: { type: 'host-wildcard', pattern: '192.168.10.*' },
        exclusive: false,
        line: 7
      },
      { condition: { type: 'bypass', pattern: '<local>' }, exclusive: false, line: 8 },
      { condition: { type: 'host-levels', min: 0, max: 2 }, exclusive: false, line: 9 },
      { condition: { type: 'host-levels', min: 3 }, exclusive: false, line: 10 },
      { condition: { type: 'weekday', days: [1, 2, 3, 4, 5] }, exclusive: false, line: 11 },
      {
        condition: { type: 'time-range', startMinute: 570, endMinute: 1_035 },
        exclusive: false,
        line: 12
      }
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('reports unsupported lines by line number instead of treating them as script', () => {
    const result = parseRuleList(
      '||example.com$script\nfunction FindProxyForURL(){}',
      'auto-proxy'
    );

    expect(result.rules).toEqual([]);
    expect(result.warnings).toEqual([
      { code: 'unsupported-syntax', line: 1 },
      { code: 'unsupported-syntax', line: 2 }
    ]);
  });

  it('provides a stable content digest for cache and diagnostics keys', () => {
    const first = parseRuleList('||example.com', 'auto-proxy');
    const same = parseRuleList('||example.com', 'auto-proxy');
    const changed = parseRuleList('||other.example', 'auto-proxy');

    expect(first.sourceDigest).toBe(same.sourceDigest);
    expect(first.sourceDigest).not.toBe(changed.sourceDigest);
    expect(first.sourceDigest).toMatch(/^[0-9a-f]{16}$/);
  });
});
