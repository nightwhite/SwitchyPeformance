import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CircleGauge,
  Clock3,
  Download,
  FileUp,
  Globe2,
  Network,
  RefreshCw,
  Route,
  Search,
  Settings2,
  Upload
} from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  importProfileDocument,
  parseConfigurationDocument,
  type ConfigurationDocument,
  type ProfileDocumentV2
} from '@switchypeformance/contracts';

import type { BackgroundState } from '../../runtime/messages.ts';
import { toUserFacingMessage } from '../error-message.ts';
import { optionsHash, pageFromOptionsHash, type OptionPage } from '../options-routes.ts';
import { requestBackgroundState } from '../background-client.ts';
import { DiagnosticsPage } from './DiagnosticsPage.tsx';
import { V2OverviewPage } from './V2OverviewPage.tsx';
import { V2ProfilesPage } from './V2ProfilesPage.tsx';
import { V2ProxyServersPage } from './V2ProxyServersPage.tsx';
import { V2RulesPage } from './V2RulesPage.tsx';
import { TemporaryRulesPage } from './TemporaryRulesPage.tsx';
import { moveShortcutProfile, shortcutProfileOrder } from './v2-shortcut-order.ts';

const PAGE_META: Record<OptionPage, { eyebrow: string; title: string }> = {
  overview: { eyebrow: '运行状态', title: '代理路由状态' },
  profiles: { eyebrow: '情景模式', title: '代理配置' },
  'proxy-servers': { eyebrow: '情景模式', title: '代理服务器' },
  rules: { eyebrow: '情景模式', title: '自动切换规则' },
  'temporary-rules': { eyebrow: '情景模式', title: '临时规则' },
  diagnostics: { eyebrow: '工具', title: '排查日志' },
  data: { eyebrow: '工具', title: '导入与导出' },
  settings: { eyebrow: '设置', title: '运行参数' }
};

export interface V2OptionsAppProps {
  busy: boolean;
  document: ProfileDocumentV2;
  error: string | undefined;
  state: BackgroundState;
  onActivate(profileId: string): Promise<void>;
  onRefresh(): Promise<void>;
  onReplace(document: ConfigurationDocument): Promise<BackgroundState>;
  onState(state: BackgroundState): void;
}

