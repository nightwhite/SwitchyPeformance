import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ThemeSettingsPage } from './ThemeSettingsPage.tsx';

describe('ThemeSettingsPage', () => {
  it('offers the original light, dark, system, and custom style controls', () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeSettingsPage, {
        onChange: vi.fn(),
        preferences: { customCss: '', density: 'comfortable', theme: 'system' }
      })
    );

    expect(markup).toContain('浅色');
    expect(markup).toContain('深色');
    expect(markup).toContain('跟随系统');
    expect(markup).toContain('自定义样式');
  });
});
