import { describe, expect, it } from 'vitest';

import { proxyControlView } from './SettingsPage.tsx';

describe('proxy control view', () => {
  it('makes an external extension conflict explicit instead of reporting an unknown command', () => {
    expect(proxyControlView({ controlledBy: 'other_extension' })).toEqual({
      detail: '其他扩展正在控制 Chrome 代理，SwitchyPeformance 不会覆盖它。',
      label: '由其他扩展控制',
      state: 'conflict'
    });
  });

  it('shows when this extension owns the current Chrome proxy setting', () => {
    expect(proxyControlView({ controlledBy: 'this_extension' })).toEqual({
      detail: '当前代理设置由 SwitchyPeformance 写入并管理。',
      label: '由 SwitchyPeformance 控制',
      state: 'owned'
    });
  });
});
