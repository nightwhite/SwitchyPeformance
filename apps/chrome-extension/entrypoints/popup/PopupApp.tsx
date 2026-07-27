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

import type { ProfileDocument, RouteTarget } from '@switchypeformance/contracts';

import {
  createId,
  requestBackgroundState,
  routeOptions,
  sendBackgroundCommand,
  targetFromValue
} from '../../src/ui/background-client.ts';
import { addHostRuleToAutoSwitch } from '../../src/ui/configuration-actions.ts';
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
  const options = useMemo(() => (document ? routeOptions(document) : []), [document]);
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
    const automatic = document.profiles.find((profile) => profile.kind === 'auto-switch');
    if (!automatic || automatic.kind !== 'auto-switch') {
      setError('No automatic routing profile is available');
      return;
    }

    const target = targetFromValue(ruleTarget);
    const replacement = addHostRuleToAutoSwitch(document, {
      host,
      profileId: automatic.id,
      ruleId: createId('rule'),
      target
    });

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
          <span>Chrome proxy routing</span>
        </div>
        <button
          className="icon-button"
          onClick={() => void refresh()}
          title="Refresh"
          type="button"
        >
          <RefreshCw size={16} />
        </button>
        <button
          className="icon-button"
          onClick={() => void openOptions()}
          title="Open settings"
          type="button"
        >
          <Settings2 size={16} />
        </button>
      </header>

      <section className="popup-status" aria-live="polite">
        <span className={error ? 'status-dot status-dot-error' : 'status-dot'} />
        <div>
          <span className="eyebrow">ACTIVE ROUTE</span>
          <strong>{activeProfile?.name ?? 'Loading configuration'}</strong>
        </div>
        <ShieldCheck size={20} aria-hidden="true" />
      </section>

      {error ? <p className="popup-error">{error}</p> : null}

      <section className="popup-section" aria-label="Profiles">
        <div className="section-label">
          <span>Profiles</span>
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
                {active ? <Check size={16} aria-label="Active" /> : <ChevronRight size={16} />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="popup-section quick-rule" aria-label="Quick rule">
        <div className="section-label">
          <span>Current site</span>
          <Globe2 size={14} aria-hidden="true" />
        </div>
        <strong className="host-value">{currentHost ?? 'No active web page'}</strong>
        <div className="quick-rule-controls">
          <select
            aria-label="Route for current site"
            disabled={busy || !currentHost}
            onChange={(event) => setRuleTarget(event.target.value)}
            value={ruleTarget}
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
            Add rule
          </button>
        </div>
      </section>

      {failedHosts.length > 0 ? (
        <section className="popup-section" aria-label="Failed resources">
          <div className="section-label">
            <span>Failed resources</span>
            <span>{failedHosts.length}</span>
          </div>
          <div className="failure-list">
            {failedHosts.map((failure) => (
              <div className="failure-row" key={failure.host} title={failure.target}>
                <span className="failure-host">{failure.host}</span>
                <button
                  aria-label={`Add ${failure.host} to automatic routing`}
                  className="icon-button"
                  disabled={busy}
                  onClick={() => void addHostRule(failure.host)}
                  title="Add failed host to automatic routing"
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
          {state?.diagnostics.filter((event) => event.level === 'error').length ?? 0} recent errors
        </span>
        <button className="link-button" onClick={() => void openOptions()} type="button">
          Dashboard
          <ExternalLink size={14} />
        </button>
      </footer>
    </main>
  );
}

function profileGlyph(kind: ProfileDocument['profiles'][number]['kind']): string {
  switch (kind) {
    case 'direct':
      return 'D';
    case 'system':
      return 'S';
    case 'fixed-proxy':
      return 'P';
    case 'auto-switch':
      return 'A';
  }
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
  return cause instanceof Error ? cause.message : String(cause);
}
