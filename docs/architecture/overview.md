# Architecture Overview

## Runtime boundary

SwitchyPeformance is a self-contained Chrome extension. It has no native messaging host, no local daemon, no SQLite process, and no cloud service required for routing.

```
React popup/options UI
        |
        v
MV3 service worker <----> chrome.storage
        |
        v
Rust/WASM compiler ----> generated PAC or fixed proxy configuration
        |
        v
Chrome proxy subsystem ----> HTTP, HTTPS, SOCKS4, SOCKS5 proxy servers
```

Chrome owns network connections and proxy authentication handshakes. The extension owns profile configuration, route selection rules, PAC generation, import/export, and diagnostics.

## Performance model

The page-load hot path must not deserialize the whole profile set, scan a JavaScript rule list, write logs, or call the network. A configuration edit instead triggers one background compilation pass:

1. Validate and normalize the configuration.
2. Build exact-host and suffix-host lookup indexes.
3. Compile remaining complex conditions into an ordered fallback section.
4. Generate a compact PAC program or fixed-proxy configuration.
5. Atomically apply the resulting Chrome proxy setting.

The PAC program preserves first-match behavior while checking inexpensive indexed rules before complex conditions. It returns an explicit fallback route for every request.

## Modules

| Module                              | Responsibility                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `packages/contracts`                | Versioned TypeScript domain types, backup migration, and shared quick-rule behavior. |
| `crates/config-model`               | Rust validation and normalized configuration representation.                         |
| `crates/routing-core`               | Rust rule analysis, matcher indexes, route decisions, and explanations.              |
| `crates/pac-compiler`               | Rust PAC source generation for indexed auto-switch rules.                            |
| `crates/routing-wasm`               | Browser-facing Rust/WASM compilation and route-explanation boundary.                 |
| `apps/chrome-extension/entrypoints` | MV3 service worker, React popup, and React options entrypoints.                      |
| `apps/chrome-extension/src/runtime` | Chrome storage, proxy settings, authentication, diagnostics, and WASM loading.       |
| `apps/chrome-extension/src/ui`      | Shared configuration actions and UI performance helpers.                             |

## Storage and diagnostics

Configuration is stored as versioned JSON in `chrome.storage.local`. Proxy credentials live in a separate local-only record store; the route configuration contains only a credential identifier. Exported backups remove both passwords and credential identifiers.

Diagnostics use a bounded ring buffer in extension storage. Successful requests are never captured. Network failures retain URL, error category, and time, with duplicate resource failures folded for one minute. Logs never participate in routing decisions.

## Reliability rules

- A service-worker restart rehydrates the last known compiled proxy state idempotently.
- An invalid profile change never replaces the last valid active configuration.
- Every auto-switch proxy selection has an explicit direct-failover or proxy-only policy.
- Local and loopback traffic has a clear default policy and visible override path.
- No production source file may exceed 2,000 lines.
