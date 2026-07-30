import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import type { BackgroundState } from '../../runtime/messages.ts';
import type { SourceStatus } from '../../runtime/source-status-repository.ts';
import type { SyncStatus } from '../../runtime/sync/sync-service.ts';
import { DataPage } from '../pages/DataPage.tsx';
import { SyncPage } from '../pages/SyncPage.tsx';

export interface ImportExportPageProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onImportCommitted?(state: BackgroundState): void;
  onState(state: BackgroundState): void;
  sourceStatuses: readonly SourceStatus[];
  syncStatus?: SyncStatus;
}

export function ImportExportPage({
  busy,
  document,
  onImportCommitted,
  onState,
  sourceStatuses,
  syncStatus
}: ImportExportPageProps) {
  return (
    <section className="original-import-export-page">
      <header className="original-page-heading">
        <p className="original-page-eyebrow">设置</p>
        <h1>导入/导出</h1>
        <p>备份和恢复配置；账号密码始终只留在当前浏览器。</p>
      </header>
      <DataPage
        busy={busy}
        document={document}
        onState={onState}
        sourceStatuses={sourceStatuses}
        variant="original"
        {...(onImportCommitted ? { onImportCommitted } : {})}
      />
      <section className="original-sync-workspace">
        <header>
          <h2>配置同步</h2>
          <p>可选功能。未设置同步时，配置只保存在本机 Chrome 中。</p>
        </header>
        <SyncPage busy={busy} onState={onState} syncStatus={syncStatus} />
      </section>
    </section>
  );
}
