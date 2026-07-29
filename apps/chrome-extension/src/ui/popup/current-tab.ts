export type CurrentTab =
  | { available: true; host: string; tabId?: number; url: string }
  | { available: false; reason: string };

const UNSUPPORTED_PAGE_REASON = '当前页面不是可添加规则的 HTTP 或 HTTPS 页面';
const POPUP_TAB_RETRY_COUNT = 3;
const POPUP_TAB_RETRY_DELAY_MS = 75;

export async function loadCurrentTab(): Promise<CurrentTab> {
  for (let attempt = 0; attempt <= POPUP_TAB_RETRY_COUNT; attempt += 1) {
    const current = await queryCurrentTab();
    if (current.available || attempt === POPUP_TAB_RETRY_COUNT) {
      return current;
    }
    await delay(POPUP_TAB_RETRY_DELAY_MS);
  }
  return unavailable();
}

async function queryCurrentTab(): Promise<CurrentTab> {
  const lastFocused = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const selectedLastFocused = currentTabFromChromeTab(lastFocused[0]);
  if (selectedLastFocused.available) {
    return selectedLastFocused;
  }

  const currentWindow = await chrome.tabs.query({ active: true, currentWindow: true });
  return firstRoutableTab([...lastFocused, ...currentWindow]) ?? selectedLastFocused;
}

function firstRoutableTab(
  tabs: readonly Pick<chrome.tabs.Tab, 'id' | 'url'>[]
): Extract<CurrentTab, { available: true }> | undefined {
  for (const tab of tabs) {
    const current = currentTabFromChromeTab(tab);
    if (current.available) {
      return current;
    }
  }
  return undefined;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
