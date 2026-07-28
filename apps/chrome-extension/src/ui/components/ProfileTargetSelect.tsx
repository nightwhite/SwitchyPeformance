import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

interface ProfileTargetSelectProps {
  disabled: boolean;
  document: ProfileDocumentV2;
  excludeProfileId?: string;
  label: string;
  onChange(profileId: string): void;
  profileId: string;
}

export function ProfileTargetSelect({
  disabled,
  document,
  excludeProfileId,
  label,
  onChange,
  profileId
}: ProfileTargetSelectProps) {
  const targets = document.profiles.filter((profile) => profile.id !== excludeProfileId);
  const hasCurrentTarget = targets.some((profile) => profile.id === profileId);

  return (
    <label>
      {label}
      <select
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={profileId}
      >
        {!hasCurrentTarget ? <option value={profileId}>{profileId}（不可用）</option> : null}
        {targets.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name}
          </option>
        ))}
      </select>
    </label>
  );
}
