import { Plus, Save } from 'lucide-react';
import { useState } from 'react';

import type { ProxySchemeV2 } from '@switchypeformance/contracts';

import { toUserFacingMessage } from '../error-message.ts';

export interface ProxyServerFormValue {
  host: string;
  name: string;
  port: number;
  scheme: ProxySchemeV2;
}

interface ProxyServerFormProps {
  busy: boolean;
  initialValue?: ProxyServerFormValue;
  onSubmit(value: ProxyServerFormValue): Promise<void>;
  submitLabel: string;
}

export function ProxyServerForm({
  busy,
  initialValue,
  onSubmit,
  submitLabel
}: ProxyServerFormProps) {
  const [draft, setDraft] = useState(() => inputFrom(initialValue));
  const [error, setError] = useState<string>();

  async function submit(): Promise<void> {
    const port = Number(draft.port);
    if (
      !draft.name.trim() ||
      !draft.host.trim() ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65_535
    ) {
      setError('请填写名称、地址和 1 到 65535 之间的端口');
      return;
    }
    try {
      setError(undefined);
      await onSubmit({
        host: draft.host.trim(),
        name: draft.name.trim(),
        port,
        scheme: draft.scheme
      });
      if (!initialValue) {
        setDraft(inputFrom(undefined));
      }
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  return (
    <>
      <div className="form-grid form-grid-proxy-server">
        <label>
          名称
          <input
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="例如：东京节点"
            value={draft.name}
          />
        </label>
        <label>
          协议
          <select
            disabled={busy}
            onChange={(event) =>
              setDraft({ ...draft, scheme: event.target.value as ProxySchemeV2 })
            }
            value={draft.scheme}
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
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, host: event.target.value })}
            placeholder="127.0.0.1"
            value={draft.host}
          />
        </label>
        <label>
          端口
          <input
            disabled={busy}
            inputMode="numeric"
            onChange={(event) => setDraft({ ...draft, port: event.target.value })}
            value={draft.port}
          />
        </label>
        <button
          className="primary-button form-command"
          disabled={busy}
          onClick={() => void submit()}
          type="button"
        >
          {initialValue ? <Save size={16} /> : <Plus size={16} />}
          {submitLabel}
        </button>
      </div>
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

function inputFrom(value: ProxyServerFormValue | undefined): {
  host: string;
  name: string;
  port: string;
  scheme: ProxySchemeV2;
} {
  return {
    host: value?.host ?? '',
    name: value?.name ?? '',
    port: String(value?.port ?? 1080),
    scheme: value?.scheme ?? 'socks5'
  };
}
