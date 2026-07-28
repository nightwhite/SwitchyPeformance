import { Save } from 'lucide-react';
import { useState } from 'react';

import type { PacProfileV2 } from '@switchypeformance/contracts';

import type { PacProfileUpdate } from '../configuration/advanced-profile-actions.ts';
import { sourceDraftFrom, sourceFromDraft } from '../configuration/source-draft.ts';
import { toUserFacingMessage } from '../error-message.ts';
import { SourceFields } from './SourceFields.tsx';

interface PacProfileEditorProps {
  busy: boolean;
  onSave(update: PacProfileUpdate): Promise<void>;
  profile: PacProfileV2;
}

export function PacProfileEditor({ busy, onSave, profile }: PacProfileEditorProps) {
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
        showHeaders={source.headersText.trim().length > 0}
        showRefresh={false}
        value={source}
      />
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
