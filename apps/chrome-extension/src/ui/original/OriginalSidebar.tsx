import {
  Activity,
  CheckCircle2,
  CirclePlus,
  FileCog,
  Palette,
  RotateCcw,
  Settings2,
  SlidersHorizontal
} from 'lucide-react';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { originalSidebarGroups, type OriginalSidebarItem } from './sidebar-model.ts';
import type { OriginalRoute, OriginalToolPage } from './routes.ts';

interface OriginalSidebarProps {
  busy: boolean;
  dirty: boolean;
  document: ProfileDocumentV2;
  onApply(): void;
  onDiscard(): void;
  onNavigateProfile(profileId: string): void;
  onNavigateTool(page: OriginalToolPage): void;
  onNewProfile(): void;
  route: OriginalRoute;
}

export function OriginalSidebar({
  busy,
  dirty,
  document,
  onApply,
  onDiscard,
  onNavigateProfile,
  onNavigateTool,
  onNewProfile,
  route
}: OriginalSidebarProps) {
  return (
    <aside className="original-sidebar">
      <header className="original-sidebar-brand">
        <strong>SwitchyPeformance</strong>
      </header>
      <nav aria-label="原版配置导航">
        {originalSidebarGroups(document).map((group) => (
          <section className="original-sidebar-group" key={group.label}>
            <h2>{group.label}</h2>
            {group.items.map((item) => (
              <SidebarItem
                busy={busy}
                dirty={dirty}
                item={item}
                key={`${item.kind}-${item.label}`}
                onApply={onApply}
                onDiscard={onDiscard}
                onNavigateProfile={onNavigateProfile}
                onNavigateTool={onNavigateTool}
                onNewProfile={onNewProfile}
                route={route}
              />
            ))}
          </section>
        ))}
      </nav>
    </aside>
  );
}

function SidebarItem({
  busy,
  dirty,
  item,
  onApply,
  onDiscard,
  onNavigateProfile,
  onNavigateTool,
  onNewProfile,
  route
}: Omit<OriginalSidebarProps, 'document'> & { item: OriginalSidebarItem }) {
  switch (item.kind) {
    case 'tool':
      return (
        <button
          aria-current={route.kind === 'tool' && route.page === item.page ? 'page' : undefined}
          className="original-sidebar-item"
          onClick={() => onNavigateTool(item.page)}
          type="button"
        >
          {toolIcon(item.page)}
          {item.label}
        </button>
      );
    case 'profile':
      return (
        <button
          aria-current={
            route.kind === 'profile' && route.profileId === item.profileId ? 'page' : undefined
          }
          className="original-sidebar-item original-sidebar-profile"
          onClick={() => onNavigateProfile(item.profileId)}
          type="button"
        >
          <span aria-hidden="true" className="original-profile-dot" />
          {item.label}
        </button>
      );
    case 'new-profile':
      return (
        <button className="original-sidebar-item" onClick={onNewProfile} type="button">
          <CirclePlus size={15} />
          {item.label}
        </button>
      );
    case 'apply':
      return (
        <button
          className={
            dirty
              ? 'original-sidebar-item original-sidebar-apply is-dirty'
              : 'original-sidebar-item original-sidebar-apply'
          }
          disabled={busy || !dirty}
          onClick={onApply}
          type="button"
        >
          <CheckCircle2 size={15} />
          {item.label}
        </button>
      );
    case 'discard':
      return (
        <button
          className="original-sidebar-item original-sidebar-discard"
          disabled={busy || !dirty}
          onClick={onDiscard}
          type="button"
        >
          <RotateCcw size={15} />
          {item.label}
        </button>
      );
  }
}

function toolIcon(page: OriginalToolPage): React.ReactNode {
  switch (page) {
    case 'ui':
      return <SlidersHorizontal size={15} />;
    case 'general':
      return <Settings2 size={15} />;
    case 'io':
      return <FileCog size={15} />;
    case 'theme':
      return <Palette size={15} />;
    case 'builtin':
      return <Settings2 size={15} />;
    case 'diagnostics':
      return <Activity size={15} />;
  }
}
