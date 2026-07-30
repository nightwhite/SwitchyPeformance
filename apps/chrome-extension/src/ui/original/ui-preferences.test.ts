import { describe, expect, it } from 'vitest';

import {
  defaultUiPreferences,
  normalizeUiPreferences,
  themeModeAttribute
} from './ui-preferences.ts';

describe('original options UI preferences', () => {
  it('keeps valid local appearance choices and discards malformed saved values', () => {
    expect(
      normalizeUiPreferences({
        customCss: '.original-options-app { outline: 0; }',
        density: 'compact',
        theme: 'dark'
      })
    ).toEqual({
      customCss: '.original-options-app { outline: 0; }',
      density: 'compact',
      theme: 'dark'
    });
    expect(normalizeUiPreferences({ density: 'huge', theme: 'neon' })).toEqual(
      defaultUiPreferences()
    );
  });

  it('uses a stable document attribute for each supported theme mode', () => {
    expect(themeModeAttribute('light')).toBe('light');
    expect(themeModeAttribute('dark')).toBe('dark');
    expect(themeModeAttribute('system')).toBe('system');
  });
});
