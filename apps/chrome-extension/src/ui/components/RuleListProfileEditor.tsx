import { Save } from 'lucide-react';
import { useState } from 'react';

import type {
  ProfileDocumentV2,
  RuleListProfileV2,
  RuleListSource
} from '@switchypeformance/contracts';

import type { RuleListProfileUpdate } from '../configuration/advanced-profile-actions.ts';
import { sourceDraftFrom, sourceFromDraft } from '../configuration/source-draft.ts';
import { toUserFacingMessage } from '../error-message.ts';
import { ProfileTargetSelect } from './ProfileTargetSelect.tsx';
import { SourceFields } from './SourceFields.tsx';

interface RuleListProfileEditorProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onSave(update: RuleListProfileUpdate): Promise<void>;
  profile: RuleListProfileV2;
  source: RuleListSource;
}

export function RuleListProfileEditor({
  busy,
  document,
  onSave,
  profile,
  source
}: RuleListProfileEditorProps) {
  const [sourceName, setSourceName] = useState(source.name);
  const [format, setFormat] = useState(source.format);
  const [sourceDraft, setSourceDraft] = useState(() => sourceDraftFrom(source.source));
  const [matchTargetId, setMatchTargetId] = useState(profile.matchTarget.profileId);
  const [fallbackProfileId, setFallbackProfileId] = useState(profile.fallback.profileId);
  const [allowInsecureHttp, setAllowInsecureHttp] = useState(false);
  const [error, setError] = useState<string>();

  async function save(): Promise<void> {
    try {
      setError(undefined);
      await onSave({
        allowInsecureHttp,
        fallback: { profileId: fallbackProfileId },
        matchTarget: { profileId: matchTargetId },
        source: {
          id: source.id,
          name: sourceName,
          format,
          source: sourceFromDraft(sourceDraft)
        }
      });
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  return (
    <section className="page-panel advanced-profile-editor rule-list-profile-editor">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">规则列表配置</p>
          <h2>{profile.name}</h2>
        </div>
        <span className="mono-chip">切换时编译</span>
      </div>
      <div className="form-grid rule-list-target-grid">
        <label>
          来源名称
          <input
            disabled={busy}
            onChange={(event) => setSourceName(event.target.value)}
            value={sourceName}
          />
        </label>
        <label>
          规则格式
          <select
            disabled={busy}
            onChange={(event) => setFormat(event.target.value as typeof format)}
            value={format}
          >
            <option value="auto-proxy">AutoProxy</option>
            <option value="switchy">Switchy</option>
          </select>
        </label>
        <ProfileTargetSelect
          autoSwitchRouteTargetsOnly
          disabled={busy}
          document={document}
          excludeProfileId={profile.id}
          label="命中规则后使用"
          onChange={setMatchTargetId}
          profileId={matchTargetId}
        />
        <ProfileTargetSelect
          autoSwitchRouteTargetsOnly
          disabled={busy}
          document={document}
          excludeProfileId={profile.id}
          label="没有规则命中时"
          onChange={setFallbackProfileId}
          profileId={fallbackProfileId}
        />
      </div>
      <SourceFields
        allowInsecureHttp={allowInsecureHttp}
        disabled={busy}
        inlineLabel="规则列表文本"
        onAllowInsecureHttpChange={setAllowInsecureHttp}
        onChange={setSourceDraft}
        showHeaders
        showRefresh
        value={sourceDraft}
      />
      <div className="editor-actions">
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => void save()}
          type="button"
        >
          <Save size={16} />
          保存规则列表
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
