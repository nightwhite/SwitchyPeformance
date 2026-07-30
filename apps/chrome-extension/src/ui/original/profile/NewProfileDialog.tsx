import { CirclePlus, X } from 'lucide-react';
import { useState } from 'react';

import type { ProfileDocumentV2, ProxySchemeV2 } from '@switchypeformance/contracts';

import {
  ORIGINAL_CREATABLE_PROFILE_KINDS,
  type OriginalCreatableProfileKind
} from './profile-actions.ts';

export interface NewProfileValue {
  kind: OriginalCreatableProfileKind;
  name: string;
  newProxy?: {
    host: string;
    name: string;
    port: number;
    scheme: ProxySchemeV2;
  };
  proxyId?: string;
}

interface NewProfileDialogProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onClose(): void;
  onCreate(value: NewProfileValue): Promise<void>;
}

const NEW_PROXY_VALUE = '__new_proxy__';

export function NewProfileDialog({ busy, document, onClose, onCreate }: NewProfileDialogProps) {
  const [kind, setKind] = useState<OriginalCreatableProfileKind>('auto-switch');
  const [name, setName] = useState('');
  const [proxyId, setProxyId] = useState(document.proxyServers[0]?.id ?? NEW_PROXY_VALUE);
  const [proxyName, setProxyName] = useState('');
  const [proxyScheme, setProxyScheme] = useState<ProxySchemeV2>('socks5');
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('1080');
  const [error, setError] = useState<string>();

  const needsProxy = kind === 'fixed-proxy';
  const createsNewProxy = needsProxy && proxyId === NEW_PROXY_VALUE;
  const parsedProxyPort = Number(proxyPort);
  const validNewProxy =
    proxyHost.trim().length > 0 &&
    Number.isInteger(parsedProxyPort) &&
    parsedProxyPort >= 1 &&
    parsedProxyPort <= 65_535;
  const canCreate =
    name.trim().length > 0 &&
    (!needsProxy || (!createsNewProxy && proxyId.length > 0) || (createsNewProxy && validNewProxy));

  async function create(): Promise<void> {
    try {
      setError(undefined);
      await onCreate({
        kind,
        name,
        ...(needsProxy && createsNewProxy
          ? {
              newProxy: {
                host: proxyHost.trim(),
                name: proxyName.trim() || name.trim(),
                port: parsedProxyPort,
                scheme: proxyScheme
              }
            }
          : needsProxy
            ? { proxyId }
            : {})
      });
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
            aria-label="配置类型"
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
            aria-label="配置名称"
            autoFocus
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：工作自动切换"
            value={name}
          />
        </label>
        {needsProxy ? (
          <>
            <label>
              代理服务器
              <select
                aria-label="代理服务器"
                disabled={busy}
                onChange={(event) => setProxyId(event.target.value)}
                value={proxyId}
              >
                <option value={NEW_PROXY_VALUE}>新建代理服务器</option>
                {document.proxyServers.map((proxy) => (
                  <option key={proxy.id} value={proxy.id}>
                    {proxy.name} ({proxy.scheme.toUpperCase()} {proxy.host}:{proxy.port})
                  </option>
                ))}
              </select>
            </label>
            {createsNewProxy ? (
              <div className="new-profile-proxy-fields">
                <label>
                  代理服务器名称
                  <input
                    aria-label="代理服务器名称"
                    disabled={busy}
                    onChange={(event) => setProxyName(event.target.value)}
                    placeholder={name.trim() || '例如：本地 SOCKS5'}
                    value={proxyName}
                  />
                </label>
                <label>
                  代理协议
                  <select
                    aria-label="代理协议"
                    disabled={busy}
                    onChange={(event) => setProxyScheme(event.target.value as ProxySchemeV2)}
                    value={proxyScheme}
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="socks4">SOCKS4</option>
                    <option value="socks5">SOCKS5</option>
                  </select>
                </label>
                <label>
                  代理地址
                  <input
                    aria-label="代理地址"
                    disabled={busy}
                    onChange={(event) => setProxyHost(event.target.value)}
                    placeholder="127.0.0.1"
                    value={proxyHost}
                  />
                </label>
                <label>
                  代理端口
                  <input
                    aria-label="代理端口"
                    disabled={busy}
                    inputMode="numeric"
                    onChange={(event) => setProxyPort(event.target.value)}
                    value={proxyPort}
                  />
                </label>
              </div>
            ) : null}
          </>
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
