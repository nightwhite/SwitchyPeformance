import {
  Activity,
  AlertTriangle,
  ChevronRight,
  CircleGauge,
  Cloud,
  Clock3,
  FileUp,
  Globe2,
  Network,
  RefreshCw,
  Route,
  Search,
  Settings2
} from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ConfigurationDocument, ProfileDocumentV2 } from '@switchypeformance/contracts';

import type { BackgroundState } from '../../runtime/messages.ts';
import { optionsHash, pageFromOptionsHash, type OptionPage } from '../options-routes.ts';
import { DiagnosticsPage } from './DiagnosticsPage.tsx';
import { DataPage } from './DataPage.tsx';
import { SettingsPage } from './SettingsPage.tsx';
import { SyncPage } from './SyncPage.tsx';
import { V2OverviewPage } from './V2OverviewPage.tsx';
import { V2ProfilesPage } from './V2ProfilesPage.tsx';
import { V2ProxyServersPage } from './V2ProxyServersPage.tsx';
import { V2RulesPage } from './V2RulesPage.tsx';
import { TemporaryRulesPage } from './TemporaryRulesPage.tsx';

const PAGE_META: Record<OptionPage, { eyebrow: string; title: string }> = {
  overview: { eyebrow: '运行状态', title: '代理路由状态' },
  profiles: { eyebrow: '情景模式', title: '代理配置' },
  'proxy-servers': { eyebrow: '情景模式', title: '代理服务器' },
  rules: { eyebrow: '情景模式', title: '自动切换规则' },
  'temporary-rules': { eyebrow: '情景模式', title: '临时规则' },
  diagnostics: { eyebrow: '工具', title: '排查日志' },
  data: { eyebrow: '工具', title: '导入与导出' },
  sync: { eyebrow: '工具', title: '配置同步' },
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
            icon={<Cloud />}
            label="配置同步"
            page="sync"
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
            <DataPage
              busy={busy}
              document={document}
              onState={onState}
              sourceStatuses={state.sourceStatuses}
            />
          ) : null}
          {page === 'sync' ? (
            <SyncPage busy={busy} onState={onState} syncStatus={state.sync} />
          ) : null}
          {page === 'settings' ? (
            <SettingsPage
              busy={busy}
              document={document}
              onReplace={onReplace}
              onState={onState}
              proxyControl={state.proxyControl}
            />
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
