import {
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileCode2,
  Globe2,
  ListTree,
  MonitorCog,
  Network,
  Plus,
  RefreshCw,
  Route,
  Settings2,
  TriangleAlert,
  WandSparkles
} from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { originalPopupRows, type OriginalPopupRow } from './menu-model.ts';
import { originalPopupShortcut } from './keyboard-shortcuts.ts';

interface OriginalPopupMenuProps {
  busy: boolean;
  currentHost: string | undefined;
  document: ProfileDocumentV2;
  failureCount: number;
  onActivate(profileId: string): Promise<void>;
  onChangeDefaultTarget(profileId: string, targetProfileId: string): Promise<void>;
  onOpenFailures(): void;
  onOpenOptions(): void;
  onOpenPermanentRule(): void;
  onOpenRoute(): void;
  onOpenTemporaryRule(): void;
  onRefresh(): void;
}

export function OriginalPopupMenu({
  busy,
  currentHost,
  document,
  failureCount,
  onActivate,
  onChangeDefaultTarget,
  onOpenFailures,
  onOpenOptions,
  onOpenPermanentRule,
  onOpenRoute,
  onOpenTemporaryRule,
  onRefresh
}: OriginalPopupMenuProps) {
  const [openDefaultFor, setOpenDefaultFor] = useState<string>();
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const rows = originalPopupRows(document);
  const builtinRows = rows.filter((row) => row.role === 'builtin');
  const customRows = rows.filter((row) => row.role === 'profile');

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (
        busy ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }
      const shortcut = originalPopupShortcut(event.key);
      if (!shortcut) {
        return;
      }
      switch (shortcut.kind) {
        case 'activate-builtin':
          event.preventDefault();
          void onActivate(shortcut.profileId);
          return;
        case 'activate-custom': {
          const profile = customRows[shortcut.index];
          if (!profile) {
            return;
          }
          event.preventDefault();
          void onActivate(profile.profileId);
          return;
        }
        case 'add-rule':
          if (!currentHost) {
            return;
          }
          event.preventDefault();
          onOpenPermanentRule();
          return;
        case 'temporary-rule':
          if (!currentHost) {
            return;
          }
          event.preventDefault();
          onOpenTemporaryRule();
          return;
        case 'failure-list':
          event.preventDefault();
          onOpenFailures();
          return;
        case 'open-options':
          event.preventDefault();
          onOpenOptions();
          return;
        case 'show-help':
          event.preventDefault();
          setShowShortcutHelp((current) => !current);
          return;
        case 'move-focus':
          event.preventDefault();
          movePopupFocus(shortcut.direction);
          return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    busy,
    currentHost,
    customRows,
    onActivate,
    onOpenOptions,
    onOpenPermanentRule,
    onOpenRoute,
    onOpenTemporaryRule
  ]);

  async function changeDefaultTarget(profileId: string, targetProfileId: string): Promise<void> {
    await onChangeDefaultTarget(profileId, targetProfileId);
    setOpenDefaultFor(undefined);
  }

  return (
    <section className="original-popup-menu" aria-label="代理配置菜单">
      <header className="original-popup-header">
        <span className="original-popup-logo" aria-hidden="true">
          <WandSparkles size={18} />
        </span>
        <span className="original-popup-brand">
          <strong>SwitchyPeformance</strong>
          <small>代理模式</small>
        </span>
        <button
          aria-label="刷新弹窗数据"
          className="original-popup-icon-button"
          disabled={busy}
          onClick={onRefresh}
          title="刷新"
          type="button"
        >
          <RefreshCw size={16} />
        </button>
        <button
          aria-label="打开设置"
          className="original-popup-icon-button"
          disabled={busy}
          onClick={onOpenOptions}
          title="选项"
          type="button"
        >
          <Settings2 size={16} />
        </button>
      </header>
      {showShortcutHelp ? (
        <p className="original-popup-shortcut-help" role="status">
          0 直连，S 系统代理，1-9 选择配置，A 添加规则，T 临时规则，R 失败请求，O 选项。
        </p>
      ) : null}

      <ul className="original-popup-profile-list" role="menu">
        {builtinRows.map((row) => (
          <PopupProfileRow
            active={row.profileId === document.activeProfileId}
            busy={busy}
            key={row.profileId}
            onActivate={onActivate}
            onChangeDefaultTarget={changeDefaultTarget}
            onToggleDefault={(profileId) =>
              setOpenDefaultFor((current) => (current === profileId ? undefined : profileId))
            }
            openDefault={openDefaultFor === row.profileId}
            row={row}
          />
        ))}
        {builtinRows.length > 0 && customRows.length > 0 ? (
          <li aria-hidden="true" className="original-popup-divider" role="separator" />
        ) : null}
        {customRows.map((row) => (
          <PopupProfileRow
            active={row.profileId === document.activeProfileId}
            busy={busy}
            key={row.profileId}
            onActivate={onActivate}
            onChangeDefaultTarget={changeDefaultTarget}
            onToggleDefault={(profileId) =>
              setOpenDefaultFor((current) => (current === profileId ? undefined : profileId))
            }
            openDefault={openDefaultFor === row.profileId}
            row={row}
          />
        ))}
      </ul>

      <nav aria-label="当前网站操作" className="original-popup-actions">
        {failureCount > 0 ? (
          <button disabled={busy} onClick={onOpenFailures} type="button">
            <TriangleAlert size={16} />
            <span>失败资源 ({failureCount})</span>
          </button>
        ) : null}
        {currentHost ? (
          <>
            <button disabled={busy} onClick={onOpenPermanentRule} type="button">
              <Plus size={16} />
              <span>为 {currentHost} 添加规则</span>
            </button>
            <button disabled={busy} onClick={onOpenTemporaryRule} type="button">
              <Clock3 size={16} />
              <span>临时规则</span>
            </button>
          </>
        ) : (
          <p>当前页面不能添加规则。</p>
        )}
        <button disabled={busy} onClick={onOpenRoute} type="button">
          <Route size={16} />
          <span>查看当前路由</span>
        </button>
        <button disabled={busy} onClick={onOpenOptions} type="button">
          <Settings2 size={16} />
          <span>选项</span>
        </button>
      </nav>
    </section>
  );
}

