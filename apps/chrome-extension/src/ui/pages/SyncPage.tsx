import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Download,
  Eye,
  Save,
  Unplug,
  Upload
} from 'lucide-react';
import { useEffect, useState } from 'react';

import type { BackgroundState } from '../../runtime/messages.ts';
import type {
  SyncInspection,
  SyncProviderConfiguration,
  SyncStatus
} from '../../runtime/sync/sync-service.ts';
import {
  configureSync,
  disconnectSync,
  keepLocalSync,
  requestBackgroundState,
  requestSyncExportPair,
  requestSyncInspection,
  useRemoteSync
} from '../background-client.ts';
import { toUserFacingMessage } from '../error-message.ts';

type ProviderKind = SyncProviderConfiguration['kind'];

const DEFAULT_GIST_FILE_NAME = 'switchypeformance.json';

interface SyncPageProps {
  busy: boolean;
  onState(state: BackgroundState): void;
  syncStatus: SyncStatus | undefined;
}

export function SyncPage({ busy, onState, syncStatus }: SyncPageProps) {
  const [provider, setProvider] = useState<ProviderKind>(
    syncStatus?.provider?.kind ?? 'chrome-sync'
  );
  const [gistFileName, setGistFileName] = useState(DEFAULT_GIST_FILE_NAME);
  const [gistId, setGistId] = useState('');
  const [webDavUrl, setWebDavUrl] = useState('');
  const [webDavUsername, setWebDavUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [inspection, setInspection] = useState<SyncInspection>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [localBusy, setLocalBusy] = useState(false);
  const interactionBusy = busy || localBusy;

  useEffect(() => {
    const configured = syncStatus?.provider;
    if (!configured) {
      return;
    }
    setProvider(configured.kind);
    if (configured.kind === 'gist') {
      setGistFileName(configured.fileName);
      setGistId(configured.gistId ?? '');
    }
    if (configured.kind === 'webdav') {
      setWebDavUrl(configured.url);
      setWebDavUsername(configured.username);
    }
  }, [syncStatus?.provider]);

  async function run(action: () => Promise<void>): Promise<void> {
    try {
      setLocalBusy(true);
      setError(undefined);
      setNotice(undefined);
      await action();
      onState(await requestBackgroundState({ type: 'state.get' }));
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    } finally {
      setLocalBusy(false);
    }
  }

  function configurationFromForm(): SyncProviderConfiguration {
    switch (provider) {
      case 'chrome-sync':
        return { kind: 'chrome-sync' };
      case 'gist':
        return {
          fileName: gistFileName.trim() || DEFAULT_GIST_FILE_NAME,
          ...(gistId.trim() ? { gistId: gistId.trim() } : {}),
          kind: 'gist'
        };
      case 'webdav':
        return { kind: 'webdav', url: webDavUrl.trim(), username: webDavUsername.trim() };
    }
  }

  async function saveProvider(): Promise<void> {
    await run(async () => {
      await configureSync(configurationFromForm(), secret.trim() || undefined);
      setSecret('');
      setInspection(undefined);
      setNotice('同步方式已保存。');
    });
  }

  async function inspectRemote(): Promise<void> {
    await run(async () => {
      const next = await requestSyncInspection();
      setInspection(next);
      switch (next.resolution.action) {
        case 'no-op':
          setNotice('本地与远端配置相同。');
          break;
        case 'push-local':
          setNotice('远端还没有配置，可以上传本地版本。');
          break;
        case 'require-user-choice':
          setNotice('本地与远端配置不同，请选择要保留的版本。');
          break;
      }
    });
  }

  async function keepLocal(): Promise<void> {
    await run(async () => {
      await keepLocalSync();
      setInspection(undefined);
      setNotice('已上传本地配置。');
    });
  }

  async function useRemote(): Promise<void> {
    if (!window.confirm('使用远端配置会替换当前本地配置，账号密码仍保留在本机。确定继续吗？')) {
      return;
    }
    await run(async () => {
      await useRemoteSync();
      setInspection(undefined);
      setNotice('已应用远端配置。');
    });
  }

  async function exportBoth(): Promise<void> {
    await run(async () => {
      const pair = await requestSyncExportPair();
      downloadJson(
        pair,
        `SwitchyPeformance-Sync-${new Date().toISOString().replaceAll(':', '-')}.json`
      );
      setNotice('已导出本地和远端两份配置。');
    });
  }

  async function disconnect(): Promise<void> {
    if (!window.confirm('取消关联会删除本机保存的同步方式和令牌，不会删除远端配置。确定继续吗？')) {
      return;
    }
    await run(async () => {
      await disconnectSync();
      setInspection(undefined);
      setSecret('');
      setNotice('已取消本机同步关联。');
    });
  }

  const configured = syncStatus?.configured ?? false;
  return (
    <section className="page-panel sync-panel">
      <section aria-label="同步状态" className="sync-status-band">
        <span
          className={configured ? 'sync-status-icon sync-status-icon-ready' : 'sync-status-icon'}
        >
          {configured ? <CheckCircle2 size={20} /> : <Cloud size={20} />}
        </span>
        <div>
          <p className="panel-kicker">配置同步</p>
          <h2>{configured ? providerLabel(syncStatus?.provider) : '尚未配置同步'}</h2>
        </div>
        <dl className="sync-status-details">
          <div>
            <dt>本地版本</dt>
            <dd>{syncStatus?.revision ?? 0}</dd>
          </div>
          <div>
            <dt>凭据状态</dt>
            <dd>
              {syncStatus?.credentialConfigured ? '已保存' : configured ? '待填写' : '未设置'}
            </dd>
          </div>
          <div>
            <dt>上次同步</dt>
            <dd>{formatTimestamp(syncStatus?.lastSyncedAt)}</dd>
          </div>
        </dl>
      </section>

      <section aria-label="同步方式" className="sync-configuration">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">同步方式</p>
            <h2>连接设置</h2>
          </div>
        </div>
        <div className="form-grid sync-form-grid">
          <label>
            同步位置
            <select
              disabled={interactionBusy}
              onChange={(event) => {
                setProvider(event.target.value as ProviderKind);
                setInspection(undefined);
              }}
              value={provider}
            >
              <option value="chrome-sync">Chrome 同步</option>
              <option value="gist">GitHub Gist</option>
              <option value="webdav">WebDAV</option>
            </select>
          </label>
          {provider === 'gist' ? (
            <>
              <label>
                Gist 标识
                <input
                  disabled={interactionBusy}
                  onChange={(event) => setGistId(event.target.value)}
                  placeholder="首次保存时自动创建"
                  value={gistId}
                />
              </label>
              <label>
                文件名
                <input
                  disabled={interactionBusy}
                  onChange={(event) => setGistFileName(event.target.value)}
                  value={gistFileName}
                />
              </label>
              <label className="sync-secret-field">
                GitHub 令牌
                <input
                  autoComplete="off"
                  disabled={interactionBusy}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder={syncStatus?.credentialConfigured ? '保留已保存令牌' : '仅保存在本机'}
                  type="password"
                  value={secret}
                />
              </label>
            </>
          ) : null}
          {provider === 'webdav' ? (
            <>
              <label className="sync-url-field">
                WebDAV 文件地址
                <input
                  disabled={interactionBusy}
                  onChange={(event) => setWebDavUrl(event.target.value)}
                  placeholder="https://dav.example.com/SwitchyPeformance.json"
                  type="url"
                  value={webDavUrl}
                />
              </label>
              <label>
                WebDAV 账号
                <input
                  autoComplete="username"
                  disabled={interactionBusy}
                  onChange={(event) => setWebDavUsername(event.target.value)}
                  value={webDavUsername}
                />
              </label>
              <label className="sync-secret-field">
                WebDAV 密码
                <input
                  autoComplete="current-password"
                  disabled={interactionBusy}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder={syncStatus?.credentialConfigured ? '保留已保存密码' : '仅保存在本机'}
                  type="password"
                  value={secret}
                />
              </label>
            </>
          ) : null}
        </div>
        <div className="sync-configuration-actions">
          <button
            className="primary-button"
            disabled={interactionBusy}
            onClick={() => void saveProvider()}
            type="button"
          >
            <Save size={16} />
            保存同步方式
          </button>
          {configured ? (
            <button
              className="danger-outline"
              disabled={interactionBusy}
              onClick={() => void disconnect()}
              type="button"
            >
              <Unplug size={16} />
              取消关联
            </button>
          ) : null}
        </div>
      </section>

      {configured ? (
        <section aria-label="同步检查" className="sync-check-panel">
          <div className="sync-check-heading">
            <div>
              <p className="panel-kicker">同步检查</p>
              <h2>本地与远端</h2>
            </div>
            <button
              className="outline-button"
              disabled={interactionBusy || !syncStatus?.credentialConfigured}
              onClick={() => void inspectRemote()}
              type="button"
            >
              <Eye size={16} />
              检查远端
            </button>
          </div>
          {inspection ? (
            <InspectionResult
              inspection={inspection}
              busy={interactionBusy}
              onExport={exportBoth}
              onKeepLocal={keepLocal}
              onUseRemote={useRemote}
            />
          ) : null}
        </section>
      ) : null}

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
  );
}

function InspectionResult({
  inspection,
  busy,
  onExport,
  onKeepLocal,
  onUseRemote
}: {
  busy: boolean;
  inspection: SyncInspection;
  onExport(): Promise<void>;
  onKeepLocal(): Promise<void>;
  onUseRemote(): Promise<void>;
}) {
  const remote = inspection.remote;
  return (
    <div
      className={
        inspection.resolution.action === 'require-user-choice'
          ? 'sync-inspection sync-inspection-conflict'
          : 'sync-inspection'
      }
    >
      <div className="sync-version-grid">
        <span>
          <small>本地</small>
          <strong>版本 {inspection.local.revision}</strong>
        </span>
        <span>
          <small>远端</small>
          <strong>{remote ? `版本 ${remote.revision}` : '尚未创建'}</strong>
        </span>
        {inspection.remotePreview ? (
          <span>
            <small>远端内容</small>
            <strong>{inspection.remotePreview.counts.profiles} 个配置</strong>
          </span>
        ) : null}
      </div>
      {inspection.resolution.action === 'no-op' ? (
        <p className="sync-result-copy">
          <CheckCircle2 size={16} />
          两份配置内容一致。
        </p>
      ) : null}
      {inspection.resolution.action === 'push-local' ? (
        <div className="sync-decision-actions">
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void onKeepLocal()}
            type="button"
          >
            <Upload size={16} />
            上传本地配置
          </button>
        </div>
      ) : null}
      {inspection.resolution.action === 'require-user-choice' ? (
        <>
          <p className="sync-result-copy sync-result-copy-warning">
            <AlertTriangle size={16} />
            两份配置不同，未自动覆盖。
          </p>
          <div className="sync-decision-actions">
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void onKeepLocal()}
              type="button"
            >
              <Upload size={16} />
              保留本地
            </button>
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => void onUseRemote()}
              type="button"
            >
              <Download size={16} />
              使用远端
            </button>
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => void onExport()}
              type="button"
            >
              <Download size={16} />
              导出两份
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function providerLabel(provider: SyncProviderConfiguration | undefined): string {
  switch (provider?.kind) {
    case 'chrome-sync':
      return 'Chrome 同步';
    case 'gist':
      return 'GitHub Gist';
    case 'webdav':
      return 'WebDAV';
    default:
      return '尚未配置同步';
  }
}

function formatTimestamp(timestamp: number | undefined): string {
  if (!timestamp) {
    return '从未同步';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(timestamp);
}

function downloadJson(value: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.download = fileName;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
