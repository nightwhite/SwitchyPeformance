import { Save } from 'lucide-react';
import { useState } from 'react';

import type { PacProfileV2 } from '@switchypeformance/contracts';

import type { PacProfileUpdate } from '../configuration/advanced-profile-actions.ts';
import { sourceDraftFrom, sourceFromDraft } from '../configuration/source-draft.ts';
import { toUserFacingMessage } from '../error-message.ts';
import { SourceFields } from './SourceFields.tsx';
import { SourceStatus } from './SourceStatus.tsx';
import type { SourceStatus as SourceStatusRecord } from '../../runtime/source-status-repository.ts';

interface PacProfileEditorProps {
  busy: boolean;
  onRefresh?(): Promise<void>;
  onSave(update: PacProfileUpdate): Promise<void>;
  profile: PacProfileV2;
  sourceStatus?: SourceStatusRecord | undefined;
}

export function PacProfileEditor({
  busy,
  onRefresh,
  onSave,
  profile,
  sourceStatus
}: PacProfileEditorProps) {
  const [source, setSource] = useState(() => sourceDraftFrom(profile.source));
  const [allowInsecureHttp, setAllowInsecureHttp] = useState(false);
  const [error, setError] = useState<string>();

  async function save(): Promise<void> {
    try {
      setError(undefined);
      await onSave({ allowInsecureHttp, source: sourceFromDraft(source) });
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  return (
    <section className="page-panel advanced-profile-editor pac-profile-editor">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">PAC 配置</p>
          <h2>{profile.name}</h2>
        </div>
      </div>
      <SourceFields
        allowInsecureHttp={allowInsecureHttp}
        disabled={busy}
        inlineLabel="PAC 脚本"
        onAllowInsecureHttpChange={setAllowInsecureHttp}
        onChange={setSource}
        showHeaders
        showRefresh
        value={source}
      />
      {profile.source.kind === 'url' && onRefresh ? (
        <SourceStatus
          busy={busy}
          onRefresh={onRefresh}
          policy={profile.source.refresh}
          status={sourceStatus}
        />
      ) : null}
      <div className="editor-actions">
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => void save()}
          type="button"
        >
          <Save size={16} />
          保存 PAC
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
