import type { AutoSwitchProfileV2, ProfileDocumentV2 } from '@switchypeformance/contracts';

interface AutoSwitchSourceEditorProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onChange(sourceIds: readonly string[]): Promise<void>;
  profile: AutoSwitchProfileV2;
}

export function AutoSwitchSourceEditor({
  busy,
  document,
  onChange,
  profile
}: AutoSwitchSourceEditorProps) {
  const selected = new Set(profile.ruleSourceIds);

  async function toggle(sourceId: string, enabled: boolean): Promise<void> {
    const next = enabled
      ? [...profile.ruleSourceIds, sourceId]
      : profile.ruleSourceIds.filter((candidate) => candidate !== sourceId);
    await onChange(next);
  }

  return (
    <section className="original-page-panel original-auto-switch-sources">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">附加规则</p>
          <h2>规则来源</h2>
        </div>
      </div>
      {document.ruleSources.length === 0 ? (
        <p className="field-help">还没有规则来源。新建“规则列表”配置后可以在这里附加它。</p>
      ) : (
        <div className="original-source-list">
          {document.ruleSources.map((source) => (
            <label className="original-source-row" key={source.id}>
              <input
                checked={selected.has(source.id)}
                disabled={busy}
                onChange={(event) => void toggle(source.id, event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>{source.name}</strong>
                <small>{source.format === 'switchy' ? 'Switchy 规则' : 'AutoProxy 规则'}</small>
              </span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
