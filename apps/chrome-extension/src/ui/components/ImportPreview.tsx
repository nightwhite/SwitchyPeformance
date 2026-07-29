import { AlertTriangle, CheckCircle2, FileCheck2, X } from 'lucide-react';

import type { ConfigurationImportPreview } from '../../runtime/configuration-import-service.ts';

export interface ImportPreviewProps {
  busy: boolean;
  onCancel(): void;
  onConfirm(): void;
  preview: ConfigurationImportPreview;
}

export interface ImportPreviewView {
  countRows: readonly (readonly [label: string, value: string])[];
  sourceLabel: string;
  warnings: readonly string[];
}

export function ImportPreview({ busy, onCancel, onConfirm, preview }: ImportPreviewProps) {
  const view = importPreviewView(preview);
  return (
    <section aria-label="导入预览" className="page-panel import-preview-panel">
      <div className="import-preview-heading">
        <div>
          <p className="panel-kicker">导入预览</p>
          <h2>{view.sourceLabel}</h2>
        </div>
        <FileCheck2 aria-hidden="true" size={23} />
      </div>
      <p className="import-preview-copy">
        确认后会替换当前配置。代理账号密码、临时规则、排查日志和下载缓存不会导入。
      </p>
      <dl className="import-preview-counts">
        {view.countRows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {view.warnings.length > 0 ? (
        <div className="import-preview-warnings">
          <p>
            <AlertTriangle aria-hidden="true" size={15} />
            需要注意
          </p>
          <ul>
            {view.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="import-preview-ready">
          <CheckCircle2 aria-hidden="true" size={15} />
          配置检查通过，可以应用。
        </p>
      )}
      <div className="import-preview-actions">
        <button className="outline-button" disabled={busy} onClick={onCancel} type="button">
          <X size={16} />
          取消
        </button>
        <button className="primary-button" disabled={busy} onClick={onConfirm} type="button">
          <FileCheck2 size={16} />
          确认并应用
        </button>
      </div>
    </section>
  );
}

export function importPreviewView(preview: ConfigurationImportPreview): ImportPreviewView {
  return {
    countRows: [
      ['配置', String(preview.counts.profiles)],
      ['代理服务器', String(preview.counts.proxyServers)],
      ['规则', String(preview.counts.rules)],
      ['跳过', String(preview.counts.skipped)]
    ],
    sourceLabel: sourceLabel(preview.source),
    warnings: preview.warnings
  };
}

function sourceLabel(source: ConfigurationImportPreview['source']): string {
  switch (source) {
    case 'legacy':
      return '旧版 SwitchyOmega 备份';
    case 'switchypeformance-v1':
      return 'SwitchyPeformance V1 配置';
    case 'switchypeformance-v2':
      return 'SwitchyPeformance V2 配置';
  }
}
