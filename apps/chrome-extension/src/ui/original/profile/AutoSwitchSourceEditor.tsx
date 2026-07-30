import { CirclePlus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type {
  ConfigurationDocument,
  ProfileDocumentV2,
  RuleListSource,
  AutoSwitchProfileV2
} from '@switchypeformance/contracts';

import { ProfileTargetSelect } from '../../components/ProfileTargetSelect.tsx';
import { SourceFields } from '../../components/SourceFields.tsx';
import {
  sourceDraftFrom,
  sourceFromDraft,
  type SourceDraft
} from '../../configuration/source-draft.ts';
import { toUserFacingMessage } from '../../error-message.ts';
import { updateRuleListDraft } from './advanced-profile-draft.ts';
import { attachedRuleListForAutoSwitch } from './auto-switch-draft.ts';

interface AutoSwitchSourceEditorProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onAttach(): Promise<void>;
  onDetach(): Promise<void>;
  onReplace(document: ConfigurationDocument): Promise<unknown>;
  profile: AutoSwitchProfileV2;
}

export function AutoSwitchSourceEditor({
  busy,
  document,
  onAttach,
  onDetach,
  onReplace,
  profile
}: AutoSwitchSourceEditorProps) {
  const attached = useMemo(
    () => attachedRuleListForAutoSwitch(document, profile.id),
    [document, profile.id]
  );
  const [format, setFormat] = useState<RuleListSource['format']>('auto-proxy');
  const [sourceDraft, setSourceDraft] = useState<SourceDraft>(emptySourceDraft);
  const [matchTargetId, setMatchTargetId] = useState('direct');
  const [fallbackProfileId, setFallbackProfileId] = useState('direct');
  const [allowInsecureHttp, setAllowInsecureHttp] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    if (!attached) {
      setError(undefined);
      setNotice(undefined);
      return;
    }
    setFormat(attached.source.format);
    setSourceDraft(sourceDraftFrom(attached.source.source));
    setMatchTargetId(attached.profile.matchTarget.profileId);
    setFallbackProfileId(attached.profile.fallback.profileId);
    setAllowInsecureHttp(allowsInsecureHttp(attached.source));
    setError(undefined);
    setNotice(undefined);
  }, [attached]);

  async function attach(): Promise<void> {
    try {
      setError(undefined);
      await onAttach();
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  async function detach(): Promise<void> {
    if (!window.confirm('要移除这个附加规则列表吗？它的规则将不再参与自动切换。')) {
      return;
    }
    try {
      setError(undefined);
      await onDetach();
      setNotice('已移除附加规则列表，等待应用修改。');
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  async function save(): Promise<void> {
    if (!attached) {
      return;
    }
    try {
      setError(undefined);
      await onReplace(
        updateRuleListDraft(document, attached.profile.id, {
          allowInsecureHttp,
          fallback: { profileId: fallbackProfileId },
          matchTarget: { profileId: matchTargetId },
          source: {
            format,
            id: attached.source.id,
            name: attached.source.name,
            source: sourceFromDraft(sourceDraft)
          }
        })
      );
      setNotice('附加规则列表已加入待应用修改。');
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  if (!attached) {
    const hasBrokenAttachment = profile.ruleSourceIds.length > 0;
    return (
      <section className="original-page-panel original-auto-switch-sources">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">附加规则</p>
            <h2>附加规则列表</h2>
          </div>
        </div>
        <p className="field-help">
          附加规则列表会排在当前表格规则之后，用于管理远程规则订阅或大量域名规则。
        </p>
        {hasBrokenAttachment ? (
          <p className="inline-error">
            当前附加关系没有对应的规则列表配置。移除后可重新创建，避免规则看起来已启用却无法编译。
          </p>
        ) : null}
        <div className="editor-actions">
          {hasBrokenAttachment ? (
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => void detach()}
              type="button"
            >
              <Trash2 size={16} />
              移除无效附加关系
            </button>
          ) : (
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => void attach()}
              type="button"
            >
              <CirclePlus size={16} />
              新建并附加规则列表
            </button>
          )}
        </div>
        {error ? <p className="inline-error">{error}</p> : null}
      </section>
    );
  }

  return (
    <section className="original-page-panel original-auto-switch-sources">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">附加规则</p>
          <h2>附加规则列表</h2>
        </div>
        <button
          aria-label="移除附加规则列表"
          className="icon-danger"
          disabled={busy}
          onClick={() => void detach()}
          title="移除附加规则列表"
          type="button"
        >
          <Trash2 size={16} />
        </button>
      </div>
      <label className="original-attached-rule-toggle">
        <input checked disabled={busy} onChange={() => void detach()} type="checkbox" />
        <span>
          <strong>在自动切换中启用 {attached.source.name}</strong>
          <small>当前表格规则优先，随后才匹配这份规则列表。</small>
        </span>
      </label>
      <div className="original-attached-rule-settings">
        <ProfileTargetSelect
          autoSwitchRouteTargetsOnly
          disabled={busy}
          document={document}
          excludeProfileId={attached.profile.id}
          label="规则命中时使用"
          onChange={setMatchTargetId}
          profileId={matchTargetId}
        />
        <ProfileTargetSelect
          autoSwitchRouteTargetsOnly
          disabled={busy}
          document={document}
          excludeProfileId={attached.profile.id}
          label="没有规则命中时使用"
          onChange={setFallbackProfileId}
          profileId={fallbackProfileId}
        />
      </div>
      <div className="original-attached-rule-format">
        <span>规则格式</span>
        <label>
          <input
            checked={format === 'auto-proxy'}
            disabled={busy}
            name={`attached-rule-format-${profile.id}`}
            onChange={() => setFormat('auto-proxy')}
            type="radio"
          />
          AutoProxy
        </label>
        <label>
          <input
            checked={format === 'switchy'}
            disabled={busy}
            name={`attached-rule-format-${profile.id}`}
            onChange={() => setFormat('switchy')}
            type="radio"
          />
          Switchy
        </label>
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
          更新附加规则列表
        </button>
      </div>
      {notice ? <p className="inline-notice">{notice}</p> : null}
      {error ? <p className="inline-error">{error}</p> : null}
    </section>
  );
}

function emptySourceDraft(): SourceDraft {
  return {
    headersText: '',
    kind: 'inline',
    refreshEnabled: false,
    refreshMinutes: 60,
    text: '',
    url: ''
  };
}

function allowsInsecureHttp(source: RuleListSource): boolean {
  return source.source.kind === 'url' && source.source.url.trim().startsWith('http:');
}
