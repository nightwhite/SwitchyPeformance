import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import type { ProxyServerDeletionPlan } from '../configuration/proxy-server-actions.ts';
import { profileName } from '../v2-labels.ts';

interface ProxyServerDeleteDialogProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onClose(): void;
  onConfirm(replacementProxyId: string | undefined): Promise<void>;
  plan: ProxyServerDeletionPlan;
  proxyId: string;
}

export function ProxyServerDeleteDialog({
  busy,
  document,
  onClose,
  onConfirm,
  plan,
  proxyId
}: ProxyServerDeleteDialogProps) {
  const replacements = document.proxyServers.filter((server) => server.id !== proxyId);
  const [replacementProxyId, setReplacementProxyId] = useState(replacements[0]?.id ?? '');
  const proxyName = document.proxyServers.find((server) => server.id === proxyId)?.name ?? proxyId;
  const needsReplacement = plan.references.length > 0;

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
        {needsReplacement ? (
          <>
            <p className="modal-warning">
              <AlertTriangle size={16} />
              当前服务器仍被 {plan.references.length} 处固定代理配置使用。删除时会改用下方服务器。
            </p>
            <ul className="reference-list">
              {plan.references.map((reference) => (
                <li key={`${reference.profileId}:${reference.field}`}>
                  {profileName(document, reference.profileId)} / {reference.field}
                </li>
              ))}
            </ul>
            <label>
              替代代理服务器
              <select
                disabled={busy || replacements.length === 0}
                onChange={(event) => setReplacementProxyId(event.target.value)}
                value={replacementProxyId}
              >
                {replacements.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name} ({server.scheme.toUpperCase()} {server.host}:{server.port})
                  </option>
                ))}
              </select>
            </label>
            {replacements.length === 0 ? (
              <p className="inline-error">没有可替代服务器，请先修改或删除引用它的固定代理配置。</p>
            ) : null}
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
            disabled={busy || (needsReplacement && !replacementProxyId)}
            onClick={() => void onConfirm(needsReplacement ? replacementProxyId : undefined)}
            type="button"
          >
            <Trash2 size={16} />
            替换并删除
          </button>
        </div>
      </section>
    </div>
  );
}
