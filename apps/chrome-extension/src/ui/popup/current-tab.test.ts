import { describe, expect, it } from 'vitest';

import { currentTabFromChromeTab, currentTabFromUrl } from './current-tab.ts';

describe('current tab', () => {
  it('exposes a proxy-routable HTTP or HTTPS page', () => {
    expect(currentTabFromUrl('https://sub.example.com:8443/path?q=1')).toEqual({
      available: true,
      host: 'sub.example.com',
      url: 'https://sub.example.com:8443/path?q=1'
    });
  });

  it('keeps the Chrome tab ID so diagnostics stay scoped to the current page', () => {
    expect(
      currentTabFromChromeTab({ id: 81, url: 'https://sub.example.com:8443/path?q=1' })
    ).toEqual({
      available: true,
      host: 'sub.example.com',
      tabId: 81,
      url: 'https://sub.example.com:8443/path?q=1'
    });
  });

  it.each([
    undefined,
    'chrome://settings/',
    'chrome-extension://extension-id/options.html',
    'file:///Users/night/project/index.html',
    'about:blank'
  ])('does not offer routing actions for %s', (url) => {
    expect(currentTabFromUrl(url)).toEqual({
      available: false,
      reason: '当前页面不是可添加规则的 HTTP 或 HTTPS 页面'
    });
  });
});
