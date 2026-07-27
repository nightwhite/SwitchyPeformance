# SwitchyPeformance

SwitchyPeformance is a Chrome-only, Manifest V3 proxy profile manager focused on fast routing, predictable behavior, and useful diagnostics.

It is an independent MIT implementation. It does not include, import, bundle, or derive code, assets, translations, tests, or generated output from ZeroOmega, SwitchyOmega, or any other proxy extension.

## Product principles

- No native host, daemon, local service, or separately installed helper.
- Chrome handles proxy connections; the extension decides configuration and routing only.
- Route decisions must stay off the browser page-load hot path whenever Chrome permits it.
- Complex profile changes compile once into an optimized PAC program rather than repeatedly parsing rules while pages load.
- Diagnostics are bounded and opt-in for high-volume request capture.
- Every production source file stays below 2,000 lines and shared logic belongs in a reusable module.

## Planned stack

- TypeScript and React for the extension UI.
- Rust compiled to WebAssembly for configuration validation, matcher construction, and PAC compilation.
- Chrome Manifest V3 service worker and Chrome proxy APIs.
- pnpm workspace, Vitest, Playwright, Cargo tests, and GitHub Actions.

## Development status

The repository is being initialized with a clean-room behavior contract and a test-first implementation baseline. It is not ready for installation yet.

## Reference boundary

The ignored `.reference/` directory is reserved for temporary, local, non-distributed reference material. Nothing under it may be committed or copied into this project. See [the clean-room policy](docs/architecture/clean-room-policy.md).
