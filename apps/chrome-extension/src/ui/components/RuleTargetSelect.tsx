import { isAutoSwitchRouteTargetV2, type ProfileDocumentV2 } from '@switchypeformance/contracts';

interface RuleTargetSelectProps {
  disabled: boolean;
  document: ProfileDocumentV2;
  label: string;
  onChange(profileId: string): void;
  profileId: string;
}

export function RuleTargetSelect({
  disabled,
  document,
  label,
  onChange,
  profileId
}: RuleTargetSelectProps) {
  const targets = document.profiles.filter((profile) =>
    isAutoSwitchRouteTargetV2(document, profile.id)
  );
  const currentIsSupported = targets.some((target) => target.id === profileId);

  return (
    <label>
      {label}
      <select
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={profileId}
      >
        {!currentIsSupported ? (
          <option value={profileId}>{profileId}（无法用于自动切换）</option>
        ) : null}
        {targets.map((target) => (
          <option key={target.id} value={target.id}>
            {target.name}
          </option>
        ))}
      </select>
    </label>
  );
}