export function V2OptionsApp({
  busy,
  document,
  error,
  state,
  onActivate,
  onRefresh,
  onReplace,
  onState
}: V2OptionsAppProps) {
  const [page, setPage] = useState<OptionPage>(() => pageFromOptionsHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setPage(pageFromOptionsHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function navigate(next: OptionPage): void {
    window.location.hash = optionsHash(next);
    setPage(next);
  }

  const copy = PAGE_META[page];
  return (
    <main className="options-app v2-options-app">
      <aside className="side-rail">
        <div className="rail-brand">
          <span className="rail-mark">
            <Globe2 size={20} strokeWidth={2.5} />
          </span>
          <span>
            <strong>SwitchyPeformance</strong>
            <small>Chrome 代理路由</small>
          </span>
        </div>
        <nav aria-label="V2 设置导航" className="side-nav">
          <NavButton
            active={page}
            icon={<CircleGauge />}
            label="运行状态"
            page="overview"
            onNavigate={navigate}
          />
          <NavButton
            active={page}
            icon={<Route />}
            label="代理配置"
            page="profiles"
            onNavigate={navigate}
          />
          <NavButton
            active={page}
            icon={<Network />}
            label="代理服务器"
            page="proxy-servers"
            onNavigate={navigate}
          />
          <NavButton
            active={page}
            icon={<Search />}
            label="自动切换规则"
            page="rules"
            onNavigate={navigate}
          />
          <NavButton
            active={page}
            icon={<Clock3 />}
            label="临时规则"
            page="temporary-rules"
            onNavigate={navigate}
          />
          <NavButton
            active={page}
            icon={<Activity />}
            label="排查日志"
            page="diagnostics"
            onNavigate={navigate}
          />
          <NavButton
            active={page}
            icon={<FileUp />}
            label="导入与导出"
            page="data"
            onNavigate={navigate}
          />
          <NavButton
            active={page}
            icon={<Settings2 />}
            label="运行参数"
            page="settings"
            onNavigate={navigate}
          />
        </nav>
        <div className="rail-status">
          <span className={error ? 'rail-dot rail-dot-error' : 'rail-dot'} />
          <span>{error ? '需要处理' : 'Chrome 代理正常'}</span>
        </div>
      </aside>
      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p>{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
          </div>
          <div className="header-actions">
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => void onRefresh()}
              type="button"
            >
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        </header>
        {error ? (
          <div className="error-strip">
            <AlertTriangle size={17} />
            {error}
          </div>
        ) : null}
        <div className="workspace-content">
          {page === 'overview' ? <V2OverviewPage document={document} /> : null}
          {page === 'profiles' ? (
            <V2ProfilesPage
              busy={busy}
              document={document}
              onActivate={onActivate}
              onReplace={onReplace}
              onState={onState}
              sourceStatuses={state.sourceStatuses}
            />
          ) : null}
          {page === 'proxy-servers' ? (
            <V2ProxyServersPage
              busy={busy}
              document={document}
              onReplace={onReplace}
              onState={onState}
            />
          ) : null}
          {page === 'rules' ? (
            <V2RulesPage busy={busy} document={document} onReplace={onReplace} />
          ) : null}
          {page === 'temporary-rules' ? (
            <TemporaryRulesPage
              busy={busy}
              document={document}
              onState={onState}
              rules={state.temporaryRules}
            />
          ) : null}
          {page === 'diagnostics' ? (
            <DiagnosticsPage
              busy={busy}
              document={document}
              events={state.diagnostics}
              networkSummary={state.networkSummary}
              onState={onState}
            />
          ) : null}
          {page === 'data' ? (
            <V2DataPage busy={busy} document={document} onReplace={onReplace} />
          ) : null}
          {page === 'settings' ? (
            <V2SettingsPage busy={busy} document={document} onReplace={onReplace} />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function NavButton({
  active,
  icon,
  label,
  page,
  onNavigate
}: {
  active: OptionPage;
  icon: React.ReactNode;
  label: string;
  page: OptionPage;
  onNavigate(page: OptionPage): void;
}) {
  const selected = active === page;
  return (
    <button
      aria-current={selected ? 'page' : undefined}
      className={selected ? 'nav-button nav-button-active' : 'nav-button'}
      onClick={() => onNavigate(page)}
      type="button"
    >
      {icon}
      <span>{label}</span>
      {selected ? <ChevronRight size={15} /> : null}
    </button>
  );
}

function V2DataPage({
  busy,
  document,
  onReplace
}: {
  busy: boolean;
  document: ProfileDocumentV2;
  onReplace(document: ConfigurationDocument): Promise<BackgroundState>;
}) {
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  function exportConfiguration(): void {
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = 'SwitchyPeformance-V2-配置.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importConfiguration(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const parsed = parseConfigurationDocument(raw);
      if (parsed.ok) {
        await onReplace(parsed.value);
        setNotice('配置已导入并应用。');
        setError(undefined);
        return;
      }
      const legacy = importProfileDocument(raw);
      if (!legacy.ok) {
        throw new Error(legacy.error);
      }
      await onReplace(legacy.value);
      setNotice(legacy.warnings.length === 0 ? '旧备份已导入。' : legacy.warnings.join(' '));
      setError(undefined);
    } catch (cause) {
      setNotice(undefined);
      setError(toUserFacingMessage(cause));
    }
  }

  return (
    <section className="data-grid">
      <article className="page-panel data-action">
        <Download size={24} />
        <h2>导出配置</h2>
        <p>代理账号密码不会写入配置文件。</p>
        <button className="primary-button" onClick={exportConfiguration} type="button">
          <Download size={16} />
          导出 JSON
        </button>
      </article>
      <article className="page-panel data-action">
        <Upload size={24} />
        <h2>导入配置</h2>
        <p>无效文件不会修改当前路由。</p>
        <label className="file-button">
          <FileUp size={16} />
          选择文件
          <input
            accept=".json,.bak,application/json"
            disabled={busy}
            onChange={(event) => {
              void importConfiguration(event.target.files?.[0]);
              event.currentTarget.value = '';
            }}
            type="file"
          />
        </label>
        {notice ? <p className="inline-notice">{notice}</p> : null}
        {error ? <p className="inline-error">{error}</p> : null}
      </article>
    </section>
  );
}

function V2SettingsPage({
  busy,
  document,
  onReplace
}: {
  busy: boolean;
  document: ProfileDocumentV2;
  onReplace(document: ConfigurationDocument): Promise<BackgroundState>;
}) {
  const [error, setError] = useState<string>();
  const shortcutOrder = shortcutProfileOrder(
    document.profiles.map((profile) => profile.id),
    document.settings.shortcutProfileIds
  );

  async function updateSettings(patch: Partial<ProfileDocumentV2['settings']>): Promise<void> {
    try {
      setError(undefined);
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

  return (
    <section className="page-panel settings-panel v2-settings-panel">
      <div className="form-grid">
        <label>
          启动时使用的配置
          <select
            disabled={busy}
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
            disabled={busy}
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
            disabled={busy}
            onChange={(event) =>
              void updateSettings({ reloadAfterProfileChange: event.target.checked })
            }
            type="checkbox"
          />
          <span>切换配置后刷新当前标签页</span>
        </label>
        <label className="switch-setting">
          <input
            checked={document.settings.networkMonitor.enabled}
            disabled={busy}
            onChange={(event) =>
              void updateSettings({ networkMonitor: { enabled: event.target.checked } })
            }
            type="checkbox"
          />
          <span>记录网页网络时间线（默认关闭）</span>
        </label>
      </div>
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
                    disabled={busy || index === 0}
                    onClick={() => void moveShortcut(profile.id, 'up')}
                    title="上移"
                    type="button"
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    aria-label={`将 ${profile.name} 下移`}
                    className="icon-button"
                    disabled={busy || index === shortcutOrder.length - 1}
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
      {error ? <p className="inline-error">{error}</p> : null}
    </section>
  );
}
