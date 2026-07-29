export type CurrentTab =
  | { available: true; host: string; tabId?: number; url: string }
  | { available: false; reason: string };

const UNSUPPORTED_PAGE_REASON = '当前页面不是可添加规则的 HTTP 或 HTTPS 页面';

export async function loadCurrentTab(): Promise<CurrentTab> {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return currentTabFromChromeTab(tabs[0]);
}

export function currentTabFromChromeTab(
  tab: Pick<chrome.tabs.Tab, 'id' | 'url'> | undefined
): CurrentTab {
  const current = currentTabFromUrl(tab?.url);
  return current.available && typeof tab?.id === 'number' ? { ...current, tabId: tab.id } : current;
}

export function currentTabFromUrl(rawUrl: string | undefined): CurrentTab {
  if (!rawUrl) {
    return unavailable();
  }

  try {
    const url = new URL(rawUrl);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) {
      return unavailable();
    }
    return { available: true, host: url.hostname, url: url.toString() };
  } catch {
    return unavailable();
  }
}

function unavailable(): CurrentTab {
  return { available: false, reason: UNSUPPORTED_PAGE_REASON };
}
