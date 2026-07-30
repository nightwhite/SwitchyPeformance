import { useEffect, useMemo, useRef, useState } from 'react';

import type { ConfigurationDocument, ProfileDocumentV2 } from '@switchypeformance/contracts';

import type { BackgroundState } from '../../runtime/messages.ts';
import { DataPage } from '../pages/DataPage.tsx';
import { ProfileWorkspace } from '../pages/ProfileWorkspace.tsx';
import { SettingsPage } from '../pages/SettingsPage.tsx';
import { V2ProfilesPage } from '../pages/V2ProfilesPage.tsx';
import { OriginalSidebar } from './OriginalSidebar.tsx';
import { confirmDiscardBeforeNavigation } from './navigation-guard.ts';
import {
  originalNewProfileHash,
  originalProfileHash,
  originalToolHash,
  resolveOriginalRoute,
  type OriginalRoute,
  type OriginalToolPage
} from './routes.ts';

export interface OriginalOptionsAppProps {
  busy: boolean;
  dirty: boolean;
  document: ProfileDocumentV2;
  error: string | undefined;
  onApply(): void;
  onBackgroundState(state: BackgroundState): void;
  onDiscard(): void;
  onDraftChange(document: ProfileDocumentV2): void;
  state: BackgroundState;
}

export function OriginalOptionsApp({
  busy,
  dirty,
  document,
  error,
  onApply,
  onBackgroundState,
  onDiscard,
  onDraftChange,
  state
}: OriginalOptionsAppProps) {
  const [route, setRoute] = useState<OriginalRoute>(() =>
    resolveOriginalRoute(currentHash(), document)
  );
  const [workspaceNotice, setWorkspaceNotice] = useState<string>();
  const expectedHash = useRef<string | undefined>(undefined);

  useEffect(() => {
    const onHashChange = () => {
      const hash = currentHash();
      if (expectedHash.current === hash) {
        expectedHash.current = undefined;
        return;
      }
      const nextRoute = resolveOriginalRoute(hash, document);
      if (sameRoute(nextRoute, route)) {
        return;
      }
      if (!confirmNavigation()) {
        writeHash(hashForRoute(route, document));
        return;
      }
      if (dirty) {
        onDiscard();
      }
      setRoute(nextRoute);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [dirty, document, onDiscard, route]);

  useEffect(() => {
    if (
      route.kind === 'profile' &&
      !document.profiles.some((profile) => profile.id === route.profileId)
    ) {
      setRoute({ kind: 'tool', page: 'builtin' });
    }
  }, [document.profiles, route]);

  const draftState = useMemo<BackgroundState>(
    () => ({ ...state, configuration: document }),
    [document, state]
  );

  function navigateProfile(profileId: string): void {
    const profile = document.profiles.find((candidate) => candidate.id === profileId);
    if (!profile) {
      return;
    }
    navigate({ kind: 'profile', profileId }, originalProfileHash(profile));
  }

  function navigateTool(page: OriginalToolPage): void {
    navigate({ kind: 'tool', page }, originalToolHash(page));
  }

  function navigateNewProfile(): void {
    navigate({ kind: 'new-profile' }, originalNewProfileHash());
  }

  function navigate(nextRoute: OriginalRoute, hash: string): void {
    if (!confirmNavigation()) {
      return;
    }
    if (dirty) {
      onDiscard();
    }
    setWorkspaceNotice(undefined);
    setRoute(nextRoute);
    writeHash(hash);
  }

  function writeHash(hash: string): void {
    if (typeof window !== 'undefined' && window.location.hash !== hash) {
      expectedHash.current = hash;
      window.location.hash = hash;
    }
  }

  function confirmNavigation(): boolean {
    return confirmDiscardBeforeNavigation(
      dirty,
      (message) => typeof window !== 'undefined' && window.confirm(message)
    );
  }

  async function replaceDraft(next: ConfigurationDocument): Promise<BackgroundState> {
    if (next.schemaVersion !== 2) {
      throw new Error('当前设置页只能编辑新版配置。');
    }
    onDraftChange(next);
    return { ...draftState, configuration: next };
  }

  async function activateDraft(profileId: string): Promise<void> {
    await replaceDraft({ ...document, activeProfileId: profileId });
  }

  return (
    <main className="original-options-app">
      <OriginalSidebar
        busy={busy}
        dirty={dirty}
        document={document}
        onApply={onApply}
        onDiscard={onDiscard}
        onNavigateProfile={navigateProfile}
        onNavigateTool={navigateTool}
        onNewProfile={navigateNewProfile}
        route={route}
      />
      <section className="original-workspace">
        {dirty ? (
          <div className="original-draft-banner" role="status">
            当前页面有未应用的修改。
          </div>
        ) : null}
        {error ? (
          <p className="inline-error original-workspace-message" role="alert">
            {error}
          </p>
        ) : null}
        {workspaceNotice ? (
          <p className="inline-notice original-workspace-message" role="status">
            {workspaceNotice}
          </p>
        ) : null}
        <div className="original-workspace-content">
          {route.kind === 'profile' ? (
            <ProfileWorkspace
              busy={busy}
              document={document}
              onActivate={activateDraft}
              onOpenProfile={navigateProfile}
              onOpenTool={() =>
                setWorkspaceNotice('代理服务器会在固定代理配置页面中直接管理。')
              }
              onReplace={replaceDraft}
              onState={onBackgroundState}
              profileId={route.profileId}
              sourceStatuses={state.sourceStatuses}
            />
          ) : null}
          {route.kind === 'new-profile' ? (
            <V2ProfilesPage
              busy={busy}
              document={document}
              onActivate={activateDraft}
              onOpenProfile={navigateProfile}
              onReplace={replaceDraft}
              onState={onBackgroundState}
              sourceStatuses={state.sourceStatuses}
            />
          ) : null}
          {route.kind === 'tool' && route.page === 'builtin' ? (
            <BuiltinConfigurationsPage document={document} onOpenProfile={navigateProfile} />
          ) : null}
          {route.kind === 'tool' && route.page === 'general' ? (
            <SettingsPage
              busy={busy}
              document={document}
              onReplace={replaceDraft}
              onState={onBackgroundState}
              proxyControl={state.proxyControl}
            />
          ) : null}
          {route.kind === 'tool' && route.page === 'io' ? (
            <DataPage
              busy={busy}
              document={document}
              onState={onBackgroundState}
              sourceStatuses={state.sourceStatuses}
            />
          ) : null}
          {route.kind === 'tool' && route.page === 'ui' ? <InterfacePage /> : null}
          {route.kind === 'tool' && route.page === 'theme' ? <ThemePage /> : null}
        </div>
      </section>
    </main>
  );
}

function BuiltinConfigurationsPage({
  document,
  onOpenProfile
}: {
  document: ProfileDocumentV2;
  onOpenProfile(profileId: string): void;
}) {
  return (
    <section className="original-page-panel">
      <p className="original-page-eyebrow">内置配置</p>
      <h1>内置配置</h1>
      <p>直连和系统代理始终可用。其余配置会在左侧按原版顺序列出。</p>
      <div className="original-builtin-list">
        {document.profiles
          .filter((profile) => profile.id === 'direct' || profile.id === 'system')
          .map((profile) => (
            <button key={profile.id} onClick={() => onOpenProfile(profile.id)} type="button">
              {profile.name}
            </button>
          ))}
      </div>
    </section>
  );
}

function InterfacePage() {
  return (
    <section className="original-page-panel">
      <p className="original-page-eyebrow">界面</p>
      <h1>界面设置</h1>
      <p>界面语言、列表密度和诊断入口会在这里统一配置。</p>
    </section>
  );
}

function ThemePage() {
  return (
    <section className="original-page-panel">
      <p className="original-page-eyebrow">主题</p>
      <h1>主题设置</h1>
      <p>主题样式不会影响代理路由；配置修改仍需要点击左侧“应用”才会生效。</p>
    </section>
  );
}

function currentHash(): string {
  return typeof window === 'undefined' ? '#!/builtin' : window.location.hash;
}

function hashForRoute(route: OriginalRoute, document: ProfileDocumentV2): string {
  if (route.kind === 'profile') {
    const profile = document.profiles.find((candidate) => candidate.id === route.profileId);
    return profile ? originalProfileHash(profile) : originalToolHash('builtin');
  }
  return route.kind === 'new-profile' ? originalNewProfileHash() : originalToolHash(route.page);
}

function sameRoute(left: OriginalRoute, right: OriginalRoute): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === 'profile' && right.kind === 'profile') {
    return left.profileId === right.profileId;
  }
  if (left.kind === 'tool' && right.kind === 'tool') {
    return left.page === right.page;
  }
  return true;
}
