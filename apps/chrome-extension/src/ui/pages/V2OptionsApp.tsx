import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { ConfigurationDocument, ProfileDocumentV2 } from '@switchypeformance/contracts';

import type { BackgroundState } from '../../runtime/messages.ts';
import {
  optionsHash,
  optionsHashForProfile,
  routeFromOptionsHash,
  type OptionPage,
  type OptionRoute
} from '../options-routes.ts';
import { profileKindLabel } from '../v2-labels.ts';
import { DataPage } from './DataPage.tsx';
import { DiagnosticsPage } from './DiagnosticsPage.tsx';
import { ProfileNavigation } from './ProfileNavigation.tsx';
import { ProfileWorkspace } from './ProfileWorkspace.tsx';
import { SettingsPage } from './SettingsPage.tsx';
import { SyncPage } from './SyncPage.tsx';
import { TemporaryRulesPage } from './TemporaryRulesPage.tsx';
import { V2OverviewPage } from './V2OverviewPage.tsx';
import { V2ProfilesPage } from './V2ProfilesPage.tsx';
import { V2ProxyServersPage } from './V2ProxyServersPage.tsx';
import { V2RulesPage } from './V2RulesPage.tsx';

const PAGE_META: Record<OptionPage, { eyebrow: string; title: string }> = {
  overview: { eyebrow: '设置', title: '运行状态' },
  profiles: { eyebrow: '代理配置', title: '新建配置' },
  'proxy-servers': { eyebrow: '工具', title: '代理服务器' },
  rules: { eyebrow: '兼容入口', title: '自动切换规则' },
  'temporary-rules': { eyebrow: '工具', title: '临时规则' },
  diagnostics: { eyebrow: '工具', title: '排查日志' },
  data: { eyebrow: '设置', title: '导入与导出' },
  sync: { eyebrow: '设置', title: '配置同步' },
  settings: { eyebrow: '设置', title: '通用设置' }
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
  const [route, setRoute] = useState<OptionRoute>(() => routeFromOptionsHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromOptionsHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const selectedProfile = useMemo(
    () =>
      route.kind === 'profile'
        ? document.profiles.find((profile) => profile.id === route.profileId)
        : undefined,
    [document.profiles, route]
  );
  const title =
    route.kind === 'profile'
      ? (selectedProfile?.name ?? '配置不存在')
      : PAGE_META[route.page].title;
  const eyebrow =
    route.kind === 'profile' && selectedProfile
      ? `代理配置 / ${profileKindLabel(selectedProfile.kind)}`
      : route.kind === 'profile'
        ? '代理配置'
        : PAGE_META[route.page].eyebrow;

  function navigateProfile(profileId: string): void {
    window.location.hash = optionsHashForProfile(profileId);
    setRoute({ kind: 'profile', profileId });
  }

  function navigateTool(page: OptionPage): void {
    window.location.hash = optionsHash(page);
    setRoute({ kind: 'tool', page });
  }

  return (
    <main className="options-app v2-options-app">
      <ProfileNavigation
        document={document}
        onNavigateProfile={navigateProfile}
        onNavigateTool={navigateTool}
        onNewProfile={() => navigateTool('profiles')}
        route={route}
        {...(error === undefined ? {} : { error })}
      />
      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p>{eyebrow}</p>
            <h1>{title}</h1>
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
          {route.kind === 'profile' ? (
            <ProfileWorkspace
              busy={busy}
              document={document}
              onActivate={onActivate}
              onOpenProfile={navigateProfile}
              onOpenTool={navigateTool}
              onReplace={onReplace}
              onState={onState}
              profileId={route.profileId}
              sourceStatuses={state.sourceStatuses}
            />
          ) : null}
          {route.kind === 'tool' && route.page === 'overview' ? (
            <V2OverviewPage document={document} />
          ) : null}
          {route.kind === 'tool' && route.page === 'profiles' ? (
            <V2ProfilesPage
              busy={busy}
              document={document}
              onActivate={onActivate}
              onOpenProfile={navigateProfile}
              onReplace={onReplace}
              onState={onState}
              sourceStatuses={state.sourceStatuses}
            />
          ) : null}
          {route.kind === 'tool' && route.page === 'proxy-servers' ? (
            <V2ProxyServersPage
              busy={busy}
              document={document}
              onReplace={onReplace}
              onState={onState}
            />
          ) : null}
          {route.kind === 'tool' && route.page === 'rules' ? (
            <V2RulesPage busy={busy} document={document} onReplace={onReplace} />
          ) : null}
          {route.kind === 'tool' && route.page === 'temporary-rules' ? (
            <TemporaryRulesPage
              busy={busy}
              document={document}
              onState={onState}
              rules={state.temporaryRules}
            />
          ) : null}
          {route.kind === 'tool' && route.page === 'diagnostics' ? (
            <DiagnosticsPage
              busy={busy}
              document={document}
              events={state.diagnostics}
              networkSummary={state.networkSummary}
              onState={onState}
            />
          ) : null}
          {route.kind === 'tool' && route.page === 'data' ? (
            <DataPage
              busy={busy}
              document={document}
              onState={onState}
              sourceStatuses={state.sourceStatuses}
            />
          ) : null}
          {route.kind === 'tool' && route.page === 'sync' ? (
            <SyncPage busy={busy} onState={onState} syncStatus={state.sync} />
          ) : null}
          {route.kind === 'tool' && route.page === 'settings' ? (
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
