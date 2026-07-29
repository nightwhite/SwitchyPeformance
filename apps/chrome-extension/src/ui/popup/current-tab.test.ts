import { afterEach, describe, expect, it, vi } from 'vitest';

import { currentTabFromChromeTab, currentTabFromUrl, loadCurrentTab } from './current-tab.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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

  it('retries a popup startup lookup when Chrome initially exposes an extension page', async () => {
    vi.useFakeTimers();
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ id: 41, url: 'chrome-extension://extension-id/popup.html' }])
      .mockResolvedValueOnce([{ id: 41, url: 'chrome-extension://extension-id/popup.html' }])
      .mockResolvedValueOnce([{ id: 81, url: 'https://sub.example.com/path?q=1' }]);
    vi.stubGlobal('chrome', { tabs: { query } });

    const current = loadCurrentTab();
    await vi.runAllTimersAsync();

    await expect(current).resolves.toEqual({
      available: true,
      host: 'sub.example.com',
      tabId: 81,
      url: 'https://sub.example.com/path?q=1'
    });
    expect(query).toHaveBeenNthCalledWith(1, { active: true, lastFocusedWindow: true });
    expect(query).toHaveBeenNthCalledWith(2, { active: true, currentWindow: true });
    expect(query).toHaveBeenNthCalledWith(3, { active: true, lastFocusedWindow: true });
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
