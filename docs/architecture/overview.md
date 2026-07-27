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

| Module | Responsibility |
| --- | --- |
| `packages/contracts` | Versioned TypeScript domain types and import/export schemas. |
| `crates/config-model` | Rust validation and normalized configuration representation. |
| `crates/routing-core` | Rust rule analysis and matcher index construction. |
| `crates/pac-compiler` | Rust PAC source generation and deterministic source maps for explanations. |
| `apps/chrome-extension/src/background` | MV3 lifecycle, storage hydration, proxy application, auth, and diagnostics. |
| `apps/chrome-extension/src/popup` | Quick profile switching and current-page rule actions. |
| `apps/chrome-extension/src/options` | Full configuration, imports, subscriptions, diagnostics, and settings UI. |
| `packages/ui` | Independently authored reusable UI primitives and accessibility behavior. |
| `tests/contracts` | Behavior contracts, migration fixtures, and routing compatibility cases. |

## Storage and diagnostics

Configuration is stored in Chrome extension storage as versioned JSON. This avoids a local service dependency and allows Chrome sync support where appropriate. Credentials remain separate from sync by default.

Diagnostics use a bounded ring buffer in extension storage. High-volume successful request capture is disabled by default; failure events retain request URL, selected route, error category, time, and relevant configuration revision. Logs never participate in routing decisions.

## Reliability rules

- A service-worker restart rehydrates the last known compiled proxy state idempotently.
- An invalid profile change never replaces the last valid active configuration.
- Every proxy selection has an explicit fallback policy.
- Local and loopback traffic has a clear default policy and visible override path.
- No production source file may exceed 2,000 lines.
