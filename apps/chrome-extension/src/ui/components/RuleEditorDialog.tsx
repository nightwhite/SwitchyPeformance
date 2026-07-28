import { Save, X } from 'lucide-react';
import { useState } from 'react';

import {
  validateCondition,
  type ProfileDocumentV2,
  type SwitchRuleV2
} from '@switchypeformance/contracts';

import { defaultRuleCondition } from '../configuration/rule-condition-draft.ts';
import { toUserFacingMessage } from '../error-message.ts';
import { RuleConditionEditor } from './RuleConditionEditor.tsx';
import { RuleTargetSelect } from './RuleTargetSelect.tsx';

export interface RuleEditorDraft {
  condition: SwitchRuleV2['condition'];
  enabled: boolean;
  target: SwitchRuleV2['target'];
}

interface RuleEditorDialogProps {
  busy: boolean;
  document: ProfileDocumentV2;
  initialRule?: SwitchRuleV2;
  onClose(): void;
  onSave(draft: RuleEditorDraft): Promise<void>;
}

export function RuleEditorDialog({
  busy,
  document,
  initialRule,
  onClose,
  onSave
}: RuleEditorDialogProps) {
  const [condition, setCondition] = useState(
    initialRule?.condition ?? defaultRuleCondition('host-wildcard')
  );
  const [targetProfileId, setTargetProfileId] = useState(initialRule?.target.profileId ?? 'direct');
  const [enabled, setEnabled] = useState(initialRule?.enabled ?? true);
  const [error, setError] = useState<string>();

  async function save(): Promise<void> {
    if (!validateCondition(condition).ok) {
      setError('请先修正无效的匹配条件。');
      return;
    }
    try {
      setError(undefined);
      await onSave({ condition, enabled, target: { profileId: targetProfileId } });
      onClose();
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  return (
    <div className="modal-scrim" role="presentation">
      <section
        aria-label="编辑自动切换规则"
        aria-modal="true"
        className="modal-dialog rule-editor-dialog"
        role="dialog"
      >
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">自动切换规则</p>
            <h2>{initialRule ? '编辑规则' : '添加规则'}</h2>
          </div>
          <button
            aria-label="关闭规则编辑器"
            className="icon-action"
            onClick={onClose}
            title="关闭"
            type="button"
          >
            <X size={17} />
          </button>
        </div>
        <label className="switch-setting">
          <input
            checked={enabled}
            disabled={busy}
            onChange={(event) => setEnabled(event.target.checked)}
            type="checkbox"
          />
          <span>启用这条规则</span>
        </label>
        <RuleConditionEditor condition={condition} disabled={busy} onChange={setCondition} />
        <RuleTargetSelect
          disabled={busy}
          document={document}
          label="命中后使用"
          onChange={setTargetProfileId}
          profileId={targetProfileId}
        />
        {error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="dialog-actions">
          <button className="outline-button" disabled={busy} onClick={onClose} type="button">
            取消
          </button>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void save()}
            type="button"
          >
            <Save size={16} />
            保存规则
          </button>
        </div>
      </section>
    </div>
  );
}
