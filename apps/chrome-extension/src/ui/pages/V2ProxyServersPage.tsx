import { KeyRound, Network, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import type {
  ConfigurationDocument,
  FixedProxyProfileV2,
  ProfileDocumentV2,
  ProxyServer
} from '@switchypeformance/contracts';

import type { BackgroundState } from '../../runtime/messages.ts';
import { createId, requestBackgroundState } from '../background-client.ts';
import { FixedProxyEditor } from '../components/FixedProxyEditor.tsx';
import { ProxyCredentialDialog } from '../components/ProxyCredentialDialog.tsx';
import { ProxyServerDeleteDialog } from '../components/ProxyServerDeleteDialog.tsx';
import { ProxyServerForm, type ProxyServerFormValue } from '../components/ProxyServerForm.tsx';
import {
  createProxyServerWithFixedProfile,
  planProxyServerDeletion,
  replaceAndDeleteProxyServer,
  updateFixedProxyProfile,
  updateProxyServer
} from '../configuration/proxy-server-actions.ts';
import { toUserFacingMessage } from '../error-message.ts';

interface V2ProxyServersPageProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onReplace(document: ConfigurationDocument): Promise<BackgroundState>;
  onState(state: BackgroundState): void;
}

export function V2ProxyServersPage({
  busy,
  document,
  onReplace,
  onState
}: V2ProxyServersPageProps) {
  const [editingServerId, setEditingServerId] = useState<string>();
  const [deletingServerId, setDeletingServerId] = useState<string>();
  const [credentialServerId, setCredentialServerId] = useState<string>();
  const [selectedFixedProfileId, setSelectedFixedProfileId] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const fixedProfiles = document.profiles.filter(
    (profile): profile is FixedProxyProfileV2 => profile.kind === 'fixed-proxy'
  );
  const selectedFixedProfile =
    fixedProfiles.find((profile) => profile.id === selectedFixedProfileId) ?? fixedProfiles[0];
  const editingServer = document.proxyServers.find((server) => server.id === editingServerId);
  const credentialServer = document.proxyServers.find((server) => server.id === credentialServerId);
  const deletingPlan = deletingServerId
    ? planProxyServerDeletion(document, deletingServerId)
    : undefined;
  const usage = useMemo(() => proxyProfileUsage(document), [document]);

  async function replaceConfiguration(action: () => ProfileDocumentV2): Promise<void> {
    try {
      setError(undefined);
      setNotice(undefined);
      await onReplace(action());
    } catch (cause) {
      setError(toUserFacingMessage(cause));
      throw cause;
    }
  }

  async function addServer(value: ProxyServerFormValue): Promise<void> {
    const name = value.name.trim();
    await replaceConfiguration(() =>
      createProxyServerWithFixedProfile(document, {
        profileId: createId('profile'),
        proxy: { ...value, id: createId('proxy'), name }
      })
    );
    setNotice(`已添加 ${name}，并创建同名固定代理配置。`);
  }

  async function saveServer(value: ProxyServerFormValue): Promise<void> {
    if (!editingServer) {
      return;
    }
    await replaceConfiguration(() => updateProxyServer(document, { ...editingServer, ...value }));
    setEditingServerId(undefined);
    setNotice(`已更新 ${value.name}。`);
  }

  async function saveFixedProfile(update: {
    bypassList: readonly string[];
    routes: FixedProxyProfileV2['routes'];
  }): Promise<void> {
    if (!selectedFixedProfile) {
      return;
    }
    await replaceConfiguration(() =>
      updateFixedProxyProfile(document, selectedFixedProfile.id, update)
    );
    setNotice(`已更新 ${selectedFixedProfile.name} 的协议和绕过规则。`);
  }

  async function deleteServer(replacementProxyId: string | undefined): Promise<void> {
    const server = document.proxyServers.find((candidate) => candidate.id === deletingServerId);
    if (!server || !deletingServerId) {
      return;
    }
    try {
      await replaceConfiguration(() =>
        replaceAndDeleteProxyServer(document, deletingServerId, replacementProxyId)
      );
    } catch {
      return;
    }
    setDeletingServerId(undefined);
    setNotice(`已删除 ${server.name}。`);
    if (server.credentialId && !credentialIsUsedElsewhere(document, server)) {
      try {
        onState(
          await requestBackgroundState({
            type: 'proxy.credentials.delete',
            credentialId: server.credentialId
          })
        );
      } catch (cause) {
        setError(`代理服务器已删除，但本地账号密码清理失败：${toUserFacingMessage(cause)}`);
      }
    }
  }

  async function saveCredentials(username: string, password: string): Promise<void> {
    if (!credentialServer) {
      return;
    }
    onState(
      await requestBackgroundState({
        type: 'proxy.credentials.save',
        password,
        proxyId: credentialServer.id,
        username
      })
    );
  }

  async function clearCredentials(): Promise<void> {
    if (!credentialServer) {
      return;
    }
    onState(
      await requestBackgroundState({
        type: 'proxy.credentials.clear',
        proxyId: credentialServer.id
      })
    );
  }

  return (
    <>
      <section className="page-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">新增代理</p>
            <h2>添加代理服务器</h2>
          </div>
          <Plus size={20} />
        </div>
        <ProxyServerForm busy={busy} onSubmit={addServer} submitLabel="添加代理" />
        {notice ? (
          <p className="inline-notice" role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
      {editingServer ? (
        <section className="page-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">编辑代理</p>
              <h2>{editingServer.name}</h2>
            </div>
            <button
              aria-label="取消编辑代理"
              className="icon-action"
              disabled={busy}
              onClick={() => setEditingServerId(undefined)}
              title="取消"
              type="button"
            >
              <X size={17} />
            </button>
          </div>
          <ProxyServerForm
            busy={busy}
            initialValue={formValue(editingServer)}
            key={editingServer.id}
            onSubmit={saveServer}
            submitLabel="保存代理"
          />
        </section>
      ) : null}
      <section className="page-panel table-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">代理服务器</p>
            <h2>已配置 {document.proxyServers.length} 个</h2>
          </div>
        </div>
        {document.proxyServers.length === 0 ? (
          <div className="empty-state">
            <Network size={24} />
            还没有代理服务器
          </div>
        ) : (
          <div className="data-table">
            <div className="table-row table-head proxy-server-table-row">
              <span>名称</span>
              <span>协议</span>
              <span>服务器地址</span>
              <span>固定配置</span>
              <span>账号密码</span>
              <span>操作</span>
            </div>
            {document.proxyServers.map((server) => (
              <div className="table-row proxy-server-table-row" key={server.id}>
                <strong>{server.name}</strong>
                <span className="mono-chip">{server.scheme.toUpperCase()}</span>
                <span className="endpoint-value">
                  {server.host}:{server.port}
                </span>
                <span>{usage.get(server.id)?.size ?? 0} 个</span>
                <span>{server.credentialId ? '已本地保存' : '未设置'}</span>
                <span className="table-actions proxy-server-actions">
                  <button
                    aria-label={`编辑 ${server.name}`}
                    className="icon-action"
                    disabled={busy}
                    onClick={() => setEditingServerId(server.id)}
                    title="编辑代理"
                    type="button"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    aria-label={`设置 ${server.name} 的账号密码`}
                    className="icon-action"
                    disabled={busy}
                    onClick={() => setCredentialServerId(server.id)}
                    title="账号密码"
                    type="button"
                  >
                    <KeyRound size={16} />
                  </button>
                  <button
                    aria-label={`删除 ${server.name}`}
                    className="icon-danger"
                    disabled={busy}
                    onClick={() => setDeletingServerId(server.id)}
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
      {selectedFixedProfile ? (
        <>
          <section className="page-panel fixed-proxy-picker">
            <label>
              要编辑的固定代理配置
              <select
                disabled={busy}
                onChange={(event) => setSelectedFixedProfileId(event.target.value)}
                value={selectedFixedProfile.id}
              >
                {fixedProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
          </section>
          <FixedProxyEditor
            busy={busy}
            document={document}
            key={selectedFixedProfile.id}
            onSave={saveFixedProfile}
            profile={selectedFixedProfile}
          />
        </>
      ) : null}
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
          busy={busy}
          hasCredential={Boolean(credentialServer.credentialId)}
          onClear={clearCredentials}
          onClose={() => setCredentialServerId(undefined)}
          onSave={saveCredentials}
          proxyName={credentialServer.name}
        />
      ) : null}
    </>
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

function proxyProfileUsage(document: ProfileDocumentV2): ReadonlyMap<string, ReadonlySet<string>> {
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

function credentialIsUsedElsewhere(document: ProfileDocumentV2, server: ProxyServer): boolean {
  return Boolean(
    server.credentialId &&
    document.proxyServers.some(
      (candidate) => candidate.id !== server.id && candidate.credentialId === server.credentialId
    )
  );
}
