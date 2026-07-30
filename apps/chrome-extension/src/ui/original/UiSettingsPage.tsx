import type { SettingsPageProps } from '../pages/SettingsPage.tsx';
import { SettingsPage } from '../pages/SettingsPage.tsx';
import type { OriginalUiPreferences } from './ui-preferences.ts';

export interface UiSettingsPageProps extends Omit<SettingsPageProps, 'section'> {
  onPreferencesChange(preferences: OriginalUiPreferences): void;
  preferences: OriginalUiPreferences;
}

export function UiSettingsPage({
  onPreferencesChange,
  preferences,
  ...props
}: UiSettingsPageProps) {
  return (
    <section className="original-settings-page">
      <header className="original-page-heading">
        <p className="original-page-eyebrow">设置</p>
        <h1>界面设置</h1>
        <p>这里的显示偏好只影响本扩展，不会改变网页代理路由。</p>
      </header>
      <SettingsPage {...props} section="ui" />
      <section className="original-page-panel original-interface-preferences">
        <h2>显示方式</h2>
        <div className="original-settings-list">
          <div className="original-static-setting">
            <strong>界面语言</strong>
            <span>简体中文</span>
          </div>
          <label className="original-static-setting">
            <span>
              <strong>列表密度</strong>
              <small>紧凑模式只压缩间距，不缩小文字或操作区域。</small>
            </span>
            <select
              aria-label="列表密度"
              onChange={(event) =>
                onPreferencesChange({
                  ...preferences,
                  density: event.target.value === 'compact' ? 'compact' : 'comfortable'
                })
              }
              value={preferences.density}
            >
              <option value="comfortable">标准</option>
              <option value="compact">紧凑</option>
            </select>
          </label>
        </div>
      </section>
      <section className="original-page-panel original-shortcut-help">
        <h2>键盘快捷键</h2>
        <p>可在 Chrome 的扩展快捷键页面修改“循环切换配置”的按键。</p>
        <a href="chrome://extensions/shortcuts" rel="noreferrer" target="_blank">
          打开 Chrome 快捷键设置
        </a>
      </section>
    </section>
  );
}
