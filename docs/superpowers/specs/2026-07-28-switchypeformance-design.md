# SwitchyPeformance Design

**Date:** 2026-07-28

## Goal

Create a Chrome-only proxy profile extension with the familiar operational scope of ZeroOmega-class products, while independently implementing the entire product under MIT. The differentiators are route-decision performance and actionable diagnostics.

## Non-negotiable constraints

- Chrome only; Manifest V3.
- No native application, local server, daemon, SQLite service, or external routing backend.
- Support HTTP, HTTPS, SOCKS4, SOCKS5, and HTTP proxy authentication through Chrome extension capabilities.
- Preserve user-visible workflows through independent React UI and Rust/WASM-backed routing logic.
- Never copy, import, or ship reference project material.
- Keep source modules below 2,000 lines and extract shared concerns.

## Functional parity inventory

- Direct, system, fixed proxy, PAC, auto-switch, rule list, and virtual profiles.
- Ordered rules, enabled state, profile fallbacks, bypass lists, and a deterministic default route.
- Host, wildcard, URL wildcard, URL regex, keyword, IP/CIDR, weekday, and time-range conditions where Chrome/PAC capabilities permit them.
- Profile switching from the toolbar popup, current-page quick actions, failed-request quick actions, context-menu actions, and temporary rules.
- PAC URL support, rule-list subscriptions, refresh scheduling, import/export, and legacy backup migration.
- HTTP proxy authentication, diagnostics, route explanation, performance measurements, and reset/recovery controls.

## User experience direction

The information architecture follows familiar proxy-extension tasks: quick switch in the popup; profiles and auto-switch rules in options; import/export and diagnostics as first-class pages. The visual system, components, styles, wording, icons, and source code are new work.

## Routing strategy

Static profiles apply through Chrome's fixed proxy configuration. Auto-switch profiles compile into PAC only when PAC is the correct Chrome API representation. The compiler preclassifies simple host rules into indexed tables and emits ordered fallback conditions for complex rules, retaining configured rule precedence.

The compiler runs after configuration changes, not during page loads. A compile result includes PAC text, a route explanation map, size and latency metrics, and validation findings. The prior valid configuration remains active if compilation fails.

## Test strategy

- Unit tests for parsing, validation, normalization, indexing, and PAC emission.
- Contract tests that express user-visible behavior independently from reference source code.
- Browser integration tests for proxy setting application, popup actions, imports, and diagnostics.
- Load tests using generated rule sets at 100, 1,000, 10,000, and 50,000 rules.
- Recovery tests for service-worker restarts, malformed imports, failed subscriptions, proxy failures, and loopback traffic.

## Acceptance targets

- A 10,000-rule auto-switch profile compiles without blocking the options UI.
- Normal page navigation does not scan the full rule set in the extension runtime.
- Diagnostics can explain a failing request without turning routine successful requests into persistent logs.
- Every supported user action has an automated test or an explicitly documented Chrome-platform limitation.
