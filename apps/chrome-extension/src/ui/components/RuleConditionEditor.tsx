import {
  validateCondition,
  type RuleConditionType,
  type RuleConditionV2
} from '@switchypeformance/contracts';

import {
  clockValueForMinute,
  defaultRuleCondition,
  minuteForClockValue,
  ruleConditionTypeLabel
} from '../configuration/rule-condition-draft.ts';

interface RuleConditionEditorProps {
  condition: RuleConditionV2;
  disabled: boolean;
  onChange(condition: RuleConditionV2): void;
}

const CONDITION_TYPES: readonly RuleConditionType[] = [
  'host-wildcard',
  'host-regex',
  'host-levels',
  'ip-cidr',
  'url-wildcard',
  'url-regex',
  'keyword',
  'bypass',
  'time-range',
  'weekday',
  'never'
];

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const;

export function RuleConditionEditor({ condition, disabled, onChange }: RuleConditionEditorProps) {
  const validation = validateCondition(condition);

  return (
    <div className="rule-condition-editor">
      <label>
        匹配条件
        <select
          disabled={disabled}
          onChange={(event) =>
            onChange(defaultRuleCondition(event.target.value as RuleConditionType))
          }
          value={condition.type}
        >
          {CONDITION_TYPES.map((type) => (
            <option key={type} value={type}>
              {ruleConditionTypeLabel(type)}
            </option>
          ))}
        </select>
      </label>
      <ConditionFields condition={condition} disabled={disabled} onChange={onChange} />
      {!validation.ok ? (
        <p className="inline-error" role="alert">
          {conditionErrorMessage(validation.code)}
        </p>
      ) : null}
    </div>
  );
}

function ConditionFields({ condition, disabled, onChange }: RuleConditionEditorProps) {
  switch (condition.type) {
    case 'host-wildcard':
      return (
        <TextConditionField
          disabled={disabled}
          label="主机模式"
          onChange={(pattern) => onChange({ type: condition.type, pattern })}
          placeholder="*.example.com"
          value={condition.pattern}
        />
      );
    case 'host-regex':
      return (
        <TextConditionField
          disabled={disabled}
          label="主机正则"
          onChange={(pattern) => onChange({ type: condition.type, pattern })}
          placeholder="(^|\\.)example\\.com$"
          value={condition.pattern}
        />
      );
    case 'host-levels':
      return (
        <div className="condition-fields two-fields">
          <NumberConditionField
            disabled={disabled}
            label="最少层级"
            onChange={(min) => onChange({ ...condition, min })}
            value={condition.min}
          />
          <label>
            最多层级
            <input
              disabled={disabled}
              inputMode="numeric"
              min="1"
              onChange={(event) => {
                const max = event.target.value ? Number(event.target.value) : undefined;
                const { max: _max, ...withoutMax } = condition;
                onChange(max === undefined ? withoutMax : { ...withoutMax, max });
              }}
              placeholder="不限"
              value={condition.max ?? ''}
            />
          </label>
        </div>
      );
    case 'ip-cidr':
      return (
        <div className="condition-fields two-fields">
          <TextConditionField
            disabled={disabled}
            label="IP 地址"
            onChange={(address) => onChange({ ...condition, address })}
            placeholder="10.0.0.0"
            value={condition.address}
          />
          <NumberConditionField
            disabled={disabled}
            label="前缀长度"
            onChange={(prefixLength) => onChange({ ...condition, prefixLength })}
            value={condition.prefixLength}
          />
        </div>
      );
    case 'url-wildcard':
      return (
        <TextConditionField
          disabled={disabled}
          label="网址模式"
          onChange={(pattern) => onChange({ type: condition.type, pattern })}
          placeholder="*://example.com/*"
          value={condition.pattern}
        />
      );
    case 'url-regex':
      return (
        <TextConditionField
          disabled={disabled}
          label="网址正则"
          onChange={(pattern) => onChange({ type: condition.type, pattern })}
          placeholder="^https://example\\.com/"
          value={condition.pattern}
        />
      );
    case 'keyword':
      return (
        <TextConditionField
          disabled={disabled}
          label="网址包含"
          onChange={(value) => onChange({ type: condition.type, value })}
          placeholder="example"
          value={condition.value}
        />
      );
    case 'bypass':
      return (
        <label className="condition-fields">
          匹配结果
          <select
            disabled={disabled}
            onChange={(event) =>
              onChange({ type: condition.type, value: event.target.value === 'true' })
            }
            value={String(condition.value)}
          >
            <option value="true">始终命中</option>
            <option value="false">永不命中</option>
          </select>
        </label>
      );
    case 'time-range':
      return (
        <div className="condition-fields two-fields">
          <label>
            开始时间
            <input
              disabled={disabled}
              onChange={(event) => {
                const startMinute = minuteForClockValue(event.target.value);
                if (startMinute !== undefined) {
                  onChange({ ...condition, startMinute });
                }
              }}
              type="time"
              value={clockValueForMinute(condition.startMinute)}
            />
          </label>
          <label>
            结束时间
            <input
              disabled={disabled}
              onChange={(event) => {
                const endMinute = minuteForClockValue(event.target.value);
                if (endMinute !== undefined) {
                  onChange({ ...condition, endMinute });
                }
              }}
              type="time"
              value={clockValueForMinute(condition.endMinute)}
            />
          </label>
        </div>
      );
    case 'weekday':
      return (
        <fieldset className="weekday-fieldset" disabled={disabled}>
          <legend>生效星期</legend>
          <div className="weekday-options">
            {WEEKDAY_LABELS.map((label, day) => {
              const checked = condition.days.includes(day);
              return (
                <label className="weekday-option" key={label}>
                  <input
                    checked={checked}
                    onChange={() => {
                      const days = checked
                        ? condition.days.filter((candidate) => candidate !== day)
                        : [...condition.days, day].sort((left, right) => left - right);
                      onChange({ type: condition.type, days });
                    }}
                    type="checkbox"
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      );
    case 'never':
      return <p className="inline-notice">此规则永远不会命中，可用于暂存规则。</p>;
  }
}

function TextConditionField({
  disabled,
  label,
  onChange,
  placeholder,
  value
}: {
  disabled: boolean;
  label: string;
  onChange(value: string): void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="condition-fields">
      {label}
      <input
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function NumberConditionField({
  disabled,
  label,
  onChange,
  value
}: {
  disabled: boolean;
  label: string;
  onChange(value: number): void;
  value: number;
}) {
  return (
    <label>
      {label}
      <input
        disabled={disabled}
        inputMode="numeric"
        min="0"
        onChange={(event) => onChange(Number(event.target.value))}
        value={value}
      />
    </label>
  );
}

function conditionErrorMessage(code: string): string {
  switch (code) {
    case 'empty-pattern':
      return '请填写匹配内容。';
    case 'invalid-regex':
      return '正则表达式语法无效。';
    case 'invalid-ip-cidr':
      return 'IP 地址或 CIDR 前缀无效。';
    case 'invalid-time-range':
      return '时间范围无效。';
    case 'invalid-weekday':
      return '至少选择一个星期。';
    default:
      return '匹配条件无效，请检查输入。';
  }
}
