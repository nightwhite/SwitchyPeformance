import {
  Activity,
  Cloud,
  FileUp,
  Globe2,
  Network,
  Plus,
  Settings2,
  SlidersHorizontal,
  TimerReset
} from 'lucide-react';

import type { ProfileDocumentV2, ProfileKind } from '@switchypeformance/contracts';

import type { OptionPage, OptionRoute } from '../options-routes.ts';
import { profileKindLabel } from '../v2-labels.ts';
import { profileNavigationItems } from './profile-navigation.ts';

interface ProfileNavigationProps {
  document: ProfileDocumentV2;
  error?: string;
  onNavigateProfile(profileId: string): void;
  onNavigateTool(page: OptionPage): void;
  onNewProfile(): void;
  route: OptionRoute;
}

export function ProfileNavigation({
  document,
  error,
  onNavigateProfile,
  onNavigateTool,
  onNewProfile,
  route
}: ProfileNavigationProps) {
  const profileItems = profileNavigationItems(document);
  return (
    <aside className="side-rail profile-side-rail">
      <div className="rail-brand">
        <span className="rail-mark" aria-hidden="true">
          <Globe2 size={21} strokeWidth={2.3} />
        </span>
        <span>
          <strong>SwitchyPeformance</strong>
          <small>Chrome 代理切换</small>
        </span>
      </div>
      <nav aria-label="配置导航" className="profile-navigation">
        <NavigationGroup label="设置">
          <ToolNavigationButton
            active={isToolRoute(route, 'overview')}
            icon={<SlidersHorizontal size={16} />}
            label="运行状态"
            onClick={() => onNavigateTool('overview')}
          />
          <ToolNavigationButton
            active={isToolRoute(route, 'settings')}
            icon={<Settings2 size={16} />}
            label="通用设置"
            onClick={() => onNavigateTool('settings')}
          />
          <ToolNavigationButton
            active={isToolRoute(route, 'data')}
            icon={<FileUp size={16} />}
            label="导入与导出"
            onClick={() => onNavigateTool('data')}
          />
          <ToolNavigationButton
            active={isToolRoute(route, 'sync')}
            icon={<Cloud size={16} />}
            label="配置同步"
            onClick={() => onNavigateTool('sync')}
          />
        </NavigationGroup>

        <NavigationGroup label="代理配置">
          {profileItems.map((profile) => (
            <button
              aria-current={
                route.kind === 'profile' && route.profileId === profile.id ? 'page' : undefined
              }
              className={
                route.kind === 'profile' && route.profileId === profile.id
                  ? 'profile-nav-button profile-nav-button-active'
                  : 'profile-nav-button'
              }
              key={profile.id}
              onClick={() => onNavigateProfile(profile.id)}
              type="button"
            >
              <ProfileKindIcon kind={profile.kind} />
              <span>{profile.name}</span>
              {profile.id === document.activeProfileId ? (
                <span aria-label="当前启用" className="profile-nav-current">
                  当前
                </span>
              ) : null}
            </button>
          ))}
          <button className="new-profile-button" onClick={onNewProfile} type="button">
            <Plus size={16} />
            新建配置
          </button>
        </NavigationGroup>

        <NavigationGroup label="工具">
          <ToolNavigationButton
            active={isToolRoute(route, 'proxy-servers')}
            icon={<Network size={16} />}
            label="代理服务器"
            onClick={() => onNavigateTool('proxy-servers')}
          />
          <ToolNavigationButton
            active={isToolRoute(route, 'temporary-rules')}
            icon={<TimerReset size={16} />}
            label="临时规则"
            onClick={() => onNavigateTool('temporary-rules')}
          />
          <ToolNavigationButton
            active={isToolRoute(route, 'diagnostics')}
            icon={<Activity size={16} />}
            label="排查日志"
            onClick={() => onNavigateTool('diagnostics')}
          />
        </NavigationGroup>
      </nav>
      <div className={error ? 'rail-status rail-status-error' : 'rail-status'}>
        <span className={error ? 'rail-dot rail-dot-error' : 'rail-dot'} />
        <span>{error ? '需要处理' : 'Chrome 代理正常'}</span>
      </div>
    </aside>
  );
}

function NavigationGroup({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <section className="navigation-group">
      <h2 className="navigation-group-label">{label}</h2>
      <div className="navigation-group-items">{children}</div>
    </section>
  );
}

function ToolNavigationButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick(): void;
}) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={active ? 'tool-nav-button tool-nav-button-active' : 'tool-nav-button'}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ProfileKindIcon({ kind }: { kind: ProfileKind }) {
  return (
    <span aria-hidden="true" className="profile-nav-icon" title={profileKindLabel(kind)}>
      {profileGlyph(kind)}
    </span>
  );
}

function isToolRoute(route: OptionRoute, page: OptionPage): boolean {
  return route.kind === 'tool' && route.page === page;
}

function profileGlyph(kind: ProfileKind): string {
  switch (kind) {
    case 'direct':
      return '直';
    case 'system':
      return '系';
    case 'fixed-proxy':
      return '代';
    case 'auto-switch':
      return '自';
    case 'pac':
      return 'P';
    case 'auto-detect':
      return '检';
    case 'rule-list':
      return '规';
    case 'virtual':
      return '虚';
  }
}