function PopupProfileRow({
  active,
  busy,
  onActivate,
  onChangeDefaultTarget,
  onToggleDefault,
  openDefault,
  row
}: {
  active: boolean;
  busy: boolean;
  onActivate(profileId: string): Promise<void>;
  onChangeDefaultTarget(profileId: string, targetProfileId: string): Promise<void>;
  onToggleDefault(profileId: string): void;
  openDefault: boolean;
  row: OriginalPopupRow;
}) {
  const defaultTarget = row.defaultTarget;
  return (
    <li className={active ? 'original-popup-profile active' : 'original-popup-profile'} role="none">
      <div className="original-popup-profile-main">
        <button
          aria-pressed={active}
          disabled={busy}
          onClick={() => void onActivate(row.profileId)}
          role="menuitemradio"
          type="button"
        >
          <ProfileIcon kind={row.kind} />
          <span className="original-popup-profile-label">{row.label}</span>
          {defaultTarget ? (
            <span className="original-popup-default-label">默认目标：{defaultTarget.label}</span>
          ) : null}
          {active ? <Check aria-label="当前启用" size={16} /> : null}
        </button>
        {defaultTarget ? (
          <button
            aria-expanded={openDefault}
            aria-label={`修改 ${row.label} 的默认目标`}
            className="original-popup-default-toggle"
            disabled={busy}
            onClick={() => onToggleDefault(row.profileId)}
            title="修改默认目标"
            type="button"
          >
            <ChevronDown size={16} />
          </button>
        ) : null}
      </div>
      {defaultTarget && openDefault ? (
        <ul aria-label={`${row.label} 的默认目标`} className="original-popup-default-menu" role="menu">
          {defaultTarget.options.map((target) => (
            <li key={target.profileId} role="none">
              <button
                aria-checked={target.profileId === defaultTarget.profileId}
                disabled={busy}
                onClick={() => void onChangeDefaultTarget(row.profileId, target.profileId)}
                role="menuitemradio"
                type="button"
              >
                <span>{target.label}</span>
                {target.profileId === defaultTarget.profileId ? <Check size={15} /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ProfileIcon({ kind }: { kind: OriginalPopupRow['kind'] }) {
  const props = { 'aria-hidden': true, size: 16 } as const;
  switch (kind) {
    case 'direct':
      return <Globe2 {...props} />;
    case 'system':
      return <MonitorCog {...props} />;
    case 'fixed-proxy':
      return <Network {...props} />;
    case 'pac':
      return <FileCode2 {...props} />;
    case 'auto-detect':
      return <CircleHelp {...props} />;
    case 'auto-switch':
      return <Route {...props} />;
    case 'rule-list':
      return <ListTree {...props} />;
    case 'virtual':
      return <WandSparkles {...props} />;
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function movePopupFocus(direction: 'next' | 'previous'): void {
  const buttons = Array.from(
    globalThis.document.querySelectorAll<HTMLButtonElement>(
      '.original-popup-menu button:not([disabled])'
    )
  );
  if (buttons.length === 0) {
    return;
  }
  const currentIndex = buttons.indexOf(globalThis.document.activeElement as HTMLButtonElement);
  const activeRowButton = globalThis.document.querySelector<HTMLButtonElement>(
    '.original-popup-profile.active .original-popup-profile-main > button:first-child'
  );
  const fallbackIndex = activeRowButton ? buttons.indexOf(activeRowButton) : 0;
  const startIndex = currentIndex >= 0 ? currentIndex : Math.max(fallbackIndex, 0);
  const nextIndex =
    direction === 'next'
      ? (startIndex + 1) % buttons.length
      : (startIndex - 1 + buttons.length) % buttons.length;
  buttons[nextIndex]?.focus();
}
