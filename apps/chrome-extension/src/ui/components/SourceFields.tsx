import type { SourceDraft } from '../configuration/source-draft.ts';

interface SourceFieldsProps {
  allowInsecureHttp: boolean;
  disabled: boolean;
  inlineLabel: string;
  onAllowInsecureHttpChange(value: boolean): void;
  onChange(draft: SourceDraft): void;
  showHeaders: boolean;
  showRefresh: boolean;
  value: SourceDraft;
}

export function SourceFields({
  allowInsecureHttp,
  disabled,
  inlineLabel,
  onAllowInsecureHttpChange,
  onChange,
  showHeaders,
  showRefresh,
  value
}: SourceFieldsProps) {
  function update(patch: Partial<SourceDraft>): void {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="source-fields">
      <label>
        来源方式
        <select
          disabled={disabled}
          onChange={(event) => update({ kind: event.target.value as SourceDraft['kind'] })}
          value={value.kind}
        >
          <option value="inline">内嵌文本</option>
          <option value="url">远程地址</option>
        </select>
      </label>
      {value.kind === 'inline' ? (
        <label className="source-wide-field">
          {inlineLabel}
          <textarea
            disabled={disabled}
            onChange={(event) => update({ text: event.target.value })}
            placeholder={
              inlineLabel === 'PAC 脚本'
                ? 'function FindProxyForURL(url, host) { return "DIRECT"; }'
                : '规则列表内容'
            }
            rows={7}
            value={value.text}
          />
        </label>
      ) : (
        <>
          <label className="source-wide-field">
            远程地址
            <input
              disabled={disabled}
              onChange={(event) => update({ url: event.target.value })}
              placeholder="https://example.com/rules.txt"
              value={value.url}
            />
          </label>
          <label className="switch-setting source-wide-field">
            <input
              checked={allowInsecureHttp}
              disabled={disabled}
              onChange={(event) => onAllowInsecureHttpChange(event.target.checked)}
              type="checkbox"
            />
            <span>允许 HTTP 地址</span>
          </label>
          {showHeaders ? (
            <label className="source-wide-field">
              自定义请求头
              <textarea
                disabled={disabled}
                onChange={(event) => update({ headersText: event.target.value })}
                placeholder={'Authorization: Bearer token\nX-Region: cn'}
                rows={4}
                value={value.headersText}
              />
            </label>
          ) : null}
          {showRefresh ? (
            <div className="source-refresh-fields source-wide-field">
              <label className="switch-setting">
                <input
                  checked={value.refreshEnabled}
                  disabled={disabled}
                  onChange={(event) => update({ refreshEnabled: event.target.checked })}
                  type="checkbox"
                />
                <span>定时刷新</span>
              </label>
              <label>
                刷新间隔（分钟）
                <input
                  disabled={disabled || !value.refreshEnabled}
                  inputMode="numeric"
                  min="1"
                  onChange={(event) => update({ refreshMinutes: Number(event.target.value) })}
                  value={value.refreshMinutes}
                />
              </label>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
