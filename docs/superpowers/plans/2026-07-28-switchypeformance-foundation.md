# SwitchyPeformance Foundation Plan

> This plan covers the independently implemented foundation. Later phases remain gated by contract tests and documented Chrome limitations.

## Delivered Foundation

- Clean-room controls, source-size enforcement, TypeScript/Rust workspaces, and Chrome MV3 production builds are in place.
- The routing core compiles indexed PAC rules once per configuration change and has a 10,000-rule regression contract.
- Direct, system, fixed-proxy, and multiple auto-switch profiles are implemented with direct-failover or proxy-only PAC behavior.
- Local-only proxy credentials, bounded diagnostics, generic route inspection, legacy JSON/`.bak` migration, popup actions, failed-resource actions, and context-menu actions are implemented.

## Remaining Release Work

1. Keep the standalone MIT repository and ignored reference directory audited before each release.
2. Keep the clean-room boundary, architecture, source-size rule, and no-native-service constraint documented.
3. Verify ignored reference material cannot be staged before each release.

## Phase 1: Build and test baseline

1. Maintain the pnpm workspace, React Chrome extension application, Rust workspace, and shared contract package.
2. Maintain formatting, TypeScript checking, Cargo checking, Vitest, and production-build checks.
3. Keep the file-size guard active for production source files over 2,000 lines.
4. Run manual Chrome installation and browser reliability checks before release.

## Phase 2: Independent domain and routing core

1. Write failing contract tests for direct, fixed-proxy, fallback, loopback, ordered-rule, and invalid-config behavior.
2. Implement versioned configuration types and Rust normalization.
3. Implement routing analysis, indexed host matching, and deterministic PAC generation.
4. Add compiler telemetry and an atomic apply/revert boundary in the service worker.

## Phase 3: User-facing parity

1. Expand proxy endpoint editing and remaining profile types such as PAC URL, rule-list, and virtual profiles.
2. Add temporary-rule workflows and independently authored visual regression coverage at popup, laptop, and wide desktop sizes.

## Phase 4: Operations and recovery

1. Expand migration schemas and add optional subscription refresh and sync controls.
2. Keep proxy authentication, diagnostics, route explanation, bounded logs, performance summaries, worker restart recovery, and safe reset controls covered by tests.

## Phase 5: Compatibility and release

1. Grow black-box behavior contracts until every public workflow is represented.
2. Run generated large-rule performance tests and browser reliability tests.
3. Audit licensing, source isolation, extension permissions, secrets, and documentation.
4. Publish an installable Chrome package and GitHub release only after all checks pass.
