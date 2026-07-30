import { FileText, Save, Table2 } from 'lucide-react';
import { useState } from 'react';

import { toUserFacingMessage } from '../../error-message.ts';

interface AutoSwitchTextEditorProps {
  busy: boolean;
  initialText: string;
  onApply(source: string): Promise<TextSourceApplyResult>;
  onClose(): void;
}

export type TextSourceApplyResult = { ok: true } | { error: string; ok: false };

export function AutoSwitchTextEditor({
  busy,
  initialText,
  onApply,
  onClose
}: AutoSwitchTextEditorProps) {
  const [source, setSource] = useState(initialText);
  const [error, setError] = useState<string>();

  async function apply(): Promise<void> {
    try {
      setError(undefined);
      const result = await onApply(source);
      if (!result.ok) {
        setError(result.error);
      }
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  return (
    <section className="original-page-panel original-auto-switch-text-editor">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">自动切换规则</p>
          <h2>规则文本</h2>
        </div>
        <span className="mono-chip">
          <FileText size={14} /> Switchy
        </span>
      </div>
      <p className="original-text-editor-help">
        每条规则写成“条件 + 目标配置”，最后一行必须是“true + 默认配置”。解析失败不会覆盖表格规则。
      </p>
      <textarea
        aria-label="自动切换规则文本"
        disabled={busy}
        onChange={(event) => setSource(event.target.value)}
        rows={22}
        spellCheck={false}
        value={source}
      />
      {error ? <p className="inline-error">{error}</p> : null}
      <div className="editor-actions">
        <button className="outline-button" disabled={busy} onClick={onClose} type="button">
          <Table2 size={16} />
          放弃文本修改
        </button>
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => void apply()}
          type="button"
        >
          <Save size={16} />
          解析并返回表格
        </button>
      </div>
    </section>
  );
}
