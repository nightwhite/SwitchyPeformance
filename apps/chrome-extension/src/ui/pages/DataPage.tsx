import { Download, FileUp, Upload } from 'lucide-react';
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
  onState(state: BackgroundState): void;
  sourceStatuses: readonly SourceStatus[];
}

export function DataPage({ busy, document, onState, sourceStatuses }: DataPageProps) {
  const [error, setError] = useState<string>();
  const [localBusy, setLocalBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [pendingInput, setPendingInput] = useState<unknown>();
  const [preview, setPreview] = useState<ConfigurationImportPreview>();
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
    anchor.download = 'SwitchyPeformance-配置.json';
    anchor.href = url;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('已生成不含账号密码、日志和下载缓存的配置备份。');
    setError(undefined);
  }

  async function inspectImport(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    setLocalBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const input = parseConfigurationImportText(await file.text());
      const nextPreview = await requestConfigurationImportPreview(input);
      setPendingInput(input);
      setPreview(nextPreview);
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
      onState(await commitConfigurationImport(pendingInput));
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
    <div className="data-page">
      <section className="data-grid">
        <article className="page-panel data-action">
          <Download size={24} />
          <h2>导出配置</h2>
          <p>导出规则、代理地址和来源信息；账号密码、日志和下载缓存不会写入文件。</p>
          <button className="primary-button" onClick={downloadConfiguration} type="button">
            <Download size={16} />
            导出 JSON
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
