import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  ExternalLink,
  Globe2,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Zap
} from 'lucide-react';

import {
  addHostRuleToAutoSwitchV2,
  type ConfigurationDocument
} from '@switchypeformance/contracts';

import {
  createId,
  requestBackgroundState,
  routeOptions,
  routeOptionsV2,
  sendBackgroundCommand,
  targetFromValue,
  targetFromValueV2
} from '../../src/ui/background-client.ts';
import { addHostRuleToAutoSwitch } from '../../src/ui/configuration-actions.ts';
import { toUserFacingMessage } from '../../src/ui/error-message.ts';
import { recentFailureHosts } from '../../src/ui/failure-hosts.ts';
import type { BackgroundState } from '../../src/runtime/messages.ts';

export function PopupApp() {
  const [state, setState] = useState<BackgroundState>();
  const [currentHost, setCurrentHost] = useState<string>();
  const [ruleTarget, setRuleTarget] = useState('direct');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const document = state?.configuration;
  const activeProfile = useMemo(
    () => document?.profiles.find((profile) => profile.id === document.activeProfileId),
    [document]
  );
  const options = useMemo(() => {
    if (!document) {
      return [];
    }
    return document.schemaVersion === 1 ? routeOptions(document) : routeOptionsV2(document);
  }, [document]);
  const failedHosts = useMemo(
    () => recentFailureHosts(state?.diagnostics ?? []),
    [state?.diagnostics]
  );

  useEffect(() => {
    void refresh();
    void loadCurrentHost().then(setCurrentHost);
  }, []);

  async function refresh(): Promise<void> {
    setError(undefined);
    try {
      setState(await requestBackgroundState({ type: 'state.get' }));
    } catch (cause) {
      setError(messageFor(cause));
    }
  }

  async function activate(profileId: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      setState(await requestBackgroundState({ type: 'profile.activate', profileId }));
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function addHostRule(host: string): Promise<void> {
    if (!document) {
      return;
    }
    const replacement =
      document.schemaVersion === 1
        ? addV1HostRule(document, host, ruleTarget)
        : addV2HostRule(document, host, selectedRuleTarget(document, ruleTarget));

    setBusy(true);
    setError(undefined);
    try {
      setState(
        await requestBackgroundState({ type: 'configuration.replace', document: replacement })
      );
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function openOptions(): Promise<void> {
    setError(undefined);
    try {
      await sendBackgroundCommand({ type: 'options.open' });
    } catch (cause) {
      setError(messageFor(cause));
    }
  }

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div className="brand-mark" aria-hidden="true">
          <Zap size={17} strokeWidth={2.5} />
        </div>
        <div className="brand-copy">
          <strong>SwitchyPeformance</strong>
          <span>Chrome 代理路由</span>
        </div>
        <button className="icon-button" onClick={() => void refresh()} title="刷新" type="button">
          <RefreshCw size={16} />
        </button>
        <button
          className="icon-button"
          onClick={() => void openOptions()}
          title="打开设置"
          type="button"
        >
          <Settings2 size={16} />
        </button>
      </header>

      <section className="popup-status" aria-live="polite">
        <span className={error ? 'status-dot status-dot-error' : 'status-dot'} />
        <div>
          <span className="eyebrow">当前模式</span>
          <strong>{activeProfile?.name ?? '正在加载配置'}</strong>
        </div>
        <ShieldCheck size={20} aria-hidden="true" />
      </section>

      {error ? <p className="popup-error">{error}</p> : null}

      <section className="popup-section" aria-label="代理配置">
        <div className="section-label">
          <span>代理配置</span>
          <span>{document?.profiles.length ?? 0}</span>
        </div>
        <div className="profile-list">
          {document?.profiles.map((profile) => {
            const active = profile.id === document.activeProfileId;
            return (
              <button
                aria-pressed={active}
                className={active ? 'profile-row profile-row-active' : 'profile-row'}
                disabled={busy}
                key={profile.id}
                onClick={() => void activate(profile.id)}
                type="button"
              >
                <span className="profile-kind">{profileGlyph(profile.kind)}</span>
                <span className="profile-name">{profile.name}</span>
                {active ? <Check size={16} aria-label="当前启用" /> : <ChevronRight size={16} />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="popup-section quick-rule" aria-label="快捷规则">
        <div className="section-label">
          <span>当前网站</span>
          <Globe2 size={14} aria-hidden="true" />
        </div>
        <strong className="host-value">{currentHost ?? '没有可用网页'}</strong>
        <div className="quick-rule-controls">
          <select
            aria-label="当前网站的路由"
            disabled={busy || !currentHost}
            onChange={(event) => setRuleTarget(event.target.value)}
            value={selectedRuleTarget(document, ruleTarget)}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            className="command-button"
            disabled={busy || !currentHost}
            onClick={() => {
              if (currentHost) {
                void addHostRule(currentHost);
              }
            }}
            type="button"
          >
            <Plus size={15} />
            添加规则
          </button>
        </div>
      </section>

      {failedHosts.length > 0 ? (
        <section className="popup-section" aria-label="失败资源">
          <div className="section-label">
            <span>失败资源</span>
            <span>{failedHosts.length}</span>
          </div>
          <div className="failure-list">
            {failedHosts.map((failure) => (
              <div className="failure-row" key={failure.host} title={failure.target}>
                <span className="failure-host">{failure.host}</span>
                <button
                  aria-label={`将 ${failure.host} 添加到自动切换`}
                  className="icon-button"
                  disabled={busy}
                  onClick={() => void addHostRule(failure.host)}
                  title="将失败主机添加到自动切换"
                  type="button"
                >
                  <Plus size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="popup-footer">
        <span>
          {state?.diagnostics.filter((event) => event.level === 'error').length ?? 0} 条近期错误
        </span>
        <button className="link-button" onClick={() => void openOptions()} type="button">
          打开设置
          <ExternalLink size={14} />
        </button>
      </footer>
    </main>
  );
}

function profileGlyph(kind: ConfigurationDocument['profiles'][number]['kind']): string {
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

function addV1HostRule(
  document: Extract<ConfigurationDocument, { schemaVersion: 1 }>,
  host: string,
  targetValue: string
) {
  const automatic = document.profiles.find((profile) => profile.kind === 'auto-switch');
  if (!automatic || automatic.kind !== 'auto-switch') {
    throw new Error('没有可用的自动切换配置');
  }
  return addHostRuleToAutoSwitch(document, {
    host,
    profileId: automatic.id,
    ruleId: createId('rule'),
    target: targetFromValue(targetValue)
  });
}

function addV2HostRule(
  document: Extract<ConfigurationDocument, { schemaVersion: 2 }>,
  host: string,
  targetValue: string
) {
  const automatic = document.profiles.find((profile) => profile.kind === 'auto-switch');
  if (!automatic || automatic.kind !== 'auto-switch') {
    throw new Error('没有可用的自动切换配置');
  }
  return addHostRuleToAutoSwitchV2(document, {
    host,
    profileId: automatic.id,
    ruleId: createId('rule'),
    target: targetFromValueV2(targetValue)
  });
}

function selectedRuleTarget(document: ConfigurationDocument | undefined, value: string): string {
  return document?.schemaVersion === 2 && value === 'direct' ? 'profile:direct' : value;
}

async function loadCurrentHost(): Promise<string | undefined> {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const url = tabs[0]?.url;
  if (!url) {
    return undefined;
  }
  try {
    const host = new URL(url).hostname;
    return host || undefined;
  } catch {
    return undefined;
  }
}

function messageFor(cause: unknown): string {
  return toUserFacingMessage(cause);
}
