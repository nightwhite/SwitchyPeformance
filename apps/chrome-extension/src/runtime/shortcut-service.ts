import type { ConfigurationDocument } from '@switchypeformance/contracts';

export function nextProfileId(
  profileIds: readonly string[],
  activeProfileId: string
): string | undefined {
  if (profileIds.length === 0) {
    return undefined;
  }

  const activeIndex = profileIds.indexOf(activeProfileId);
  if (activeIndex < 0 || activeIndex === profileIds.length - 1) {
    return profileIds[0];
  }
  return profileIds[activeIndex + 1];
}

export function profileCycleIds(document: ConfigurationDocument): readonly string[] {
  const profileIds = document.profiles.map((profile) => profile.id);
  return orderedProfileIds(
    profileIds,
    document.schemaVersion === 2 ? document.settings.shortcutProfileIds : undefined
  );
}

export function orderedProfileIds(
  profileIds: readonly string[],
  savedOrder: readonly string[] | undefined
): string[] {
  if (!savedOrder?.length) {
    return [...profileIds];
  }
  const availableIds = new Set(profileIds);
  const seen = new Set<string>();
  const configuredIds = savedOrder.filter((profileId) => {
    if (!availableIds.has(profileId) || seen.has(profileId)) {
      return false;
    }
    seen.add(profileId);
    return true;
  });
  return [...configuredIds, ...profileIds.filter((profileId) => !seen.has(profileId))];
}

export function shouldReloadAfterProfileChange(document: ConfigurationDocument): boolean {
  return document.schemaVersion === 2 && document.settings.reloadAfterProfileChange;
}

export function profileSwitchRefreshTabId(
  tab: { id?: number | undefined; url?: string | undefined } | undefined,
  reloadAfterProfileChange: boolean
): number | undefined {
  const tabId = tab?.id;
  const tabUrl = tab?.url;
  if (
    !reloadAfterProfileChange ||
    typeof tabId !== 'number' ||
    !Number.isInteger(tabId) ||
    tabId < 0
  ) {
    return undefined;
  }
  if (!isHttpUrl(tabUrl)) {
    return undefined;
  }
  return tabId;
}

function isHttpUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) {
    return false;
  }
  try {
    const url = new URL(rawUrl);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}
