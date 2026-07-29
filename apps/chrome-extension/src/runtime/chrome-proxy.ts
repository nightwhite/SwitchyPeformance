import type { ChromeProxySetting } from './proxy-setting.ts';
import {
  canControlChromeProxy,
  proxyControlStateFromLevel,
  type ProxyControlState
} from './external-proxy-state.ts';

export async function setChromeProxySetting(setting: ChromeProxySetting): Promise<void> {
  const control = await readChromeProxyControl();
  if (!canControlChromeProxy(control)) {
    throw new Error(proxyControlError(control));
  }
  await chrome.proxy.settings.set({
    scope: 'regular',
    value: setting as unknown as chrome.proxy.ProxyConfig
  });
}

export async function readChromeProxyControl(): Promise<ProxyControlState> {
  const setting = await chrome.proxy.settings.get({ incognito: false });
  return proxyControlStateFromLevel(setting.levelOfControl);
}

/** Clears only this extension's proxy setting and never changes the system proxy. */
export async function clearChromeProxySetting(): Promise<{
  cleared: boolean;
  control: ProxyControlState;
}> {
  const control = await readChromeProxyControl();
  if (control.controlledBy !== 'this_extension') {
    return { cleared: false, control };
  }
  await chrome.proxy.settings.clear({ scope: 'regular' });
  return { cleared: true, control };
}

function proxyControlError(control: ProxyControlState): string {
  switch (control.controlledBy) {
    case 'other_extension':
      return 'Chrome 代理当前由其他扩展控制，SwitchyPeformance 不会覆盖它。';
    case 'system':
      return 'Chrome 代理当前由系统策略控制，SwitchyPeformance 无法修改它。';
    case 'this_extension':
    case 'uncontrolled':
      return 'Chrome 代理控制状态异常。';
  }
}
