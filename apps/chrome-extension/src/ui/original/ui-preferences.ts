export type OriginalThemeMode = 'dark' | 'light' | 'system';
export type OriginalDensity = 'comfortable' | 'compact';

export interface OriginalUiPreferences {
  customCss: string;
  density: OriginalDensity;
  theme: OriginalThemeMode;
}

const STORAGE_KEY = 'switchypeformance.original-ui-preferences.v1';
const CUSTOM_CSS_STYLE_ID = 'switchypeformance-original-custom-css';

export function defaultUiPreferences(): OriginalUiPreferences {
  return { customCss: '', density: 'comfortable', theme: 'system' };
}

export function normalizeUiPreferences(value: unknown): OriginalUiPreferences {
  if (!isRecord(value)) {
    return defaultUiPreferences();
  }
  const theme = isThemeMode(value.theme) ? value.theme : 'system';
  const density = isDensity(value.density) ? value.density : 'comfortable';
  const customCss = typeof value.customCss === 'string' ? value.customCss.slice(0, 50_000) : '';
  return { customCss, density, theme };
}

export function loadUiPreferences(): OriginalUiPreferences {
  if (typeof window === 'undefined') {
    return defaultUiPreferences();
  }
  try {
    return normalizeUiPreferences(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return defaultUiPreferences();
  }
}

export function saveUiPreferences(preferences: OriginalUiPreferences): OriginalUiPreferences {
  const normalized = normalizeUiPreferences(preferences);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Appearance controls should never block proxy configuration when storage is unavailable.
    }
  }
  return normalized;
}

export function applyUiPreferences(preferences: OriginalUiPreferences): void {
  if (typeof document === 'undefined') {
    return;
  }
  const normalized = normalizeUiPreferences(preferences);
  document.documentElement.dataset.switchypeformanceTheme = themeModeAttribute(normalized.theme);
  document.documentElement.dataset.switchypeformanceDensity = normalized.density;

  let style = document.getElementById(CUSTOM_CSS_STYLE_ID) as HTMLStyleElement | null;
  if (!normalized.customCss) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = CUSTOM_CSS_STYLE_ID;
    document.head.append(style);
  }
  style.textContent = normalized.customCss;
}

export function themeModeAttribute(theme: OriginalThemeMode): OriginalThemeMode {
  return theme;
}

function isThemeMode(value: unknown): value is OriginalThemeMode {
  return value === 'dark' || value === 'light' || value === 'system';
}

function isDensity(value: unknown): value is OriginalDensity {
  return value === 'compact' || value === 'comfortable';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
