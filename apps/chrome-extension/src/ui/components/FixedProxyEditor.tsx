import { Save } from 'lucide-react';
import { useState } from 'react';

import type {
  FixedProxyProfileV2,
  ProfileDocumentV2,
  ProxyRoutes
} from '@switchypeformance/contracts';

import { toUserFacingMessage } from '../error-message.ts';
import { normalizeBypassList } from '../configuration/proxy-server-actions.ts';

interface FixedProxyEditorProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onSave(update: { bypassList: readonly string[]; routes: ProxyRoutes }): Promise<void>;
  profile: FixedProxyProfileV2;
}

export function FixedProxyEditor({ busy, document, onSave, profile }: FixedProxyEditorProps) {
  const [routes, setRoutes] = useState(profile.routes);
  const [bypassText, setBypassText] = useState(profile.bypassList.join('\n'));
  const [error, setError] = useState<string>();

  async function save(): Promise<void> {
    try {
      setError(undefined);
      await onSave({
        bypassList: normalizeBypassList(bypassText.split(/[,\n]/)),
        routes
      });
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  function updateRoute(field: keyof ProxyRoutes, value: string): void {
    if (field === 'fallbackProxyId') {
      setRoutes({ ...routes, fallbackProxyId: value });
      return;
    }
    const next = { ...routes };
    if (value) {
      next[field] = value;
    } else {
      delete next[field];
    }
    setRoutes(next);
  }

  return (
    <section className="page-panel fixed-proxy-editor">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">固定代理配置</p>
          <h2>{profile.name}</h2>
        </div>
      </div>
      <div className="form-grid fixed-proxy-grid">
        <ProxyRouteSelect
          label="默认代理"
          disabled={busy}
          onChange={(value) => updateRoute('fallbackProxyId', value)}
          servers={document.proxyServers}
          value={routes.fallbackProxyId}
        />
        <ProxyRouteSelect
          label="HTTP 代理"
          disabled={busy}
          onChange={(value) => updateRoute('httpProxyId', value)}
          servers={document.proxyServers}
          value={routes.httpProxyId ?? ''}
        />
        <ProxyRouteSelect
          label="HTTPS 代理"
          disabled={busy}
          onChange={(value) => updateRoute('httpsProxyId', value)}
          servers={document.proxyServers}
          value={routes.httpsProxyId ?? ''}
        />
        <ProxyRouteSelect
          label="FTP 代理"
          disabled={busy}
          onChange={(value) => updateRoute('ftpProxyId', value)}
          servers={document.proxyServers}
          value={routes.ftpProxyId ?? ''}
        />
        <label className="bypass-input">
          绕过地址
          <textarea
            disabled={busy}
            onChange={(event) => setBypassText(event.target.value)}
            placeholder={'localhost\n*.internal.example\n10.0.0.0/8'}
            rows={4}
            value={bypassText}
          />
        </label>
        <button
          className="primary-button form-command"
          disabled={busy || !routes.fallbackProxyId}
          onClick={() => void save()}
          type="button"
        >
          <Save size={16} />
          保存固定代理
        </button>
      </div>
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function ProxyRouteSelect({
  label,
  disabled,
  onChange,
  servers,
  value
}: {
  disabled: boolean;
  label: string;
  onChange(value: string): void;
  servers: ProfileDocumentV2['proxyServers'];
  value: string;
}) {
  const optional = label !== '默认代理';
  return (
    <label>
      {label}
      <select disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
        {optional ? <option value="">使用默认代理</option> : null}
        {servers.map((server) => (
          <option key={server.id} value={server.id}>
            {server.name} ({server.scheme.toUpperCase()} {server.host}:{server.port})
          </option>
        ))}
      </select>
    </label>
  );
}
