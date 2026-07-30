import { CirclePlus, X } from 'lucide-react';
import { useState } from 'react';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import {
  ORIGINAL_CREATABLE_PROFILE_KINDS,
  type OriginalCreatableProfileKind
} from './profile-actions.ts';

export interface NewProfileValue {
  kind: OriginalCreatableProfileKind;
  name: string;
  proxyId?: string;
}

interface NewProfileDialogProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onClose(): void;
  onCreate(value: NewProfileValue): Promise<void>;
}

export function NewProfileDialog({ busy, document, onClose, onCreate }: NewProfileDialogProps) {
  const [kind, setKind] = useState<OriginalCreatableProfileKind>('auto-switch');
  const [name, setName] = useState('');
  const [proxyId, setProxyId] = useState(document.proxyServers[0]?.id ?? '');
  const [error, setError] = useState<string>();

  const needsProxy = kind === 'fixed-proxy';
  const canCreate = name.trim().length > 0 && (!needsProxy || proxyId.length > 0);

  async function create(): Promise<void> {
    try {
      setError(undefined);
      await onCreate({ kind, name, ...(needsProxy ? { proxyId } : {}) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法创建配置');
    }
  }

  return (
    <div className="modal-scrim" role="presentation">
      <section aria-label="新建配置" aria-modal="true" className="modal-dialog" role="dialog">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">新建配置</p>
            <h2>新建配置</h2>
          </div>
          <button
            aria-label="关闭新建配置窗口"
            className="icon-action"
            disabled={busy}
            onClick={onClose}
            title="关闭"
            type="button"
          >
            <X size={17} />
          </button>
        </div>
        <label>
          配置类型
          <select
            disabled={busy}
            onChange={(event) => setKind(event.target.value as OriginalCreatableProfileKind)}
            value={kind}
          >
            {ORIGINAL_CREATABLE_PROFILE_KINDS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {kindLabel(candidate)}
              </option>
            ))}
          </select>
        </label>
        <label>
          配置名称
          <input
            autoFocus
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：工作自动切换"
            value={name}
          />
        </label>
        {needsProxy ? (
          <label>
            默认代理服务器
            <select
              disabled={busy || document.proxyServers.length === 0}
              onChange={(event) => setProxyId(event.target.value)}
              value={proxyId}
            >
              {document.proxyServers.length === 0 ? <option value="">还没有代理服务器</option> : null}
              {document.proxyServers.map((proxy) => (
                <option key={proxy.id} value={proxy.id}>
                  {proxy.name} ({proxy.scheme.toUpperCase()} {proxy.host}:{proxy.port})
                </option>
              ))}
            </select>
            {document.proxyServers.length === 0 ? (
              <span className="field-help">先在一个固定代理配置中添加代理服务器。</span>
            ) : null}
          </label>
        ) : null}
        {error ? <p className="inline-error">{error}</p> : null}
        <div className="dialog-actions">
          <button className="outline-button" disabled={busy} onClick={onClose} type="button">
            取消
          </button>
          <button
            className="primary-button"
            disabled={busy || !canCreate}
            onClick={() => void create()}
            type="button"
          >
            <CirclePlus size={16} />
            创建配置
          </button>
        </div>
      </section>
    </div>
  );
}

function kindLabel(kind: OriginalCreatableProfileKind): string {
  switch (kind) {
    case 'fixed-proxy':
      return '固定代理';
    case 'auto-switch':
      return '自动切换';
    case 'pac':
      return 'PAC 脚本';
    case 'auto-detect':
      return '自动检测';
    case 'rule-list':
      return '规则列表';
    case 'virtual':
      return '虚拟配置';
  }
}
