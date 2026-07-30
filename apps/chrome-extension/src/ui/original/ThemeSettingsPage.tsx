import type { OriginalThemeMode, OriginalUiPreferences } from './ui-preferences.ts';

export interface ThemeSettingsPageProps {
  onChange(preferences: OriginalUiPreferences): void;
  preferences: OriginalUiPreferences;
}

const THEME_OPTIONS: readonly { label: string; value: OriginalThemeMode }[] = [
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
  { label: '跟随系统', value: 'system' }
];

export function ThemeSettingsPage({ onChange, preferences }: ThemeSettingsPageProps) {
  return (
    <section className="original-settings-page">
      <header className="original-page-heading">
        <p className="original-page-eyebrow">设置</p>
        <h1>主题</h1>
        <p>主题只修改扩展自己的显示，不改变当前浏览器页面。</p>
      </header>
      <section className="original-page-panel original-theme-settings">
        <h2>配色</h2>
        <div aria-label="主题模式" className="original-theme-options" role="radiogroup">
          {THEME_OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                checked={preferences.theme === option.value}
                name="original-theme"
                onChange={() => onChange({ ...preferences, theme: option.value })}
                type="radio"
                value={option.value}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </section>
      <section className="original-page-panel original-custom-css">
        <h2>自定义样式</h2>
        <p>输入的样式会立即用于当前设置页；删除内容即可恢复默认外观。</p>
        <textarea
          aria-label="自定义样式"
          onChange={(event) => onChange({ ...preferences, customCss: event.target.value })}
          placeholder=".original-options-app { }"
          rows={12}
          spellCheck={false}
          value={preferences.customCss}
        />
      </section>
    </section>
  );
}
