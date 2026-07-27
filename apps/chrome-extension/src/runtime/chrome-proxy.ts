import type { ChromeProxySetting } from './proxy-setting.ts';

export async function setChromeProxySetting(setting: ChromeProxySetting): Promise<void> {
  await chrome.proxy.settings.set({
    scope: 'regular',
    value: setting as unknown as chrome.proxy.ProxyConfig
  });
}
