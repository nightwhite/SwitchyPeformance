import type { ChromeProxySetting } from './proxy-setting.ts';
import {
  canControlChromeProxy,
  proxyControlStateFromLevel,
  type ProxyControlState
} from './external-proxy-state.ts';

export const CHROME_PROXY_CONTROL_CONFLICT = 'chrome-proxy-control-conflict';

export class ChromeProxyControlConflictError extends Error {
  readonly code = CHROME_PROXY_CONTROL_CONFLICT;

  constructor(readonly control: ProxyControlState) {
    super(proxyControlError(control));
    this.name = 'ChromeProxyControlConflictError';
  }
}

export async function setChromeProxySetting(setting: ChromeProxySetting): Promise<void> {
  const control = await readChromeProxyControl();
  if (!canControlChromeProxy(control)) {
    throw new ChromeProxyControlConflictError(control);
  }
  await chrome.proxy.settings.set({
    scope: 'regular',
    value: setting as unknown as chrome.proxy.ProxyConfig
  });
}

export function isChromeProxyControlConflict(
  error: unknown
): error is Pick<ChromeProxyControlConflictError, 'code' | 'control'> {
  if (!isRecord(error) || error.code !== CHROME_PROXY_CONTROL_CONFLICT) {
    return false;
  }
  return isProxyControlState(error.control);
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

function isProxyControlState(value: unknown): value is ProxyControlState {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.controlledBy === 'other_extension' || value.controlledBy === 'system') &&
    (value.levelOfControl === 'controlled_by_other_extensions' ||
      value.levelOfControl === 'not_controllable')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
