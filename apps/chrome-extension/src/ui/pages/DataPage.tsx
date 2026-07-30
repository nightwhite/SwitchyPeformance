import { Download, FileUp, Globe2, Upload } from 'lucide-react';
import { useState } from 'react';

import type { ConfigurationDocument } from '@switchypeformance/contracts';

import type { ConfigurationImportPreview } from '../../runtime/configuration-import-service.ts';
import type { SourceStatus } from '../../runtime/source-status-repository.ts';
import type { BackgroundState } from '../../runtime/messages.ts';
import {
  commitConfigurationImport,
  requestConfigurationImportPreview
} from '../background-client.ts';
import { ImportPreview } from '../components/ImportPreview.tsx';
import { parseConfigurationImportText } from '../../runtime/configuration-import-service.ts';
import { exportConfiguration } from '../../runtime/configuration-export.ts';
import { toUserFacingMessage } from '../error-message.ts';

interface DataPageProps {
  busy: boolean;
  document: ConfigurationDocument;
  onImportCommitted?(state: BackgroundState): void;
  onState(state: BackgroundState): void;
  sourceStatuses: readonly SourceStatus[];
  variant?: 'default' | 'original';
}

export function DataPage({
  busy,
  document,
  onImportCommitted,
  onState,
  sourceStatuses,
  variant = 'default'
}: DataPageProps) {
  const [error, setError] = useState<string>();
  const [localBusy, setLocalBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [pendingInput, setPendingInput] = useState<unknown>();
  const [preview, setPreview] = useState<ConfigurationImportPreview>();
  const [remoteUrl, setRemoteUrl] = useState('');
  const interactionBusy = busy || localBusy;

  function downloadConfiguration(): void {
    const blob = new Blob(
      [JSON.stringify(exportConfiguration(document, sourceStatuses), null, 2)],
      {
        type: 'application/json'
      }
    );
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.download = `SwitchyPeformanceOptions-${new Date().toISOString()}.bak`;
    anchor.href = url;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('已生成 .bak 配置备份，不含账号密码、日志和下载缓存。');
    setError(undefined);
  }

  async function inspectText(text: string): Promise<void> {
    const input = parseConfigurationImportText(text);
    const nextPreview = await requestConfigurationImportPreview(input);
    setPendingInput(input);
    setPreview(nextPreview);
  }

  async function inspectImport(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    await inspectWithBusy(async () => inspectText(await file.text()));
  }

  async function inspectRemote(): Promise<void> {
    await inspectWithBusy(async () => {
      const url = parseBackupUrl(remoteUrl);
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`在线备份请求失败（${response.status}）`);
      }
      await inspectText(await response.text());
    });
  }

  async function inspectWithBusy(read: () => Promise<void>): Promise<void> {
    setLocalBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await read();
    } catch (cause) {
      setPendingInput(undefined);
      setPreview(undefined);
      setError(toUserFacingMessage(cause));
    } finally {
      setLocalBusy(false);
    }
  }

  async function confirmImport(): Promise<void> {
    if (pendingInput === undefined) {
      return;
    }
    setLocalBusy(true);
    setError(undefined);
    try {
      const nextState = await commitConfigurationImport(pendingInput);
      (onImportCommitted ?? onState)(nextState);
      setPendingInput(undefined);
      setPreview(undefined);
      setNotice('配置已导入并应用。代理账号密码需要在本机重新填写。');
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    } finally {
      setLocalBusy(false);
    }
  }

  function cancelImport(): void {
    setPendingInput(undefined);
    setPreview(undefined);
    setError(undefined);
  }

  return (
    <div className={variant === 'original' ? 'data-page data-page-original' : 'data-page'}>
      <section className="data-grid">
        <article className="page-panel data-action">
          <Download size={24} />
          <h2>导出配置</h2>
          <p>导出规则、代理地址和来源信息；账号密码、日志和下载缓存不会写入文件。</p>
          <button className="primary-button" onClick={downloadConfiguration} type="button">
            <Download size={16} />
            导出备份（.bak）
          </button>
        </article>
        <article className="page-panel data-action">
          <Upload size={24} />
          <h2>导入配置</h2>
          <p>支持 JSON 和 .bak 文件。先检查内容，确认后才会替换当前路由。</p>
          <label className="file-button">
            <FileUp size={16} />
            选择备份文件
            <input
              accept=".json,.bak,application/json"
              disabled={interactionBusy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = '';
                void inspectImport(file);
              }}
              type="file"
            />
          </label>
        </article>
      </section>
      <section className="data-online-restore page-panel">
        <div>
          <Globe2 aria-hidden="true" size={20} />
          <h2>在线备份地址</h2>
          <p>读取一个 HTTPS 或 HTTP 的 JSON/.bak 备份，预览后才会覆盖当前配置。</p>
        </div>
        <div className="data-online-restore-controls">
          <input
            aria-label="在线备份地址"
            disabled={interactionBusy}
            onChange={(event) => setRemoteUrl(event.target.value)}
            placeholder="https://example.com/ZeroOmegaOptions.bak"
            type="url"
            value={remoteUrl}
          />
          <button
            className="outline-button"
            disabled={interactionBusy || !remoteUrl.trim()}
            onClick={() => void inspectRemote()}
            type="button"
          >
            读取并预览
          </button>
        </div>
      </section>
      {preview ? (
        <ImportPreview
          busy={interactionBusy}
          onCancel={cancelImport}
          onConfirm={() => void confirmImport()}
          preview={preview}
        />
      ) : null}
      {notice ? <p className="inline-notice">{notice}</p> : null}
      {error ? <p className="inline-error">{error}</p> : null}
    </div>
  );
}

export function parseBackupUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('在线备份地址无效');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('在线备份地址只能使用 HTTP 或 HTTPS');
  }
  return url.toString();
}
