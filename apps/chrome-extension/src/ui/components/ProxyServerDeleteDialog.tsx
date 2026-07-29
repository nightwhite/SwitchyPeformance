import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import type { ProxyServerDeletionPlan } from '../configuration/proxy-server-actions.ts';
import { profileName } from '../v2-labels.ts';

interface ProxyServerDeleteDialogProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onClose(): void;
  onConfirm(action: ProxyServerDeleteAction): Promise<void>;
  plan: ProxyServerDeletionPlan;
  proxyId: string;
}

export type ProxyServerDeleteAction =
  | { kind: 'delete-server' }
  | { kind: 'delete-dependent-profiles'; replacementProfileId: string }
  | { kind: 'replace-server'; replacementProxyId: string };

export function ProxyServerDeleteDialog({
  busy,
  document,
  onClose,
  onConfirm,
  plan,
  proxyId
}: ProxyServerDeleteDialogProps) {
  const serverReplacements = document.proxyServers.filter((server) => server.id !== proxyId);
  const dependentProfileIds = [...new Set(plan.references.map((reference) => reference.profileId))];
  const profileReplacements = document.profiles.filter(
    (profile) => !dependentProfileIds.includes(profile.id)
  );
  const hasReferences = plan.references.length > 0;
  const [mode, setMode] = useState<'delete-dependent-profiles' | 'replace-server'>(
    serverReplacements.length > 0 ? 'replace-server' : 'delete-dependent-profiles'
  );
  const [replacementProxyId, setReplacementProxyId] = useState(serverReplacements[0]?.id ?? '');
  const [replacementProfileId, setReplacementProfileId] = useState(
    profileReplacements[0]?.id ?? ''
  );
  const proxyName = document.proxyServers.find((server) => server.id === proxyId)?.name ?? proxyId;
  const deletingProfiles = mode === 'delete-dependent-profiles';
  const canConfirm =
    !busy &&
    (!hasReferences || deletingProfiles
      ? Boolean(!hasReferences || replacementProfileId)
      : Boolean(replacementProxyId));

  function confirmAction(): ProxyServerDeleteAction {
    if (!hasReferences) {
      return { kind: 'delete-server' };
    }
    return deletingProfiles
      ? { kind: 'delete-dependent-profiles', replacementProfileId }
      : { kind: 'replace-server', replacementProxyId };
  }

  return (
    <div className="modal-scrim" role="presentation">
      <section aria-label="删除代理服务器" aria-modal="true" className="modal-dialog" role="dialog">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">安全删除</p>
            <h2>删除 {proxyName}</h2>
          </div>
          <button
            aria-label="关闭删除对话框"
            className="icon-action"
            onClick={onClose}
            title="关闭"
            type="button"
          >
            <X size={17} />
          </button>
        </div>
        {hasReferences ? (
          <>
            <p className="modal-warning">
              <AlertTriangle size={16} />
              当前服务器仍被 {plan.references.length} 处固定代理配置使用。
            </p>
            <ul className="reference-list">
              {plan.references.map((reference) => (
                <li key={`${reference.profileId}:${reference.field}`}>
                  {profileName(document, reference.profileId)} / {reference.field}
                </li>
              ))}
            </ul>
            <div className="dialog-mode-control" role="group" aria-label="删除处理方式">
              {serverReplacements.length > 0 ? (
                <button
                  aria-pressed={!deletingProfiles}
                  className={
                    !deletingProfiles ? 'scope-button scope-button-active' : 'scope-button'
                  }
                  disabled={busy}
                  onClick={() => setMode('replace-server')}
                  type="button"
                >
                  替代服务器
                </button>
              ) : null}
              <button
                aria-pressed={deletingProfiles}
                className={deletingProfiles ? 'scope-button scope-button-active' : 'scope-button'}
                disabled={busy}
                onClick={() => setMode('delete-dependent-profiles')}
                type="button"
              >
                删除关联配置
              </button>
            </div>
            {deletingProfiles ? (
              <label>
                被替换为
                <select
                  disabled={busy || profileReplacements.length === 0}
                  onChange={(event) => setReplacementProfileId(event.target.value)}
                  value={replacementProfileId}
                >
                  {profileReplacements.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                替代代理服务器
                <select
                  disabled={busy || serverReplacements.length === 0}
                  onChange={(event) => setReplacementProxyId(event.target.value)}
                  value={replacementProxyId}
                >
                  {serverReplacements.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.name} ({server.scheme.toUpperCase()} {server.host}:{server.port})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        ) : (
          <p className="inline-notice">没有固定代理配置引用这个服务器。</p>
        )}
        <div className="dialog-actions">
          <button className="outline-button" disabled={busy} onClick={onClose} type="button">
            取消
          </button>
          <button
            className="danger-outline"
            disabled={!canConfirm}
            onClick={() => void onConfirm(confirmAction())}
            type="button"
          >
            <Trash2 size={16} />
            {deletingProfiles && hasReferences ? '删除配置和服务器' : '替换并删除'}
          </button>
        </div>
      </section>
    </div>
  );
}
