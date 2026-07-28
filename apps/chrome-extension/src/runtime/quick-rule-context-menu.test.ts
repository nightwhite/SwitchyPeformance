import { describe, expect, it } from 'vitest';

import {
  contextTargetFromClick,
  DIRECT_QUICK_RULE_MENU_ID,
  profileQuickRuleMenuId,
  quickRuleMenuContexts,
  quickRuleTargetFromMenuId,
  proxyQuickRuleMenuId
} from './quick-rule-context-menu.ts';

describe('quick rule context-menu ids', () => {
  it('round-trips direct and proxy routing targets without relying on display names', () => {
    expect(quickRuleTargetFromMenuId(DIRECT_QUICK_RULE_MENU_ID)).toEqual({ kind: 'direct' });
    expect(quickRuleTargetFromMenuId(proxyQuickRuleMenuId('proxy/china:1'))).toEqual({
      kind: 'proxy',
      proxyId: 'proxy/china:1'
    });
  });

  it('ignores unrelated menu ids', () => {
    expect(quickRuleTargetFromMenuId('unrelated')).toBeUndefined();
  });

  it('round-trips a V2 profile target without treating it as a legacy proxy id', () => {
    expect(quickRuleTargetFromMenuId(profileQuickRuleMenuId('fixed/work'))).toEqual({
      kind: 'profile',
      profileId: 'fixed/work'
    });
  });

  it('selects the actual link, media, frame, or page URL for a quick rule', () => {
    expect(contextTargetFromClick({ linkUrl: 'https://cdn.example.test/file.js' })).toEqual({
      source: 'link',
      url: 'https://cdn.example.test/file.js'
    });
    expect(
      contextTargetFromClick({
        linkUrl: 'https://app.example.test/article',
        mediaType: 'image',
        srcUrl: 'https://images.example.test/cover.png'
      })
    ).toEqual({
      source: 'media',
      url: 'https://images.example.test/cover.png'
    });
    expect(
      contextTargetFromClick({
        frameUrl: 'https://frame.example.test/embed',
        pageUrl: 'https://app.example.test/home'
      })
    ).toEqual({
      source: 'frame',
      url: 'https://frame.example.test/embed'
    });
    expect(contextTargetFromClick({ pageUrl: 'https://app.example.test/home' })).toEqual({
      source: 'page',
      url: 'https://app.example.test/home'
    });
  });

  it('skips unsupported URLs and falls back to the next valid click target', () => {
    expect(
      contextTargetFromClick({
        linkUrl: 'javascript:void 0',
        pageUrl: 'https://app.example.test/home'
      })
    ).toEqual({ source: 'page', url: 'https://app.example.test/home' });
    expect(contextTargetFromClick({ srcUrl: 'data:image/png;base64,AAAA' })).toBeUndefined();
  });

  it('registers quick-rule entries in every URL-bearing Chrome context', () => {
    expect(quickRuleMenuContexts).toEqual(['page', 'frame', 'link', 'image', 'video', 'audio']);
  });
});
