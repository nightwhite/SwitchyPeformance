import { AlertTriangle, ArrowDown, ArrowUp, RotateCcw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import type { ConfigurationDocument, ProfileDocumentV2 } from '@switchypeformance/contracts';

import type { ProxyControlState } from '../../runtime/external-proxy-state.ts';
import type { BackgroundState } from '../../runtime/messages.ts';
import { requestBackgroundState } from '../background-client.ts';
import { toUserFacingMessage } from '../error-message.ts';
import { moveShortcutProfile, shortcutProfileOrder } from './v2-shortcut-order.ts';

export interface ProxyControlView {
  detail: string;
  label: string;
  state: 'available' | 'conflict' | 'owned' | 'pending';
}

export type SettingsPageSection = 'all' | 'general' | 'ui';

export interface SettingsPageProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onOpenDiagnostics?(): void;
  onReplace(document: ConfigurationDocument): Promise<BackgroundState>;
  onState(state: BackgroundState): void;
  proxyControl: ProxyControlState | undefined;
  section?: SettingsPageSection;
}

export function SettingsPage({
  busy,
  document,
  onOpenDiagnostics,
  onReplace,
  onState,
  proxyControl,
  section = 'all'
}: SettingsPageProps) {
  const [error, setError] = useState<string>();
  const [localBusy, setLocalBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const shortcutOrder = shortcutProfileOrder(
    document.profiles.map((profile) => profile.id),
    document.settings.shortcutProfileIds
  );
  const interactionBusy = busy || localBusy;
  const controlView = proxyControlView(proxyControl);
  const showGeneral = section !== 'ui';
  const showUi = section !== 'general';

  async function updateSettings(patch: Partial<ProfileDocumentV2['settings']>): Promise<void> {
    try {
      setError(undefined);
      setNotice(undefined);
      await onReplace({ ...document, settings: { ...document.settings, ...patch } });
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  async function moveShortcut(profileId: string, direction: 'down' | 'up'): Promise<void> {
    await updateSettings({
      shortcutProfileIds: moveShortcutProfile(shortcutOrder, profileId, direction)
    });
  }

  async function resetExtension(): Promise<void> {
    if (
      !window.confirm(
        '要重置 SwitchyPeformance 吗？这会删除本扩展的配置、账号密码、同步关联、临时规则和日志；不会修改系统代理或其他扩展的代理设置。'
      )
    ) {
      return;
    }

    try {
      setLocalBusy(true);
      setError(undefined);
      onState(await requestBackgroundState({ type: 'extension.reset' }));
      setNotice('已重置本扩展的数据。系统代理和其他扩展的代理设置未被修改。');
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <section className={`page-panel settings-panel v2-settings-panel settings-panel-${section}`}>
      {showGeneral ? (
        <section aria-label="Chrome 代理控制状态" className="proxy-control-panel">
          <div className="proxy-control-heading">
            <div>
              <p className="panel-kicker">Chrome 代理控制权</p>
              <h2>{controlView.label}</h2>
            </div>
            {controlView.state === 'conflict' ? (
              <AlertTriangle aria-hidden="true" size={21} />
            ) : (
              <ShieldCheck aria-hidden="true" size={21} />
            )}
          </div>
          <p className={`proxy-control-detail proxy-control-detail-${controlView.state}`}>
            {controlView.detail}
          </p>
        </section>
      ) : null}

      {showUi ? (
        <div className="form-grid">
          <label>
            启动时使用的配置
            <select
              disabled={interactionBusy}
              onChange={(event) => void updateSettings({ startupProfileId: event.target.value })}
              value={document.settings.startupProfileId}
            >
              {document.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            新规则插入位置
            <select
              disabled={interactionBusy}
              onChange={(event) =>
                void updateSettings({
                  ruleInsertPosition: event.target.value === 'first' ? 'first' : 'last'
                })
              }
              value={document.settings.ruleInsertPosition}
            >
              <option value="first">最前</option>
              <option value="last">最后</option>
            </select>
          </label>
          <label className="switch-setting">
            <input
              checked={document.settings.reloadAfterProfileChange}
              disabled={interactionBusy}
              onChange={(event) =>
                void updateSettings({ reloadAfterProfileChange: event.target.checked })
              }
              type="checkbox"
            />
            <span>切换配置后刷新当前标签页</span>
          </label>
        </div>
      ) : null}

      {showGeneral ? (
        <section aria-label="网络请求监控" className="settings-monitor-panel">
          <div>
            <p className="panel-kicker">网络请求</p>
            <h2>网络时间线</h2>
            <p>记录失败请求和路由结果，方便定位某个页面资源无法加载的原因。</p>
          </div>
          <label className="switch-setting">
            <input
              checked={document.settings.networkMonitor.enabled}
              disabled={interactionBusy}
              onChange={(event) =>
                void updateSettings({ networkMonitor: { enabled: event.target.checked } })
              }
              type="checkbox"
            />
            <span>记录网页网络时间线</span>
          </label>
          {onOpenDiagnostics ? (
            <button className="link-button" onClick={onOpenDiagnostics} type="button">
              打开详细排查
            </button>
          ) : null}
        </section>
      ) : null}

      {showGeneral ? (
        <div className="form-grid">
          <label>
            检测到外部代理控制时
            <select
              disabled={interactionBusy}
              onChange={(event) =>
                void updateSettings({
                  onExternalConflict: event.target.value as NonNullable<
                    ProfileDocumentV2['settings']['onExternalConflict']
                  >
                })
              }
              value={document.settings.onExternalConflict ?? 'warn'}
            >
              <option value="warn">显示冲突提示（推荐）</option>
              <option value="leave-unchanged">保持外部代理设置</option>
              <option value="reapply">控制权恢复后重新应用</option>
            </select>
            <span className="field-help">
              无论选择哪种策略，本扩展都不会覆盖其他扩展或系统策略。
            </span>
          </label>
        </div>
      ) : null}

      {showUi ? (
        <section aria-label="快捷切换顺序" className="shortcut-order">
          <div className="shortcut-order-heading">
            <div>
              <p className="panel-kicker">快捷切换</p>
              <h2>配置循环顺序</h2>
            </div>
          </div>
          <ol className="shortcut-order-list">
            {shortcutOrder.map((profileId, index) => {
              const profile = document.profiles.find((candidate) => candidate.id === profileId);
              if (!profile) {
                return null;
              }
              return (
                <li className="shortcut-order-row" key={profile.id}>
                  <span className="shortcut-order-index">{index + 1}</span>
                  <span className="shortcut-order-name">{profile.name}</span>
                  <span className="shortcut-order-actions">
                    <button
                      aria-label={`将 ${profile.name} 上移`}
                      className="icon-button"
                      disabled={interactionBusy || index === 0}
                      onClick={() => void moveShortcut(profile.id, 'up')}
                      title="上移"
                      type="button"
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      aria-label={`将 ${profile.name} 下移`}
                      className="icon-button"
                      disabled={interactionBusy || index === shortcutOrder.length - 1}
                      onClick={() => void moveShortcut(profile.id, 'down')}
                      title="下移"
                      type="button"
                    >
                      <ArrowDown size={15} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {showGeneral ? (
        <section aria-label="重置扩展" className="settings-reset">
          <div>
            <p className="panel-kicker">本扩展数据</p>
            <h2>重置 SwitchyPeformance</h2>
            <p>
              删除本扩展保存的配置、账号密码、同步关联、临时规则、来源缓存和日志，不会修改系统代理。
            </p>
          </div>
          <button
            className="danger-outline"
            disabled={interactionBusy}
            onClick={() => void resetExtension()}
            type="button"
          >
            <RotateCcw size={16} />
            重置扩展
          </button>
        </section>
      ) : null}

      {notice ? (
        <p className="inline-notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function proxyControlView(control: ProxyControlState | undefined): ProxyControlView {
  switch (control?.controlledBy) {
    case 'this_extension':
      return {
        detail: '当前代理设置由 SwitchyPeformance 写入并管理。',
        label: '由 SwitchyPeformance 控制',
        state: 'owned'
      };
    case 'other_extension':
      return {
        detail: '其他扩展正在控制 Chrome 代理，SwitchyPeformance 不会覆盖它。',
        label: '由其他扩展控制',
        state: 'conflict'
      };
    case 'system':
      return {
        detail: '系统策略正在控制 Chrome 代理，SwitchyPeformance 无法修改它。',
        label: '由系统策略控制',
        state: 'conflict'
      };
    case 'uncontrolled':
      return {
        detail: 'Chrome 允许 SwitchyPeformance 在需要时应用代理配置。',
        label: '可由 SwitchyPeformance 控制',
        state: 'available'
      };
    default:
      return {
        detail: '正在检查 Chrome 代理控制权。',
        label: '正在读取控制状态',
        state: 'pending'
      };
  }
}
