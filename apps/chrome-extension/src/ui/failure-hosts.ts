export interface FailureHostEvent {
  scope: string;
  target?: string;
}

export interface FailureHost {
  host: string;
  target: string;
}

export function recentFailureHosts(
  events: readonly FailureHostEvent[],
  limit = 2
): readonly FailureHost[] {
  const hosts: FailureHost[] = [];
  const seen = new Set<string>();
  for (const event of events.slice().reverse()) {
    if (event.scope !== 'network' || !event.target) {
      continue;
    }
    const host = hostFromTarget(event.target);
    if (!host || seen.has(host)) {
      continue;
    }
    hosts.push({ host, target: event.target });
    seen.add(host);
    if (hosts.length >= limit) {
      break;
    }
  }
  return hosts;
}

function hostFromTarget(target: string): string | undefined {
  try {
    return new URL(target).hostname || undefined;
  } catch {
    return undefined;
  }
}
