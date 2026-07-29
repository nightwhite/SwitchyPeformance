import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearChromeProxySetting, setChromeProxySetting } from './chrome-proxy.ts';

afterEach(() => vi.unstubAllGlobals());

describe('Chrome proxy controller', () => {
  it('refuses to overwrite a setting controlled by another extension', async () => {
    const settings = installProxySettings('controlled_by_other_extensions');

    await expect(setChromeProxySetting({ mode: 'direct' })).rejects.toThrow('其他扩展控制');

    expect(settings.set).not.toHaveBeenCalled();
  });

  it('clears only a setting controlled by this extension', async () => {
    const settings = installProxySettings('controlled_by_this_extension');

    await expect(clearChromeProxySetting()).resolves.toMatchObject({ cleared: true });

    expect(settings.clear).toHaveBeenCalledWith({ scope: 'regular' });
  });

  it('does not clear an external setting during extension reset', async () => {
    const settings = installProxySettings('not_controllable');

    await expect(clearChromeProxySetting()).resolves.toMatchObject({ cleared: false });

    expect(settings.clear).not.toHaveBeenCalled();
  });
});

function installProxySettings(levelOfControl: chrome.types.LevelOfControl) {
  const settings = {
    clear: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ levelOfControl, value: { mode: 'direct' } }),
    set: vi.fn().mockResolvedValue(undefined)
  };
  vi.stubGlobal('chrome', { proxy: { settings } });
  return settings;
}
