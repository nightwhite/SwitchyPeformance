# SwitchyPeformance Foundation Plan

> This plan covers the independently implemented foundation. Later phases remain gated by contract tests and documented Chrome limitations.

## Phase 0: Repository and clean-room controls

1. Initialize the standalone repository with MIT licensing and an ignored reference directory.
2. Document the clean-room boundary, architecture, source-size rule, and no-native-service constraint.
3. Create the public GitHub repository only after verifying ignored reference material cannot be staged.

## Phase 1: Build and test baseline

1. Create the pnpm workspace, React Chrome extension application, Rust workspace, and shared contract package.
2. Add linting, formatting, TypeScript checking, Cargo checking, Vitest, and Playwright configuration.
3. Add a file-size guard that fails for production source files over 2,000 lines.
4. Verify a blank MV3 extension can build and load without a native process.

## Phase 2: Independent domain and routing core

1. Write failing contract tests for direct, fixed-proxy, fallback, loopback, ordered-rule, and invalid-config behavior.
2. Implement versioned configuration types and Rust normalization.
3. Implement routing analysis, indexed host matching, and deterministic PAC generation.
4. Add compiler telemetry and an atomic apply/revert boundary in the service worker.

## Phase 3: User-facing parity

1. Build options navigation and profile management.
2. Build fixed proxy, PAC, auto-switch, rule-list, and virtual profile editors.
3. Build the popup, quick page-rule actions, failed-resource actions, context menu, and temporary-rule workflows.
4. Add independently authored visual regression coverage at popup, laptop, and wide desktop sizes.

## Phase 4: Operations and recovery

1. Implement import/export and legacy backup migration through documented schemas.
2. Implement subscription refresh, proxy authentication, sync controls, diagnostics, and route explanation.
3. Add bounded logs, performance summaries, worker restart recovery, and safe reset controls.

## Phase 5: Compatibility and release

1. Grow black-box behavior contracts until every public workflow is represented.
2. Run generated large-rule performance tests and browser reliability tests.
3. Audit licensing, source isolation, extension permissions, secrets, and documentation.
4. Publish an installable Chrome package and GitHub release only after all checks pass.
