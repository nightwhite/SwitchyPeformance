import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  CircleGauge,
  Download,
  FileUp,
  Globe2,
  KeyRound,
  Network,
  Plus,
  RefreshCw,
  RotateCcw,
  Route,
  Search,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  Waypoints
} from 'lucide-react';

import type {
  AutoSwitchProfile,
  ProfileDocument,
  ProxyEndpoint,
  Rule
} from '@switchypeformance/contracts';
import { importProfileDocument } from '@switchypeformance/contracts';

import {
  createId,
  requestBackgroundState,
  routeOptions,
  targetFromValue,
  targetToValue
} from '../../src/ui/background-client.ts';
import { toUserFacingMessage } from '../../src/ui/error-message.ts';
import {
  addAutoSwitchProfile,
  addHostRuleToAutoSwitch,
  addProxyWithFixedProfile,
  removeAutoSwitchProfile,
  removeProxyAndReferences,
  replaceAutoSwitchProfile
} from '../../src/ui/configuration-actions.ts';
import { calculateVirtualWindow } from '../../src/ui/rule-virtualizer.ts';
import type { BackgroundState } from '../../src/runtime/messages.ts';
import { explainRouteWithWasm } from '../../src/runtime/wasm-runtime.ts';
import type { RouteExplanation } from '../../src/runtime/route-explainer.ts';
import { V2OptionsApp } from '../../src/ui/pages/V2OptionsApp.tsx';

type Page = 'overview' | 'proxies' | 'automatic' | 'diagnostics' | 'data' | 'settings';

const PAGE_COPY: Record<Page, { title: string; eyebrow: string }> = {
  overview: { eyebrow: '运行状态', title: '代理路由状态' },
  proxies: { eyebrow: '情景模式', title: '代理服务器' },
  automatic: { eyebrow: '情景模式', title: '自动切换' },
  diagnostics: { eyebrow: '工具', title: '排查日志' },
  data: { eyebrow: '工具', title: '导入与导出' },
  settings: { eyebrow: '设置', title: '运行参数' }
};

const RULE_ROW_HEIGHT = 59;
const RULE_VIEWPORT_HEIGHT = 590;
const RULE_OVERSCAN = 5;

