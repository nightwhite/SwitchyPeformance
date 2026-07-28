import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import {
  automaticProfileOptions,
  buildCurrentSiteRule,
  defaultAutomaticProfileId
} from './current-site-rule.ts';

describe('current site rule', () => {
  it('builds a page rule without binding the current query string', () => {
    expect(buildCurrentSiteRule('https://sub.example.com/path/to/page?tab=latest', 'page')).toEqual(
      {
        condition: { type: 'url-wildcard', pattern: 'https://sub.example.com/path/to/page*' },
        host: 'sub.example.com'
      }
    );
  });

  it('builds an exact host rule for the current host', () => {
    expect(buildCurrentSiteRule('https://sub.example.com/path?q=1', 'host')).toEqual({
      condition: { type: 'host-wildcard', pattern: 'sub.example.com' },
      host: 'sub.example.com'
    });
  });

  it('uses the registrable domain rather than guessing the final two labels', () => {
    expect(buildCurrentSiteRule('https://sub.example.co.uk/path?q=1', 'domain')).toEqual({
      condition: { type: 'host-wildcard', pattern: '*.example.co.uk' },
      host: 'sub.example.co.uk'
    });
    expect(buildCurrentSiteRule('https://project.github.io/path', 'domain')).toEqual({
      condition: { type: 'host-wildcard', pattern: '*.project.github.io' },
      host: 'project.github.io'
    });
  });

  it('keeps local hosts exact when they do not have a registrable domain', () => {
    expect(buildCurrentSiteRule('http://localhost:3000/', 'domain')).toEqual({
      condition: { type: 'host-wildcard', pattern: 'localhost' },
      host: 'localhost'
    });
  });

  it('defaults to the automatic profile actually reached through a virtual active profile', () => {
    const document = automaticDocument();

    expect(defaultAutomaticProfileId(document)).toBe('automatic-work');
    expect(automaticProfileOptions(document)).toEqual([
      { id: 'automatic-work', label: '工作自动切换' },
      { id: 'automatic-backup', label: '备用自动切换' }
    ]);
  });
});

function automaticDocument(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'virtual-work',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        id: 'automatic-work',
        kind: 'auto-switch',
        name: '工作自动切换',
        fallback: { profileId: 'direct' },
        loopbackPolicy: 'direct',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: [],
        rules: []
      },
      {
        id: 'automatic-backup',
        kind: 'auto-switch',
        name: '备用自动切换',
        fallback: { profileId: 'direct' },
        loopbackPolicy: 'direct',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: [],
        rules: []
      },
      {
        id: 'virtual-work',
        kind: 'virtual',
        name: '工作入口',
        target: { profileId: 'automatic-work' }
      }
    ],
    proxyServers: [],
    ruleSources: [],
    settings: {
      startupProfileId: 'virtual-work',
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      networkMonitor: { enabled: false }
    }
  };
}
