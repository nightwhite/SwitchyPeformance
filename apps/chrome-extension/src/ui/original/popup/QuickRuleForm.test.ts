import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { QuickRuleForm } from './QuickRuleForm.tsx';

describe('QuickRuleForm', () => {
  it('renders original-style condition controls and both persistent and temporary actions', () => {
    const markup = renderToStaticMarkup(
      createElement(QuickRuleForm, {
        automaticProfileId: 'automatic',
        automaticProfiles: [{ id: 'automatic', label: '自动切换' }],
        busy: false,
        onAutomaticProfileChange: vi.fn(),
        onCancel: vi.fn(),
        onRouteChange: vi.fn(),
        onSubmit: vi.fn(async () => undefined),
        onTemporaryDurationChange: vi.fn(),
        routeOptions: [
          { label: '直连', value: 'profile:direct' },
          { label: '工作代理', value: 'profile:work' }
        ],
        routeValue: 'profile:work',
        tab: { available: true, host: 'api.x.com', url: 'https://api.x.com/home' },
        temporaryDuration: '30m'
      })
    );

    expect(markup).toContain('当前网站规则条件类型');
    expect(markup).toContain('主机通配符');
    expect(markup).toContain('主机正则');
    expect(markup).toContain('网址通配符');
    expect(markup).toContain('网址正则');
    expect(markup).toContain('关键词');
    expect(markup).toContain('临时加入');
    expect(markup).toContain('添加到自动切换');
  });
});