export function OptionsApp() {
  const [state, setState] = useState<BackgroundState>();
  const [page, setPage] = useState<Page>(pageFromHash());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void refresh();
    const onHashChange = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const activeProfile = useMemo(
    () =>
      state?.configuration.profiles.find(
        (profile) => profile.id === state.configuration.activeProfileId
      ),
    [state]
  );

  async function refresh(): Promise<void> {
    setError(undefined);
    try {
      setState(await requestBackgroundState({ type: 'state.get' }));
    } catch (cause) {
      setError(messageFor(cause));
    }
  }

  async function saveConfiguration(candidate: unknown): Promise<BackgroundState> {
    setBusy(true);
    setError(undefined);
    try {
      const nextState = await requestBackgroundState({
        type: 'configuration.replace',
        document: candidate
      });
      setState(nextState);
      return nextState;
    } catch (cause) {
      setError(messageFor(cause));
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  function navigate(next: Page): void {
    window.location.hash = next;
    setPage(next);
  }

  if (!state) {
    return <main className="options-loading">正在加载 SwitchyPeformance...</main>;
  }

  const document = state.configuration;
  if (document.schemaVersion === 2) {
    return (
      <V2OptionsApp
        busy={busy}
        document={document}
        error={error}
        state={state}
        onActivate={async (profileId) => {
          setBusy(true);
          setError(undefined);
          try {
            setState(await requestBackgroundState({ type: 'profile.activate', profileId }));
          } catch (cause) {
            setError(messageFor(cause));
          } finally {
            setBusy(false);
          }
        }}
        onRefresh={refresh}
        onReplace={saveConfiguration}
        onState={setState}
      />
    );
  }

  const copy = PAGE_COPY[page];
  return (
    <main className="options-app">
      <aside className="side-rail">
        <div className="rail-brand">
          <span className="rail-mark">
            <ZapMark />
          </span>
          <span>
            <strong>SwitchyPeformance</strong>
            <small>Chrome 代理路由</small>
          </span>
        </div>
        <nav aria-label="设置导航" className="side-nav">
          <NavButton
            icon={<CircleGauge />}
            label="运行状态"
            page="overview"
            active={page}
            onNavigate={navigate}
          />
          <NavButton
            icon={<Network />}
            label="代理服务器"
            page="proxies"
            active={page}
            onNavigate={navigate}
          />
          <NavButton
            icon={<Route />}
            label="自动切换"
            page="automatic"
            active={page}
            onNavigate={navigate}
          />
          <NavButton
            icon={<Activity />}
            label="排查日志"
            page="diagnostics"
            active={page}
            onNavigate={navigate}
          />
          <NavButton
            icon={<FileUp />}
            label="导入与导出"
            page="data"
            active={page}
            onNavigate={navigate}
          />
          <NavButton
            icon={<Settings2 />}
            label="运行参数"
            page="settings"
            active={page}
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
              onClick={() => void refresh()}
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
          {page === 'overview' ? (
            <OverviewPanel
              activeName={activeProfile?.name}
              diagnostics={state.diagnostics}
              document={document}
              onNavigate={navigate}
            />
          ) : null}
          {page === 'proxies' ? (
            <ProxyPanel
              document={document}
              busy={busy}
              onSave={saveConfiguration}
              onState={setState}
            />
          ) : null}
          {page === 'automatic' ? (
            <AutomaticPanel document={document} busy={busy} onSave={saveConfiguration} />
          ) : null}
          {page === 'diagnostics' ? (
            <DiagnosticsPanel
              state={state}
              busy={busy}
              document={document}
              onSave={saveConfiguration}
              onState={setState}
            />
          ) : null}
          {page === 'data' ? (
            <DataPanel document={document} busy={busy} onSave={saveConfiguration} />
          ) : null}
          {page === 'settings' ? (
            <SettingsPanel document={document} busy={busy} onSave={saveConfiguration} />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function NavButton({
  icon,
  label,
  page,
  active,
  onNavigate
}: {
  icon: React.ReactNode;
  label: string;
  page: Page;
  active: Page;
  onNavigate(page: Page): void;
}) {
  const selected = page === active;
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

function OverviewPanel({
  document,
  diagnostics,
  activeName,
  onNavigate
}: {
  document: ProfileDocument;
  diagnostics: BackgroundState['diagnostics'];
  activeName: string | undefined;
  onNavigate(page: Page): void;
}) {
  const autoRules = document.profiles
    .filter((profile): profile is AutoSwitchProfile => profile.kind === 'auto-switch')
    .reduce((count, profile) => count + profile.rules.length, 0);
  const errors = diagnostics.filter((event) => event.level === 'error').length;

  return (
    <>
      <section className="control-band">
        <div className="control-signal">
          <span className="signal-dot" />
          <span>当前模式</span>
        </div>
        <strong>{activeName ?? '未知配置'}</strong>
        <ShieldCheck size={28} aria-hidden="true" />
      </section>
      <section className="metric-grid" aria-label="路由指标">
        <Metric value={document.proxies.length} label="代理服务器" />
        <Metric value={autoRules} label="自动切换规则" />
        <Metric value={errors} label="近期错误" tone={errors > 0 ? 'danger' : 'normal'} />
      </section>
      <section className="page-panel overview-actions">
        <div>
          <p className="panel-kicker">配置管理</p>
          <h2>管理代理服务器和代理配置</h2>
        </div>
        <button className="primary-button" onClick={() => onNavigate('proxies')} type="button">
          <Network size={16} />
          打开代理服务器
        </button>
      </section>
      <section className="page-panel overview-actions">
        <div>
          <p className="panel-kicker">规则引擎</p>
          <h2>每次保存后都会重新编译自动切换规则</h2>
        </div>
        <button className="primary-button" onClick={() => onNavigate('automatic')} type="button">
          <Waypoints size={16} />
          编辑规则
        </button>
      </section>
    </>
  );
}

function Metric({
  value,
  label,
  tone = 'normal'
}: {
  value: number;
  label: string;
  tone?: 'normal' | 'danger';
}) {
  return (
    <div className={tone === 'danger' ? 'metric metric-danger' : 'metric'}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ProxyPanel({
  document,
  busy,
  onSave,
  onState
}: {
  document: ProfileDocument;
  busy: boolean;
  onSave(document: ProfileDocument): Promise<BackgroundState>;
  onState(state: BackgroundState): void;
}) {
  const [draft, setDraft] = useState({
    host: '',
    name: '',
    password: '',
    port: '1080',
    scheme: 'socks5' as ProxyEndpoint['scheme'],
    username: ''
  });
  const [localError, setLocalError] = useState<string>();
  const [credentialDraft, setCredentialDraft] = useState<{
    proxyId: string;
    proxyName: string;
    username: string;
    password: string;
  }>();

  async function addProxy(): Promise<void> {
    const port = Number(draft.port);
    if (
      !draft.name.trim() ||
      !draft.host.trim() ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      setLocalError('请填写名称、地址和 1 到 65535 之间的端口');
      return;
    }
    if ((draft.username || draft.password) && !draft.username.trim()) {
      setLocalError('保存代理账号密码前请填写用户名');
      return;
    }
    setLocalError(undefined);
    try {
      const nextDocument = addProxyWithFixedProfile(document, {
        ...draft,
        name: draft.name.trim(),
        host: draft.host.trim(),
        port
      });
      const proxy = nextDocument.proxies.at(-1);
      await onSave(nextDocument);
      if (proxy && draft.username.trim()) {
        onState(
          await requestBackgroundState({
            type: 'proxy.credentials.save',
            proxyId: proxy.id,
            username: draft.username.trim(),
            password: draft.password
          })
        );
      }
      setDraft({ host: '', name: '', password: '', port: '1080', scheme: 'socks5', username: '' });
    } catch (cause) {
      setLocalError(messageFor(cause));
    }
  }

  async function removeProxy(proxyId: string): Promise<void> {
    if (!window.confirm('要删除此代理及其关联规则吗？')) {
      return;
    }
    const proxy = document.proxies.find((candidate) => candidate.id === proxyId);
    try {
      await onSave(removeProxyAndReferences(document, proxyId));
      if (proxy?.credentialId) {
        onState(
          await requestBackgroundState({
            type: 'proxy.credentials.delete',
            credentialId: proxy.credentialId
          })
        );
      }
      if (credentialDraft?.proxyId === proxyId) {
        setCredentialDraft(undefined);
      }
    } catch (cause) {
      setLocalError(messageFor(cause));
    }
  }

  async function saveCredentials(): Promise<void> {
    if (!credentialDraft) return;
    if (!credentialDraft.username.trim()) {
      setLocalError('保存代理账号密码前请填写用户名');
      return;
    }
    try {
      setLocalError(undefined);
      onState(
        await requestBackgroundState({
          type: 'proxy.credentials.save',
          proxyId: credentialDraft.proxyId,
          username: credentialDraft.username.trim(),
          password: credentialDraft.password
        })
      );
      setCredentialDraft(undefined);
    } catch (cause) {
      setLocalError(messageFor(cause));
    }
  }

  async function clearCredentials(proxy: ProxyEndpoint): Promise<void> {
    if (!proxy.credentialId || !window.confirm(`要清除 ${proxy.name} 已保存的账号密码吗？`)) {
      return;
    }
    try {
      setLocalError(undefined);
      onState(await requestBackgroundState({ type: 'proxy.credentials.clear', proxyId: proxy.id }));
      if (credentialDraft?.proxyId === proxy.id) {
        setCredentialDraft(undefined);
      }
    } catch (cause) {
      setLocalError(messageFor(cause));
    }
  }

  return (
    <>
      <section className="page-panel proxy-form-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">新增代理</p>
            <h2>添加代理服务器</h2>
          </div>
          <Plus size={20} />
        </div>
        <div className="form-grid form-grid-proxy">
          <label>
            名称
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="例如：东京节点"
            />
          </label>
          <label>
            协议
            <select
              value={draft.scheme}
              onChange={(event) =>
                setDraft({ ...draft, scheme: event.target.value as ProxyEndpoint['scheme'] })
              }
            >
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="socks4">SOCKS4</option>
              <option value="socks5">SOCKS5</option>
            </select>
          </label>
          <label>
            地址
            <input
              value={draft.host}
              onChange={(event) => setDraft({ ...draft, host: event.target.value })}
              placeholder="127.0.0.1"
            />
          </label>
          <label>
            端口
            <input
              inputMode="numeric"
              value={draft.port}
              onChange={(event) => setDraft({ ...draft, port: event.target.value })}
            />
          </label>
          <label>
            用户名
            <input
              autoComplete="username"
              value={draft.username}
              onChange={(event) => setDraft({ ...draft, username: event.target.value })}
              placeholder="可选"
            />
          </label>
          <label>
            密码
            <input
              autoComplete="new-password"
              type="password"
              value={draft.password}
              onChange={(event) => setDraft({ ...draft, password: event.target.value })}
              placeholder="可选"
            />
          </label>
          <button
            className="primary-button form-command"
            disabled={busy}
            onClick={() => void addProxy()}
            type="button"
          >
            <Plus size={16} />
            添加代理
          </button>
        </div>
        {localError ? <p className="inline-error">{localError}</p> : null}
      </section>
      <section className="page-panel table-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">代理服务器</p>
            <h2>已配置 {document.proxies.length} 个</h2>
          </div>
        </div>
        {document.proxies.length === 0 ? (
          <EmptyState icon={<Network />} label="还没有代理服务器" />
        ) : (
          <div className="data-table">
            <div className="table-row table-head">
              <span>名称</span>
              <span>协议</span>
              <span>服务器地址</span>
              <span>账号密码</span>
              <span>操作</span>
            </div>
            {document.proxies.map((proxy) => (
              <div className="table-row" key={proxy.id}>
                <strong>{proxy.name}</strong>
                <span className="mono-chip">{proxy.scheme}</span>
                <span className="endpoint-value">
                  {proxy.host}:{proxy.port}
                </span>
                <span>{proxy.credentialId ? '已本地保存' : '未设置'}</span>
                <span className="table-actions">
                  <button
                    aria-label={`设置 ${proxy.name} 的账号密码`}
                    className="icon-action"
                    disabled={busy}
                    onClick={() =>
                      setCredentialDraft({
                        password: '',
                        proxyId: proxy.id,
                        proxyName: proxy.name,
                        username: ''
                      })
                    }
                    title="设置账号密码"
                    type="button"
                  >
                    <KeyRound size={16} />
                  </button>
                  {proxy.credentialId ? (
                    <button
                      aria-label={`清除 ${proxy.name} 的账号密码`}
                      className="icon-action"
                      disabled={busy}
                      onClick={() => void clearCredentials(proxy)}
                      title="清除账号密码"
                      type="button"
                    >
                      <RotateCcw size={16} />
                    </button>
                  ) : null}
                  <button
                    aria-label={`删除 ${proxy.name}`}
                    className="icon-danger"
                    disabled={busy}
                    onClick={() => void removeProxy(proxy.id)}
                    title="删除代理"
                    type="button"
                  >
                    <Trash2 size={16} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
      {credentialDraft ? (
        <section className="page-panel credential-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">本地账号密码</p>
              <h2>{credentialDraft.proxyName}</h2>
            </div>
            <KeyRound size={20} />
          </div>
          <div className="form-grid credential-form">
            <label>
              用户名
              <input
                autoComplete="username"
                value={credentialDraft.username}
                onChange={(event) =>
                  setCredentialDraft({ ...credentialDraft, username: event.target.value })
                }
              />
            </label>
            <label>
              密码
              <input
                autoComplete="new-password"
                type="password"
                value={credentialDraft.password}
                onChange={(event) =>
                  setCredentialDraft({ ...credentialDraft, password: event.target.value })
                }
              />
            </label>
            <button
              className="primary-button form-command"
              disabled={busy}
              onClick={() => void saveCredentials()}
              type="button"
            >
              <Save size={16} />
              保存账号密码
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}

function AutomaticPanel({
  document,
  busy,
  onSave
}: {
  document: ProfileDocument;
  busy: boolean;
  onSave(document: ProfileDocument): Promise<BackgroundState>;
}) {
  const profiles = document.profiles.filter(
    (profile): profile is AutoSwitchProfile => profile.kind === 'auto-switch'
  );
  const [selectedId, setSelectedId] = useState(profiles[0]?.id);
  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0];
  const [draft, setDraft] = useState<AutoSwitchProfile | undefined>(
    selected && cloneAutoProfile(selected)
  );
  const [ruleQuery, setRuleQuery] = useState('');
  const [ruleScrollTop, setRuleScrollTop] = useState(0);
  const [localError, setLocalError] = useState<string>();
  const ruleListRef = useRef<HTMLDivElement>(null);

  const filteredRuleEntries = useMemo(() => {
    const query = ruleQuery.trim().toLocaleLowerCase();
    return (draft?.rules ?? [])
      .map((rule, index) => ({ index, rule }))
      .filter(({ rule }) => {
        if (!query) {
          return true;
        }
        return (
          rule.condition.value.toLocaleLowerCase().includes(query) ||
          rule.condition.type.includes(query) ||
          targetToValue(rule.target).includes(query)
        );
      });
  }, [draft?.rules, ruleQuery]);
  const virtualWindow = useMemo(
    () =>
      calculateVirtualWindow({
        itemCount: filteredRuleEntries.length,
        overscan: RULE_OVERSCAN,
        rowHeight: RULE_ROW_HEIGHT,
        scrollTop: ruleScrollTop,
        viewportHeight: RULE_VIEWPORT_HEIGHT
      }),
    [filteredRuleEntries.length, ruleScrollTop]
  );

  useEffect(() => {
    setDraft(selected && cloneAutoProfile(selected));
    setRuleQuery('');
    setRuleScrollTop(0);
    if (ruleListRef.current) {
      ruleListRef.current.scrollTop = 0;
    }
  }, [selected?.id]);

  if (!selected || !draft) {
    return (
      <section className="page-panel">
        <EmptyState icon={<Waypoints />} label="未找到自动切换配置" />
      </section>
    );
  }

  const activeDraft = draft;
  const targets = routeOptions(document);
  const visibleRuleEntries = filteredRuleEntries.slice(virtualWindow.start, virtualWindow.end);

  function updateRuleSearch(value: string): void {
    setRuleQuery(value);
    setRuleScrollTop(0);
    if (ruleListRef.current) {
      ruleListRef.current.scrollTop = 0;
    }
  }

  function updateRule(index: number, update: Partial<Rule>): void {
    setDraft({
      ...activeDraft,
      rules: activeDraft.rules.map((rule, position) =>
        position === index ? { ...rule, ...update } : rule
      )
    });
  }
  function addRule(): void {
    setDraft({
      ...activeDraft,
      rules: [
        ...activeDraft.rules,
        {
          condition: { type: 'host-suffix', value: '' },
          enabled: true,
          id: createId('rule'),
          target: { kind: 'direct' }
        }
      ]
    });
  }
  async function addAutomaticProfile(): Promise<void> {
    const profileId = createId('auto');
    try {
      setLocalError(undefined);
      await onSave(addAutoSwitchProfile(document, profileId, `自动切换 ${profiles.length + 1}`));
      setSelectedId(profileId);
    } catch (cause) {
      setLocalError(messageFor(cause));
    }
  }
  async function deleteAutomaticProfile(): Promise<void> {
    if (!window.confirm(`要删除 ${activeDraft.name} 及其所有规则吗？`)) {
      return;
    }
    try {
      setLocalError(undefined);
      await onSave(removeAutoSwitchProfile(document, activeDraft.id));
    } catch (cause) {
      setLocalError(messageFor(cause));
    }
  }
  function removeRule(index: number): void {
    setDraft({
      ...activeDraft,
      rules: activeDraft.rules.filter((_rule, position) => position !== index)
    });
  }
  async function applyRules(): Promise<void> {
    try {
      setLocalError(undefined);
      await onSave(replaceAutoSwitchProfile(document, activeDraft));
    } catch (cause) {
      setLocalError(messageFor(cause));
    }
  }

  return (
    <>
      <section className="page-panel rule-toolbar">
        <div className="profile-select">
          <label>
            自动切换配置
            <select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            配置名称
            <input
              onChange={(event) => setDraft({ ...activeDraft, name: event.target.value })}
              value={activeDraft.name}
            />
          </label>
          <label>
            兜底策略
            <select
              value={targetToValue(activeDraft.fallback)}
              onChange={(event) =>
                setDraft({ ...activeDraft, fallback: targetFromValue(event.target.value) })
              }
            >
              {targets.map((target) => (
                <option key={target.value} value={target.value}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            代理失败处理
            <select
              value={activeDraft.proxyFailurePolicy}
              onChange={(event) =>
                setDraft({
                  ...activeDraft,
                  proxyFailurePolicy: event.target.value as AutoSwitchProfile['proxyFailurePolicy']
                })
              }
            >
              <option value="direct">失败后直连</option>
              <option value="block">仅使用代理</option>
            </select>
          </label>
          <label className="rule-search">
            搜索规则
            <input
              type="search"
              value={ruleQuery}
              onChange={(event) => updateRuleSearch(event.target.value)}
              placeholder="域名或路由"
            />
          </label>
        </div>
        <div className="toolbar-actions">
          <button
            className="outline-button"
            disabled={busy}
            onClick={() => void addAutomaticProfile()}
            type="button"
          >
            <Plus size={16} />
            新建配置
          </button>
          <button
            aria-label={`删除 ${activeDraft.name}`}
            className="icon-danger"
            disabled={busy || profiles.length <= 1}
            onClick={() => void deleteAutomaticProfile()}
            title="删除自动切换配置"
            type="button"
          >
            <Trash2 size={16} />
          </button>
          <button className="outline-button" disabled={busy} onClick={addRule} type="button">
            <Plus size={16} />
            添加规则
          </button>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void applyRules()}
            type="button"
          >
            <Save size={16} />
            应用 {activeDraft.rules.length} 条规则
          </button>
        </div>
      </section>
      {localError ? <p className="inline-error">{localError}</p> : null}
      <section className="page-panel rule-table-panel">
        <div className="rule-table-heading">
          <span>启用</span>
          <span>匹配条件</span>
          <span>匹配内容</span>
          <span>路由</span>
          <span>操作</span>
        </div>
        <div
          className="rule-table"
          onScroll={(event) => setRuleScrollTop(event.currentTarget.scrollTop)}
          ref={ruleListRef}
        >
          {filteredRuleEntries.length > 0 ? (
            <div
              className="rule-virtual-spacer"
              style={{ height: `${virtualWindow.totalHeight}px` }}
            >
              <div
                className="rule-virtual-content"
                style={{ transform: `translateY(${virtualWindow.offsetTop}px)` }}
              >
                {visibleRuleEntries.map(({ rule, index }) => (
                  <div className="rule-row" key={rule.id}>
                    <label className="switch-control">
                      <input
                        checked={rule.enabled}
                        onChange={(event) => updateRule(index, { enabled: event.target.checked })}
                        type="checkbox"
                      />
                      <span />
                    </label>
                    <select
                      value={rule.condition.type}
                      onChange={(event) =>
                        updateRule(index, {
                          condition: {
                            type: event.target.value as Rule['condition']['type'],
                            value: rule.condition.value
                          }
                        })
                      }
                    >
                      <option value="host-suffix">主机后缀</option>
                      <option value="host-equals">完整主机</option>
                      <option value="url-glob">网址通配符</option>
                    </select>
                    <input
                      aria-label={`规则 ${index + 1} 的匹配内容`}
                      value={rule.condition.value}
                      onChange={(event) =>
                        updateRule(index, {
                          condition: { ...rule.condition, value: event.target.value }
                        })
                      }
                      placeholder="example.com"
                    />
                    <select
                      value={targetToValue(rule.target)}
                      onChange={(event) =>
                        updateRule(index, { target: targetFromValue(event.target.value) })
                      }
                    >
                      {targets.map((target) => (
                        <option key={target.value} value={target.value}>
                          {target.label}
                        </option>
                      ))}
                    </select>
                    <button
                      aria-label={`删除规则 ${index + 1}`}
                      className="icon-danger"
                      onClick={() => removeRule(index)}
                      title="删除规则"
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Route />}
              label={activeDraft.rules.length === 0 ? '尚未添加规则' : '没有匹配的规则'}
            />
          )}
        </div>
      </section>
    </>
  );
}

function DiagnosticsPanel({
  state,
  busy,
  document,
  onSave,
  onState
}: {
  state: BackgroundState;
  busy: boolean;
  document: ProfileDocument;
  onSave(document: ProfileDocument): Promise<BackgroundState>;
  onState(state: BackgroundState): void;
}) {
  const targets = routeOptions(document);
  const [failureTarget, setFailureTarget] = useState('direct');
  const [localError, setLocalError] = useState<string>();
  const [inspectionUrl, setInspectionUrl] = useState('');
  const [inspection, setInspection] = useState<RouteExplanation>();
  const [inspectionBusy, setInspectionBusy] = useState(false);

  useEffect(() => {
    if (!targets.some((target) => target.value === failureTarget)) {
      setFailureTarget('direct');
    }
  }, [document, failureTarget, targets]);

  async function clear(): Promise<void> {
    if (!window.confirm('要清空排查日志吗？')) {
      return;
    }
    onState(await requestBackgroundState({ type: 'diagnostics.clear' }));
  }

  async function addFailureRule(targetUrl: string): Promise<void> {
    const automatic =
      document.profiles.find(
        (profile): profile is AutoSwitchProfile =>
          profile.kind === 'auto-switch' && profile.id === document.activeProfileId
      ) ??
      document.profiles.find(
        (profile): profile is AutoSwitchProfile => profile.kind === 'auto-switch'
      );
    if (!automatic) {
      setLocalError('没有可用的自动切换配置');
      return;
    }
    try {
      const host = new URL(targetUrl).hostname;
      if (!host) {
        throw new Error('失败请求没有主机名');
      }
      setLocalError(undefined);
      await onSave(
        addHostRuleToAutoSwitch(document, {
          host,
          profileId: automatic.id,
          ruleId: createId('rule'),
          target: targetFromValue(failureTarget)
        })
      );
    } catch (cause) {
      setLocalError(messageFor(cause));
    }
  }

  async function inspectRoute(): Promise<void> {
    try {
      const url = new URL(inspectionUrl.trim()).toString();
      setInspectionBusy(true);
      setLocalError(undefined);
      setInspection(await explainRouteWithWasm(document, url));
    } catch (cause) {
      setInspection(undefined);
      setLocalError(messageFor(cause));
    } finally {
      setInspectionBusy(false);
    }
  }

  return (
    <>
      <section className="page-panel route-inspector">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">路由排查</p>
            <h2>检查网址</h2>
          </div>
          <Search size={20} />
        </div>
        <div className="inspection-form">
          <label>
            网址
            <input
              inputMode="url"
              onChange={(event) => setInspectionUrl(event.target.value)}
              placeholder="https://example.com"
              value={inspectionUrl}
            />
          </label>
          <button
            className="primary-button form-command"
            disabled={inspectionBusy || !inspectionUrl.trim()}
            onClick={() => void inspectRoute()}
            type="button"
          >
            <Search size={16} />
            检查路由
          </button>
        </div>
        {inspection ? (
          <div className="inspection-result">
            <span className="mono-chip">{routeDescription(document, inspection)}</span>
            <span>
              {inspection.matchedRuleId ? `规则 ${inspection.matchedRuleId}` : '配置兜底'}
            </span>
            <span>{reasonDescription(inspection.reason)}</span>
          </div>
        ) : null}
      </section>
      <section className="page-panel diagnostics-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">本地事件</p>
            <h2>{state.diagnostics.length} 条事件</h2>
          </div>
          <div className="diagnostic-actions">
            <label>
              失败请求的路由
              <select
                value={failureTarget}
                onChange={(event) => setFailureTarget(event.target.value)}
              >
                {targets.map((target) => (
                  <option key={target.value} value={target.value}>
                    {target.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => void clear()}
              type="button"
            >
              <Trash2 size={16} />
              清空
            </button>
          </div>
        </div>
        {localError ? <p className="inline-error">{localError}</p> : null}
        {state.diagnostics.length === 0 ? (
          <EmptyState icon={<Activity />} label="没有排查事件" />
        ) : (
          <div className="diagnostic-list">
            {state.diagnostics
              .slice()
              .reverse()
              .map((event) => (
                <article
                  className={
                    event.level === 'error'
                      ? 'diagnostic-event diagnostic-error'
                      : 'diagnostic-event'
                  }
                  key={event.id}
                >
                  <time>{new Date(event.timestamp).toLocaleString()}</time>
                  <span className="event-scope">{diagnosticScopeLabel(event.scope)}</span>
                  <strong>{event.message}</strong>
                  {event.scope === 'network' && event.target ? (
                    <button
                      aria-label={`将 ${event.target} 添加到自动切换`}
                      className="icon-action"
                      disabled={busy}
                      onClick={() => void addFailureRule(event.target ?? '')}
                      title="将失败主机添加到自动切换"
                      type="button"
                    >
                      <Plus size={16} />
                    </button>
                  ) : (
                    <span />
                  )}
                  {event.target ? <p className="diagnostic-target">{event.target}</p> : null}
                  {event.detail ? <p>{event.detail}</p> : null}
                </article>
              ))}
          </div>
        )}
      </section>
    </>
  );
}

function DataPanel({
  document,
  busy,
  onSave
}: {
  document: ProfileDocument;
  busy: boolean;
  onSave(document: ProfileDocument): Promise<BackgroundState>;
}) {
  const [localError, setLocalError] = useState<string>();
  const [localNotice, setLocalNotice] = useState<string>();
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  function exportConfiguration(): void {
    const { credentials: _credentials, ...serializable } = document;
    const exportable = {
      ...serializable,
      proxies: serializable.proxies.map(({ credentialId: _credentialId, ...proxy }) => proxy)
    };
    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = documentCreateAnchor(url, 'SwitchyPeformance-配置.json');
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function importConfiguration(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      setLocalError(undefined);
      setLocalNotice(undefined);
      setWarnings([]);
      const imported = importProfileDocument(JSON.parse(await file.text()) as unknown);
      if (!imported.ok) {
        throw new Error(imported.error);
      }
      await onSave(imported.value);
      const ruleCount = imported.value.profiles
        .filter((profile): profile is AutoSwitchProfile => profile.kind === 'auto-switch')
        .reduce((count, profile) => count + profile.rules.length, 0);
      setLocalNotice(
        `已导入 ${imported.value.proxies.length} 个代理、${imported.value.profiles.length} 个配置和 ${ruleCount} 条规则。`
      );
      setWarnings(imported.warnings);
    } catch (cause) {
      setLocalError(messageFor(cause));
    }
  }
  return (
    <section className="data-grid">
      <article className="page-panel data-action">
        <Download size={24} />
        <h2>导出配置</h2>
        <p>代理账号密码不会导出。</p>
        <button
          className="primary-button"
          disabled={busy}
          onClick={exportConfiguration}
          type="button"
        >
          <Download size={16} />
          导出 JSON
        </button>
      </article>
      <article className="page-panel data-action">
        <Upload size={24} />
        <h2>导入配置</h2>
        <p>无效文件不会修改现有路由。</p>
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
        {localNotice ? <p className="inline-notice">{localNotice}</p> : null}
        {warnings.length > 0 ? (
          <ul className="import-warnings">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        {localError ? <p className="inline-error">{localError}</p> : null}
      </article>
    </section>
  );
}

function SettingsPanel({
  document,
  busy,
  onSave
}: {
  document: ProfileDocument;
  busy: boolean;
  onSave(document: ProfileDocument): Promise<BackgroundState>;
}) {
  const direct = document.profiles.find((profile) => profile.kind === 'direct');
  async function resetToDirect(): Promise<void> {
    if (!direct || !window.confirm('要让 Chrome 切回直连模式吗？')) return;
    await onSave({ ...document, activeProfileId: direct.id });
  }
  return (
    <section className="page-panel settings-panel">
      <div>
        <p className="panel-kicker">恢复</p>
        <h2>切回 Chrome 直连模式</h2>
        <p>原有配置和规则会保留。</p>
      </div>
      <button
        className="danger-outline"
        disabled={busy || !direct}
        onClick={() => void resetToDirect()}
        type="button"
      >
        <RotateCcw size={16} />
        切换到直连模式
      </button>
    </section>
  );
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="empty-state">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function ZapMark() {
  return <Globe2 size={20} strokeWidth={2.5} />;
}

function cloneAutoProfile(profile: AutoSwitchProfile): AutoSwitchProfile {
  return JSON.parse(JSON.stringify(profile)) as AutoSwitchProfile;
}

function pageFromHash(): Page {
  const page = window.location.hash.slice(1);
  return page === 'proxies' ||
    page === 'automatic' ||
    page === 'diagnostics' ||
    page === 'data' ||
    page === 'settings'
    ? page
    : 'overview';
}

function documentCreateAnchor(url: string, filename: string): HTMLAnchorElement {
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  return anchor;
}

function messageFor(cause: unknown): string {
  return toUserFacingMessage(cause);
}

function routeDescription(document: ProfileDocument, explanation: RouteExplanation): string {
  const route = explanation.route;
  if (route.kind === 'direct') {
    return '直连';
  }
  if (route.kind === 'system') {
    return '系统代理';
  }
  const proxy = document.proxies.find((candidate) => candidate.id === route.proxyId);
  return proxy ? `代理：${proxy.name}` : `代理：${route.proxyId}`;
}

function diagnosticScopeLabel(scope: BackgroundState['diagnostics'][number]['scope']): string {
  switch (scope) {
    case 'configuration':
      return '配置';
    case 'proxy':
      return '代理';
    case 'network':
      return '网络';
    case 'runtime':
      return '运行时';
  }
}

function reasonDescription(reason: RouteExplanation['reason']): string {
  switch (reason) {
    case 'fixed-profile':
      return '固定代理配置';
    case 'indexed-rule':
      return '索引主机规则';
    case 'complex-rule':
      return '网址通配符规则';
    case 'loopback-default':
      return '本地地址默认直连';
    case 'profile-default':
      return '配置兜底';
    default:
      return reason;
  }
}
