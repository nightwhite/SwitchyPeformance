import { KeyRound, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { toUserFacingMessage } from '../error-message.ts';

interface ProxyCredentialDialogProps {
  busy: boolean;
  hasCredential: boolean;
  onClear(): Promise<void>;
  onClose(): void;
  onSave(username: string, password: string): Promise<void>;
  proxyName: string;
}

export function ProxyCredentialDialog({
  busy,
  hasCredential,
  onClear,
  onClose,
  onSave,
  proxyName
}: ProxyCredentialDialogProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();

  async function save(): Promise<void> {
    if (!username.trim()) {
      setError('请填写代理用户名');
      return;
    }
    try {
      setError(undefined);
      await onSave(username.trim(), password);
      onClose();
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  async function clear(): Promise<void> {
    try {
      setError(undefined);
      await onClear();
      onClose();
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  return (
    <div className="modal-scrim" role="presentation">
      <section
        aria-label="代理账号密码"
        aria-modal="true"
        className="modal-dialog credential-dialog"
        role="dialog"
      >
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">本地账号密码</p>
            <h2>{proxyName}</h2>
          </div>
          <button
            aria-label="关闭账号密码对话框"
            className="icon-action"
            onClick={onClose}
            title="关闭"
            type="button"
          >
            <X size={17} />
          </button>
        </div>
        <label>
          用户名
          <input
            autoComplete="username"
            disabled={busy}
            onChange={(event) => setUsername(event.target.value)}
            value={username}
          />
        </label>
        <label>
          密码
          <input
            autoComplete="new-password"
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>
        {error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="dialog-actions credential-actions">
          {hasCredential ? (
            <button
              className="danger-outline"
              disabled={busy}
              onClick={() => void clear()}
              type="button"
            >
              <Trash2 size={16} />
              清除账号密码
            </button>
          ) : null}
          <button className="outline-button" disabled={busy} onClick={onClose} type="button">
            取消
          </button>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void save()}
            type="button"
          >
            <KeyRound size={16} />
            保存到本机
          </button>
        </div>
      </section>
    </div>
  );
}
