import { ChevronDown, CirclePlus, KeyRound, Pencil, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type {
  ConfigurationDocument,
  FixedProxyProfileV2,
  ProfileDocumentV2,
  ProxyRoutes,
  ProxyServer
} from '@switchypeformance/contracts';

import type { BackgroundState } from '../../../runtime/messages.ts';
import { createId, requestBackgroundState } from '../../background-client.ts';
import { ProxyCredentialDialog } from '../../components/ProxyCredentialDialog.tsx';
import {
  ProxyServerDeleteDialog,
  type ProxyServerDeleteAction
} from '../../components/ProxyServerDeleteDialog.tsx';
import { ProxyServerForm, type ProxyServerFormValue } from '../../components/ProxyServerForm.tsx';
import {
  deleteProxyServerWithDependentProfiles,
  planProxyServerDeletion,
  replaceAndDeleteProxyServer,
  updateProxyServer
} from '../../configuration/proxy-server-actions.ts';
import {
  addProxyServerToDraft,
  setFixedBypassList,
  setFixedRoute
} from './fixed-profile-draft.ts';

interface FixedProfilePageProps {
  busy: boolean;
  dirty: boolean;
  document: ProfileDocumentV2;
  onBackgroundState(state: BackgroundState): void;
  onReplace(document: ConfigurationDocument): Promise<BackgroundState>;
  profile: FixedProxyProfileV2;
}

export function FixedProfilePage({
  busy,
  dirty,
  document,
  onBackgroundState,
  onReplace,
  profile
}: FixedProfilePageProps) {
  const [advancedOpen, setAdvancedOpen] = useState(hasProtocolOverrides(profile.routes));
  const [bypassText, setBypassText] = useState(profile.bypassList.join('\n'));
  const [addingServer, setAddingServer] = useState(false);
  const [editingServerId, setEditingServerId] = useState<string>();
  const [deletingServerId, setDeletingServerId] = useState<string>();
  const [credentialServerId, setCredentialServerId] = useState<string>();
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    setAdvancedOpen(hasProtocolOverrides(profile.routes));
    setBypassText(profile.bypassList.join('\n'));
    setError(undefined);
    setNotice(undefined);
  }, [profile.bypassList, profile.id, profile.routes]);

  const editingServer = document.proxyServers.find((server) => server.id === editingServerId);
  const credentialServer = document.proxyServers.find((server) => server.id === credentialServerId);
  const deletingPlan = deletingServerId
    ? planProxyServerDeletion(document, deletingServerId)
    : undefined;
  const profileUsage = useMemo(() => usageByServer(document), [document]);

  async function replace(action: () => ProfileDocumentV2, message?: string): Promise<boolean> {
    try {
      setError(undefined);
      await onReplace(action());
      if (message) {
        setNotice(message);
      }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法更新固定代理配置');
      return false;
    }
  }

  async function changeRoute(field: keyof ProxyRoutes, proxyId: string): Promise<void> {
    await replace(
      () => setFixedRoute(document, profile.id, field, proxyId),
      '协议路由已加入待应用修改。'
    );
  }

  async function saveBypass(): Promise<void> {
    await replace(
      () => setFixedBypassList(document, profile.id, bypassText.split(/[\n,]/)),
      '绕过列表已加入待应用修改。'
    );
  }

  async function addServer(value: ProxyServerFormValue): Promise<void> {
    const saved = await replace(
      () => addProxyServerToDraft(document, { ...value, id: createId('proxy') }),
      `${value.name} 已加入待应用修改。`
    );
    if (saved) {
      setAddingServer(false);
    }
  }

  async function saveServer(value: ProxyServerFormValue): Promise<void> {
    if (!editingServer) {
      return;
    }
    const saved = await replace(
      () => updateProxyServer(document, { ...editingServer, ...value }),
      `${value.name} 已加入待应用修改。`
    );
    if (saved) {
      setEditingServerId(undefined);
    }
  }

  async function deleteServer(action: ProxyServerDeleteAction): Promise<void> {
    const proxyId = deletingServerId;
    const server = document.proxyServers.find((candidate) => candidate.id === proxyId);
    if (!proxyId || !server) {
      return;
    }
    const saved = await replace(() => {
      switch (action.kind) {
        case 'delete-server':
          return replaceAndDeleteProxyServer(document, proxyId);
        case 'replace-server':
          return replaceAndDeleteProxyServer(document, proxyId, action.replacementProxyId);
        case 'delete-dependent-profiles':
          return deleteProxyServerWithDependentProfiles(
            document,
            proxyId,
            action.replacementProfileId
          );
      }
    }, `${server.name} 已从待应用配置中删除。`);
    if (saved) {
      setDeletingServerId(undefined);
    }
  }

  async function saveCredentials(username: string, password: string): Promise<void> {
    if (!credentialServer) {
      return;
    }
    setCredentialBusy(true);
    try {
      onBackgroundState(
        await requestBackgroundState({
          type: 'proxy.credentials.save',
          password,
          proxyId: credentialServer.id,
          username
        })
      );
      setCredentialServerId(undefined);
    } finally {
      setCredentialBusy(false);
    }
  }

  async function clearCredentials(): Promise<void> {
    if (!credentialServer) {
      return;
    }
    setCredentialBusy(true);
    try {
      onBackgroundState(
        await requestBackgroundState({ type: 'proxy.credentials.clear', proxyId: credentialServer.id })
      );
      setCredentialServerId(undefined);
    } finally {
      setCredentialBusy(false);
    }
  }

  return (
    <section className="original-fixed-profile-page">
      <section className="original-page-panel original-fixed-routes">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">固定代理</p>
            <h2>代理协议</h2>
          </div>
        </div>
        <div className="original-route-table" role="table" aria-label="固定代理协议">
          <ProxyRouteRow
            busy={busy}
            document={document}
            field="fallbackProxyId"
            label="默认代理"
            onChange={changeRoute}
            value={profile.routes.fallbackProxyId}
          />
          <button
            aria-expanded={advancedOpen}
            className="original-advanced-toggle"
            onClick={() => setAdvancedOpen((current) => !current)}
            type="button"
          >
            <ChevronDown className={advancedOpen ? 'original-chevron-open' : undefined} size={16} />
            协议代理覆盖
          </button>
          {advancedOpen ? (
            <>
              <ProxyRouteRow
                busy={busy}
                document={document}
                field="httpProxyId"
                label="HTTP 代理"
                onChange={changeRoute}
                value={profile.routes.httpProxyId ?? ''}
              />
              <ProxyRouteRow
                busy={busy}
                document={document}
                field="httpsProxyId"
                label="HTTPS 代理"
                onChange={changeRoute}
                value={profile.routes.httpsProxyId ?? ''}
              />
              <ProxyRouteRow
                busy={busy}
                document={document}
                field="ftpProxyId"
                label="FTP 代理"
                onChange={changeRoute}
                value={profile.routes.ftpProxyId ?? ''}
              />
            </>
          ) : null}
        </div>
      </section>

      <section className="original-page-panel original-bypass-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">高级选项</p>
            <h2>绕过列表</h2>
          </div>
          <button className="outline-button" disabled={busy} onClick={() => void saveBypass()} type="button">
            <Save size={16} />
            更新列表
          </button>
        </div>
        <textarea
          aria-label="绕过列表"
          disabled={busy}
          onChange={(event) => setBypassText(event.target.value)}
          placeholder={'localhost\n*.internal.example\n10.0.0.0/8'}
          rows={5}
          value={bypassText}
        />
      </section>

      <section className="original-page-panel original-proxy-server-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">代理服务器</p>
            <h2>{document.proxyServers.length} 个可用代理</h2>
          </div>
          <button
            className="outline-button"
            disabled={busy}
            onClick={() => setAddingServer((current) => !current)}
            type="button"
          >
            <CirclePlus size={16} />
            添加代理服务器
          </button>
        </div>
        {addingServer ? (
          <div className="original-server-form">
            <ProxyServerForm busy={busy} onSubmit={addServer} submitLabel="加入当前配置" />
          </div>
        ) : null}
        {editingServer ? (
          <div className="original-server-form">
            <div className="original-server-form-heading">
              <strong>编辑 {editingServer.name}</strong>
              <button
                aria-label="取消编辑代理服务器"
                className="icon-action"
                disabled={busy}
                onClick={() => setEditingServerId(undefined)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
            <ProxyServerForm
              busy={busy}
              initialValue={formValue(editingServer)}
              key={editingServer.id}
              onSubmit={saveServer}
              submitLabel="保存代理服务器"
            />
          </div>
        ) : null}
        <div className="original-server-list" role="list">
          {document.proxyServers.map((server) => (
            <article className="original-server-row" key={server.id} role="listitem">
              <div>
                <strong>{server.name}</strong>
                <span>
                  {server.scheme.toUpperCase()} {server.host}:{server.port}
                </span>
              </div>
              <small>{profileUsage.get(server.id)?.size ?? 0} 个固定配置使用</small>
              <div className="original-server-actions">
                <button
                  aria-label={`编辑 ${server.name}`}
                  className="icon-action"
                  disabled={busy}
                  onClick={() => setEditingServerId(server.id)}
                  title="编辑代理服务器"
                  type="button"
                >
                  <Pencil size={16} />
                </button>
                <button
                  aria-label={`设置 ${server.name} 的账号密码`}
                  className="icon-action"
                  disabled={busy || dirty}
                  onClick={() => setCredentialServerId(server.id)}
                  title={dirty ? '请先应用当前配置修改，再设置账号密码' : '账号密码'}
                  type="button"
                >
                  <KeyRound size={16} />
                </button>
                <button
                  aria-label={`删除 ${server.name}`}
                  className="icon-danger"
                  disabled={busy}
                  onClick={() => setDeletingServerId(server.id)}
                  title="删除代理服务器"
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
        {dirty ? <p className="field-help">有未应用的配置时，账号密码按钮会暂时关闭。</p> : null}
      </section>

      {notice ? <p className="inline-notice">{notice}</p> : null}
      {error ? <p className="inline-error">{error}</p> : null}
      {deletingServerId && deletingPlan ? (
        <ProxyServerDeleteDialog
          busy={busy}
          document={document}
          onClose={() => setDeletingServerId(undefined)}
          onConfirm={deleteServer}
          plan={deletingPlan}
          proxyId={deletingServerId}
        />
      ) : null}
      {credentialServer ? (
        <ProxyCredentialDialog
          busy={busy || credentialBusy}
          hasCredential={Boolean(credentialServer.credentialId)}
          onClear={clearCredentials}
          onClose={() => setCredentialServerId(undefined)}
          onSave={saveCredentials}
          proxyName={credentialServer.name}
        />
      ) : null}
    </section>
  );
}

function ProxyRouteRow({
  busy,
  document,
  field,
  label,
  onChange,
  value
}: {
  busy: boolean;
  document: ProfileDocumentV2;
  field: keyof ProxyRoutes;
  label: string;
  onChange(field: keyof ProxyRoutes, proxyId: string): Promise<void>;
  value: string;
}) {
  const optional = field !== 'fallbackProxyId';
  return (
    <label className="original-route-row" role="row">
      <span>{label}</span>
      <select
        disabled={busy}
        onChange={(event) => void onChange(field, event.target.value)}
        value={value}
      >
        {optional ? <option value="">使用默认代理</option> : null}
        {document.proxyServers.map((server) => (
          <option key={server.id} value={server.id}>
            {server.name} ({server.scheme.toUpperCase()} {server.host}:{server.port})
          </option>
        ))}
      </select>
    </label>
  );
}

function formValue(server: ProxyServer): ProxyServerFormValue {
  return {
    host: server.host,
    name: server.name,
    port: server.port,
    scheme: server.scheme
  };
}

function hasProtocolOverrides(routes: ProxyRoutes): boolean {
  return Boolean(routes.httpProxyId || routes.httpsProxyId || routes.ftpProxyId);
}

function usageByServer(document: ProfileDocumentV2): ReadonlyMap<string, ReadonlySet<string>> {
  const usage = new Map<string, Set<string>>();
  for (const profile of document.profiles) {
    if (profile.kind !== 'fixed-proxy') {
      continue;
    }
    for (const proxyId of [
      profile.routes.fallbackProxyId,
      profile.routes.httpProxyId,
      profile.routes.httpsProxyId,
      profile.routes.ftpProxyId
    ]) {
      if (!proxyId) {
        continue;
      }
      const profiles = usage.get(proxyId) ?? new Set<string>();
      profiles.add(profile.id);
      usage.set(proxyId, profiles);
    }
  }
  return usage;
}
